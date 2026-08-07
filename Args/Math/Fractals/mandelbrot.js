(() => {
  "use strict";

  const canvas = document.getElementById("fractalCanvas");
  const panel = document.getElementById("renderPanel");
  const fallback = document.getElementById("fallbackMessage");
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance"
  });

  if (!gl) {
    fallback.classList.add("is-visible");
    return;
  }

  const vertexSource = `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform vec2 u_center;
    uniform float u_span;
    uniform int u_iterations;
    uniform int u_palette;

    vec3 palette(float t) {
      float a = 6.28318530718 * t;
      if (u_palette == 1) {
        return 0.50 + 0.50 * cos(a + vec3(0.10, 1.35, 2.65));
      }
      if (u_palette == 2) {
        return 0.48 + 0.52 * cos(a + vec3(2.10, 0.85, 0.10));
      }
      if (u_palette == 3) {
        float value = 0.12 + 0.88 * t;
        return vec3(value);
      }
      return 0.48 + 0.52 * cos(a + vec3(3.05, 1.02, 0.25));
    }

    void main() {
      vec2 offset = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.x;
      vec2 c = u_center + offset * u_span;
      vec2 z = vec2(0.0);
      float smoothIteration = 0.0;
      bool escaped = false;

      for (int i = 0; i < 1200; i++) {
        if (i >= u_iterations) break;
        float x = z.x * z.x - z.y * z.y + c.x;
        float y = 2.0 * z.x * z.y + c.y;
        z = vec2(x, y);
        float magnitude = dot(z, z);
        if (magnitude > 256.0) {
          smoothIteration = float(i) + 1.0 - log2(log2(sqrt(magnitude)));
          escaped = true;
          break;
        }
      }

      if (!escaped) {
        gl_FragColor = vec4(0.006, 0.018, 0.016, 1.0);
      } else {
        float band = 0.5 + 0.5 * cos(smoothIteration * 0.19);
        float t = fract(smoothIteration * 0.027 + 0.06 * band);
        vec3 color = palette(t);
        float exposure = 0.34 + 0.72 * (1.0 - exp(-smoothIteration * 0.035));
        gl_FragColor = vec4(color * exposure, 1.0);
      }
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
    }
    return shader;
  }

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    console.error(error);
    fallback.textContent = "The GPU renderer could not be initialized on this device.";
    fallback.classList.add("is-visible");
    return;
  }

  const presets = {
    overview: { x: -0.5, y: 0, span: 3.2, iterations: 320, targetX: -0.743643887, targetY: 0.131825904 },
    seahorse: { x: -0.743643887, y: 0.131825904, span: 0.018, iterations: 460, targetX: -0.743643887, targetY: 0.131825904 },
    elephant: { x: 0.285, y: 0.01, span: 0.16, iterations: 420, targetX: 0.285, targetY: 0.01 },
    spiral: { x: -0.776680, y: 0.136640, span: 0.012, iterations: 560, targetX: -0.776680, targetY: 0.136640 },
    needle: { x: -1.749420, y: 0.000000, span: 0.018, iterations: 600, targetX: -1.749420, targetY: 0 }
  };
  const paletteMap = { tidal: 0, ember: 1, violet: 2, mono: 3 };
  const state = {
    x: presets.overview.x,
    y: presets.overview.y,
    span: presets.overview.span,
    iterations: presets.overview.iterations,
    palette: 0,
    auto: false,
    autoTargetX: presets.overview.targetX,
    autoTargetY: presets.overview.targetY,
    dirty: true,
    lastFrame: performance.now()
  };

  const locations = {
    position: gl.getAttribLocation(program, "a_position"),
    resolution: gl.getUniformLocation(program, "u_resolution"),
    center: gl.getUniformLocation(program, "u_center"),
    span: gl.getUniformLocation(program, "u_span"),
    iterations: gl.getUniformLocation(program, "u_iterations"),
    palette: gl.getUniformLocation(program, "u_palette")
  };

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  const elements = {
    preset: document.getElementById("preset"),
    iterations: document.getElementById("iterations"),
    iterationValue: document.getElementById("iterationValue"),
    palette: document.getElementById("palette"),
    autoDive: document.getElementById("autoDive"),
    zoomValue: document.getElementById("zoomValue"),
    spanValue: document.getElementById("spanValue"),
    realValue: document.getElementById("realValue"),
    imagValue: document.getElementById("imagValue"),
    pointerCoordinate: document.getElementById("pointerCoordinate"),
    copyLink: document.getElementById("copyLink")
  };

  function formatNumber(value, digits = 8) {
    if (Math.abs(value) > 0 && Math.abs(value) < 0.00001) return value.toExponential(5);
    return value.toFixed(digits);
  }

  function updateMeasurements() {
    elements.zoomValue.textContent = `${(3.2 / state.span).toLocaleString(undefined, { maximumFractionDigits: 1 })}x`;
    elements.spanValue.textContent = formatNumber(state.span, state.span < 0.001 ? 7 : 5);
    elements.realValue.textContent = formatNumber(state.x);
    elements.imagValue.textContent = formatNumber(state.y);
    elements.iterationValue.textContent = String(state.iterations);
  }

  function serializeView() {
    const values = [state.x, state.y, state.span, state.iterations, state.palette].map((value, index) => index < 3 ? Number(value).toPrecision(12) : value);
    history.replaceState(null, "", `#${values.join(",")}`);
  }

  function loadHash() {
    if (!location.hash) return false;
    const values = location.hash.slice(1).split(",").map(Number);
    if (values.length < 3 || values.slice(0, 3).some(value => !Number.isFinite(value))) return false;
    state.x = values[0];
    state.y = values[1];
    state.span = Math.min(4, Math.max(1e-7, values[2]));
    if (Number.isFinite(values[3])) state.iterations = Math.min(1000, Math.max(80, Math.round(values[3] / 20) * 20));
    if (Number.isFinite(values[4])) state.palette = Math.min(3, Math.max(0, Math.round(values[4])));
    return true;
  }

  function resize() {
    const rect = panel.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.15 : 1.6);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      state.dirty = true;
    }
  }

  function draw() {
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.enableVertexAttribArray(locations.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(locations.resolution, canvas.width, canvas.height);
    gl.uniform2f(locations.center, state.x, state.y);
    gl.uniform1f(locations.span, state.span);
    gl.uniform1i(locations.iterations, state.iterations);
    gl.uniform1i(locations.palette, state.palette);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.dirty = false;
  }

  function complexAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: state.x + ((clientX - rect.left) - rect.width / 2) / rect.width * state.span,
      y: state.y + (rect.height / 2 - (clientY - rect.top)) / rect.width * state.span
    };
  }

  function zoomAt(clientX, clientY, factor) {
    const anchor = complexAt(clientX, clientY);
    const nextSpan = Math.min(4, Math.max(1e-7, state.span * factor));
    const ratio = nextSpan / state.span;
    state.x = anchor.x + (state.x - anchor.x) * ratio;
    state.y = anchor.y + (state.y - anchor.y) * ratio;
    state.span = nextSpan;
    state.dirty = true;
    updateMeasurements();
  }

  function setAuto(active) {
    state.auto = active;
    elements.autoDive.textContent = active ? "Pause auto dive" : "Start auto dive";
    elements.autoDive.classList.toggle("is-active", active);
    state.lastFrame = performance.now();
  }

  function usePreset(name) {
    const preset = presets[name] || presets.overview;
    state.x = preset.x;
    state.y = preset.y;
    state.span = preset.span;
    state.iterations = preset.iterations;
    state.autoTargetX = preset.targetX;
    state.autoTargetY = preset.targetY;
    elements.iterations.value = String(state.iterations);
    setAuto(false);
    state.dirty = true;
    updateMeasurements();
    serializeView();
  }

  const pointers = new Map();
  let gesture = null;

  function beginGesture() {
    const values = [...pointers.values()];
    if (values.length === 1) {
      gesture = { type: "pan", point: values[0], x: state.x, y: state.y, span: state.span };
    } else if (values.length >= 2) {
      const distance = Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y);
      gesture = { type: "pinch", distance: Math.max(1, distance), span: state.span };
    }
  }

  canvas.addEventListener("pointerdown", event => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setAuto(false);
    beginGesture();
  });

  canvas.addEventListener("pointermove", event => {
    const point = complexAt(event.clientX, event.clientY);
    elements.pointerCoordinate.textContent = `c = ${formatNumber(point.x, 6)} ${point.y < 0 ? "-" : "+"} ${formatNumber(Math.abs(point.y), 6)}i`;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = [...pointers.values()];
    const rect = canvas.getBoundingClientRect();
    if (gesture?.type === "pan" && values.length === 1) {
      state.x = gesture.x - (values[0].x - gesture.point.x) / rect.width * gesture.span;
      state.y = gesture.y + (values[0].y - gesture.point.y) / rect.width * gesture.span;
    } else if (gesture?.type === "pinch" && values.length >= 2) {
      const distance = Math.max(1, Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y));
      state.span = Math.min(4, Math.max(1e-7, gesture.span * gesture.distance / distance));
    }
    state.dirty = true;
    updateMeasurements();
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    beginGesture();
    serializeView();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    setAuto(false);
    zoomAt(event.clientX, event.clientY, Math.exp(event.deltaY * 0.0012));
    serializeView();
  }, { passive: false });

  canvas.addEventListener("dblclick", event => {
    setAuto(false);
    zoomAt(event.clientX, event.clientY, 0.42);
    serializeView();
  });

  elements.preset.addEventListener("change", () => usePreset(elements.preset.value));
  elements.iterations.addEventListener("input", () => {
    state.iterations = Number(elements.iterations.value);
    state.dirty = true;
    updateMeasurements();
  });
  elements.iterations.addEventListener("change", serializeView);
  elements.palette.addEventListener("change", () => {
    state.palette = paletteMap[elements.palette.value] ?? 0;
    state.dirty = true;
    serializeView();
  });
  elements.autoDive.addEventListener("click", () => setAuto(!state.auto));
  document.getElementById("resetView").addEventListener("click", () => usePreset("overview"));
  document.getElementById("zoomIn").addEventListener("click", () => {
    const rect = canvas.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.55);
    serializeView();
  });
  document.getElementById("zoomOut").addEventListener("click", () => {
    const rect = canvas.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.8);
    serializeView();
  });
  elements.copyLink.addEventListener("click", async () => {
    serializeView();
    try {
      await navigator.clipboard.writeText(location.href);
      elements.copyLink.textContent = "View copied";
    } catch {
      elements.copyLink.textContent = "Link ready in address bar";
    }
    window.setTimeout(() => { elements.copyLink.textContent = "Copy this view"; }, 1800);
  });

  function animate(now) {
    if (state.auto && !document.hidden) {
      const elapsed = Math.min(50, now - state.lastFrame);
      const zoomRate = Math.pow(0.986, elapsed / 16.667);
      if (state.span > 1.02e-7) {
        state.span = Math.max(1e-7, state.span * zoomRate);
        const follow = 1 - Math.pow(0.985, elapsed / 16.667);
        state.x += (state.autoTargetX - state.x) * follow;
        state.y += (state.autoTargetY - state.y) * follow;
        state.dirty = true;
        updateMeasurements();
      } else {
        setAuto(false);
        serializeView();
      }
    }
    state.lastFrame = now;
    if (state.dirty) draw();
    requestAnimationFrame(animate);
  }

  const restored = loadHash();
  elements.iterations.value = String(state.iterations);
  elements.palette.value = Object.keys(paletteMap).find(key => paletteMap[key] === state.palette) || "tidal";
  if (restored) elements.preset.value = "overview";
  updateMeasurements();
  new ResizeObserver(() => { state.dirty = true; }).observe(panel);
  requestAnimationFrame(animate);
})();
