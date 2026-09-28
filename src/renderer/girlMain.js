import * as THREE from './vendor/three.module.min.js';
import { createGirl, applyPose, setOutfit, scruffFor, setupGirlLighting, HEAD_SCALE } from './girl/girlModel.js';
import { createGirlBrain } from './girl/girlBrain.js';
import { createEffects } from './girl/effects.js';
import { createWorld } from './world.js';

// Renderer for the cat girl overlay. Same setup as the cat's main.js: a
// fullscreen click-through window with a small canvas that follows her.

const SIZES = { small: 125, medium: 155, large: 190 };

const canvas = document.getElementById('scene');
let width = window.innerWidth;
let height = window.innerHeight;

const VIEW_W = 440;
const VIEW_H = 480;

const camera = new THREE.OrthographicCamera(0, VIEW_W, height, height - VIEW_H, -2000, 2000);
camera.position.z = 800;

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(VIEW_W, VIEW_H);

function moveView(cx, cy) {
  const left = Math.round(cx - VIEW_W / 2);
  const top = Math.round(cy - VIEW_H * 0.6);
  canvas.style.transform = `translate(${left}px, ${top}px)`;
  camera.left = left;
  camera.right = left + VIEW_W;
  camera.top = height - top;
  camera.bottom = height - top - VIEW_H;
  camera.updateProjectionMatrix();
}

const scene = new THREE.Scene();
setupGirlLighting(scene, renderer);

const effects = createEffects(scene);
let S = SIZES.medium;
let girl = null;
let rig = null;

// ---------------------------------------------------------------- shadow
const shadowTilt = new THREE.Group();
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    map: (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(40,20,40,0.45)');
      grad.addColorStop(1, 'rgba(40,20,40,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })(),
    transparent: true,
    depthWrite: false,
  }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.renderOrder = -1;
shadowTilt.add(shadow);
scene.add(shadowTilt);

// ---------------------------------------------------------------- world
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
let press = null;
let dragging = false;
let events = {};
const grabOffset = { x: 0, y: 0 };
const headScreen = { x: -9999, y: -9999 };

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

setInterval(async () => {
  try {
    const pt = await window.deskCat.getCursorPoint();
    setCursor(pt.x - surfaces.origin.x, pt.y - surfaces.origin.y);
  } catch (_) {
    /* window may be closing */
  }
}, 30);

const tmp = new THREE.Vector3();
function toScreen(v) {
  return { x: v.x, y: height - v.y };
}

window.addEventListener('mousemove', (e) => {
  setCursor(e.clientX, e.clientY);
  if (frame && press && !dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) {
    dragging = true;
    events.grab = true;
    // Keep the grab point where it was relative to the hand; the offset
    // eases away while she's held.
    tmp.copy(scruffFor(girl));
    rig.pose.localToWorld(tmp);
    const p = toScreen(tmp);
    grabOffset.x = p.x - cursor.x;
    grabOffset.y = p.y - cursor.y;
  }
});

window.addEventListener('mousedown', (e) => {
  if (!enabled || e.button !== 0) return;
  press = { x: e.clientX, y: e.clientY, t: performance.now() };
});

window.addEventListener('mouseup', (e) => {
  if (dragging) {
    rig.pelvis.getWorldPosition(tmp);
    events.release = { hip: toScreen(tmp) };
    dragging = false;
  } else if (press && performance.now() - press.t < 400) {
    const onHead = Math.hypot(e.clientX - headScreen.x, e.clientY - headScreen.y) < S * 0.2 * HEAD_SCALE;
    events.pet = { onHead };
  }
  press = null;
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (enabled && !dragging && brain) window.deskCat.showGirlMenu({ outfit: brain.outfit });
});

window.deskCat.onGirlCommand((cmd) => {
  events.command = cmd;
});

window.deskCat.onSetEnabled((value) => {
  enabled = value;
  canvas.style.display = enabled ? 'block' : 'none';
  if (!enabled && !ignoring) {
    window.deskCat.setIgnoreMouseEvents(true, { forward: true });
    ignoring = true;
  }
});

window.deskCat.onGirlSettings((settings) => {
  if (brain) brain.setAutoOutfit(settings.autoOutfit);
});

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  surfaces.refreshMetrics();
});

// ---------------------------------------------------------------- hit region
// A box around her head and limbs (cheaper than a mesh bounding box, and
// the skirt geometry changes every frame anyway).
const HIT_PARTS = [];
function updateHitRegion() {
  let over = false;
  if (press && !dragging && performance.now() - press.t > 3000) press = null;
  if (dragging || press) {
    over = true;
  } else {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [obj, pad] of HIT_PARTS) {
      obj.getWorldPosition(tmp);
      const r = pad * S;
      const p = toScreen(tmp);
      x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r);
      y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r);
    }
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
const ACTIVE_MODES = new Set(['walk', 'play', 'dragged', 'fall', 'jumpDown', 'land', 'change', 'pet', 'poke', 'dance', 'wave', 'stretch', 'groom']);
let sinceRender = 0;

function step() {
  requestAnimationFrame(step);
  if (!enabled || !brain) return;

  sinceRender += Math.min(clock.getDelta(), 0.1);
  const mode = frame ? frame.mode : 'walk';
  const fps = dragging || press || ACTIVE_MODES.has(mode) || effects.count ? 60 : mode === 'doze' ? 20 : 30;
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

  surfaceTimer -= dt;
  const busy = dragging || (frame && (frame.mode === 'fall' || frame.mode === 'jumpDown'));
  if (surfaceTimer <= 0) {
    surfaceTimer = busy || (frame && frame.onWindow) ? 0.35 : 3;
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
    headPos: headScreen,
    headR: S * 0.17 * HEAD_SCALE,
  });
  if (frame.outfit) {
    setOutfit(girl, frame.outfit);
    window.deskCat.girlOutfitChanged(frame.outfit);
  }

  // --- place the rig
  const P = frame.pose;
  let look = null;
  if (frame.look) {
    const L = frame.look;
    if (L.kind === 'cursor') lookPoint.set(smoothCursor.x, height - smoothCursor.y, S * 0.8);
    else if (L.kind === 'viewer') lookPoint.set(girl.position.x, girl.position.y + S * 0.7, S * 10);
    else lookPoint.set(L.x, height - L.y, S * 0.5);
    look = { point: lookPoint, weight: L.weight };
  }
  girl.rotation.z = frame.swing;
  rig.yaw.rotation.y = frame.yaw;
  if (frame.hang) {
    const k = 1 - Math.exp(-dt * 6);
    grabOffset.x -= grabOffset.x * k;
    grabOffset.y -= grabOffset.y * k;
    girl.position.set(cursor.x + grabOffset.x, height - (cursor.y + grabOffset.y), 0);
    applyPose(girl, P, t, dt, look, frame.face, frame.swing);
    const s = scruffFor(girl);
    rig.pose.position.set(-s.x, -s.y, -s.z);
  } else {
    girl.position.set(frame.x, height - frame.y, 0);
    rig.pose.position.set(0, 0, 0);
    applyPose(girl, P, t, dt, look, frame.face, 0);
  }
  girl.updateMatrixWorld(true);

  rig.headGroup.getWorldPosition(tmp);
  const hs = toScreen(tmp);
  headScreen.x = hs.x;
  headScreen.y = hs.y;

  // --- effects
  if (frame.effects.length) {
    const head = { x: tmp.x, y: tmp.y + S * 0.2 * HEAD_SCALE };
    rig.chest.getWorldPosition(tmp);
    const body = { x: tmp.x, y: tmp.y, w: S * 0.45, h: S * 0.9 };
    for (const e of frame.effects) effects.spawn(e, head, body, S);
  }
  effects.update(dt);

  // --- contact shadow (not while sitting on a ledge)
  const feetY = frame.hang ? cursor.y + S * 0.6 : frame.y;
  const lift = Math.max(0, frame.floorY - feetY);
  const fade = Math.max(0, 1 - lift / 300) * (frame.seated ? 0 : 1);
  shadowTilt.position.set(frame.hang ? cursor.x : frame.x, height - frame.floorY, -60);
  shadowTilt.rotation.x = rig.tilt.rotation.x;
  shadow.scale.set(S * 0.42 * (0.6 + 0.4 * fade), S * 0.2 * (0.6 + 0.4 * fade), 1);
  shadow.material.opacity = fade;

  updateHitRegion();
  if (frame.hang) moveView(cursor.x, cursor.y + S * 0.45);
  else moveView(frame.x, frame.y - S * (frame.seated ? 0.3 : 0.45));
  renderer.render(scene, camera);
}

(async () => {
  let settings = {};
  try { settings = (await window.deskCat.getGirlSettings()) || {}; } catch (_) { /* defaults */ }
  S = SIZES[settings.size] || SIZES.medium;
  girl = createGirl();
  girl.scale.setScalar(S);
  scene.add(girl);
  rig = girl.userData.rig;
  setOutfit(girl, settings.outfit);
  HIT_PARTS.push(
    [rig.headGroup, 0.22 * HEAD_SCALE], [rig.chest, 0.12], [rig.pelvis, 0.12],
    [rig.arms.L.hand, 0.05], [rig.arms.R.hand, 0.05],
    [rig.legs.L.foot, 0.06], [rig.legs.R.foot, 0.06],
  );

  await surfaces.refreshMetrics();
  await surfaces.refreshSurfaces();
  brain = createGirlBrain({
    scale: S,
    taskbarFloor: surfaces.taskbar,
    outfit: rig.outfit,
    autoOutfit: settings.autoOutfit !== false,
  });
  setInterval(async () => {
    await surfaces.refreshMetrics();
    brain.setTaskbar(surfaces.taskbar);
  }, 5000);
  requestAnimationFrame(step);
})();
