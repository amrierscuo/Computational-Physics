"""
Utilities for simulating Lorenz-63 and Lorenz-96 systems.

This module contains:
- right-hand-side functions for Lorenz-63 and Lorenz-96;
- a generic RK4 time-stepping routine;
- trajectory generation utilities;
- train/validation/test splitting;
- supervised learning pair construction.

The goal is to keep the dynamical-system code separate from the ML code,
so that the same trajectories can be reused by the MLP, CNN, rollout,
Lyapunov, and FTLE parts of the project.
"""

import numpy as np


def lorenz63_rhs(x, sigma=10.0, rho=28.0, beta=8.0 / 3.0):
    """
    Compute the Lorenz-63 right-hand side.

    The Lorenz-63 system is a 3-dimensional chaotic system:

        dx/dt = sigma * (y - x)
        dy/dt = x * (rho - z) - y
        dz/dt = x * y - beta * z

    Standard chaotic parameters are:
        sigma = 10
        rho   = 28
        beta  = 8/3

    Parameters
    ----------
    x : array-like, shape (3,)
        Current state vector [x, y, z].
    sigma : float
        Prandtl-number-like parameter.
    rho : float
        Rayleigh-number-like forcing parameter.
    beta : float
        Geometric parameter.

    Returns
    -------
    dxdt : ndarray, shape (3,)
        Time derivative of the current state.
    """
    x = np.asarray(x, dtype=np.float64)

    # Allocate output with the same shape as the input state.
    dx = np.empty_like(x)

    # Unpack the three state variables for readability.
    x0 = x[0]
    y0 = x[1]
    z0 = x[2]

    # Lorenz-63 equations.
    dx[0] = sigma * (y0 - x0)
    dx[1] = x0 * (rho - z0) - y0
    dx[2] = x0 * y0 - beta * z0

    return dx


def lorenz96_rhs(x, F=8.0):
    """
    Compute the Lorenz-96 right-hand side.

    The Lorenz-96 system is an N-dimensional chaotic model with periodic
    boundary conditions. It is often used as a simplified model of
    large-scale atmospheric dynamics.

    Equation:

        dX_k/dt = (X_{k+1} - X_{k-2}) * X_{k-1} - X_k + F

    where the indices are cyclic, so for N variables:
        X_{-1} = X_{N-1}
        X_N    = X_0

    Parameters
    ----------
    x : array-like, shape (N,)
        Current Lorenz-96 state.
    F : float
        Constant forcing. The project uses F = 8.

    Returns
    -------
    dxdt : ndarray, shape (N,)
        Time derivative of the current state.
    """
    x = np.asarray(x, dtype=np.float64)

    # np.roll implements cyclic indexing:
    # np.roll(x, -1) gives X_{k+1}
    # np.roll(x,  1) gives X_{k-1}
    # np.roll(x,  2) gives X_{k-2}
    x_plus_1 = np.roll(x, -1)
    x_minus_1 = np.roll(x, 1)
    x_minus_2 = np.roll(x, 2)

    # Lorenz-96 equation with cyclic boundary conditions.
    dx = (x_plus_1 - x_minus_2) * x_minus_1 - x + F

    return dx


def rk4_step(rhs, x, dt, **rhs_kwargs):
    """
    Advance one time step using the classical fourth-order Runge-Kutta method.

    RK4 is used here because the project asks for reference trajectories
    generated with RK4. It gives a stable and accurate reference integration
    for small time steps such as dt = 0.01.

    Parameters
    ----------
    rhs : callable
        Function that computes dx/dt from the current state.
    x : array-like
        Current state.
    dt : float
        Time step.
    rhs_kwargs : dict
        Additional keyword arguments passed to the RHS function,
        for example F=8.0 for Lorenz-96.

    Returns
    -------
    x_next : ndarray
        State after one RK4 time step.
    """
    x = np.asarray(x, dtype=np.float64)

    # Four RK4 slope evaluations.
    k1 = rhs(x, **rhs_kwargs)
    k2 = rhs(x + 0.5 * dt * k1, **rhs_kwargs)
    k3 = rhs(x + 0.5 * dt * k2, **rhs_kwargs)
    k4 = rhs(x + dt * k3, **rhs_kwargs)

    # Weighted average of the four slopes.
    x_next = x + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)

    return x_next


def integrate(rhs, x0, dt, n_steps, spinup=0, sample_every=1, **rhs_kwargs):
    """
    Integrate a dynamical system using RK4 and return a saved trajectory.

    The function first runs a spin-up phase and discards those states.
    This is useful for chaotic systems because we usually want the saved
    trajectory to lie on the attractor rather than depend strongly on the
    arbitrary initial condition.

    Parameters
    ----------
    rhs : callable
        Right-hand-side function, such as lorenz63_rhs or lorenz96_rhs.
    x0 : array-like
        Initial condition.
    dt : float
        RK4 time step.
    n_steps : int
        Number of states to save after spin-up.
    spinup : int
        Number of RK4 steps to discard before saving.
    sample_every : int
        Save one state every sample_every RK4 steps.
        For example, sample_every=10 saves every 10th state.
    rhs_kwargs : dict
        Extra parameters passed to the RHS function.

    Returns
    -------
    trajectory : ndarray, shape (n_steps, state_dimension)
        Saved trajectory after spin-up.
    """
    x = np.asarray(x0, dtype=np.float64).copy()

    # Spin-up phase: advance the system but do not store states.
    for _ in range(spinup):
        x = rk4_step(rhs, x, dt, **rhs_kwargs)

    saved = []

    # If sample_every > 1, we perform more RK4 steps than saved samples.
    total_steps = n_steps * sample_every

    for step in range(total_steps):
        x = rk4_step(rhs, x, dt, **rhs_kwargs)

        # Store only every sample_every-th state.
        if (step + 1) % sample_every == 0:
            saved.append(x.copy())

    return np.asarray(saved)


def split_train_val_test(traj, train_frac=0.70, val_frac=0.15):
    """
    Split a trajectory into non-overlapping train, validation, and test windows.

    This follows the project requirement that train, validation, and test
    periods must not overlap. Because this is time-series data, we keep
    the chronological order instead of randomly shuffling the samples.

    Parameters
    ----------
    traj : ndarray, shape (time, state_dimension)
        Full trajectory.
    train_frac : float
        Fraction of trajectory used for training.
    val_frac : float
        Fraction of trajectory used for validation.
        The remaining fraction is used for testing.

    Returns
    -------
    train : ndarray
        First part of the trajectory.
    val : ndarray
        Middle part of the trajectory.
    test : ndarray
        Final part of the trajectory.
    """
    n = len(traj)

    n_train = int(n * train_frac)
    n_val = int(n * val_frac)

    train = traj[:n_train]
    val = traj[n_train:n_train + n_val]
    test = traj[n_train + n_val:]

    return train, val, test


def make_supervised_pairs(traj, mode="next_state", dt=0.01):
    """
    Convert a trajectory into one-step supervised learning pairs.

    This supports the two prediction targets required by the project:

    1. next_state:
        input  = x_t
        target = x_{t+1}

    2. tendency:
        input  = x_t
        target = (x_{t+1} - x_t) / dt

    A model trained in next_state mode directly predicts the next state.
    A model trained in tendency mode predicts the time derivative or finite
    difference tendency, which can later be converted into a next-step update.

    Parameters
    ----------
    traj : ndarray, shape (time, state_dimension)
        Input trajectory.
    mode : {"next_state", "tendency"}
        Type of supervised target to construct.
    dt : float
        Time step used for tendency targets.

    Returns
    -------
    x : ndarray, shape (time - 1, state_dimension)
        Input states.
    y : ndarray, shape (time - 1, state_dimension)
        Targets.
    """
    # Inputs are all states except the final one.
    x = traj[:-1]

    if mode == "next_state":
        # Target is the following state.
        y = traj[1:]

    elif mode == "tendency":
        # Target is a finite-difference approximation of dx/dt.
        y = (traj[1:] - traj[:-1]) / dt

    else:
        raise ValueError("mode must be 'next_state' or 'tendency'")

    return x, y
