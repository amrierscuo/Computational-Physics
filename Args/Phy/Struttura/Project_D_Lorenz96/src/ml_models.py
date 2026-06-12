"""
Neural-network models for Lorenz emulation.

This module contains two basic emulator architectures:

1. MLPEmulator
   - Fully connected neural network.
   - Can be used for both Lorenz-63 and Lorenz-96.
   - Treats the full state vector as a flat input.

2. PeriodicCNN1DEmulator
   - 1-D convolutional neural network with periodic padding.
   - Mainly useful for Lorenz-96 because L96 has a cyclic spatial structure.
   - Uses the same convolutional filters at every spatial location.

Both models can be trained either to predict:
- the next state x_{t+1};
- or the tendency (x_{t+1} - x_t) / dt.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class MLPEmulator(nn.Module):
    """
    Fully connected emulator for dynamical-system states.

    Parameters
    ----------
    input_dim : int
        Dimension of the input state.
        For L63, input_dim = 3.
        For L96, input_dim = 40.
    output_dim : int
        Dimension of the output.
        Usually same as input_dim.
    hidden_dim : int
        Number of units in each hidden layer.
    n_hidden_layers : int
        Number of hidden layers.
    activation : callable
        PyTorch activation class, for example nn.ReLU.

    Notes
    -----
    This model has no explicit knowledge of spatial structure.
    For L96, it sees the 40 variables as a flat vector.
    """

    def __init__(
        self,
        input_dim,
        output_dim,
        hidden_dim=256,
        n_hidden_layers=3,
        activation=nn.ReLU,
    ):
        super().__init__()

        layers = []

        # First layer maps from state dimension to hidden dimension.
        layers.append(nn.Linear(input_dim, hidden_dim))
        layers.append(activation())

        # Middle hidden layers.
        for _ in range(n_hidden_layers - 1):
            layers.append(nn.Linear(hidden_dim, hidden_dim))
            layers.append(activation())

        # Final layer maps back to the desired output dimension.
        layers.append(nn.Linear(hidden_dim, output_dim))

        self.net = nn.Sequential(*layers)

    def forward(self, x):
        """
        Forward pass.

        x shape:
            (batch, state_dim)

        output shape:
            (batch, output_dim)
        """
        return self.net(x)


class PeriodicCNN1DEmulator(nn.Module):
    """
    1-D CNN emulator with periodic padding.

    This model is designed for Lorenz-96.

    Lorenz-96 variables live on a cyclic ring:
        X_0, X_1, ..., X_{N-1}, then back to X_0.

    Standard zero padding would create artificial boundaries.
    Periodic padding avoids this by wrapping the state around before
    applying convolutions.

    Input shape:
        (batch, state_dim)

    Internally converted to:
        (batch, channels=1, state_dim)

    Output shape:
        (batch, state_dim)
    """

    def __init__(
        self,
        state_dim=40,
        hidden_channels=64,
        kernel_size=5,
        n_layers=3,
    ):
        super().__init__()

        if kernel_size % 2 == 0:
            raise ValueError("kernel_size should be odd for symmetric padding")

        self.state_dim = state_dim
        self.kernel_size = kernel_size
        self.pad = kernel_size // 2

        layers = []

        # First convolution maps 1 input channel to hidden channels.
        layers.append(nn.Conv1d(1, hidden_channels, kernel_size))
        layers.append(nn.ReLU())

        # Middle convolutional layers.
        for _ in range(n_layers - 1):
            layers.append(nn.Conv1d(hidden_channels, hidden_channels, kernel_size))
            layers.append(nn.ReLU())

        # Final 1x1 convolution maps hidden channels back to 1 output channel.
        layers.append(nn.Conv1d(hidden_channels, 1, kernel_size=1))

        self.layers = nn.ModuleList(layers)

    def _periodic_pad(self, x):
        """
        Apply periodic padding along the spatial dimension.

        Input shape:
            (batch, channels, state_dim)

        Output shape:
            (batch, channels, state_dim + 2 * pad)
        """
        if self.pad == 0:
            return x

        return F.pad(x, (self.pad, self.pad), mode="circular")

    def forward(self, x):
        """
        Forward pass.

        Input:
            x shape = (batch, state_dim)

        Output:
            y shape = (batch, state_dim)
        """

        # Add channel dimension for Conv1d.
        x = x.unsqueeze(1)

        # Apply all layers manually so we can use periodic padding before
        # every convolution with kernel_size > 1.
        for layer in self.layers:
            if isinstance(layer, nn.Conv1d) and layer.kernel_size[0] > 1:
                x = self._periodic_pad(x)

            x = layer(x)

        # Remove channel dimension.
        x = x.squeeze(1)

        return x


def count_parameters(model):
    """
    Count the number of trainable parameters in a PyTorch model.

    This is useful for the project table comparing:
    - model complexity;
    - offline error;
    - online/rollout error;
    - stability;
    - Lyapunov estimates.
    """
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
