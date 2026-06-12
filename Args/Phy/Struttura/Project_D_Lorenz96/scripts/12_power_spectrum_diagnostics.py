# power_spectrum_diagnostics.py
# Power-spectrum diagnostics for Lorenz-63 and Lorenz-96 emulators.
#
# Purpose:
#   Compare physical trajectories against autoregressive emulator rollouts.
#
# Outputs:
#   figures/power_spectrum_l63_rk4_vs_mlp.png
#   figures/power_spectrum_l96_rk4_vs_cnn.png
#   reports/power_spectrum_summary.txt

from pathlib import Path
import numpy as np
import torch
import matplotlib.pyplot as plt

from src.ml_models import MLPEmulator, PeriodicCNN1DEmulator


PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"
FIGURES_DIR = PROJECT_ROOT / "figures"

DT = 0.01
ROLLOUT_STEPS = 1000


def load_npz_array(path, preferred_keys=("test", "trajectory", "traj", "x", "data")):
    """Load a useful trajectory array from an npz file with flexible key names."""
    if not path.exists():
        raise FileNotFoundError(f"Missing dataset: {path}")

    obj = np.load(path)
    keys = list(obj.keys())

    for key in preferred_keys:
        if key in obj:
            arr = obj[key]
            if arr.ndim == 2:
                return arr.astype(np.float32), key, keys

    for key in keys:
        arr = obj[key]
        if hasattr(arr, "ndim") and arr.ndim == 2:
            return arr.astype(np.float32), key, keys

    raise ValueError(f"No 2D trajectory array found in {path}. Available keys: {keys}")


def load_state_dict_flexible(model, path, device):
    """Load model weights from either a raw state_dict or a checkpoint dictionary."""
    if not path.exists():
        raise FileNotFoundError(f"Missing model file: {path}")

    ckpt = torch.load(path, map_location=device)

    if isinstance(ckpt, dict) and "model_state_dict" in ckpt:
        state = ckpt["model_state_dict"]
    elif isinstance(ckpt, dict) and "state_dict" in ckpt:
        state = ckpt["state_dict"]
    else:
        state = ckpt

    model.load_state_dict(state)
    return model


@torch.no_grad()
def rollout_model(model, x0, steps, device):
    """Autoregressively roll out a learned one-step emulator."""
    model.eval()

    x = torch.tensor(x0, dtype=torch.float32, device=device).unsqueeze(0)
    out = [x.squeeze(0).detach().cpu().numpy()]

    for _ in range(steps):
        x = model(x)
        out.append(x.squeeze(0).detach().cpu().numpy())

    return np.asarray(out, dtype=np.float32)


def power_spectrum(signal, dt):
    """Compute one-sided power spectrum for a 1D signal."""
    signal = np.asarray(signal, dtype=np.float64)
    signal = signal - np.mean(signal)

    n = len(signal)
    window = np.hanning(n)
    signal_w = signal * window

    fft = np.fft.rfft(signal_w)
    freq = np.fft.rfftfreq(n, d=dt)
    power = np.abs(fft) ** 2

    # Remove zero frequency for log plots and summary.
    return freq[1:], power[1:]


def spectrum_summary(freq, power):
    """Return simple scalar summaries of a power spectrum."""
    eps = 1e-30
    power_sum = float(np.sum(power) + eps)
    peak_idx = int(np.argmax(power))
    peak_frequency = float(freq[peak_idx])
    spectral_centroid = float(np.sum(freq * power) / power_sum)

    cumulative = np.cumsum(power) / power_sum
    median_idx = int(np.searchsorted(cumulative, 0.5))
    median_frequency = float(freq[min(median_idx, len(freq) - 1)])

    return {
        "peak_frequency": peak_frequency,
        "spectral_centroid": spectral_centroid,
        "median_frequency": median_frequency,
        "total_power": power_sum,
    }


def main():
    REPORTS_DIR.mkdir(exist_ok=True)
    FIGURES_DIR.mkdir(exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device = {device}")

    # ------------------------------------------------------------
    # L63: physical test trajectory vs MLP autoregressive rollout
    # ------------------------------------------------------------
    l63_path = DATA_DIR / "l63_small.npz"
    l63_test, l63_key, l63_keys = load_npz_array(l63_path, preferred_keys=("test", "test_x", "trajectory", "traj"))
    print(f"L63 dataset key used: {l63_key}")
    print(f"L63 available keys: {l63_keys}")

    l63_steps = min(ROLLOUT_STEPS, len(l63_test) - 1)

    mlp_l63 = MLPEmulator(input_dim=3, output_dim=3, hidden_dim=256, n_hidden_layers=3).to(device)
    mlp_l63 = load_state_dict_flexible(mlp_l63, MODELS_DIR / "mlp_l63_next_small.pt", device)

    l63_physical = l63_test[: l63_steps + 1]
    l63_mlp = rollout_model(mlp_l63, l63_physical[0], l63_steps, device)

    # Use the x coordinate for L63 spectrum.
    f_l63_phys, p_l63_phys = power_spectrum(l63_physical[:, 0], DT)
    f_l63_mlp, p_l63_mlp = power_spectrum(l63_mlp[:, 0], DT)

    l63_phys_summary = spectrum_summary(f_l63_phys, p_l63_phys)
    l63_mlp_summary = spectrum_summary(f_l63_mlp, p_l63_mlp)

    plt.figure(figsize=(7, 5))
    plt.semilogy(f_l63_phys, p_l63_phys + 1e-30, label="Physical RK4/test")
    plt.semilogy(f_l63_mlp, p_l63_mlp + 1e-30, label="MLP rollout")
    plt.xlabel("Frequency")
    plt.ylabel("Power")
    plt.title("L63 power spectrum: x coordinate")
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "power_spectrum_l63_rk4_vs_mlp.png", dpi=200)
    plt.close()

    # ------------------------------------------------------------
    # L96: physical test trajectory vs periodic CNN rollout
    # ------------------------------------------------------------
    l96_path = DATA_DIR / "l96_small.npz"
    l96_test, l96_key, l96_keys = load_npz_array(l96_path, preferred_keys=("test", "test_x", "trajectory", "traj"))
    print(f"L96 dataset key used: {l96_key}")
    print(f"L96 available keys: {l96_keys}")

    l96_steps = min(ROLLOUT_STEPS, len(l96_test) - 1)

    cnn_l96 = PeriodicCNN1DEmulator(
        state_dim=40,
        hidden_channels=64,
        kernel_size=5,
        n_layers=3,
    ).to(device)
    cnn_l96 = load_state_dict_flexible(cnn_l96, MODELS_DIR / "cnn_l96_next_small.pt", device)

    l96_physical = l96_test[: l96_steps + 1]
    l96_cnn = rollout_model(cnn_l96, l96_physical[0], l96_steps, device)

    # Use variable 0 for L96 spectrum.
    f_l96_phys, p_l96_phys = power_spectrum(l96_physical[:, 0], DT)
    f_l96_cnn, p_l96_cnn = power_spectrum(l96_cnn[:, 0], DT)

    l96_phys_summary = spectrum_summary(f_l96_phys, p_l96_phys)
    l96_cnn_summary = spectrum_summary(f_l96_cnn, p_l96_cnn)

    plt.figure(figsize=(7, 5))
    plt.semilogy(f_l96_phys, p_l96_phys + 1e-30, label="Physical RK4/test")
    plt.semilogy(f_l96_cnn, p_l96_cnn + 1e-30, label="CNN rollout")
    plt.xlabel("Frequency")
    plt.ylabel("Power")
    plt.title("L96 power spectrum: variable 0")
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "power_spectrum_l96_rk4_vs_cnn.png", dpi=200)
    plt.close()

    lines = []
    lines.append("Power spectrum diagnostics")
    lines.append("=" * 50)
    lines.append("")
    lines.append(f"device = {device}")
    lines.append(f"dt = {DT}")
    lines.append(f"rollout_steps = {ROLLOUT_STEPS}")
    lines.append("")
    lines.append("L63: physical RK4/test vs MLP rollout")
    lines.append("-" * 50)
    lines.append(f"dataset_key_used = {l63_key}")
    lines.append(f"steps_used = {l63_steps}")
    lines.append(f"physical_peak_frequency = {l63_phys_summary['peak_frequency']:.8f}")
    lines.append(f"mlp_peak_frequency      = {l63_mlp_summary['peak_frequency']:.8f}")
    lines.append(f"physical_centroid       = {l63_phys_summary['spectral_centroid']:.8f}")
    lines.append(f"mlp_centroid            = {l63_mlp_summary['spectral_centroid']:.8f}")
    lines.append(f"physical_median_freq    = {l63_phys_summary['median_frequency']:.8f}")
    lines.append(f"mlp_median_freq         = {l63_mlp_summary['median_frequency']:.8f}")
    lines.append("")
    lines.append("L96: physical RK4/test vs CNN rollout")
    lines.append("-" * 50)
    lines.append(f"dataset_key_used = {l96_key}")
    lines.append(f"steps_used = {l96_steps}")
    lines.append(f"physical_peak_frequency = {l96_phys_summary['peak_frequency']:.8f}")
    lines.append(f"cnn_peak_frequency      = {l96_cnn_summary['peak_frequency']:.8f}")
    lines.append(f"physical_centroid       = {l96_phys_summary['spectral_centroid']:.8f}")
    lines.append(f"cnn_centroid            = {l96_cnn_summary['spectral_centroid']:.8f}")
    lines.append(f"physical_median_freq    = {l96_phys_summary['median_frequency']:.8f}")
    lines.append(f"cnn_median_freq         = {l96_cnn_summary['median_frequency']:.8f}")
    lines.append("")
    lines.append("Generated figures")
    lines.append("-" * 50)
    lines.append(str(FIGURES_DIR / "power_spectrum_l63_rk4_vs_mlp.png"))
    lines.append(str(FIGURES_DIR / "power_spectrum_l96_rk4_vs_cnn.png"))
    lines.append("")
    lines.append("Interpretation")
    lines.append("-" * 50)
    lines.append(
        "Power spectra provide an attractor/statistical diagnostic beyond pointwise RMSE. "
        "Even when rollout trajectories diverge, a useful emulator should preserve the "
        "dominant temporal frequencies and broad spectral shape of the physical system."
    )

    out_txt = REPORTS_DIR / "power_spectrum_summary.txt"
    out_txt.write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
