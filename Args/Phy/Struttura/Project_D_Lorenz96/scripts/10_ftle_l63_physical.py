"""
Compute finite-time Lyapunov exponents (FTLEs) for the physical Lorenz-63 system.

This script uses the RK4 physical map and finite-difference Jacobians.

Inputs:
    data/l63_small.npz

Outputs:
    reports/ftle_l63_physical.txt
    reports/ftle_l63_physical.csv
    figures/ftle_l63_physical_hist.png
    figures/ftle_l63_physical_attractor.png

Purpose:
    Produce the required L63 FTLE diagnostic:
        FTLE distribution and FTLE values overlaid on the L63 attractor.

The FTLE is computed over sliding windows:
    FTLE(t, T) = (1 / T) * log(|| tangent growth over window T ||)

Here we estimate only the leading finite-time exponent using one tangent vector.
"""

from pathlib import Path
import csv

import numpy as np

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from src.lorenz_systems import lorenz63_rhs, rk4_step


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
        Finite-difference perturbation size.

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


def compute_ftle_window(x0, dt, window_steps):
    """
    Compute one leading FTLE over a window starting from x0.

    The trajectory is advanced with the physical RK4 map.
    A tangent vector is propagated using finite-difference Jacobians.
    """
    x = np.asarray(x0, dtype=np.float64).copy()

    v = np.ones_like(x)
    v = v / np.linalg.norm(v)

    log_growth_sum = 0.0

    def rk4_map(z):
        return rk4_step(lorenz63_rhs, z, dt)

    for _ in range(window_steps):
        J = finite_difference_jacobian_map(rk4_map, x)

        v = J @ v

        norm_v = np.linalg.norm(v)

        if norm_v == 0.0:
            raise RuntimeError("Tangent vector norm became zero")

        log_growth_sum += np.log(norm_v)

        v = v / norm_v
        x = rk4_map(x)

    window_time = window_steps * dt

    return log_growth_sum / window_time


def main():
    data_path = Path("data/l63_small.npz")

    report_path = Path("reports/ftle_l63_physical.txt")
    csv_path = Path("reports/ftle_l63_physical.csv")

    hist_fig_path = Path("figures/ftle_l63_physical_hist.png")
    attractor_fig_path = Path("figures/ftle_l63_physical_attractor.png")

    report_path.parent.mkdir(exist_ok=True)
    csv_path.parent.mkdir(exist_ok=True)
    hist_fig_path.parent.mkdir(exist_ok=True)
    attractor_fig_path.parent.mkdir(exist_ok=True)

    data = np.load(data_path)
    test = data["test"].astype("float64")
    dt = float(data["dt"])

    # FTLE window settings.
    # window_steps=100 corresponds to physical time T=1.0 because dt=0.01.
    window_steps = 100
    stride = 10

    # Use a moderate number of windows to keep the script fast.
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
        ftle = compute_ftle_window(x0, dt, window_steps)

        rows.append(
            {
                "window_id": count,
                "start_index": start,
                "start_time": start * dt,
                "x": x0[0],
                "y": x0[1],
                "z": x0[2],
                "ftle": ftle,
            }
        )

        if count == 1 or count % 10 == 0:
            print(
                f"window {count:03d}/{len(start_indices)} "
                f"start_time={start * dt:.3f} ftle={ftle:.6f}"
            )

    ftles = np.array([row["ftle"] for row in rows])
    xs = np.array([row["x"] for row in rows])
    ys = np.array([row["y"] for row in rows])
    zs = np.array([row["z"] for row in rows])

    print()
    print("FTLE summary")
    print("============")
    print(f"mean_ftle: {ftles.mean():.8e}")
    print(f"std_ftle:  {ftles.std():.8e}")
    print(f"min_ftle:  {ftles.min():.8e}")
    print(f"max_ftle:  {ftles.max():.8e}")

    # Save CSV.
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

    # Save text report.
    with open(report_path, "w") as f:
        f.write("L63 physical RK4 finite-time Lyapunov exponents\n")
        f.write("===============================================\n")
        f.write(f"data_path: {data_path}\n")
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
            "FTLEs are computed from the physical RK4 map using finite-difference "
            "Jacobians. Values are associated with the starting points of each "
            "sliding window and visualised on the L63 attractor.\n"
        )

    print("saved:", report_path)

    # Histogram.
    plt.figure()
    plt.hist(ftles, bins=25)
    plt.xlabel("FTLE")
    plt.ylabel("count")
    plt.title("L63 physical RK4 FTLE distribution")
    plt.tight_layout()
    plt.savefig(hist_fig_path, dpi=150)
    plt.close()

    print("saved:", hist_fig_path)

    # FTLE overlaid on attractor projection.
    plt.figure()
    scatter = plt.scatter(xs, zs, c=ftles, s=20)
    plt.xlabel("x")
    plt.ylabel("z")
    plt.title("L63 FTLE field on attractor projection")
    plt.colorbar(scatter, label="FTLE")
    plt.tight_layout()
    plt.savefig(attractor_fig_path, dpi=150)
    plt.close()

    print("saved:", attractor_fig_path)


if __name__ == "__main__":
    main()
