"""
Diagnostic autoregressive rollout comparison for Lorenz-96.

This script is similar to rollout_l96_mlp_vs_cnn.py, but prints RMSE
at selected lead times. This helps determine whether the models fail
immediately or only after chaotic error growth.

Inputs:
    data/l96_small.npz
    models/mlp_l96_next_small.pt
    models/cnn_l96_next_small.pt

Outputs:
    reports/l96_mlp_vs_cnn_rollout_diagnostics.txt
"""

from pathlib import Path

import numpy as np
import torch

from src.ml_models import MLPEmulator, PeriodicCNN1DEmulator


def rmse_over_time(pred, truth):
    return np.sqrt(np.mean((pred - truth) ** 2, axis=1))


def autoregressive_rollout(model, x0, n_steps, device):
    model.eval()

    states = [x0.astype("float32")]
    current = torch.from_numpy(x0.astype("float32")).unsqueeze(0).to(device)

    with torch.no_grad():
        for _ in range(n_steps):
            next_state = model(current)
            states.append(next_state.squeeze(0).cpu().numpy())
            current = next_state

    return np.asarray(states)


def load_mlp(path, device):
    checkpoint = torch.load(path, map_location=device)

    model = MLPEmulator(
        input_dim=checkpoint["input_dim"],
        output_dim=checkpoint["output_dim"],
        hidden_dim=checkpoint["hidden_dim"],
        n_hidden_layers=checkpoint["n_hidden_layers"],
    ).to(device)

    model.load_state_dict(checkpoint["model_state_dict"])
    return model


def load_cnn(path, device):
    checkpoint = torch.load(path, map_location=device)

    model = PeriodicCNN1DEmulator(
        state_dim=checkpoint["state_dim"],
        hidden_channels=checkpoint["hidden_channels"],
        kernel_size=checkpoint["kernel_size"],
        n_layers=checkpoint["n_layers"],
    ).to(device)

    model.load_state_dict(checkpoint["model_state_dict"])
    return model


def main():
    data_path = Path("data/l96_small.npz")
    mlp_path = Path("models/mlp_l96_next_small.pt")
    cnn_path = Path("models/cnn_l96_next_small.pt")
    report_path = Path("reports/l96_mlp_vs_cnn_rollout_diagnostics.txt")

    report_path.parent.mkdir(exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("device:", device)

    data = np.load(data_path)
    test = data["test"].astype("float32")
    dt = float(data["dt"])

    n_steps = min(1000, len(test) - 1)

    x0 = test[0]
    truth = test[: n_steps + 1]

    mlp = load_mlp(mlp_path, device)
    cnn = load_cnn(cnn_path, device)

    pred_mlp = autoregressive_rollout(mlp, x0, n_steps, device)
    pred_cnn = autoregressive_rollout(cnn, x0, n_steps, device)

    rmse_mlp = rmse_over_time(pred_mlp, truth)
    rmse_cnn = rmse_over_time(pred_cnn, truth)

    selected_steps = [0, 1, 5, 10, 25, 50, 100, 250, 500, 1000]

    lines = []
    lines.append("L96 rollout diagnostics: MLP vs Periodic CNN")
    lines.append("============================================")
    lines.append(f"dt: {dt}")
    lines.append(f"n_steps: {n_steps}")
    lines.append("")
    lines.append("step,time,rmse_mlp,rmse_cnn,ratio_mlp_over_cnn")

    for step in selected_steps:
        if step <= n_steps:
            ratio = rmse_mlp[step] / rmse_cnn[step] if rmse_cnn[step] > 0 else np.nan
            lines.append(
                f"{step},{step * dt:.4f},"
                f"{rmse_mlp[step]:.8e},"
                f"{rmse_cnn[step]:.8e},"
                f"{ratio:.8e}"
            )

    lines.append("")
    lines.append(f"mlp_final_rmse: {rmse_mlp[-1]:.8e}")
    lines.append(f"cnn_final_rmse: {rmse_cnn[-1]:.8e}")
    lines.append(f"mlp_max_rmse: {rmse_mlp.max():.8e}")
    lines.append(f"cnn_max_rmse: {rmse_cnn.max():.8e}")

    text = "\n".join(lines)

    print(text)

    with open(report_path, "w") as f:
        f.write(text)
        f.write("\n")

    print("saved:", report_path)


if __name__ == "__main__":
    main()
