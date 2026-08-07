(() => {
  "use strict";

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width, height };
  }

  function drawMandelbrot() {
    const canvas = document.getElementById("mandelbrotPreview");
    if (!canvas) return;
    const { width, height } = fitCanvas(canvas);
    const workW = Math.min(420, width);
    const workH = Math.max(1, Math.round(workW * height / width));
    const work = document.createElement("canvas");
    work.width = workW;
    work.height = workH;
    const ctx = work.getContext("2d", { alpha: false });
    const image = ctx.createImageData(workW, workH);
    const centerX = -0.62;
    const centerY = 0;
    const span = 3.1;
    const maxIterations = 96;

    for (let py = 0; py < workH; py += 1) {
      const cy = centerY + (py / workH - 0.5) * span * workH / workW;
      for (let px = 0; px < workW; px += 1) {
        const cx = centerX + (px / workW - 0.5) * span;
        let zx = 0;
        let zy = 0;
        let iteration = 0;
        while (zx * zx + zy * zy <= 4 && iteration < maxIterations) {
          const nextX = zx * zx - zy * zy + cx;
          zy = 2 * zx * zy + cy;
          zx = nextX;
          iteration += 1;
        }
        const offset = (py * workW + px) * 4;
        if (iteration === maxIterations) {
          image.data[offset] = 3;
          image.data[offset + 1] = 9;
          image.data[offset + 2] = 8;
        } else {
          const t = iteration / maxIterations;
          const wave = Math.pow(t, 0.3);
          image.data[offset] = Math.round(255 * Math.max(0, wave * 0.35 + Math.sin(iteration * 0.31) * 0.06));
          image.data[offset + 1] = Math.round(255 * Math.min(1, wave * 1.25));
          image.data[offset + 2] = Math.round(255 * Math.min(1, 0.48 + wave * 0.7));
        }
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const target = canvas.getContext("2d", { alpha: false });
    target.imageSmoothingEnabled = true;
    target.drawImage(work, 0, 0, width, height);
  }

  function rotate(point, yaw, pitch) {
    const cosy = Math.cos(yaw);
    const siny = Math.sin(yaw);
    const cosp = Math.cos(pitch);
    const sinp = Math.sin(pitch);
    const x1 = point[0] * cosy + point[2] * siny;
    const z1 = -point[0] * siny + point[2] * cosy;
    return [x1, point[1] * cosp - z1 * sinp, point[1] * sinp + z1 * cosp];
  }

  function spherePoint(face, u, v) {
    const faces = [[1, u, v], [-1, u, -v], [u, 1, v], [u, -1, -v], [u, v, 1], [-u, v, -1]];
    const p = faces[face];
    const length = Math.hypot(p[0], p[1], p[2]);
    return [p[0] / length, p[1] / length, p[2] / length];
  }

  function drawSphere() {
    const canvas = document.getElementById("spherePreview");
    if (!canvas) return;
    const { width, height } = fitCanvas(canvas);
    const ctx = canvas.getContext("2d");
    const radius = Math.min(width, height) * 0.35;
    const cx = width * 0.51;
    const cy = height * 0.5;
    const yaw = -0.7;
    const pitch = 0.35;
    ctx.clearRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(cx - radius * 0.32, cy - radius * 0.38, 0, cx, cy, radius * 1.25);
    glow.addColorStop(0, "#28564d");
    glow.addColorStop(0.62, "#10231f");
    glow.addColorStop(1, "#020706");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, dpr);

    const n = 8;
    for (let face = 0; face < 6; face += 1) {
      for (let axis = 0; axis < 2; axis += 1) {
        for (let line = 0; line <= n; line += 1) {
          ctx.beginPath();
          let drawing = false;
          const fixed = -1 + line * 2 / n;
          for (let sample = 0; sample <= 32; sample += 1) {
            const moving = -1 + sample * 2 / 32;
            const p = spherePoint(face, axis === 0 ? fixed : moving, axis === 0 ? moving : fixed);
            const q = rotate(p, yaw, pitch);
            if (q[2] >= -0.015) {
              const x = cx + q[0] * radius;
              const y = cy - q[1] * radius;
              if (!drawing) ctx.moveTo(x, y); else ctx.lineTo(x, y);
              drawing = true;
            } else {
              drawing = false;
            }
          }
          ctx.strokeStyle = line % 2 === 0 ? "rgba(111,255,233,.64)" : "rgba(176,156,255,.34)";
          ctx.stroke();
        }
      }
    }
  }

  function drawMap() {
    const canvas = document.getElementById("mapPreview");
    if (!canvas) return;
    const { width, height } = fitCanvas(canvas);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#10211e");
    background.addColorStop(1, "#050a09");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(151, 180, 171, 0.13)";
    ctx.lineWidth = Math.max(7, width * 0.012);
    const streets = [
      [[-0.05, 0.72], [0.26, 0.55], [0.54, 0.57], [1.05, 0.24]],
      [[0.18, -0.08], [0.27, 0.25], [0.53, 0.48], [0.72, 1.1]],
      [[-0.05, 0.27], [0.25, 0.33], [0.55, 0.23], [1.06, 0.3]],
      [[0.58, -0.08], [0.55, 0.23], [0.65, 0.44], [1.05, 0.69]]
    ];
    streets.forEach((street) => {
      ctx.beginPath();
      street.forEach((point, index) => {
        const x = point[0] * width;
        const y = point[1] * height;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    const grid = [
      [[-0.08, 0.11], [0.34, 0.05], [0.75, 0.12], [1.08, 0.26]],
      [[-0.08, 0.58], [0.31, 0.54], [0.7, 0.59], [1.08, 0.74]],
      [[0.2, -0.08], [0.16, 0.27], [0.14, 0.65], [0.18, 1.08]],
      [[0.62, -0.08], [0.58, 0.29], [0.57, 0.68], [0.61, 1.08]],
      [[0.83, -0.08], [0.79, 0.33], [0.79, 0.76], [0.83, 1.08]]
    ];
    ctx.strokeStyle = "rgba(69, 240, 139, 0.88)";
    ctx.lineWidth = Math.max(1.2, dpr * 1.2);
    grid.forEach((line) => {
      ctx.beginPath();
      line.forEach((point, index) => {
        const x = point[0] * width;
        const y = point[1] * height;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    ctx.strokeStyle = "rgba(255, 209, 102, 0.92)";
    ctx.lineWidth = Math.max(2.4, dpr * 2.2);
    ctx.strokeRect(width * 0.15, height * 0.06, width * 0.65, height * 0.63);
    ctx.fillStyle = "#2979ff";
    ctx.beginPath();
    ctx.arc(width * 0.53, height * 0.49, Math.max(7, width * 0.012), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#88bfff";
    ctx.lineWidth = Math.max(3, dpr * 2);
    ctx.stroke();
  }

  const redraw = () => {
    drawMandelbrot();
    drawSphere();
    drawMap();
  };
  redraw();
  window.addEventListener("resize", redraw, { passive: true });
})();
