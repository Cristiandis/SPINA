const canvas = document.getElementById("physicsCanvas");
const ctx = canvas.getContext("2d");

let physicsState = {
  elongation: 35, // mm, 0-70
  tension: 40, // %, 0-100
  flexion: 0, // degrees, from -25 to 35
};

// 7 cervical, 12 thoracic, 5 lumbar, sacrum, coccyx
// curveX shifts each vertebra sideways and draws the S curve
const SPINE_DATA = [
  // cervical
  { label: "C1", region: "C", w: 18, h: 6, curveX: 6 },
  { label: "C2", region: "C", w: 19, h: 7, curveX: 9 },
  { label: "C3", region: "C", w: 20, h: 7, curveX: 11 },
  { label: "C4", region: "C", w: 21, h: 7, curveX: 12 },
  { label: "C5", region: "C", w: 22, h: 8, curveX: 11 },
  { label: "C6", region: "C", w: 23, h: 8, curveX: 8 },
  { label: "C7", region: "C", w: 24, h: 9, curveX: 4 },
  // thoracic
  { label: "T1", region: "T", w: 25, h: 9, curveX: -2 },
  { label: "T2", region: "T", w: 26, h: 10, curveX: -7 },
  { label: "T3", region: "T", w: 26, h: 10, curveX: -12 },
  { label: "T4", region: "T", w: 27, h: 10, curveX: -16 },
  { label: "T5", region: "T", w: 28, h: 11, curveX: -19 },
  { label: "T6", region: "T", w: 29, h: 11, curveX: -21 },
  { label: "T7", region: "T", w: 30, h: 11, curveX: -20 },
  { label: "T8", region: "T", w: 31, h: 12, curveX: -18 },
  { label: "T9", region: "T", w: 32, h: 12, curveX: -14 },
  { label: "T10", region: "T", w: 33, h: 12, curveX: -9 },
  { label: "T11", region: "T", w: 34, h: 13, curveX: -4 },
  { label: "T12", region: "T", w: 35, h: 13, curveX: 2 },
  // lumbar
  { label: "L1", region: "L", w: 37, h: 14, curveX: 8 },
  { label: "L2", region: "L", w: 39, h: 15, curveX: 14 },
  { label: "L3", region: "L", w: 41, h: 15, curveX: 18 },
  { label: "L4", region: "L", w: 42, h: 15, curveX: 16 },
  { label: "L5", region: "L", w: 43, h: 15, curveX: 10 },
  // sacrum and coccyx
  { label: "Sacrum", region: "S", w: 38, h: 24, curveX: -6 },
  { label: "Coccyx", region: "S", w: 16, h: 12, curveX: -12 },
];

// same colors as the legend in index.html
const REGION_COLORS = {
  C: "#2f6db5",
  T: "#3d9a5a",
  L: "#e0a21b",
  S: "#d1483a",
};

let vertebrae = SPINE_DATA.map((d, i) => ({
  ...d,
  index: i,
  x: 160 + d.curveX,
  y: 35 + i * 18,
  vx: 0,
  vy: 0,
  angle: 0,
}));

// dragging with the mouse
let draggedNode = null;
let mousePos = { x: 0, y: 0 };

canvas.addEventListener("mousedown", (e) => {
  const rect = canvas.getBoundingClientRect();
  mousePos.x = e.clientX - rect.left;
  mousePos.y = e.clientY - rect.top;

  let minDist = 25;
  vertebrae.forEach((v) => {
    const dist = Math.hypot(v.x - mousePos.x, v.y - mousePos.y);
    if (dist < minDist) {
      minDist = dist;
      draggedNode = v;
    }
  });
});

canvas.addEventListener("mousemove", (e) => {
  if (!draggedNode) return;
  const rect = canvas.getBoundingClientRect();
  mousePos.x = e.clientX - rect.left;
  mousePos.y = e.clientY - rect.top;
});

window.addEventListener("mouseup", () => {
  draggedNode = null;
});

function updatePhysicsParams() {
  physicsState.elongation = parseFloat(
    document.getElementById("elongation").value,
  );
  physicsState.tension = parseFloat(document.getElementById("tension").value);
  physicsState.flexion = parseFloat(document.getElementById("flexion").value);

  document.getElementById("valElong").innerText = physicsState.elongation;
  document.getElementById("valTension").innerText = physicsState.tension;
  document.getElementById("valFlex").innerText = physicsState.flexion;

  updateUIStatus();
}

function updateUIStatus() {
  const stress = physicsState.elongation * 0.65 + physicsState.tension * 0.45;

  let color = "#3a7d44";
  let title = "Normal condition";
  let desc =
    "The curves are still well defined and the distance between the vertebrae is close to normal.";

  if (stress > 70) {
    color = "#b3261e";
    title = "High elongation and tension";
    desc =
      "The curves are very flat, especially the lumbar lordosis, and the paravertebral muscles are very tense.";
  } else if (stress > 40) {
    color = "#b8860b";
    title = "Moderate decompression";
    desc = "The discs lengthen and the S-shaped curves flatten slightly.";
  }

  document.documentElement.style.setProperty("--spine-color", color);
  document.getElementById("statusTitle").innerText = title;
  document.getElementById("routineDesc").innerText = desc;
}

function toggleContrast() {
  document.body.classList.toggle("high-contrast");
}

// main loop: springs + damping
function runPhysicsEngine() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // elongation reduces the curves (up to 65%)
  const curveRetention = Math.max(0.35, 1 - physicsState.elongation / 110);

  // vertical spacing: grows with elongation, shrinks a little with tension
  const spacingFactor =
    1 + physicsState.elongation * 0.0042 - physicsState.tension * 0.0008;

  // spring stiffness and damping
  const k = 0.14 + physicsState.tension * 0.0025;
  const damping = 0.78;
  const baseX = 160;
  const topY = 32;

  let currentY = topY;

  for (let i = 0; i < vertebrae.length; i++) {
    let v = vertebrae[i];

    let stepY = (v.h + 4.8) * spacingFactor;
    if (i > 0) currentY += stepY;

    // tilt is felt more at the top, the sacrum barely moves
    let mobility = i < 24 ? Math.pow((24 - i) / 24, 1.35) : 0.05;
    let flexionOffset = physicsState.flexion * 1.4 * mobility;

    let targetX = baseX + v.curveX * curveRetention + flexionOffset;
    let targetY = currentY;

    if (draggedNode === v) {
      v.x = mousePos.x;
      v.y = mousePos.y;
      v.vx = 0;
      v.vy = 0;
    } else {
      // spring toward the target position
      let fx = (targetX - v.x) * k;
      let fy = (targetY - v.y) * k;

      // the previous vertebra pulls this one slightly
      if (i > 0) {
        let prev = vertebrae[i - 1];
        fx += (prev.x - v.x) * 0.04;
      }

      // small continuous motion
      let microFloat =
        Math.sin(Date.now() / 500 + i * 0.35) *
        (0.25 + physicsState.elongation * 0.005);

      v.vx = (v.vx + fx) * damping;
      v.vy = (v.vy + fy) * damping;

      v.x += v.vx + microFloat * 0.15;
      v.y += v.vy;
    }
  }

  // angle of each vertebra from its neighbors
  for (let i = 0; i < vertebrae.length; i++) {
    let prev = i > 0 ? vertebrae[i - 1] : vertebrae[i];
    let next = i < vertebrae.length - 1 ? vertebrae[i + 1] : vertebrae[i];
    vertebrae[i].angle = Math.atan2(next.x - prev.x, next.y - prev.y);
  }

  // line behind the vertebrae
  ctx.beginPath();
  ctx.moveTo(vertebrae[0].x, vertebrae[0].y);
  for (let i = 1; i < vertebrae.length; i++) {
    ctx.lineTo(vertebrae[i].x, vertebrae[i].y);
  }
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 6;
  ctx.stroke();

  // 23 discs, from C2 to the sacrum (no disc between C1 and C2)
  for (let i = 1; i < 24; i++) {
    let v1 = vertebrae[i];
    let v2 = vertebrae[i + 1];

    let discAlpha = 0.35 + physicsState.elongation / 140;
    let discColor =
      physicsState.elongation > 50
        ? `rgba(179, 38, 30, ${discAlpha})`
        : `rgba(60, 110, 165, ${discAlpha})`;

    ctx.beginPath();
    ctx.moveTo(v1.x - v1.w * 0.42, v1.y + v1.h * 0.4);
    ctx.lineTo(v1.x + v1.w * 0.42, v1.y + v1.h * 0.4);
    ctx.lineTo(v2.x + v2.w * 0.42, v2.y - v2.h * 0.4);
    ctx.lineTo(v2.x - v2.w * 0.42, v2.y - v2.h * 0.4);
    ctx.closePath();
    ctx.fillStyle = discColor;
    ctx.fill();
  }

  // vertebrae
  vertebrae.forEach((v, i) => {
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(-v.angle);

    let color = REGION_COLORS[v.region];

    // spinous process (toward the left)
    ctx.beginPath();
    ctx.moveTo(-v.w / 2, -v.h * 0.25);
    ctx.lineTo(
      -v.w / 2 - (v.region === "T" ? 11 : 8),
      v.region === "T" ? 3 : 0,
    );
    ctx.lineTo(-v.w / 2, v.h * 0.25);
    ctx.fillStyle = color;
    ctx.fill();

    // vertebral body (sacrum and coccyx are trapezoid/triangle shaped)
    ctx.beginPath();
    if (v.label === "Sacrum") {
      ctx.moveTo(-v.w / 2, -v.h / 2);
      ctx.lineTo(v.w / 2, -v.h / 2);
      ctx.lineTo(v.w * 0.22, v.h / 2);
      ctx.lineTo(-v.w * 0.22, v.h / 2);
      ctx.closePath();
    } else if (v.label === "Coccyx") {
      ctx.moveTo(-v.w / 2, -v.h / 2);
      ctx.lineTo(v.w / 2, -v.h / 2);
      ctx.lineTo(0, v.h / 2);
      ctx.closePath();
    } else {
      ctx.roundRect(-v.w / 2, -v.h / 2, v.w, v.h, 3);
    }

    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#333333";
    ctx.stroke();

    // labels only on some vertebrae
    if (["C1", "C7", "T6", "T12", "L3", "L5", "Sacrum"].includes(v.label)) {
      ctx.rotate(v.angle); // upright text
      ctx.fillStyle = "#333333";
      ctx.font = "11px Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(v.label, v.w / 2 + 8, 0);
    }

    ctx.restore();
  });

  requestAnimationFrame(runPhysicsEngine);
}

updatePhysicsParams();
runPhysicsEngine();
