(() => {
  "use strict";

  const canvas = document.getElementById("sphereCanvas");
  const panel = document.getElementById("spherePanel");
  const context = canvas.getContext("2d");
  const faceNames = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"];
  const faceColors = ["#6fffe9", "#55c9ba", "#d8ff78", "#ff8066", "#b09cff", "#72a8ff"];
  const earthRadiusKm = 6371.0088;
  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    level: 3,
    yaw: -0.62,
    pitch: 0.3,
    size: 0.86,
    spinning: !prefersReducedMotion,
    selected: { face: 4, i: 4, j: 4 },
    dirty: true,
    lastTime: performance.now(),
    lastDraw: 0,
    drag: null,
    pointers: new Map()
  };

  const elements = {
    level: document.getElementById("level"),
    levelValue: document.getElementById("levelValue"),
    globeSize: document.getElementById("globeSize"),
    sizeValue: document.getElementById("sizeValue"),
    spinToggle: document.getElementById("spinToggle"),
    cellCount: document.getElementById("cellCount"),
    meanArea: document.getElementById("meanArea"),
    faceValue: document.getElementById("faceValue"),
    cellAddress: document.getElementById("cellAddress"),
    hoverCell: document.getElementById("hoverCell"),
    copyCell: document.getElementById("copyCell")
  };

  function normalize(point) {
    const length = Math.hypot(point[0], point[1], point[2]);
    return [point[0] / length, point[1] / length, point[2] / length];
  }

  function facePoint(face, u, v) {
    const points = [[1, u, v], [-1, u, -v], [u, 1, v], [u, -1, -v], [u, v, 1], [-u, v, -1]];
    return normalize(points[face]);
  }

  function rotate(point) {
    const cosy = Math.cos(state.yaw);
    const siny = Math.sin(state.yaw);
    const cosp = Math.cos(state.pitch);
    const sinp = Math.sin(state.pitch);
    const x1 = point[0] * cosy + point[2] * siny;
    const z1 = -point[0] * siny + point[2] * cosy;
    return [x1, point[1] * cosp - z1 * sinp, point[1] * sinp + z1 * cosp];
  }

  function inverseRotate(point) {
    const cosy = Math.cos(state.yaw);
    const siny = Math.sin(state.yaw);
    const cosp = Math.cos(state.pitch);
    const sinp = Math.sin(state.pitch);
    const y = point[1] * cosp + point[2] * sinp;
    const z1 = -point[1] * sinp + point[2] * cosp;
    return [point[0] * cosy - z1 * siny, y, point[0] * siny + z1 * cosy];
  }

  function metrics() {
    const rect = panel.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.3 : 1.7);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      state.dirty = true;
    }
    return {
      width,
      height,
      dpr,
      cx: width * 0.5,
      cy: height * 0.5,
      radius: Math.min(width, height) * 0.47 * state.size
    };
  }

  function project(point, view) {
    const rotated = rotate(point);
    return { x: view.cx + rotated[0] * view.radius, y: view.cy - rotated[1] * view.radius, z: rotated[2] };
  }

  function traceGridLine(face, fixed, axis, view, style, width, samples) {
    context.beginPath();
    let drawing = false;
    for (let sample = 0; sample <= samples; sample += 1) {
      const moving = -1 + sample * 2 / samples;
      const point = project(facePoint(face, axis === 0 ? fixed : moving, axis === 0 ? moving : fixed), view);
      if (point.z > -0.012) {
        if (!drawing) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
        drawing = true;
      } else {
        drawing = false;
      }
    }
    context.strokeStyle = style;
    context.lineWidth = width;
    context.stroke();
  }

  function cellBoundary(cell) {
    const count = 2 ** state.level;
    const u0 = -1 + cell.i * 2 / count;
    const u1 = -1 + (cell.i + 1) * 2 / count;
    const v0 = -1 + cell.j * 2 / count;
    const v1 = -1 + (cell.j + 1) * 2 / count;
    const points = [];
    const samples = 18;
    for (let k = 0; k <= samples; k += 1) points.push(facePoint(cell.face, u0 + (u1 - u0) * k / samples, v0));
    for (let k = 1; k <= samples; k += 1) points.push(facePoint(cell.face, u1, v0 + (v1 - v0) * k / samples));
    for (let k = 1; k <= samples; k += 1) points.push(facePoint(cell.face, u1 - (u1 - u0) * k / samples, v1));
    for (let k = 1; k < samples; k += 1) points.push(facePoint(cell.face, u0, v1 - (v1 - v0) * k / samples));
    return points;
  }

  function drawSelection(view) {
    const points = cellBoundary(state.selected).map(point => project(point, view));
    if (points.every(point => point.z < -0.02)) return;
    context.beginPath();
    let started = false;
    for (const point of points) {
      if (point.z >= -0.02) {
        if (!started) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
        started = true;
      }
    }
    if (!started) return;
    context.closePath();
    context.fillStyle = "rgba(216,255,120,0.28)";
    context.fill();
    context.strokeStyle = "#efffbf";
    context.lineWidth = 2.4 * view.dpr;
    context.shadowColor = "rgba(216,255,120,0.65)";
    context.shadowBlur = 10 * view.dpr;
    context.stroke();
    context.shadowBlur = 0;
  }

  function drawFaceLabels(view) {
    context.font = `${Math.max(10, 11 * view.dpr)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let face = 0; face < 6; face += 1) {
      const center = project(facePoint(face, 0, 0), view);
      if (center.z < 0.22) continue;
      context.fillStyle = "rgba(235,247,243,0.7)";
      context.fillText(faceNames[face], center.x, center.y);
    }
  }

  function draw() {
    const view = metrics();
    context.clearRect(0, 0, view.width, view.height);

    const background = context.createRadialGradient(view.cx - view.radius * 0.34, view.cy - view.radius * 0.38, 0, view.cx, view.cy, view.radius * 1.25);
    background.addColorStop(0, "#254b43");
    background.addColorStop(0.48, "#10231f");
    background.addColorStop(1, "#020706");
    context.fillStyle = background;
    context.beginPath();
    context.arc(view.cx, view.cy, view.radius, 0, Math.PI * 2);
    context.fill();

    const subdivisions = 2 ** state.level;
    const samples = state.level <= 3 ? 34 : state.level <= 5 ? 24 : 16;
    for (let face = 0; face < 6; face += 1) {
      for (let axis = 0; axis < 2; axis += 1) {
        for (let line = 0; line <= subdivisions; line += 1) {
          const fixed = -1 + line * 2 / subdivisions;
          const boundary = line === 0 || line === subdivisions;
          const alpha = boundary ? 0.77 : state.level > 5 ? 0.25 : 0.4;
          traceGridLine(face, fixed, axis, view, `${faceColors[face]}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`, (boundary ? 1.45 : 0.75) * view.dpr, samples);
        }
      }
    }

    drawSelection(view);
    drawFaceLabels(view);
    context.strokeStyle = "rgba(226,255,247,0.42)";
    context.lineWidth = 1.2 * view.dpr;
    context.beginPath();
    context.arc(view.cx, view.cy, view.radius, 0, Math.PI * 2);
    context.stroke();
    state.dirty = false;
  }

  function cellFromClient(clientX, clientY) {
    const view = metrics();
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width * view.width - view.cx) / view.radius;
    const y = -((clientY - rect.top) / rect.height * view.height - view.cy) / view.radius;
    const radius2 = x * x + y * y;
    if (radius2 > 1) return null;
    const world = inverseRotate([x, y, Math.sqrt(Math.max(0, 1 - radius2))]);
    const absolute = world.map(Math.abs);
    const dominant = Math.max(...absolute);
    let face;
    let u;
    let v;
    if (absolute[0] === dominant) {
      face = world[0] >= 0 ? 0 : 1;
      u = world[1] / dominant;
      v = face === 0 ? world[2] / dominant : -world[2] / dominant;
    } else if (absolute[1] === dominant) {
      face = world[1] >= 0 ? 2 : 3;
      u = world[0] / dominant;
      v = face === 2 ? world[2] / dominant : -world[2] / dominant;
    } else {
      face = world[2] >= 0 ? 4 : 5;
      u = face === 4 ? world[0] / dominant : -world[0] / dominant;
      v = world[1] / dominant;
    }
    const count = 2 ** state.level;
    return {
      face,
      i: Math.min(count - 1, Math.max(0, Math.floor((u + 1) * 0.5 * count))),
      j: Math.min(count - 1, Math.max(0, Math.floor((v + 1) * 0.5 * count)))
    };
  }

  function normalizeSelection(previousLevel) {
    if (state.level > previousLevel) {
      const factor = 2 ** (state.level - previousLevel);
      state.selected.i *= factor;
      state.selected.j *= factor;
    } else if (state.level < previousLevel) {
      const factor = 2 ** (previousLevel - state.level);
      state.selected.i = Math.floor(state.selected.i / factor);
      state.selected.j = Math.floor(state.selected.j / factor);
    }
  }

  function updateMeasurements() {
    const total = 6 * 4 ** state.level;
    const meanArea = 4 * Math.PI * earthRadiusKm ** 2 / total;
    elements.level.value = String(state.level);
    elements.levelValue.textContent = String(state.level);
    elements.globeSize.value = String(Math.round(state.size * 100));
    elements.sizeValue.textContent = `${Math.round(state.size * 100)}%`;
    elements.cellCount.textContent = total.toLocaleString();
    elements.meanArea.textContent = meanArea >= 1e6 ? `${(meanArea / 1e6).toFixed(2)}M km2` : `${Math.round(meanArea).toLocaleString()} km2`;
    elements.faceValue.textContent = faceNames[state.selected.face];
    elements.cellAddress.textContent = `L${state.level} / ${state.selected.i} / ${state.selected.j}`;
    elements.hoverCell.textContent = `6 faces x 4^${state.level} = ${total.toLocaleString()} cells`;
    elements.spinToggle.textContent = state.spinning ? "Pause rotation" : "Resume rotation";
    elements.spinToggle.classList.toggle("is-active", state.spinning);
  }

  function setLevel(level) {
    const previous = state.level;
    state.level = Math.min(7, Math.max(0, level));
    normalizeSelection(previous);
    state.dirty = true;
    updateMeasurements();
  }

  function setSize(size) {
    state.size = Math.min(1.05, Math.max(0.58, size));
    state.dirty = true;
    updateMeasurements();
  }

  elements.level.addEventListener("input", () => setLevel(Number(elements.level.value)));
  elements.globeSize.addEventListener("input", () => setSize(Number(elements.globeSize.value) / 100));
  document.getElementById("subdivideCell").addEventListener("click", () => setLevel(state.level + 1));
  document.getElementById("parentCell").addEventListener("click", () => setLevel(state.level - 1));
  document.getElementById("levelUp").addEventListener("click", () => setLevel(state.level + 1));
  document.getElementById("levelDown").addEventListener("click", () => setLevel(state.level - 1));
  elements.spinToggle.addEventListener("click", () => {
    state.spinning = !state.spinning;
    state.lastTime = performance.now();
    updateMeasurements();
  });
  document.getElementById("resetSphere").addEventListener("click", () => {
    state.yaw = -0.62;
    state.pitch = 0.3;
    state.dirty = true;
  });
  elements.copyCell.addEventListener("click", async () => {
    const value = `${faceNames[state.selected.face]} / L${state.level} / ${state.selected.i} / ${state.selected.j}`;
    try {
      await navigator.clipboard.writeText(value);
      elements.copyCell.textContent = "Cell address copied";
    } catch {
      elements.copyCell.textContent = value;
    }
    setTimeout(() => { elements.copyCell.textContent = "Copy cell address"; }, 1800);
  });

  function beginPointerGesture() {
    const points = [...state.pointers.values()];
    if (points.length === 1) {
      state.drag = { type: "rotate", point: points[0], yaw: state.yaw, pitch: state.pitch, moved: false };
    } else if (points.length >= 2) {
      state.drag = { type: "pinch", distance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)), size: state.size, moved: true };
    }
  }

  canvas.addEventListener("pointerdown", event => {
    canvas.setPointerCapture(event.pointerId);
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.spinning = false;
    beginPointerGesture();
    updateMeasurements();
  });

  canvas.addEventListener("pointermove", event => {
    const hover = cellFromClient(event.clientX, event.clientY);
    if (hover) elements.hoverCell.textContent = `${faceNames[hover.face]} / L${state.level} / ${hover.i} / ${hover.j}`;
    if (!state.pointers.has(event.pointerId)) return;
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...state.pointers.values()];
    if (state.drag?.type === "rotate" && points.length === 1) {
      const dx = points[0].x - state.drag.point.x;
      const dy = points[0].y - state.drag.point.y;
      state.yaw = state.drag.yaw + dx * 0.008;
      state.pitch = Math.min(1.35, Math.max(-1.35, state.drag.pitch + dy * 0.008));
      state.drag.moved = state.drag.moved || Math.hypot(dx, dy) > 5;
    } else if (state.drag?.type === "pinch" && points.length >= 2) {
      const distance = Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
      state.size = Math.min(1.05, Math.max(0.58, state.drag.size * distance / state.drag.distance));
      updateMeasurements();
    }
    state.dirty = true;
  });

  function endPointer(event) {
    const wasClick = state.drag?.type === "rotate" && !state.drag.moved;
    state.pointers.delete(event.pointerId);
    if (wasClick) {
      const selected = cellFromClient(event.clientX, event.clientY);
      if (selected) {
        state.selected = selected;
        state.dirty = true;
        updateMeasurements();
      }
    }
    beginPointerGesture();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => {
    const total = 6 * 4 ** state.level;
    elements.hoverCell.textContent = `6 faces x 4^${state.level} = ${total.toLocaleString()} cells`;
  });
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    setSize(state.size * Math.exp(-event.deltaY * 0.0008));
  }, { passive: false });

  function animate(now) {
    const elapsed = Math.min(50, now - state.lastTime);
    state.lastTime = now;
    if (state.spinning && !document.hidden) {
      state.yaw += elapsed * 0.00008;
      state.dirty = true;
    }
    if (state.dirty && (!state.spinning || now - state.lastDraw >= 33)) {
      draw();
      state.lastDraw = now;
    }
    requestAnimationFrame(animate);
  }

  updateMeasurements();
  new ResizeObserver(() => { state.dirty = true; }).observe(panel);
  requestAnimationFrame(animate);
})();
