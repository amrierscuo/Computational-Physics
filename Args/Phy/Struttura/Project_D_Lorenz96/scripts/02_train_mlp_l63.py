"""
Train a small MLP emulator on the Lorenz-63 small dataset.

Task:
    next-state prediction

Input:
    data/l63_small.npz

Outputs:
    models/mlp_l63_next_small.pt
    figures/mlp_l63_next_small_loss.png
    reports/mlp_l63_next_small_metrics.txt

This is the first minimal training script for Student 2.
It is intentionally simple and fast.
"""

from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

import matplotlib.pyplot as plt

from src.ml_models import MLPEmulator, count_parameters


def load_dataset(path):
    """
    Load next-state supervised pairs from the L63 small dataset.
    """

    data = np.load(path)

    x_train = data["x_train_next"].astype("float32")
    y_train = data["y_train_next"].astype("float32")

    x_val = data["x_val_next"].astype("float32")
    y_val = data["y_val_next"].astype("float32")

    x_test = data["x_test_next"].astype("float32")
    y_test = data["y_test_next"].astype("float32")

    return x_train, y_train, x_val, y_val, x_test, y_test


def make_loader(x, y, batch_size=256, shuffle=True):
    """
    Convert NumPy arrays into a PyTorch DataLoader.
    """

    x_tensor = torch.from_numpy(x)
    y_tensor = torch.from_numpy(y)

    dataset = TensorDataset(x_tensor, y_tensor)

    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
    )

    return loader


def evaluate(model, loader, loss_fn, device):
    """
    Compute mean loss over a DataLoader.
    """

    model.eval()

    total_loss = 0.0
    total_count = 0

    with torch.no_grad():
        for x_batch, y_batch in loader:
            x_batch = x_batch.to(device)
            y_batch = y_batch.to(device)

            pred = model(x_batch)
            loss = loss_fn(pred, y_batch)

            batch_size = x_batch.shape[0]
            total_loss += loss.item() * batch_size
            total_count += batch_size

    return total_loss / total_count


def main():
    """
    Train the MLP and save model, loss plot, and metrics.
    """

    # -------------------------
    # Paths
    # -------------------------

    data_path = Path("data/l63_small.npz")
    model_path = Path("models/mlp_l63_next_small.pt")
    figure_path = Path("figures/mlp_l63_next_small_loss.png")
    metrics_path = Path("reports/mlp_l63_next_small_metrics.txt")

    model_path.parent.mkdir(exist_ok=True)
    figure_path.parent.mkdir(exist_ok=True)
    metrics_path.parent.mkdir(exist_ok=True)

    # -------------------------
    # Reproducibility
    # -------------------------

    torch.manual_seed(42)
    np.random.seed(42)

    # -------------------------
    # Device
    # -------------------------

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device: {device}")

    # -------------------------
    # Data
    # -------------------------

    x_train, y_train, x_val, y_val, x_test, y_test = load_dataset(data_path)

    print("x_train:", x_train.shape)
    print("y_train:", y_train.shape)
    print("x_val:  ", x_val.shape)
    print("y_val:  ", y_val.shape)
    print("x_test: ", x_test.shape)
    print("y_test: ", y_test.shape)

    train_loader = make_loader(x_train, y_train, batch_size=256, shuffle=True)
    val_loader = make_loader(x_val, y_val, batch_size=512, shuffle=False)
    test_loader = make_loader(x_test, y_test, batch_size=512, shuffle=False)

    # -------------------------
    # Model
    # -------------------------

    model = MLPEmulator(
        input_dim=3,
        output_dim=3,
        hidden_dim=256,
        n_hidden_layers=3,
    ).to(device)

    print("parameters:", count_parameters(model))

    # -------------------------
    # Optimization
    # -------------------------

    loss_fn = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

    n_epochs = 50

    train_losses = []
    val_losses = []

    # -------------------------
    # Training loop
    # -------------------------

    for epoch in range(1, n_epochs + 1):
        model.train()

        running_loss = 0.0
        running_count = 0

        for x_batch, y_batch in train_loader:
            x_batch = x_batch.to(device)
            y_batch = y_batch.to(device)

            optimizer.zero_grad()

            pred = model(x_batch)
            loss = loss_fn(pred, y_batch)

            loss.backward()
            optimizer.step()

            batch_size = x_batch.shape[0]
            running_loss += loss.item() * batch_size
            running_count += batch_size

        train_loss = running_loss / running_count
        val_loss = evaluate(model, val_loader, loss_fn, device)

        train_losses.append(train_loss)
        val_losses.append(val_loss)

        if epoch == 1 or epoch % 5 == 0:
            print(
                f"epoch {epoch:03d}/{n_epochs} "
                f"train_mse={train_loss:.6e} "
                f"val_mse={val_loss:.6e}"
            )

    # -------------------------
    # Final test evaluation
    # -------------------------

    test_loss = evaluate(model, test_loader, loss_fn, device)

    print(f"test_mse={test_loss:.6e}")

    # -------------------------
    # Save model
    # -------------------------

    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "input_dim": 3,
            "output_dim": 3,
            "hidden_dim": 256,
            "n_hidden_layers": 3,
            "task": "l63_next_state",
            "train_losses": train_losses,
            "val_losses": val_losses,
            "test_mse": test_loss,
        },
        model_path,
    )

    print(f"saved model: {model_path}")

    # -------------------------
    # Save loss figure
    # -------------------------

    plt.figure()
    plt.plot(train_losses, label="train")
    plt.plot(val_losses, label="validation")
    plt.xlabel("epoch")
    plt.ylabel("MSE loss")
    plt.yscale("log")
    plt.legend()
    plt.tight_layout()
    plt.savefig(figure_path, dpi=150)
    plt.close()

    print(f"saved figure: {figure_path}")

    # -------------------------
    # Save metrics text file
    # -------------------------

    with open(metrics_path, "w") as f:
        f.write("MLP L63 next-state small dataset\n")
        f.write("================================\n")
        f.write(f"device: {device}\n")
        f.write(f"parameters: {count_parameters(model)}\n")
        f.write(f"final_train_mse: {train_losses[-1]:.8e}\n")
        f.write(f"final_val_mse: {val_losses[-1]:.8e}\n")
        f.write(f"test_mse: {test_loss:.8e}\n")

    print(f"saved metrics: {metrics_path}")


if __name__ == "__main__":
    main()
