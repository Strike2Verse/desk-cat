import * as THREE from './vendor/three.module.min.js';
import { createCat, applyPose, jointsFor } from './catModel.js';
import { addLights } from './lighting.js';
import { createBrain } from './brain.js';
import { createWorld } from './world.js';

const CAT_SCALE = 115; // px per cat unit (~ body length)

const canvas = document.getElementById('scene');
let width = window.innerWidth;
let height = window.innerHeight;

// The overlay window covers the whole screen, but the canvas is only a
// small viewport that follows the cat around (moved with a CSS transform,
// camera frustum shifted to match). Compositing a full-screen transparent
// canvas every frame costs far more CPU/GPU than drawing the cat itself.
const VIEW_W = 480;
const VIEW_H = 440;

// Orthographic camera in normal (Y-up) orientation -- swapping top/bottom
// instead to get screen-like Y-down coordinates would bake a mirror into
// the projection matrix and flip every triangle's winding. Screen-space
// (Y-down) positions are flipped with `height - y` where they become world
// positions instead.
const camera = new THREE.OrthographicCamera(0, VIEW_W, height, height - VIEW_H, -2000, 2000);
camera.position.z = 800;

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(VIEW_W, VIEW_H);

// Centre the viewport on a screen point (px, y down).
function moveView(cx, cy) {
  const left = Math.round(cx - VIEW_W / 2);
  const top = Math.round(cy - VIEW_H * 0.55);
  canvas.style.transform = `translate(${left}px, ${top}px)`;
  camera.left = left;
  camera.right = left + VIEW_W;
  camera.top = height - top;
  camera.bottom = height - top - VIEW_H;
  camera.updateProjectionMatrix();
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
addLights(scene);

const cat = createCat();
cat.scale.setScalar(CAT_SCALE);
scene.add(cat);
const rig = cat.userData.rig;

// ---------------------------------------------------------------- shadow
function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const shadowTilt = new THREE.Group();
shadowTilt.rotation.x = rig.tilt.rotation.x;
const shadowYaw = new THREE.Group();
shadowTilt.add(shadowYaw);
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'),
    transparent: true,
    depthWrite: false,
  }),
);
shadow.rotation.x = -Math.PI / 2;
shadowYaw.add(shadow);
shadow.renderOrder = -1;
scene.add(shadowTilt);

// ---------------------------------------------------------------- effects
function glyphTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const zTex = glyphTexture((g) => {
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(40,50,90,0.9)';
  g.strokeText('z', 32, 34);
  g.fillStyle = '#e8eeff';
  g.fillText('z', 32, 34);
});
// Words like "meow" / "hss!" are spelled out letter by letter, each letter
// its own sprite.
const STYLES = {
  meow: { fill: '#e6eeff', stroke: 'rgba(40,52,110,0.9)' },
  hiss: { fill: '#ffd0c8', stroke: 'rgba(130,20,30,0.95)' },
};
const letterTex = {};
function letter(ch, style) {
  const key = style + ch;
  if (!letterTex[key]) {
    const st = STYLES[style];
    letterTex[key] = glyphTexture((g) => {
      g.font = 'bold 46px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 7;
      g.strokeStyle = st.stroke;
      g.strokeText(ch, 32, 30);
      g.fillStyle = st.fill;
      g.fillText(ch, 32, 30);
    });
  }
  return letterTex[key];
}
// A short word on one sprite; returns { map, aspect }.
function wordTexture(text, { size = 40, fill, stroke, italic = false }) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `${italic ? 'italic ' : ''}bold ${size}px sans-serif`;
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width + 18);
  c.height = 64;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 7;
  g.strokeStyle = stroke;
  g.strokeText(text, c.width / 2, 33);
  g.fillStyle = fill;
  g.fillText(text, c.width / 2, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { map: t, aspect: c.width / 64 };
}
const heartTex = glyphTexture((g) => {
  g.beginPath();
  g.moveTo(32, 54);
  g.bezierCurveTo(4, 36, 6, 10, 22, 10);
  g.bezierCurveTo(28, 10, 32, 15, 32, 20);
  g.bezierCurveTo(32, 15, 36, 10, 42, 10);
  g.bezierCurveTo(58, 10, 60, 36, 32, 54);
  g.closePath();
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(120,20,60,0.9)';
  g.stroke();
  g.fillStyle = '#ff7aa8';
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.beginPath();
  g.ellipse(22, 22, 5, 7, -0.5, 0, Math.PI * 2);
  g.fill();
});
// The manga "anger vein": four curved red brackets around a centre.
const angerTex = glyphTexture((g) => {
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const cx = 32 + Math.cos(a) * 13, cy = 32 + Math.sin(a) * 13;
    g.beginPath();
    g.arc(cx, cy, 11, a + Math.PI * 0.55, a + Math.PI * 1.45);
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(90,0,10,0.9)';
    g.stroke();
    g.lineWidth = 6;
    g.strokeStyle = '#ff3b3b';
    g.stroke();
  }
});
const WORDS = {
  prr: wordTexture('prr~', { size: 34, fill: '#e3d9ff', stroke: 'rgba(60,40,120,0.85)', italic: true }),
  exclaim: wordTexture('!', { size: 56, fill: '#ffe45c', stroke: 'rgba(110,70,0,0.95)' }),
  question: wordTexture('?', { size: 52, fill: '#ffffff', stroke: 'rgba(40,52,110,0.95)' }),
  chatter: wordTexture('ek ek', { size: 30, fill: '#fff4d0', stroke: 'rgba(90,60,20,0.9)', italic: true }),
};
const particles = [];
function addParticle(map, x, y, data) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
  s.position.set(x, y, 300);
  s.userData = { age: 0, phase: Math.random() * 6, aspect: 1, ...data };
  s.renderOrder = 10;
  s.visible = s.userData.age >= 0;
  scene.add(s);
  particles.push(s);
}
function spawn(type) {
  const p = new THREE.Vector3();
  rig.head.getWorldPosition(p);
  if (type === 'zzz') {
    addParticle(zTex, p.x + 14, p.y + 18, { life: 2.6, vx: 10, vy: 26, base: 14 });
  } else if (type === 'meow' || type === 'hiss') {
    const word = type === 'meow' ? 'meow' : 'hss!';
    const spacing = 18;
    [...word].forEach((ch, i) => {
      addParticle(letter(ch, type), p.x + (i - (word.length - 1) / 2) * spacing, p.y + 26, {
        letter: true, age: -i * (type === 'hiss' ? 0.07 : 0.14), life: 1.9, vx: 0, vy: 18, base: 23, phase: i * 0.9,
      });
    });
  } else if (type === 'heart') {
    addParticle(heartTex, p.x + (Math.random() - 0.5) * 24, p.y + 18, { life: 1.9, vx: (Math.random() - 0.5) * 16, vy: 30, base: 13 });
  } else if (type === 'prr') {
    const w = WORDS.prr;
    addParticle(w.map, p.x - 16, p.y + 12, { life: 1.6, vx: -8, vy: 16, base: 11, aspect: w.aspect });
  } else if (type === 'chatter') {
    const w = WORDS.chatter;
    addParticle(w.map, p.x + 14, p.y + 22, { life: 0.9, vx: 12, vy: 22, base: 11, aspect: w.aspect });
  } else if (type === 'anger') {
    addParticle(angerTex, p.x + 16, p.y + 24, { pop: true, life: 1.3, base: 18 });
  } else if (type === 'exclaim' || type === 'question') {
    const w = WORDS[type];
    addParticle(w.map, p.x + 6, p.y + 34, { pop: true, life: type === 'exclaim' ? 1.0 : 1.7, base: type === 'exclaim' ? 26 : 22, aspect: w.aspect });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const s = particles[i];
    const u = s.userData;
    u.age += dt;
    s.visible = u.age >= 0;
    if (u.age < 0) continue; // letters of "meow" wait their turn
    const k = u.age / u.life;
    if (u.letter) {
      // Pop in with a little bounce, then drift up in a gentle wave.
      const pop = Math.min(1, u.age / 0.12);
      const sc = u.base * (pop < 1 ? pop * 1.25 : 1 + 0.25 * Math.max(0, 1 - (u.age - 0.12) / 0.15));
      s.scale.set(sc, sc, 1);
      s.position.y += (u.vy + Math.sin(u.age * 6 + u.phase) * 10) * dt;
    } else if (u.pop) {
      // Pop in with an overshoot and hover by the head, pulsing slightly.
      const pop = Math.min(1, u.age / 0.12);
      const sc = u.base * (pop < 1 ? pop * 1.35 : 1 + 0.35 * Math.max(0, 1 - (u.age - 0.12) / 0.12)) * (1 + 0.06 * Math.sin(u.age * 14));
      s.scale.set(sc * u.aspect, sc, 1);
      s.position.y += Math.sin(u.age * 5) * 6 * dt;
    } else {
      s.position.x += (u.vx + Math.sin(u.age * 3 + u.phase) * 12) * dt;
      s.position.y += u.vy * dt;
      const sc = u.base * (0.6 + k * 0.9);
      s.scale.set(sc * u.aspect, sc, 1);
    }
    s.material.opacity = Math.max(0, Math.min(1, (1 - k) * 2.5, u.age * 8));
    if (k >= 1) {
      scene.remove(s);
      s.material.dispose();
      particles.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- screen / surfaces
const surfaces = createWorld(() => ({ width, height }));
const world = surfaces.world;

// ---------------------------------------------------------------- input
const cursor = { x: -9999, y: -9999 };
const smoothCursor = { x: -9999, y: -9999 };
const cursorVel = { x: 0, y: 0 };
let lastSample = { x: -9999, y: -9999, t: performance.now() };
let stillSince = performance.now();
let enabled = true;
let ignoring = true;
let press = null; // { x, y, t } while the button is down on the cat
let dragging = false;
let events = {};
const grabOffset = { x: 0, y: 0 };

function setCursor(x, y) {
  const t = performance.now();
  const dt = Math.max(1, t - lastSample.t) / 1000;
  const vx = (x - lastSample.x) / dt;
  const vy = (y - lastSample.y) / dt;
  if (Math.abs(lastSample.x) < 9000) {
    cursorVel.x += (vx - cursorVel.x) * 0.5;
    cursorVel.y += (vy - cursorVel.y) * 0.5;
  }
  if (Math.hypot(x - cursor.x, y - cursor.y) > 1.5) stillSince = t;
  cursor.x = x;
  cursor.y = y;
  lastSample = { x, y, t };
}

async function pollCursor() {
  try {
    const pt = await window.deskCat.getCursorPoint();
    setCursor(pt.x - surfaces.origin.x, pt.y - surfaces.origin.y);
  } catch (_) {
    /* window may be closing */
  }
}
setInterval(pollCursor, 30);

// When the window isn't click-through we get real mouse events, which are
// smoother than polling -- use them while hovering / dragging.
window.addEventListener('mousemove', (e) => {
  setCursor(e.clientX, e.clientY);
  if (frame && press && !dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) {
    dragging = true;
    events.grab = true;
    // Remember where the scruff was relative to the hand so the pick-up
    // doesn't snap; the offset eases away while held.
    const J = jointsFor(frame.pose);
    const p = new THREE.Vector3(J.scruff.x, J.scruff.y, 0);
    rig.pose.localToWorld(p);
    grabOffset.x = p.x - cursor.x;
    grabOffset.y = height - p.y - cursor.y;
  }
});

window.addEventListener('mousedown', (e) => {
  if (!enabled || e.button !== 0) return;
  press = { x: e.clientX, y: e.clientY, t: performance.now() };
});

window.addEventListener('mouseup', () => {
  if (dragging) {
    const J = jointsFor(frame.pose);
    const p = new THREE.Vector3(J.hip.x, J.hip.y, 0);
    rig.pose.localToWorld(p);
    events.release = { hip: { x: p.x, y: height - p.y } };
    dragging = false;
  } else if (press && performance.now() - press.t < 400) {
    events.pet = true;
  }
  press = null;
});

// Right-click on the cat opens its menu (Pet / Close). The window only
// receives mouse events while the cursor is over the cat.
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (enabled && !dragging) window.deskCat.showCatMenu();
});

window.deskCat.onPet(() => {
  events.pet = true;
});

window.deskCat.onSetEnabled((value) => {
  enabled = value;
  canvas.style.display = enabled ? 'block' : 'none';
  if (!enabled && !ignoring) {
    window.deskCat.setIgnoreMouseEvents(true, { forward: true });
    ignoring = true;
  }
});

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  surfaces.refreshMetrics();
});

// ---------------------------------------------------------------- hit region
const box = new THREE.Box3();
function updateHitRegion() {
  let over = false;
  // Never keep the whole overlay capturing input because a mouseup got lost.
  if (press && !dragging && performance.now() - press.t > 3000) press = null;
  if (dragging || press) {
    over = true;
  } else {
    box.setFromObject(cat);
    const pad = 6;
    const x0 = box.min.x - pad, x1 = box.max.x + pad;
    const y0 = height - box.max.y - pad, y1 = height - box.min.y + pad;
    over = cursor.x >= x0 && cursor.x <= x1 && cursor.y >= y0 && cursor.y <= y1;
  }
  const shouldIgnore = !over;
  if (shouldIgnore !== ignoring) {
    window.deskCat.setIgnoreMouseEvents(shouldIgnore, { forward: true });
    ignoring = shouldIgnore;
  }
  document.body.style.cursor = dragging ? 'grabbing' : over ? 'grab' : 'default';
}

// ---------------------------------------------------------------- loop
let brain = null;
let frame = null;
const lookPoint = new THREE.Vector3();
const clock = new THREE.Clock();
let surfaceTimer = 0;

// Redrawing a full-screen transparent overlay isn't free, so only run at
// 60fps while something is actually moving.
const ACTIVE_MODES = new Set([
  'walk', 'play', 'pounce', 'dragged', 'fall', 'jumpDown', 'land', 'stretch', 'pet',
  'purr', 'hiss', 'startle', 'scared', 'curious', 'chatter', 'zoomies', 'attention',
]);
let sinceRender = 0;

function step() {
  requestAnimationFrame(step);
  if (!enabled || !brain) return;

  sinceRender += Math.min(clock.getDelta(), 0.1);
  const mode = frame ? frame.mode : 'walk';
  const fps = dragging || press || ACTIVE_MODES.has(mode) ? 60 : mode === 'sleep' ? 15 : 30;
  if (sinceRender < 1 / fps - 0.004) return;
  const dt = Math.min(sinceRender, 0.07);
  sinceRender = 0;
  const t = clock.elapsedTime;

  const kc = 1 - Math.exp(-dt * 25);
  smoothCursor.x += (cursor.x - smoothCursor.x) * (Math.abs(smoothCursor.x) > 9000 ? 1 : kc);
  smoothCursor.y += (cursor.y - smoothCursor.y) * (Math.abs(smoothCursor.y) > 9000 ? 1 : kc);
  if (performance.now() - lastSample.t > 120) {
    cursorVel.x *= 0.8;
    cursorVel.y *= 0.8;
  }

  // Window tops only matter when perched or about to land somewhere.
  surfaceTimer -= dt;
  const busy = dragging || (frame && (frame.mode === 'fall' || frame.mode === 'jumpDown'));
  const perched = frame && frame.onWindow;
  if (surfaceTimer <= 0) {
    surfaceTimer = busy || perched ? 0.35 : 3;
    surfaces.refreshSurfaces();
  }

  const ev = events;
  events = {};
  frame = brain.update(dt, t, {
    cursor: dragging ? cursor : smoothCursor,
    cursorVel,
    cursorStill: (performance.now() - stillSince) / 1000,
    events: ev,
    world,
  });
  for (const e of frame.effects) spawn(e.type);

  // --- place the rig
  const P = frame.pose;
  if (frame.hang) {
    const k = 1 - Math.exp(-dt * 6);
    grabOffset.x -= grabOffset.x * k;
    grabOffset.y -= grabOffset.y * k;
    cat.position.set(cursor.x + grabOffset.x, height - (cursor.y + grabOffset.y), 0);
    const J = jointsFor(P);
    rig.pose.position.set(-J.scruff.x, -J.scruff.y, 0);
  } else {
    cat.position.set(frame.x, height - frame.y, 0);
    rig.pose.position.set(0, 0, 0);
  }
  cat.rotation.z = frame.swing;
  rig.yaw.rotation.y = frame.yaw;

  let look = null;
  if (frame.look) {
    const L = frame.look;
    if (L.kind === 'cursor') lookPoint.set(smoothCursor.x, height - smoothCursor.y, CAT_SCALE * 0.6);
    else if (L.kind === 'viewer') lookPoint.set(cat.position.x, cat.position.y + CAT_SCALE * 0.45, CAT_SCALE * 8);
    else lookPoint.set(L.x, height - L.y, CAT_SCALE * 0.4);
    look = { point: lookPoint, weight: L.weight };
  }
  applyPose(cat, P, t, dt, look);

  // --- contact shadow on whatever the cat stands on / will land on
  const feetY = frame.hang ? cursor.y + CAT_SCALE * 0.55 : frame.y;
  const lift = Math.max(0, frame.floorY - feetY);
  const fade = Math.max(0, 1 - lift / 350);
  shadowTilt.position.set(frame.hang ? cursor.x : frame.x, height - frame.floorY, -40);
  shadowYaw.rotation.y = frame.yaw;
  const lying = Math.max(0, 0.3 - P.hipY) * 2;
  shadow.scale.set(CAT_SCALE * (0.85 + lying) * (0.6 + 0.4 * fade), CAT_SCALE * 0.5 * (0.6 + 0.4 * fade), 1);
  shadow.material.opacity = 0.9 * fade;

  updateParticles(dt);
  updateHitRegion();
  if (frame.hang) moveView(cursor.x, cursor.y + CAT_SCALE * 0.35);
  else moveView(frame.x, frame.y - CAT_SCALE * 0.35);
  renderer.render(scene, camera);
}

(async () => {
  await surfaces.refreshMetrics();
  await surfaces.refreshSurfaces();
  brain = createBrain({ scale: CAT_SCALE, taskbarFloor: surfaces.taskbar });
  setInterval(async () => {
    await surfaces.refreshMetrics();
    brain.setTaskbar(surfaces.taskbar);
  }, 5000);
  requestAnimationFrame(step);
})();
