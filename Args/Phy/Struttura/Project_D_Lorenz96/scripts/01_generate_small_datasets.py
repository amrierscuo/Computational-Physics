"""
Generate small provisional Lorenz-63 and Lorenz-96 datasets.

These datasets are intentionally small and quick to generate.
Their purpose is to let the ML part of the project start early:
- Student 2 can test MLP/CNN training loops.
- Student 3 can test rollout and diagnostic code.
- Later, we can generate larger final datasets with the same structure.

All outputs are saved under ./data, which is inside /work/ext/st02,
not inside the small home directory.
"""

from pathlib import Path

import numpy as np

from src.lorenz_systems import (
    lorenz63_rhs,
    lorenz96_rhs,
    integrate,
    split_train_val_test,
    make_supervised_pairs,
)


def save_dataset(name, traj, dt):
    """
    Save one trajectory and its supervised-learning splits.

    Parameters
    ----------
    name : str
        Dataset name, for example "l63" or "l96".
    traj : ndarray
        Full simulated trajectory with shape (time, state_dimension).
    dt : float
        Integration time step.

    The saved .npz file contains:
    - the full trajectory;
    - chronological train/validation/test splits;
    - next-state prediction pairs;
    - tendency prediction pairs.
    """

    # Make sure the output directory exists.
    out_dir = Path("data")
    out_dir.mkdir(exist_ok=True)

    # Split the full trajectory into non-overlapping time windows.
    # We do not shuffle because this is time-series data.
    train, val, test = split_train_val_test(traj)

    # Create supervised pairs for next-state prediction:
    # input x_t, target x_{t+1}.
    x_train_next, y_train_next = make_supervised_pairs(
        train, mode="next_state", dt=dt
    )
    x_val_next, y_val_next = make_supervised_pairs(
        val, mode="next_state", dt=dt
    )
    x_test_next, y_test_next = make_supervised_pairs(
        test, mode="next_state", dt=dt
    )

    # Create supervised pairs for tendency prediction:
    # input x_t, target (x_{t+1} - x_t) / dt.
    x_train_tend, y_train_tend = make_supervised_pairs(
        train, mode="tendency", dt=dt
    )
    x_val_tend, y_val_tend = make_supervised_pairs(
        val, mode="tendency", dt=dt
    )
    x_test_tend, y_test_tend = make_supervised_pairs(
        test, mode="tendency", dt=dt
    )

    # Final output file.
    path = out_dir / f"{name}_small.npz"

    # Save everything in compressed NumPy format.
    # This keeps all arrays together and makes loading easy later.
    np.savez_compressed(
        path,
        dt=dt,
        trajectory=traj,
        train=train,
        val=val,
        test=test,
        x_train_next=x_train_next,
        y_train_next=y_train_next,
        x_val_next=x_val_next,
        y_val_next=y_val_next,
        x_test_next=x_test_next,
        y_test_next=y_test_next,
        x_train_tend=x_train_tend,
        y_train_tend=y_train_tend,
        x_val_tend=x_val_tend,
        y_val_tend=y_val_tend,
        x_test_tend=x_test_tend,
        y_test_tend=y_test_tend,
    )

    # Print a compact summary so we can check the result from the terminal.
    print(f"saved: {path}")
    print(f"full trajectory: {traj.shape}")
    print(f"train: {train.shape} | val: {val.shape} | test: {test.shape}")
    print()


def main():
    """
    Generate small L63 and L96 datasets.

    Project parameters:
    - L63: sigma=10, rho=28, beta=8/3 are default in lorenz63_rhs.
    - L96: N=40, F=8.
    - dt=0.01 as required by the project.

    For the small provisional dataset:
    - n_steps=10000 after spin-up;
    - spinup=1000.
    """

    dt = 0.01

    # -------------------------
    # Lorenz-63 small dataset
    # -------------------------

    # Standard nonzero initial condition for L63.
    l63_x0 = np.array([1.0, 1.0, 1.0])

    # Integrate and discard spin-up so the trajectory is closer to the attractor.
    l63 = integrate(
        lorenz63_rhs,
        l63_x0,
        dt=dt,
        n_steps=10000,
        spinup=1000,
    )

    # -------------------------
    # Lorenz-96 small dataset
    # -------------------------

    # Lorenz-96 starts near the forcing value F=8.
    # A small perturbation is added to avoid a perfectly symmetric state.
    l96_x0 = np.ones(40) * 8.0
    l96_x0[0] += 0.01

    # Integrate L96 with N=40 and forcing F=8.
    l96 = integrate(
        lorenz96_rhs,
        l96_x0,
        dt=dt,
        n_steps=10000,
        spinup=1000,
        F=8.0,
    )

    # Save both datasets using the same structure.
    save_dataset("l63", l63, dt)
    save_dataset("l96", l96, dt)


if __name__ == "__main__":
    main()
