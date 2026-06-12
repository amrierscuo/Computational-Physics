"""
Estimate leading Lyapunov exponents for L96 ML emulators.

This script compares:

1. Trained MLP next-state emulator
2. Trained periodic CNN next-state emulator

Reference physical value from the project statement:
    L96 at F=8 has lambda_1 approximately 1.68

The model Jacobians are computed with PyTorch autograd.
The models are discrete one-step maps:
    x_n -> x_{n+1}

The Lyapunov exponent is converted to inverse physical time by dividing
the accumulated log-growth by n_steps * dt.

Outputs:
    reports/lyapunov_l96_mlp_vs_cnn.txt
    figures/lyapunov_l96_mlp_vs_cnn_running.png
"""

from pathlib import Path

import numpy as np
import torch

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from src.ml_models import MLPEmulator, PeriodicCNN1DEmulator


def load_mlp(path, device):
    """
    Load trained L96 MLP checkpoint.
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


def load_cnn(path, device):
    """
    Load trained L96 periodic CNN checkpoint.
    """
    checkpoint = torch.load(path, map_location=device)

    model = PeriodicCNN1DEmulator(
        state_dim=checkpoint["state_dim"],
        hidden_channels=checkpoint["hidden_channels"],
        kernel_size=checkpoint["kernel_size"],
        n_layers=checkpoint["n_layers"],
    ).to(device)

    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    return model


def model_map_and_jacobian(model, x_np, device):
    """
    Compute one model step and its Jacobian with PyTorch autograd.

    Input:
        x_np shape = (state_dim,)

    Output:
        y_np shape = (state_dim,)
        J_np shape = (state_dim, state_dim)
    """
    x = torch.tensor(x_np, dtype=torch.float32, device=device, requires_grad=True)

    def model_single(z):
        return model(z.unsqueeze(0)).squeeze(0)

    J = torch.autograd.functional.jacobian(model_single, x)

    with torch.no_grad():
        y = model_single(x)

    return y.detach().cpu().numpy(), J.detach().cpu().numpy()


def estimate_leading_lyapunov_model(model, x0, dt, n_steps, device):
    """
    Estimate leading Lyapunov exponent for a learned one-step map.

    Uses one tangent vector and repeated renormalization.
    This gives the leading exponent.
    """
    x = np.asarray(x0, dtype=np.float32).copy()

    v = np.ones_like(x, dtype=np.float32)
    v = v / np.linalg.norm(v)

    log_growth_sum = 0.0
    running = []

    for step in range(1, n_steps + 1):
        x_next, J = model_map_and_jacobian(model, x, device)

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
    data_path = Path("data/l96_small.npz")

    mlp_path = Path("models/mlp_l96_next_small.pt")
    cnn_path = Path("models/cnn_l96_next_small.pt")

    report_path = Path("reports/lyapunov_l96_mlp_vs_cnn.txt")
    figure_path = Path("figures/lyapunov_l96_mlp_vs_cnn_running.png")

    report_path.parent.mkdir(exist_ok=True)
    figure_path.parent.mkdir(exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("device:", device)

    data = np.load(data_path)
    test = data["test"].astype("float32")
    dt = float(data["dt"])

    # Start modestly. L96 Jacobian is 40x40 and autograd is more expensive.
    n_steps = min(500, len(test) - 1)

    x0 = test[0]

    print("dt:", dt)
    print("n_steps:", n_steps)
    print("x0 shape:", x0.shape)

    print("Loading MLP...")
    mlp = load_mlp(mlp_path, device)

    print("Loading CNN...")
    cnn = load_cnn(cnn_path, device)

    print("Estimating MLP L96 Lyapunov exponent...")
    mlp_lambda, mlp_running = estimate_leading_lyapunov_model(
        model=mlp,
        x0=x0,
        dt=dt,
        n_steps=n_steps,
        device=device,
    )

    print("Estimating CNN L96 Lyapunov exponent...")
    cnn_lambda, cnn_running = estimate_leading_lyapunov_model(
        model=cnn,
        x0=x0,
        dt=dt,
        n_steps=n_steps,
        device=device,
    )

    print("reference_l96_lambda:", 1.68)
    print("mlp_lambda:", mlp_lambda)
    print("cnn_lambda:", cnn_lambda)

    selected_steps = [10, 25, 50, 100, 250, 500]

    print()
    print("Running Lyapunov estimates")
    print("==========================")
    print("step,time,mlp_lambda_running,cnn_lambda_running")

    for step in selected_steps:
        if step <= n_steps:
            print(
                f"{step},{step * dt:.4f},"
                f"{mlp_running[step - 1]:.8e},"
                f"{cnn_running[step - 1]:.8e}"
            )

    time = np.arange(1, n_steps + 1) * dt

    plt.figure()
    plt.plot(time, mlp_running, label="MLP emulator")
    plt.plot(time, cnn_running, label="Periodic CNN emulator")
    plt.axhline(1.68, linestyle="--", label="L96 reference ~1.68")
    plt.xlabel("time")
    plt.ylabel("running leading Lyapunov exponent")
    plt.title("L96 leading Lyapunov exponent estimate")
    plt.legend()
    plt.tight_layout()
    plt.savefig(figure_path, dpi=150)
    plt.close()

    print("saved:", figure_path)

    with open(report_path, "w") as f:
        f.write("L96 leading Lyapunov exponent: MLP vs Periodic CNN\n")
        f.write("==================================================\n")
        f.write(f"data_path: {data_path}\n")
        f.write(f"mlp_path: {mlp_path}\n")
        f.write(f"cnn_path: {cnn_path}\n")
        f.write(f"dt: {dt}\n")
        f.write(f"n_steps: {n_steps}\n")
        f.write("\n")
        f.write("reference_lambda_l96: 1.68000000e+00\n")
        f.write(f"mlp_lambda: {mlp_lambda:.8e}\n")
        f.write(f"cnn_lambda: {cnn_lambda:.8e}\n")
        f.write("\n")
        f.write("Notes:\n")
        f.write(
            "Both estimates use torch.autograd.functional.jacobian on the learned "
            "one-step maps. The L96 physical reference value is taken from the "
            "project statement.\n"
        )

    print("saved:", report_path)


if __name__ == "__main__":
    main()
