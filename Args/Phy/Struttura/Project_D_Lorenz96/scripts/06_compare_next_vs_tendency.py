# compare_next_vs_tendency.py
# Compare next-state models and tendency models in the same next-state space.
#
# For tendency models:
#   predicted_next = x_t + dt * predicted_tendency
#
# Outputs:
#   reports/next_vs_tendency_comparison.txt
#   reports/next_vs_tendency_comparison.csv

from pathlib import Path
import numpy as np
import torch

from src.ml_models import MLPEmulator, PeriodicCNN1DEmulator


PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_checkpoint(model, path):
    ckpt = torch.load(path, map_location=DEVICE)

    if isinstance(ckpt, dict) and "model_state_dict" in ckpt:
        state = ckpt["model_state_dict"]
    elif isinstance(ckpt, dict) and "state_dict" in ckpt:
        state = ckpt["state_dict"]
    else:
        state = ckpt

    model.load_state_dict(state)
    model.to(DEVICE)
    model.eval()
    return model


def evaluate_next_model(model, x_test, y_next):
    x = torch.tensor(x_test, dtype=torch.float32, device=DEVICE)
    y = torch.tensor(y_next, dtype=torch.float32, device=DEVICE)

    with torch.no_grad():
        pred_next = model(x)
        mse = torch.mean((pred_next - y) ** 2).item()
        mae = torch.mean(torch.abs(pred_next - y)).item()

    return mse, mae


def evaluate_tendency_model_as_next(model, x_test, y_next, dt):
    x = torch.tensor(x_test, dtype=torch.float32, device=DEVICE)
    y = torch.tensor(y_next, dtype=torch.float32, device=DEVICE)

    with torch.no_grad():
        pred_tend = model(x)
        pred_next = x + dt * pred_tend
        mse = torch.mean((pred_next - y) ** 2).item()
        mae = torch.mean(torch.abs(pred_next - y)).item()

    return mse, mae


def main():
    REPORTS_DIR.mkdir(exist_ok=True)

    print(f"device = {DEVICE}")

    rows = []

    # ------------------------------------------------------------
    # L63 MLP: next-state vs tendency-as-next
    # ------------------------------------------------------------
    l63 = np.load(DATA_DIR / "l63_small.npz")
    dt_l63 = float(l63["dt"])
    x_l63 = l63["x_test_next"].astype(np.float32)
    y_l63_next = l63["y_test_next"].astype(np.float32)

    mlp_l63_next = MLPEmulator(input_dim=3, output_dim=3, hidden_dim=256, n_hidden_layers=3)
    mlp_l63_next = load_checkpoint(mlp_l63_next, MODELS_DIR / "mlp_l63_next_small.pt")
    mse, mae = evaluate_next_model(mlp_l63_next, x_l63, y_l63_next)
    rows.append(("L63", "MLP", "next_state", mse, mae))

    mlp_l63_tend = MLPEmulator(input_dim=3, output_dim=3, hidden_dim=256, n_hidden_layers=3)
    mlp_l63_tend = load_checkpoint(mlp_l63_tend, MODELS_DIR / "mlp_l63_tendency_small.pt")
    mse, mae = evaluate_tendency_model_as_next(mlp_l63_tend, x_l63, y_l63_next, dt_l63)
    rows.append(("L63", "MLP", "tendency_as_next", mse, mae))

    # ------------------------------------------------------------
    # L96 MLP and CNN: next-state vs tendency-as-next
    # ------------------------------------------------------------
    l96 = np.load(DATA_DIR / "l96_small.npz")
    dt_l96 = float(l96["dt"])
    x_l96 = l96["x_test_next"].astype(np.float32)
    y_l96_next = l96["y_test_next"].astype(np.float32)

    mlp_l96_next = MLPEmulator(input_dim=40, output_dim=40, hidden_dim=256, n_hidden_layers=3)
    mlp_l96_next = load_checkpoint(mlp_l96_next, MODELS_DIR / "mlp_l96_next_small.pt")
    mse, mae = evaluate_next_model(mlp_l96_next, x_l96, y_l96_next)
    rows.append(("L96", "MLP", "next_state", mse, mae))

    mlp_l96_tend = MLPEmulator(input_dim=40, output_dim=40, hidden_dim=256, n_hidden_layers=3)
    mlp_l96_tend = load_checkpoint(mlp_l96_tend, MODELS_DIR / "mlp_l96_tendency_small.pt")
    mse, mae = evaluate_tendency_model_as_next(mlp_l96_tend, x_l96, y_l96_next, dt_l96)
    rows.append(("L96", "MLP", "tendency_as_next", mse, mae))

    cnn_l96_next = PeriodicCNN1DEmulator(state_dim=40, hidden_channels=64, kernel_size=5, n_layers=3)
    cnn_l96_next = load_checkpoint(cnn_l96_next, MODELS_DIR / "cnn_l96_next_small.pt")
    mse, mae = evaluate_next_model(cnn_l96_next, x_l96, y_l96_next)
    rows.append(("L96", "CNN", "next_state", mse, mae))

    cnn_l96_tend = PeriodicCNN1DEmulator(state_dim=40, hidden_channels=64, kernel_size=5, n_layers=3)
    cnn_l96_tend = load_checkpoint(cnn_l96_tend, MODELS_DIR / "cnn_l96_tendency_small.pt")
    mse, mae = evaluate_tendency_model_as_next(cnn_l96_tend, x_l96, y_l96_next, dt_l96)
    rows.append(("L96", "CNN", "tendency_as_next", mse, mae))

    # Write CSV.
    csv_path = REPORTS_DIR / "next_vs_tendency_comparison.csv"
    with csv_path.open("w") as f:
        f.write("system,architecture,target_type,next_state_mse,next_state_mae\n")
        for system, arch, target_type, mse, mae in rows:
            f.write(f"{system},{arch},{target_type},{mse:.12e},{mae:.12e}\n")

    # Human-readable report.
    lines = []
    lines.append("Next-state vs tendency comparison")
    lines.append("=" * 60)
    lines.append("")
    lines.append(f"device = {DEVICE}")
    lines.append("")
    lines.append("All metrics below are evaluated in next-state space x_{t+1}.")
    lines.append("For tendency models, prediction is converted as:")
    lines.append("  x_pred_next = x_t + dt * predicted_tendency")
    lines.append("")
    lines.append("system, architecture, target_type, next_state_mse, next_state_mae")
    for system, arch, target_type, mse, mae in rows:
        lines.append(f"{system}, {arch}, {target_type}, {mse:.12e}, {mae:.12e}")

    lines.append("")
    lines.append("Interpretation")
    lines.append("-" * 60)
    lines.append(
        "This table gives a fair comparison between direct next-state learning and "
        "tendency learning because both are evaluated against x_{t+1}. "
        "The tendency loss itself is on a different scale and should not be compared "
        "directly to next-state MSE."
    )

    txt_path = REPORTS_DIR / "next_vs_tendency_comparison.txt"
    txt_path.write_text("\n".join(lines))

    print("\n".join(lines))


if __name__ == "__main__":
    main()
