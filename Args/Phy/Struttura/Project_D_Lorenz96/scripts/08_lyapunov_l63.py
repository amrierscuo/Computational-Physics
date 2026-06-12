"""
Estimate the leading Lyapunov exponent for Lorenz-63.

This script compares:

1. Physical RK4 Lorenz-63 map
2. Trained MLP next-state emulator

The physical reference is expected to be close to lambda_1 ~ 0.91
for the classical Lorenz-63 parameters, although estimates vary with
trajectory length and numerical setup.

For the MLP emulator, the Jacobian is computed using PyTorch autograd.
For the RK4 physical map, the Jacobian is approximated with central
finite differences.

Outputs:
    reports/lyapunov_l63_mlp.txt
    figures/lyapunov_l63_mlp_running.png
"""

from pathlib import Path

import numpy as np
import torch

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from src.lorenz_systems import lorenz63_rhs, rk4_step
from src.ml_models import MLPEmulator


def finite_difference_jacobian_map(map_fn, x, eps=1e-5):
    """
    Compute the Jacobian of a discrete map with central finite differences.

    Parameters
    ----------
    map_fn:
        Function mapping x_n -> x_{n+1}.
    x:
        Current state, shape (dim,).
    eps:
        Perturbation size.

    Returns
    -------
    J:
        Jacobian matrix, shape (dim, dim).
    """
    x = np.asarray(x, dtype=np.float64)
    dim = x.size

    J = np.zeros((dim, dim), dtype=np.float64)

    for j in range(dim):
        dx = np.zeros(dim, dtype=np.float64)
        dx[j] = eps

        f_plus = map_fn(x + dx)
        f_minus = map_fn(x - dx)

        J[:, j] = (f_plus - f_minus) / (2.0 * eps)

    return J


def estimate_leading_lyapunov_physical_l63(x0, dt, n_steps):
    """
    Estimate leading Lyapunov exponent for the physical Lorenz-63 RK4 map.

    This propagates one tangent vector and repeatedly normalizes it.
    For the leading exponent, this is equivalent to QR with a single vector.
    """
    x = np.asarray(x0, dtype=np.float64).copy()

    # Initial tangent vector.
    v = np.ones_like(x)
    v = v / np.linalg.norm(v)

    log_growth_sum = 0.0
    running = []

    def rk4_map(z):
        return rk4_step(lorenz63_rhs, z, dt)

    for step in range(1, n_steps + 1):
        # Jacobian of one RK4 step at current state.
        J = finite_difference_jacobian_map(rk4_map, x)

        # Tangent propagation.
        v = J @ v

        norm_v = np.linalg.norm(v)

        # Avoid division by zero in pathological cases.
        if norm_v == 0.0:
            raise RuntimeError("Tangent vector norm became zero")

        log_growth_sum += np.log(norm_v)

        # Renormalize tangent vector.
        v = v / norm_v

        # Advance physical trajectory.
        x = rk4_map(x)

        # Running estimate in units of inverse physical time.
        running.append(log_growth_sum / (step * dt))

    return running[-1], np.asarray(running)


def load_mlp_l63(path, device):
    """
    Load trained L63 MLP model.
    """
    checkpoint = torch.load(path, map_location=device)

    model = MLPEmulator(
        input_dim=checkpoint["input_dim"],
        output_dim=checkpoint["output_dim"],
        hidden_dim=checkpoint["hidden_dim"],
        n_hidden_layers=checkpoint["n_hidden_layers"],
    ).to(device)

    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    return model


def mlp_map_and_jacobian(model, x_np, device):
    """
    Compute MLP next-state prediction and Jacobian using PyTorch autograd.

    The model is a discrete map:
        x_n -> x_{n+1}

    Its Jacobian is therefore the derivative of the learned one-step map.
    """
    x = torch.tensor(x_np, dtype=torch.float32, device=device, requires_grad=True)

    def model_single(z):
        return model(z.unsqueeze(0)).squeeze(0)

    # PyTorch autograd Jacobian of output vector wrt input vector.
    J = torch.autograd.functional.jacobian(model_single, x)

    with torch.no_grad():
        y = model_single(x)

    return y.detach().cpu().numpy(), J.detach().cpu().numpy()


def estimate_leading_lyapunov_mlp(model, x0, dt, n_steps, device):
    """
    Estimate leading Lyapunov exponent for the trained MLP emulator.

    The emulator is rolled out autoregressively.
    At each model state, autograd computes the Jacobian of the learned map.
    """
    x = np.asarray(x0, dtype=np.float32).copy()

    v = np.ones_like(x)
    v = v / np.linalg.norm(v)

    log_growth_sum = 0.0
    running = []

    for step in range(1, n_steps + 1):
        x_next, J = mlp_map_and_jacobian(model, x, device)

        v = J @ v

        norm_v = np.linalg.norm(v)

        if norm_v == 0.0:
            raise RuntimeError("Tangent vector norm became zero")

        log_growth_sum += np.log(norm_v)

        v = v / norm_v
        x = x_next.astype(np.float32)

        running.append(log_growth_sum / (step * dt))

    return running[-1], np.asarray(running)


def main():
    data_path = Path("data/l63_small.npz")
    model_path = Path("models/mlp_l63_next_small.pt")

    report_path = Path("reports/lyapunov_l63_mlp.txt")
    figure_path = Path("figures/lyapunov_l63_mlp_running.png")

    report_path.parent.mkdir(exist_ok=True)
    figure_path.parent.mkdir(exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("device:", device)

    data = np.load(data_path)
    test = data["test"].astype("float32")
    dt = float(data["dt"])

    # Keep this moderate for a first test.
    # Later we can increase it for final estimates.
    n_steps = min(1000, len(test) - 1)

    x0 = test[0]

    print("dt:", dt)
    print("n_steps:", n_steps)
    print("x0:", x0)

    print("Estimating physical RK4 L63 Lyapunov exponent...")
    physical_lambda, physical_running = estimate_leading_lyapunov_physical_l63(
        x0=x0,
        dt=dt,
        n_steps=n_steps,
    )

    print("Loading MLP...")
    model = load_mlp_l63(model_path, device)

    print("Estimating MLP L63 Lyapunov exponent...")
    mlp_lambda, mlp_running = estimate_leading_lyapunov_mlp(
        model=model,
        x0=x0,
        dt=dt,
        n_steps=n_steps,
        device=device,
    )

    print("physical_lambda:", physical_lambda)
    print("mlp_lambda:", mlp_lambda)

    # Print selected running estimates to terminal.
    # This makes the diagnostic visible even without opening the PNG figure.
    selected_steps = [10, 25, 50, 100, 250, 500, 1000]

    print()
    print("Running Lyapunov estimates")
    print("==========================")
    print("step,time,physical_lambda_running,mlp_lambda_running")

    for step in selected_steps:
        if step <= n_steps:
            print(
                f"{step},{step * dt:.4f},"
                f"{physical_running[step - 1]:.8e},"
                f"{mlp_running[step - 1]:.8e}"
            )

    # Plot running estimates.
    time = np.arange(1, n_steps + 1) * dt

    plt.figure()
    plt.plot(time, physical_running, label="RK4 physical")
    plt.plot(time, mlp_running, label="MLP emulator")
    plt.axhline(0.91, linestyle="--", label="L63 reference ~0.91")
    plt.xlabel("time")
    plt.ylabel("running leading Lyapunov exponent")
    plt.title("L63 leading Lyapunov exponent estimate")
    plt.legend()
    plt.tight_layout()
    plt.savefig(figure_path, dpi=150)
    plt.close()

    print("saved:", figure_path)

    with open(report_path, "w") as f:
        f.write("L63 leading Lyapunov exponent: physical RK4 vs MLP\n")
        f.write("==================================================\n")
        f.write(f"data_path: {data_path}\n")
        f.write(f"model_path: {model_path}\n")
        f.write(f"dt: {dt}\n")
        f.write(f"n_steps: {n_steps}\n")
        f.write("\n")
        f.write("reference_lambda_l63: 9.10000000e-01\n")
        f.write(f"physical_rk4_lambda: {physical_lambda:.8e}\n")
        f.write(f"mlp_lambda: {mlp_lambda:.8e}\n")
        f.write("\n")
        f.write("Notes:\n")
        f.write(
            "The physical estimate uses a finite-difference Jacobian of the RK4 map. "
            "The MLP estimate uses torch.autograd.functional.jacobian. "
            "The estimate is short because this is a first diagnostic run.\n"
        )

    print("saved:", report_path)


if __name__ == "__main__":
    main()
