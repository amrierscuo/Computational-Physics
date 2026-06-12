# DEMOL v24.2 - Lorenz-96 Project D Showroom

Static HTML/CSS/JS showroom for the FERS Project D Lorenz emulation work.

## What is new in v14

- Keeps all v5 content intact.
- Adds a new freestanding scientific concept display in the diagnostics quadrant.
- Places the previously created divergence-comparison image on its own large screen.
- Keeps the concept figure separate from the main dashboards to reduce visual overlap.
- Slightly updates text labels and loader copy to clarify the new layer.

## Local run

```powershell
cd "C:\Users\Gysgh\Desktop\Fers\testLLL\reference_projects\Computational-Physics\Args\Phy\Struttura\DEMOL"
python -m http.server 8000 --bind 127.0.0.1
```

Open:

```txt
http://127.0.0.1:8000
```

Or double-click `run_server_ipv4.bat`.

## Controls

- WASD: move
- Mouse: look around / look up
- Shift: faster walk
- ESC: unlock mouse
- R: reset sync clock
- P: pause/resume
- [ / ]: slower/faster loop
- T: toggle tour mode
- N: next tour step

## Data

`data/modelTrajectories.js` contains:

- physical L96 test-window trajectory
- MLP next real rollout
- MLP tendency real rollout
- CNN next real rollout
- CNN tendency real rollout

Visible v14 stations:

- Q1: physical RK4 truth
- Q2: MLP next real rollout against physical ghost
- Q3: CNN tendency real rollout against physical ghost
- Q4: diagnostics dashboard and HovmÃ¶ller 3D terrain

The other trajectories are already available for future toggles.


Additional v14 display:

- Diagnostics-side concept board: divergence / Lyapunov intuition figure placed next to Q4.


## V14 cleanup

- Added real log-RMSE(t) display computed from exported physical/MLP/CNN rollout trajectories.
- Added CNN periodic topology explanation panel near the CNN quadrant.
- Replaced the unfinished placeholder with a scientific mini leaderboard using the real L96 export metrics.
- Kept V8 menu, sync and 2D dashboards intact.


- The green diagnostic signboards in the HovmÃ¶ller 3D quadrant were removed.


- V14 removes the remaining diagnostics wall/bar chart in Q4, leaving the HovmÃ¶ller 3D quadrant clean.


## V14 additions
- Fly mode: PC uses F toggle, Space up, Ctrl/C down, Shift for speed.
- Mobile controls: joystick movement, right-side camera look, FLY toggle, â†‘/â†“ altitude.
- Collision preserved: floor clamp, roof clamp at 72, invisible lateral walls.


## V20 portal annex

Adds a lightweight single-scene portal to a distant Project Annex. The annex contains the leaderboard/project panels while preserving the clean main HovmÃ¶ller quadrant. PC uses E near the portal; mobile shows a PORTAL button near the trigger.


## V20 cleanup

The Project Annex now contains only one dynamic leaderboard panel. It updates during the shared 0â€“15 s rollout loop and ranks the models by live RMSE.


V20 cleanup: Project Annex contains only the dynamic leaderboard. Extra context panels and scientific comparison figure were removed; L63/FTLE simulation is reserved for the next build.
