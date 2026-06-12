# train_tendency_models.py
# Train tendency-prediction emulators for Lorenz-63 and Lorenz-96.
#
# Tendency task:
#   input  = x_t
#   target = (x_{t+1} - x_t) / dt
#
# This complements the next-state task already trained in the project.
#
# Outputs:
#   models/mlp_l63_tendency_small.pt
#   models/mlp_l96_tendency_small.pt
#   models/cnn_l96_tendency_small.pt
#   reports/*_tendency_small_metrics.txt
#   figures/*_tendency_small_loss.png

from pathlib import Path
import time
import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset
import matplotlib.pyplot as plt

from src.ml_models import MLPEmulator, PeriodicCNN1DEmulator, count_parameters


PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"
FIGURES_DIR = PROJECT_ROOT / "figures"

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

BATCH_SIZE = 512
EPOCHS = 50
LR = 1e-3


def get_array(npz, key_options):
    """Return the first available array from key_options."""
    for key in key_options:
        if key in npz:
            return npz[key]
    raise KeyError(f"None of these keys found: {key_options}. Available keys: {list(npz.keys())}")


def make_loader(x, y, batch_size, shuffle):
    """Build a PyTorch DataLoader from numpy arrays."""
    x_t = torch.tensor(x, dtype=torch.float32)
    y_t = torch.tensor(y, dtype=torch.float32)
    ds = TensorDataset(x_t, y_t)
    return DataLoader(ds, batch_size=batch_size, shuffle=shuffle)


def train_one_model(model, train_loader, val_loader, epochs, lr):
    """Train one model and return history."""
    model = model.to(DEVICE)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()

    history = {
        "train_mse": [],
        "val_mse": [],
    }

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss_sum = 0.0
        train_count = 0

        for xb, yb in train_loader:
            xb = xb.to(DEVICE)
            yb = yb.to(DEVICE)

            pred = model(xb)
            loss = loss_fn(pred, yb)

            opt.zero_grad()
            loss.backward()
            opt.step()

            train_loss_sum += float(loss.item()) * xb.shape[0]
            train_count += xb.shape[0]

        train_mse = train_loss_sum / train_count

        model.eval()
        val_loss_sum = 0.0
        val_count = 0

        with torch.no_grad():
            for xb, yb in val_loader:
                xb = xb.to(DEVICE)
                yb = yb.to(DEVICE)

                pred = model(xb)
                loss = loss_fn(pred, yb)

                val_loss_sum += float(loss.item()) * xb.shape[0]
                val_count += xb.shape[0]

        val_mse = val_loss_sum / val_count

        history["train_mse"].append(train_mse)
        history["val_mse"].append(val_mse)

        if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
            print(f"epoch {epoch:03d}/{epochs} train_mse={train_mse:.8e} val_mse={val_mse:.8e}")

    return history


def evaluate_model(model, x, y):
    """Evaluate MSE on a full numpy dataset."""
    model.eval()
    x_t = torch.tensor(x, dtype=torch.float32, device=DEVICE)
    y_t = torch.tensor(y, dtype=torch.float32, device=DEVICE)

    with torch.no_grad():
        pred = model(x_t)
        mse = torch.mean((pred - y_t) ** 2).item()
        mae = torch.mean(torch.abs(pred - y_t)).item()

    return mse, mae


def save_loss_plot(history, out_path, title):
    """Save training/validation loss curve."""
    epochs = np.arange(1, len(history["train_mse"]) + 1)

    plt.figure(figsize=(7, 5))
    plt.semilogy(epochs, history["train_mse"], label="train")
    plt.semilogy(epochs, history["val_mse"], label="validation")
    plt.xlabel("Epoch")
    plt.ylabel("MSE")
    plt.title(title)
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig(out_path, dpi=200)
    plt.close()


def train_case(case_name, data_path, model_kind, state_dim):
    """Train and evaluate one tendency-prediction case."""
    print("")
    print("=" * 70)
    print(f"Training case: {case_name}")
    print("=" * 70)

    npz = np.load(data_path)

    x_train = get_array(npz, ("x_train_tend", "x_train_tendency"))
    y_train = get_array(npz, ("y_train_tend", "y_train_tendency"))
    x_val = get_array(npz, ("x_val_tend", "x_val_tendency"))
    y_val = get_array(npz, ("y_val_tend", "y_val_tendency"))
    x_test = get_array(npz, ("x_test_tend", "x_test_tendency"))
    y_test = get_array(npz, ("y_test_tend", "y_test_tendency"))

    print(f"x_train shape = {x_train.shape}")
    print(f"y_train shape = {y_train.shape}")
    print(f"x_val shape   = {x_val.shape}")
    print(f"y_val shape   = {y_val.shape}")
    print(f"x_test shape  = {x_test.shape}")
    print(f"y_test shape  = {y_test.shape}")

    train_loader = make_loader(x_train, y_train, BATCH_SIZE, shuffle=True)
    val_loader = make_loader(x_val, y_val, BATCH_SIZE, shuffle=False)

    if model_kind == "mlp":
        model = MLPEmulator(
            input_dim=state_dim,
            output_dim=state_dim,
            hidden_dim=256,
            n_hidden_layers=3,
        )
    elif model_kind == "cnn":
        model = PeriodicCNN1DEmulator(
            state_dim=state_dim,
            hidden_channels=64,
            kernel_size=5,
            n_layers=3,
        )
    else:
        raise ValueError(f"Unknown model_kind: {model_kind}")

    n_params = count_parameters(model)
    print(f"parameters = {n_params}")
    print(f"device = {DEVICE}")

    t0 = time.time()
    history = train_one_model(model, train_loader, val_loader, EPOCHS, LR)
    elapsed = time.time() - t0

    test_mse, test_mae = evaluate_model(model, x_test, y_test)

    model_path = MODELS_DIR / f"{case_name}_small.pt"
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "case_name": case_name,
            "model_kind": model_kind,
            "state_dim": state_dim,
            "task": "tendency",
            "epochs": EPOCHS,
            "lr": LR,
            "batch_size": BATCH_SIZE,
            "test_mse": test_mse,
            "test_mae": test_mae,
            "n_params": n_params,
        },
        model_path,
    )

    fig_path = FIGURES_DIR / f"{case_name}_small_loss.png"
    save_loss_plot(history, fig_path, f"{case_name}: tendency prediction loss")

    report_path = REPORTS_DIR / f"{case_name}_small_metrics.txt"
    lines = []
    lines.append(f"case_name = {case_name}")
    lines.append(f"task = tendency")
    lines.append(f"model_kind = {model_kind}")
    lines.append(f"state_dim = {state_dim}")
    lines.append(f"device = {DEVICE}")
    lines.append(f"epochs = {EPOCHS}")
    lines.append(f"batch_size = {BATCH_SIZE}")
    lines.append(f"learning_rate = {LR}")
    lines.append(f"n_params = {n_params}")
    lines.append(f"elapsed_seconds = {elapsed:.4f}")
    lines.append(f"final_train_mse = {history['train_mse'][-1]:.12e}")
    lines.append(f"final_val_mse = {history['val_mse'][-1]:.12e}")
    lines.append(f"test_mse = {test_mse:.12e}")
    lines.append(f"test_mae = {test_mae:.12e}")
    lines.append(f"model_path = {model_path}")
    lines.append(f"loss_figure = {fig_path}")

    report_path.write_text("\n".join(lines))

    print("")
    print("\n".join(lines))

    return {
        "case_name": case_name,
        "model_kind": model_kind,
        "n_params": n_params,
        "test_mse": test_mse,
        "test_mae": test_mae,
        "report_path": report_path,
        "model_path": model_path,
        "fig_path": fig_path,
    }


def main():
    MODELS_DIR.mkdir(exist_ok=True)
    REPORTS_DIR.mkdir(exist_ok=True)
    FIGURES_DIR.mkdir(exist_ok=True)

    print(f"DEVICE = {DEVICE}")
    if torch.cuda.is_available():
        print(f"GPU = {torch.cuda.get_device_name(0)}")

    results = []

    results.append(
        train_case(
            case_name="mlp_l63_tendency",
            data_path=DATA_DIR / "l63_small.npz",
            model_kind="mlp",
            state_dim=3,
        )
    )

    results.append(
        train_case(
            case_name="mlp_l96_tendency",
            data_path=DATA_DIR / "l96_small.npz",
            model_kind="mlp",
            state_dim=40,
        )
    )

    results.append(
        train_case(
            case_name="cnn_l96_tendency",
            data_path=DATA_DIR / "l96_small.npz",
            model_kind="cnn",
            state_dim=40,
        )
    )

    summary_path = REPORTS_DIR / "tendency_models_summary.txt"

    lines = []
    lines.append("Tendency model summary")
    lines.append("=" * 60)
    lines.append(f"device = {DEVICE}")
    lines.append("")
    lines.append("case_name,model_kind,n_params,test_mse,test_mae")
    for r in results:
        lines.append(
            f"{r['case_name']},"
            f"{r['model_kind']},"
            f"{r['n_params']},"
            f"{r['test_mse']:.12e},"
            f"{r['test_mae']:.12e}"
        )

    lines.append("")
    lines.append("Interpretation")
    lines.append("-" * 60)
    lines.append(
        "These models predict the tendency rather than the next state. "
        "They are used to compare whether learning dx/dt or delta/dt is more suitable "
        "than directly learning x_{t+1}."
    )

    summary_path.write_text("\n".join(lines))
    print("")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
