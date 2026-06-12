"""
Compute finite-time Lyapunov exponents (FTLEs) for the trained L63 MLP emulator.

This script uses PyTorch autograd Jacobians of the learned one-step map.

Inputs:
    data/l63_small.npz
    models/mlp_l63_next_small.pt

Outputs:
    reports/ftle_l63_mlp.txt
    reports/ftle_l63_mlp.csv
    figures/ftle_l63_mlp_hist.png
    figures/ftle_l63_mlp_attractor.png

Purpose:
    Compare the learned emulator's local finite-time instability structure
    against the physical Lorenz-63 FTLE field.
"""

from pathlib import Path
import csv

import numpy as np
import torch

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from src.ml_models import MLPEmulator


def load_mlp_l63(path, device):
    """
    Load trained L63 MLP checkpoint.
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


def model_map_and_jacobian(model, x_np, device):
    """
    Compute one MLP step and its Jacobian using PyTorch autograd.

    Input:
        x_np shape = (3,)

    Output:
        y_np shape = (3,)
        J_np shape = (3, 3)
    """
    x = torch.tensor(x_np, dtype=torch.float32, device=device, requires_grad=True)

    def model_single(z):
        return model(z.unsqueeze(0)).squeeze(0)

    J = torch.autograd.functional.jacobian(model_single, x)

    with torch.no_grad():
        y = model_single(x)

    return y.detach().cpu().numpy(), J.detach().cpu().numpy()


def compute_ftle_window_mlp(model, x0, dt, window_steps, device):
    """
    Compute one leading FTLE over a window for the MLP emulator.

    The trajectory is advanced using the MLP itself.
    The tangent vector is advanced using the model Jacobian from autograd.
    """
    x = np.asarray(x0, dtype=np.float32).copy()

    v = np.ones_like(x, dtype=np.float32)
    v = v / np.linalg.norm(v)

    log_growth_sum = 0.0

    for _ in range(window_steps):
        x_next, J = model_map_and_jacobian(model, x, device)

        v = J @ v

        norm_v = np.linalg.norm(v)

        if norm_v == 0.0:
            raise RuntimeError("Tangent vector norm became zero")

        log_growth_sum += np.log(norm_v)

        v = v / norm_v
        x = x_next.astype(np.float32)

    window_time = window_steps * dt

    return log_growth_sum / window_time


def main():
    data_path = Path("data/l63_small.npz")
    model_path = Path("models/mlp_l63_next_small.pt")

    report_path = Path("reports/ftle_l63_mlp.txt")
    csv_path = Path("reports/ftle_l63_mlp.csv")

    hist_fig_path = Path("figures/ftle_l63_mlp_hist.png")
    attractor_fig_path = Path("figures/ftle_l63_mlp_attractor.png")

    report_path.parent.mkdir(exist_ok=True)
    csv_path.parent.mkdir(exist_ok=True)
    hist_fig_path.parent.mkdir(exist_ok=True)
    attractor_fig_path.parent.mkdir(exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("device:", device)

    data = np.load(data_path)
    test = data["test"].astype("float32")
    dt = float(data["dt"])

    model = load_mlp_l63(model_path, device)

    window_steps = 100
    stride = 10
    max_windows = 100

    start_indices = list(range(0, len(test) - window_steps, stride))
    start_indices = start_indices[:max_windows]

    print("dt:", dt)
    print("test trajectory:", test.shape)
    print("window_steps:", window_steps)
    print("window_time:", window_steps * dt)
    print("stride:", stride)
    print("n_windows:", len(start_indices))

    rows = []

    for count, start in enumerate(start_indices, start=1):
        x0 = test[start]
        ftle = compute_ftle_window_mlp(model, x0, dt, window_steps, device)

        rows.append(
            {
                "window_id": count,
                "start_index": start,
                "start_time": start * dt,
                "x": float(x0[0]),
                "y": float(x0[1]),
                "z": float(x0[2]),
                "ftle": float(ftle),
            }
        )

        if count == 1 or count % 10 == 0:
            print(
                f"window {count:03d}/{len(start_indices)} "
                f"start_time={start * dt:.3f} ftle={ftle:.6f}"
            )

    ftles = np.array([row["ftle"] for row in rows])
    xs = np.array([row["x"] for row in rows])
    zs = np.array([row["z"] for row in rows])

    print()
    print("FTLE summary")
    print("============")
    print(f"mean_ftle: {ftles.mean():.8e}")
    print(f"std_ftle:  {ftles.std():.8e}")
    print(f"min_ftle:  {ftles.min():.8e}")
    print(f"max_ftle:  {ftles.max():.8e}")

    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "window_id",
                "start_index",
                "start_time",
                "x",
                "y",
                "z",
                "ftle",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print("saved:", csv_path)

    with open(report_path, "w") as f:
        f.write("L63 MLP finite-time Lyapunov exponents\n")
        f.write("======================================\n")
        f.write(f"data_path: {data_path}\n")
        f.write(f"model_path: {model_path}\n")
        f.write(f"dt: {dt}\n")
        f.write(f"window_steps: {window_steps}\n")
        f.write(f"window_time: {window_steps * dt}\n")
        f.write(f"stride: {stride}\n")
        f.write(f"n_windows: {len(rows)}\n")
        f.write("\n")
        f.write(f"mean_ftle: {ftles.mean():.8e}\n")
        f.write(f"std_ftle: {ftles.std():.8e}\n")
        f.write(f"min_ftle: {ftles.min():.8e}\n")
        f.write(f"max_ftle: {ftles.max():.8e}\n")
        f.write("\n")
        f.write("Notes:\n")
        f.write(
            "FTLEs are computed from the learned MLP one-step map using "
            "torch.autograd.functional.jacobian. Values are associated with "
            "the same L63 test-set starting points used for the physical FTLEs.\n"
        )

    print("saved:", report_path)

    plt.figure()
    plt.hist(ftles, bins=25)
    plt.xlabel("FTLE")
    plt.ylabel("count")
    plt.title("L63 MLP FTLE distribution")
    plt.tight_layout()
    plt.savefig(hist_fig_path, dpi=150)
    plt.close()

    print("saved:", hist_fig_path)

    plt.figure()
    scatter = plt.scatter(xs, zs, c=ftles, s=20)
    plt.xlabel("x")
    plt.ylabel("z")
    plt.title("L63 MLP FTLE field on attractor projection")
    plt.colorbar(scatter, label="FTLE")
    plt.tight_layout()
    plt.savefig(attractor_fig_path, dpi=150)
    plt.close()

    print("saved:", attractor_fig_path)


if __name__ == "__main__":
    main()
