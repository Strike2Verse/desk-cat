// The cat girl's face is painted on a canvas and projected onto the front of
// the head (see girlModel.js). Expressions are just different drawings, so
// the face is redrawn only when its (quantised) state changes.
//
// Canvas layout: 512 x 512 px covers FACE.W x FACE.H head units, centred on
// the head centre. Canvas x grows toward the girl's LEFT (the viewer's right
// when she faces the camera), canvas y grows downward.

export const FACE = { W: 0.32, H: 0.32, PX: 512 };

const EYE = { dx: 112, y: 318, rx: 62, ry: 84 };
const MOUTH = { x: 256, y: 428 };
const LASH = '#1e1a28';
const LINE = '#7a3444';

const IRIS = {
  top: '#0c3552',
  mid: '#138fa8',
  low: '#6ceee8',
  ring: '#0a2c44',
  pupil: '#08203a',
};

export function defaultFace() {
  return {
    eyes: 'open', // open | happy | closed | x | wink
    open: 1, // 0..1 lid opening (for 'open')
    mouth: 'smile', // smile | cat | fang | open | o | yawn | pout | flat | wavy
    blush: 0.25,
    brow: 'normal', // normal | worried | angry | up
    gx: 0, gy: 0, // gaze, -1..1 (canvas x / y directions)
    pupil: 0, // 0 round .. 1 cat slit
    small: 0, // 0..1 shrinks the irises (surprise)
    sparkle: 0, // extra star highlights
  };
}

export function faceKey(f) {
  const q = (v, s) => Math.round(v * s);
  return [f.eyes, q(f.open, 12), f.mouth, q(f.blush, 10), f.brow, q(f.gx, 10), q(f.gy, 10),
    q(f.pupil, 5), q(f.small, 5), q(f.sparkle, 2)].join('|');
}

function ellipse(g, x, y, rx, ry) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
}

// Visible outline of an open eye with the lid at `open`: returns sampled
// top (lash) boundary points and the full closed polygon.
function eyeShape(cx, cy, side, open) {
  const { rx, ry } = EYE;
  const lidY = cy - ry + (1 - open) * ry * 1.8;
  const top = [];
  const bottom = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    const x = cx + u * rx;
    const h = ry * Math.sqrt(Math.max(0, 1 - u * u));
    // Slightly flattened, higher toward the inner corner like anime eyes.
    const eTop = cy - h * (0.92 + 0.08 * -u * side);
    const eBot = cy + h * 0.96;
    const lid = lidY + 6 * u * u;
    const y = Math.max(eTop, lid);
    if (y < eBot - 1) {
      top.push([x, y]);
      bottom.push([x, eBot]);
    }
  }
  return { top, bottom };
}

function drawOpenEye(g, cx, cy, side, f) {
  const open = Math.max(0.05, Math.min(1, f.open));
  const { top, bottom } = eyeShape(cx, cy, side, open);
  if (top.length < 3) return drawClosedEye(g, cx, cy, side);

  g.save();
  g.beginPath();
  g.moveTo(top[0][0], top[0][1]);
  for (const p of top) g.lineTo(p[0], p[1]);
  for (let i = bottom.length - 1; i >= 0; i--) g.lineTo(bottom[i][0], bottom[i][1]);
  g.closePath();
  g.clip();

  // Sclera with a soft shadow under the upper lid.
  g.fillStyle = '#ffffff';
  g.fillRect(cx - 80, cy - 95, 160, 190);
  const lidTop = Math.min(...top.map((p) => p[1]));
  const sh = g.createLinearGradient(0, lidTop, 0, lidTop + 26);
  sh.addColorStop(0, 'rgba(150,110,140,0.45)');
  sh.addColorStop(1, 'rgba(150,110,140,0)');
  g.fillStyle = sh;
  g.fillRect(cx - 70, lidTop, 140, 30);

  // Iris.
  const s = 1 - f.small * 0.35;
  const ix = cx + f.gx * 10;
  const iy = cy + 6 + f.gy * 9;
  const irx = 53 * s, iry = 72 * s;
  const grad = g.createLinearGradient(0, iy - iry, 0, iy + iry);
  grad.addColorStop(0, IRIS.top);
  grad.addColorStop(0.45, IRIS.mid);
  grad.addColorStop(1, IRIS.low);
  ellipse(g, ix, iy, irx, iry);
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = IRIS.ring;
  g.stroke();

  // Pupil (round -> cat slit).
  ellipse(g, ix, iy + 3, (17 - f.pupil * 10) * s, (29 + f.pupil * 9) * s);
  g.fillStyle = IRIS.pupil;
  g.fill();

  // Glow in the lower iris.
  const glow = g.createRadialGradient(ix, iy + iry * 0.6, 2, ix, iy + iry * 0.6, iry * 0.7);
  glow.addColorStop(0, 'rgba(210,255,240,0.75)');
  glow.addColorStop(1, 'rgba(210,255,240,0)');
  g.fillStyle = glow;
  ellipse(g, ix, iy + iry * 0.55, irx * 0.8, iry * 0.45);
  g.fill();

  // Highlights (same light direction for both eyes).
  g.fillStyle = '#ffffff';
  ellipse(g, ix - 15 * s, iy - 24 * s, 15 * s, 20 * s);
  g.fill();
  ellipse(g, ix + 16 * s, iy + 22 * s, 7 * s, 7 * s);
  g.fill();
  ellipse(g, ix + 8 * s, iy - 30 * s, 4 * s, 4 * s);
  g.fill();
  if (f.sparkle > 0) star(g, ix + 12, iy - 26, 9, 'rgba(255,255,255,0.95)');
  g.restore();

  // Upper lash line with a wing at the outer corner.
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = LASH;
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(top[0][0], top[0][1]);
  for (const p of top) g.lineTo(p[0], p[1]);
  g.stroke();
  const outer = side < 0 ? top[0] : top[top.length - 1];
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(outer[0] - side * 4, outer[1] + 2);
  g.quadraticCurveTo(outer[0] + side * 8, outer[1] - 2, outer[0] + side * 15, outer[1] - 10);
  g.stroke();

  // A short lower lash near the outer corner.
  g.lineWidth = 2.5;
  g.strokeStyle = '#7b4a5c';
  g.beginPath();
  const a0 = side < 0 ? Math.PI * 0.72 : Math.PI * 0.06;
  g.ellipse(cx, cy, EYE.rx * 0.98, EYE.ry * 0.93, 0, a0, a0 + Math.PI * 0.22);
  g.stroke();
}

function drawClosedEye(g, cx, cy, side) {
  // Relaxed closed eye: a soft downward curve.
  g.lineCap = 'round';
  g.strokeStyle = LASH;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(cx - 42, cy + 6);
  g.quadraticCurveTo(cx, cy + 30, cx + 42, cy + 6);
  g.stroke();
  const ox = cx + side * 42;
  g.lineWidth = 4.5;
  g.beginPath();
  g.moveTo(ox, cy + 6);
  g.lineTo(ox + side * 10, cy - 1);
  g.stroke();
}

function drawHappyEye(g, cx, cy) {
  // ^ ^
  g.lineCap = 'round';
  g.strokeStyle = LASH;
  g.lineWidth = 7.5;
  g.beginPath();
  g.moveTo(cx - 42, cy + 18);
  g.quadraticCurveTo(cx, cy - 38, cx + 42, cy + 18);
  g.stroke();
}

function drawXEye(g, cx, cy, side) {
  // > <  (the chevrons point at each other)
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = LASH;
  g.lineWidth = 7.5;
  g.beginPath();
  g.moveTo(cx + side * 26, cy - 24);
  g.lineTo(cx - side * 20, cy);
  g.lineTo(cx + side * 26, cy + 24);
  g.stroke();
}

function star(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.3;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function drawBrow(g, cx, cy, side, brow) {
  // side: -1 = canvas-left eye. Inner end is toward the canvas centre.
  const y = cy - EYE.ry - 20;
  const inner = cx - side * 30;
  const outer = cx + side * 32;
  let yi = y, yo = y + 4, bend = -7;
  if (brow === 'worried') { yi = y - 9; yo = y + 6; bend = -2; }
  else if (brow === 'angry') { yi = y + 10; yo = y - 4; bend = 2; }
  else if (brow === 'up') { yi = y - 8; yo = y - 5; bend = -9; }
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(40,110,120,0.75)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(inner, yi);
  g.quadraticCurveTo((inner + outer) / 2, Math.min(yi, yo) + bend, outer, yo);
  g.stroke();
}

function drawMouth(g, kind) {
  const { x, y } = MOUTH;
  // Drawn at 1.35x around the mouth centre: the chibi figure style has a
  // big, expressive mouth.
  g.save();
  g.translate(x, y);
  g.scale(1.35, 1.35);
  g.translate(-x, -y);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = LINE;
  g.lineWidth = 4;
  switch (kind) {
    case 'cat':
    case 'fang': {
      g.beginPath();
      g.moveTo(x - 20, y - 3);
      g.quadraticCurveTo(x - 10, y + 10, x, y);
      g.quadraticCurveTo(x + 10, y + 10, x + 20, y - 3);
      g.stroke();
      if (kind === 'fang') {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(x + 5, y + 4);
        g.lineTo(x + 13, y + 4);
        g.lineTo(x + 9, y + 13);
        g.closePath();
        g.fill();
        g.lineWidth = 1.5;
        g.stroke();
      }
      break;
    }
    case 'open':
    case 'yawn':
    case 'o': {
      g.beginPath();
      if (kind === 'open') {
        g.moveTo(x - 17, y - 4);
        g.quadraticCurveTo(x, y + 1, x + 17, y - 4);
        g.quadraticCurveTo(x + 13, y + 22, x, y + 23);
        g.quadraticCurveTo(x - 13, y + 22, x - 17, y - 4);
      } else if (kind === 'yawn') {
        g.ellipse(x, y + 8, 13, 17, 0, 0, Math.PI * 2);
      } else {
        g.ellipse(x, y + 4, 8, 10, 0, 0, Math.PI * 2);
      }
      g.closePath();
      g.fillStyle = '#8c2c3d';
      g.fill();
      g.save();
      g.clip();
      g.fillStyle = '#f07e90';
      ellipse(g, x, y + (kind === 'open' ? 22 : kind === 'yawn' ? 24 : 14), 13, 9);
      g.fill();
      g.restore();
      g.lineWidth = 3;
      g.stroke();
      break;
    }
    case 'pout': {
      g.beginPath();
      g.moveTo(x - 9, y + 4);
      g.quadraticCurveTo(x, y - 6, x + 9, y + 4);
      g.stroke();
      break;
    }
    case 'wavy': {
      g.beginPath();
      g.moveTo(x - 18, y + 2);
      for (let i = 1; i <= 6; i++) g.lineTo(x - 18 + i * 6, y + 2 + (i % 2 ? -5 : 2));
      g.stroke();
      break;
    }
    case 'flat': {
      g.beginPath();
      g.moveTo(x - 10, y + 2);
      g.lineTo(x + 10, y + 2);
      g.stroke();
      break;
    }
    default: {
      g.beginPath();
      g.moveTo(x - 16, y - 2);
      g.quadraticCurveTo(x, y + 13, x + 16, y - 2);
      g.stroke();
    }
  }
  g.restore();
}

export function drawFace(g, f) {
  const P = FACE.PX;
  g.clearRect(0, 0, P, P);

  // Blush.
  if (f.blush > 0.01) {
    for (const s of [-1, 1]) {
      const bx = 256 + s * 150, by = 372;
      const grad = g.createRadialGradient(bx, by, 2, bx, by, 40);
      grad.addColorStop(0, `rgba(255,120,150,${0.55 * f.blush})`);
      grad.addColorStop(1, 'rgba(255,120,150,0)');
      g.fillStyle = grad;
      ellipse(g, bx, by, 44, 26);
      g.fill();
      if (f.blush > 0.6) {
        g.strokeStyle = `rgba(230,80,110,${(f.blush - 0.6) * 1.8})`;
        g.lineWidth = 3;
        g.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.moveTo(bx + i * 13 - 5, by + 7);
          g.lineTo(bx + i * 13 + 5, by - 7);
          g.stroke();
        }
      }
    }
  }

  // Tiny nose.
  g.strokeStyle = 'rgba(205,120,120,0.7)';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(256, 364);
  g.lineTo(259, 369);
  g.stroke();

  for (const side of [-1, 1]) {
    const cx = 256 + side * EYE.dx;
    const cy = EYE.y;
    drawBrow(g, cx, cy, side, f.brow);
    let kind = f.eyes;
    // Wink closes the girl's left eye (canvas right).
    if (kind === 'wink') kind = side > 0 ? 'happy' : 'open';
    if (kind === 'happy') drawHappyEye(g, cx, cy);
    else if (kind === 'closed' || (kind === 'open' && f.open < 0.08)) drawClosedEye(g, cx, cy, side);
    else if (kind === 'x') drawXEye(g, cx, cy, side);
    else drawOpenEye(g, cx, cy, side, f);
  }

  drawMouth(g, f.mouth);
}
