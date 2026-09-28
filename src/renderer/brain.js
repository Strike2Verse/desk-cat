import { jointsFor } from './catModel.js';
import {
  STAND, WALK, SIT, LOAF, SLEEP, STRETCH, CROUCH, READY, REAR, AIR, FALL, HAPPY, HISS, SCARED, CURIOUS,
  hangPose, blendPose,
} from './poses.js';

// The cat's behaviour: a mode machine driven by timers, weighted random
// picks and distance checks (no AI). Every mode produces a full target pose
// each frame; switching modes cross-fades from a snapshot of the last output
// pose, so any mode can interrupt any other without popping.
//
// Emotions are modes too: purring + kneading when petted a few times,
// hissing then sulking when poked too much or held too long, startling at a
// cursor that whips past, curiosity at one that hovers, chattering at one
// that flies around out of reach, zoomies, meowing for attention when
// ignored, and yawning when sleepy.
//
// Screen space is in px with y pointing DOWN; the cat's (x, y) is the point
// between its feet. Pose space is in cat units with y UP (see catModel.js).

const GRAVITY = 2600; // px/s^2
const WALK_SPEED = 52;
const TROT_SPEED = 150;
const PLAY_RADIUS = 190; // px, cursor this close (and moving) starts play
const WAKE_RADIUS = 120;
const ZOOM_SPEED = 330;
// Modes the cursor can't pull the cat out of into play.
const BUSY = ['play', 'dragged', 'fall', 'land', 'pounce', 'jumpDown', 'stretch', 'pet', 'purr', 'hiss', 'sulk', 'startle', 'scared', 'zoomies', 'attention'];
// Calm modes where the cat can notice things (startle, chatter).
const IDLE = ['sit', 'loaf', 'walk', 'groom'];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const PAW_KEYS = ['fl', 'fr', 'bl', 'br'];

function shiftPose(P, dx, dy) {
  P.hipX += dx; P.hipY += dy;
  for (const k of PAW_KEYS) { P[k + 'X'] += dx; P[k + 'Y'] += dy; }
  return P;
}

function gait(base, phase, kind, stride) {
  const P = { ...base };
  const trot = kind === 'trot';
  const offs = trot ? { bl: 0, fr: 0, br: 0.5, fl: 0.5 } : { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 };
  const duty = trot ? 0.5 : 0.62;
  const lift = trot ? 0.075 : 0.055;
  for (const leg of PAW_KEYS) {
    const ph = (phase + offs[leg]) % 1;
    let dx, dy = 0;
    if (ph < duty) {
      dx = stride * (0.5 - ph / duty);
    } else {
      const s = (ph - duty) / (1 - duty);
      dx = stride * (-0.5 + ease(s));
      dy = lift * Math.sin(Math.PI * s);
    }
    P[leg + 'X'] += dx;
    P[leg + 'Y'] += dy;
    if (leg[0] === 'b') P[leg + 'M'] += dy * 6;
  }
  const w = phase * Math.PI * 2;
  P.hipY += (trot ? 0.014 : 0.006) * Math.sin(w * 2);
  P.pitch += (trot ? 0.03 : 0.012) * Math.sin(w);
  P.headPitch += 0.03 * Math.sin(w * 2 + 1.2);
  P.roll = 0.03 * Math.sin(w);
  if (trot) { P.hipY -= 0.02; P.tailBase = -0.5; P.tailSway = 0.2; }
  return P;
}

export function createBrain({ scale, taskbarFloor }) {
  const S = scale;
  const cat = { x: taskbarFloor.x0 + (taskbarFloor.x1 - taskbarFloor.x0) * 0.5, y: taskbarFloor.y, facing: 1, vy: 0 };
  let floor = { ...taskbarFloor };
  let yaw = -0.4;
  let now = 0;
  let mode = null;
  let m = {};
  let snapshot = { ...SIT };
  let out = { ...SIT };
  let blendStart = 0;
  let blendDur = 0.001;
  let lastInteract = 0;
  let perchedSince = 0;
  let effects = [];
  let earTwitch = { until: 0, side: 1, next: 3 };
  let wakeScore = 0;
  let swing = 0, swingVel = 0;
  let inp = null; // latest input, for modes that hand off to others
  // Mood bookkeeping.
  let pets = []; // times of recent pets
  let lastPetAt = -1e9;
  let grumpy = false; // held too long: hisses once it lands
  const cooldown = { startle: 0, curious: 0, chatter: 0, asked: -1e9 };

  function setMode(name, data = {}, blend = 0.45) {
    snapshot = { ...out };
    blendStart = now;
    blendDur = Math.max(0.001, blend);
    mode = name;
    m = { t0: now, ...data };
  }
  const since = () => now - m.t0;
  const yawFor = (off) => (cat.facing > 0 ? -off : -Math.PI + off);
  const touch = () => { lastInteract = now; };
  // 0 while recently played with, rising to 1 after ~3 minutes alone.
  const drowsiness = () => clamp((now - lastInteract - 45) / 130, 0, 1);

  function walkBounds() {
    const pad = S * 0.45;
    return [floor.x0 + pad, floor.x1 - pad];
  }

  // ------------------------------------------------------------ schedule
  function pickActivity(input = inp) {
    const idle = now - lastInteract;
    const drowsy = drowsiness();
    const [lo, hi] = walkBounds();
    const canWalk = hi - lo > S * 0.6;
    // Only ever hop down from a window, and only after a long while; a spot
    // the user deliberately put the cat on is kept.
    const bored = floor.id != null && now - perchedSince > 180;
    const options = [
      ['walk', canWalk ? 4 * (1 - 0.6 * drowsy) : 0],
      ['sit', 3],
      ['groom', 1.3],
      ['loaf', 1 + 2 * drowsy],
      ['sleep', drowsy > 0.15 ? 8 * drowsy : 0],
      ['stretch', 0.35],
      ['jumpDown', bored ? 0.5 : 0],
      ['zoomies', canWalk && hi - lo > S * 3 ? 0.35 * (1 - drowsy) : 0],
      // Ignored for a while but not sleepy yet: ask for attention (once).
      ['attention', idle > 28 && drowsy < 0.3 && cooldown.asked < lastInteract ? 3 : 0],
    ];
    const total = options.reduce((s, o) => s + o[1], 0);
    let r = Math.random() * total;
    let pick = 'sit';
    for (const [name, w] of options) { if (r < w) { pick = name; break; } r -= w; }
    startActivity(pick, input);
  }

  function startActivity(name, input = inp) {
    const [lo, hi] = walkBounds();
    switch (name) {
      case 'walk': {
        let tx = rand(lo, hi);
        if (Math.abs(tx - cat.x) < S * 0.6) tx = clamp(cat.x + (Math.random() < 0.5 ? -1 : 1) * S * rand(1, 3), lo, hi);
        setMode('walk', { tx, gait: 'walk', phase: 0 }, 0.5);
        break;
      }
      case 'sit': setMode('sit', { dur: rand(4, 10), nextLook: 0 }, 0.7); break;
      case 'groom': setMode('groom', { dur: rand(5, 10), leg: Math.random() < 0.5 ? 'fl' : 'fr' }, 0.7); break;
      case 'loaf': setMode('loaf', { dur: rand(8, 20), nextLook: 0 }, 1.0); break;
      case 'sleep': setMode('sleep', { dur: rand(90, 240), nextZ: 2.5 }, 2.8); break;
      case 'stretch': setMode('stretch', { dur: 1.9 }, 0.5); break;
      case 'zoomies': setMode('zoomies', { runs: 2 + Math.floor(rand(0, 3)), tx: null, phase: 0 }, 0.25); break;
      case 'attention': cooldown.asked = now; setMode('attention', { dur: 3.4, meows: [0.35, 1.9] }, 0.5); break;
      case 'jumpDown': {
        const dir = cat.facing;
        // Hop off the nearer edge of the perch if that's closer.
        const toEdge = dir > 0 ? floor.x1 - cat.x : cat.x - floor.x0;
        const x1 = clamp(cat.x + dir * (toEdge + S * 0.5), S * 0.5, input.world.width - S * 0.5);
        setMode('jumpDown', { x0: cat.x, y0: cat.y, x1, phase: 'prep' }, 0.35);
        break;
      }
      default: setMode('sit', { dur: 4, nextLook: 0 });
    }
  }

  // ------------------------------------------------------------ expression helpers
  // Mouth shape for a meow that started t seconds ago.
  const meowJaw = (t) => (t >= 0 && t < 0.55 ? Math.sin((t / 0.55) * Math.PI) * 0.75 : 0);
  // Occasional big yawn while sleepy (sit / loaf).
  function yawn(P) {
    if (m.nextYawn === undefined) m.nextYawn = now + rand(3, 10);
    if (now > m.nextYawn && drowsiness() > 0.1) { m.yawnT = now; m.nextYawn = now + rand(12, 25); }
    const u = (now - (m.yawnT ?? -9)) / 1.7;
    if (u >= 0 && u < 1) {
      const a = Math.sin(u * Math.PI);
      P.jaw = a;
      P.eyeOpen = Math.min(P.eyeOpen, 1 - a);
      P.earBack = Math.max(P.earBack, a * 0.4);
      P.headPitch += a * 0.3;
      P.whisker = a * 0.6;
    }
    return P;
  }

  // ------------------------------------------------------------ play helpers
  function relUnits(input, off) {
    // Cursor relative to the cat, in pose units, x toward where it faces.
    return {
      x: ((input.cursor.x - cat.x) * cat.facing) / (S * Math.max(0.5, Math.cos(off))),
      y: (cat.y - input.cursor.y) / S,
    };
  }

  function swipePaw(P, leg, J, target, u) {
    // Keyframes: rest -> wind-up (paw raised near chest) -> strike -> rest.
    const rest = { x: P[leg + 'X'], y: P[leg + 'Y'] };
    const wind = { x: J.shoulder.x + 0.05, y: J.shoulder.y + 0.02 };
    let a, b, k;
    if (u < 0.3) { a = rest; b = wind; k = ease(u / 0.3); }
    else if (u < 0.55) { a = wind; b = target; k = ease((u - 0.3) / 0.25); }
    else if (u < 0.7) { a = target; b = target; k = 0; }
    else { a = target; b = rest; k = ease((u - 0.7) / 0.3); }
    P[leg + 'X'] = a.x + (b.x - a.x) * k;
    P[leg + 'Y'] = a.y + (b.y - a.y) * k;
  }

  function reachTarget(J, rel, reach) {
    const dx = rel.x - J.shoulder.x, dy = rel.y - J.shoulder.y;
    const d = Math.hypot(dx, dy);
    const k = d > reach ? reach / d : 1;
    return { x: J.shoulder.x + dx * k, y: Math.max(0.02, J.shoulder.y + dy * k) };
  }

  // ------------------------------------------------------------ modes
  const modes = {
    walk(input, dt) {
      const [lo, hi] = walkBounds();
      m.tx = clamp(m.tx, lo, hi);
      const dx = m.tx - cat.x;
      if (Math.abs(dx) < 3) { pickActivity(input); return modes[mode](input, 0); }
      cat.facing = Math.sign(dx);
      const turning = Math.abs(yaw - yawFor(0.12)) > 0.5;
      const speed = (m.gait === 'trot' ? TROT_SPEED : WALK_SPEED) * (turning ? 0.15 : 1);
      cat.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
      const stride = m.gait === 'trot' ? 0.26 : 0.17;
      const duty = m.gait === 'trot' ? 0.5 : 0.62;
      m.phase = (m.phase + (dt * (speed / S) * duty) / stride) % 1;
      const P = gait(WALK, m.phase, m.gait, stride);
      if (now - lastPetAt < 40) {
        // Still happy from being petted: tail held high with a hooked tip.
        P.tailBase = HAPPY.tailBase; P.tailTip = HAPPY.tailTip; P.tailCurl = HAPPY.tailCurl; P.tailSway = 0.1;
      }
      const d = Math.hypot(input.cursor.x - cat.x, input.cursor.y - cat.y);
      return { P, yaw: 0.12, look: d < 350 ? { kind: 'cursor', weight: 0.4 } : null };
    },

    sit(input) {
      if (since() > m.dur) { pickActivity(input); return modes[mode](input, 0); }
      if (now > m.nextLook) {
        m.nextLook = now + rand(1.5, 4);
        const d = Math.hypot(input.cursor.x - cat.x, input.cursor.y - cat.y);
        const r = Math.random();
        if (d < 600 && r < 0.35) m.look = { kind: 'cursor', weight: 0.8 };
        else if (r < 0.65) m.look = { kind: 'viewer', weight: 0.9 };
        else m.look = { kind: 'point', x: cat.x + rand(-400, 400), y: cat.y - rand(-40, 300), weight: 0.8 };
      }
      return { P: yawn({ ...SIT }), yaw: 0.55, look: m.look };
    },

    groom() {
      if (since() > m.dur) { pickActivity(); return modes[mode](inp, 0); }
      const P = { ...SIT };
      const J = jointsFor(P);
      const t = since();
      const leg = m.leg;
      const side = leg === 'fl' ? 1 : -1;
      const cycle = t % 4.5;
      if (cycle < 3) {
        // Lick the raised paw.
        P[leg + 'X'] = J.shoulder.x + 0.12;
        P[leg + 'Y'] = J.shoulder.y + 0.1 + Math.sin(t * 6) * 0.01;
        P.headPitch = -0.55 + Math.sin(t * 6.5) * 0.12;
        P.headYaw = -side * 0.35;
        P.headRoll = side * 0.1;
      } else {
        // Wipe the paw over the face and ear.
        const u = (cycle - 3) / 1.5;
        const a = Math.sin(u * Math.PI);
        P[leg + 'X'] = J.shoulder.x + 0.14 - a * 0.02;
        P[leg + 'Y'] = J.shoulder.y + 0.1 + a * 0.2;
        P.headPitch = -0.35 - a * 0.2;
        P.headYaw = -side * 0.5;
        P.headRoll = side * (0.2 + a * 0.2);
      }
      P.neck = 0.35;
      P.eyeOpen = 0.25;
      P.tailSway = 0.1;
      return { P, yaw: 0.6, look: null };
    },

    loaf(input) {
      if (since() > m.dur) { pickActivity(input); return modes[mode](input, 0); }
      if (now > m.nextLook) {
        m.nextLook = now + rand(3, 7);
        m.look = Math.random() < 0.5 ? { kind: 'viewer', weight: 0.7 } : null;
      }
      const P = { ...LOAF };
      const drowsy = drowsiness();
      P.eyeOpen = 0.6 - drowsy * 0.35;
      return { P: yawn(P), yaw: 0.45, look: m.look };
    },

    sleep(input) {
      if (since() > m.dur) {
        lastInteract = now - 20; // well rested: stay up for a while
        setMode('stretch', { dur: 1.9 }, 0.8);
        return modes.stretch(input);
      }
      if (now - m.t0 > m.nextZ) { m.nextZ += 2.2; effects.push({ type: 'zzz' }); }
      const P = { ...SLEEP };
      // Drift off: eyes close over the first couple of seconds.
      P.eyeOpen = clamp(0.5 - since() * 0.25, 0, 1);
      if (wakeScore > 0.2) { P.earBack = 0; P.earTwitch = 0.3 * Math.sin(now * 30); P.earTwitchSide = 1; }
      return { P, yaw: 0.6, look: null };
    },

    stretch(input) {
      if (since() > m.dur) {
        const d = Math.hypot(input.cursor.x - cat.x, input.cursor.y - cat.y);
        if (d < PLAY_RADIUS * 1.4) setMode('play', { sub: 'watch', subT: now, nextSwipe: 0 }, 0.5);
        else pickActivity(input);
        return modes[mode](input, 0);
      }
      const P = { ...STRETCH };
      const u = since() / m.dur;
      // Front half of the stretch, then shift weight back.
      if (u > 0.55) blendPose(STRETCH, STAND, ease((u - 0.55) / 0.45), P);
      P.eyeOpen = u < 0.6 ? 0.1 : 0.8;
      return { P, yaw: 0.2, look: null };
    },

    pet() {
      if (since() > m.dur) { setMode('sit', { dur: rand(3, 6), nextLook: 0 }, 0.6); return modes.sit(inp); }
      const P = { ...SIT };
      P.eyeOpen = 0.12;
      P.headRoll = 0.25 * Math.sin(since() * 2.2);
      P.headPitch = 0.2;
      P.earBack = 0.15;
      P.tailSway = 0.1;
      P.jaw = meowJaw(since());
      return { P, yaw: 0.85, look: { kind: 'viewer', weight: 0.5 } };
    },

    // Content: kneading, slow blinks, purring (a fast breath shiver), hearts.
    purr() {
      if (since() > m.dur) { setMode('sit', { dur: rand(4, 8), nextLook: 0 }, 0.8); return modes.sit(inp); }
      if (now > m.nextFx) { m.nextFx = now + rand(0.9, 1.5); effects.push({ type: Math.random() < 0.55 ? 'prr' : 'heart' }); }
      const P = { ...SIT };
      const k = Math.sin(since() * 4.5);
      P.flY += Math.max(0, k) * 0.04; P.flX += Math.max(0, k) * 0.015;
      P.frY += Math.max(0, -k) * 0.04; P.frX += Math.max(0, -k) * 0.015;
      P.eyeOpen = 0.12 + 0.25 * Math.max(0, Math.sin(since() * 0.9));
      P.headRoll = 0.14 * Math.sin(since() * 1.3);
      P.headPitch = 0.12;
      P.earBack = 0.05;
      P.whisker = 0.3;
      P.breath = 0.018; P.breathHz = 7;
      P.tailWrap = 0.6; P.tailSway = 0.05;
      return { P, yaw: 0.85, look: { kind: 'viewer', weight: 0.4 } };
    },

    // Halloween-cat hiss, then whatever m.then says (usually sulking).
    hiss() {
      if (since() > m.dur) {
        if (m.then === 'sulk') setMode('sulk', { dur: rand(8, 13), nextFx: now + 2.5 }, 0.6);
        else setMode('scared', { dur: 1.6 }, 0.4);
        return modes[mode](inp);
      }
      const P = { ...HISS };
      const u = since();
      P.hipY += Math.min(1, u / 0.15) * 0.01;
      P.jaw = 0.85 + 0.1 * Math.sin(u * 40);
      P.tailSway = 0.25; P.tailHz = 2.5;
      return { P, yaw: 0.55, look: { kind: 'cursor', weight: 0.9 } };
    },

    // Sulking: sits with its back half-turned, tail lashing, ears back.
    sulk() {
      if (since() > m.dur) { setMode('sit', { dur: rand(3, 6), nextLook: 0 }, 1.0); return modes.sit(inp); }
      if (now > m.nextFx) { m.nextFx = now + rand(2.5, 4.5); effects.push({ type: 'anger' }); }
      const P = { ...SIT };
      P.earBack = 0.5; P.eyeOpen = 0.45; P.whisker = -0.4;
      P.headYaw = 0.6; P.headPitch = 0.12;
      P.tailWrap = 0; P.tailBase = 0.7; P.tailSway = 0.8; P.tailHz = 1.4; P.tailLift = 0.25;
      return { P, yaw: 2.3, look: null };
    },

    // Jump straight up, arched and puffed, then cower.
    startle() {
      const u = since() / 0.5;
      if (u >= 1) {
        cat.y = m.y0;
        setMode('scared', { dur: rand(1.8, 3) }, 0.2);
        return modes.scared(inp);
      }
      cat.y = m.y0 - S * 0.4 * Math.sin(Math.PI * u);
      const P = { ...HISS };
      P.jaw = 0.4;
      return { P, yaw: 0.5, look: { kind: 'cursor', weight: 0.8 } };
    },

    scared() {
      if (since() > m.dur) { setMode('sit', { dur: rand(3, 6), nextLook: 0 }, 0.8); return modes.sit(inp); }
      const P = { ...SCARED };
      P.puff = SCARED.puff * Math.max(0, 1 - since() / m.dur);
      return { P, yaw: 0.45, look: { kind: 'cursor', weight: 0.7 } };
    },

    // Head tilts at a cursor that hovers nearby without moving.
    curious(input) {
      if (since() > m.dur) { setMode('sit', { dur: rand(3, 6), nextLook: 0 }, 0.6); return modes.sit(input); }
      const P = { ...CURIOUS };
      const step = Math.floor(since() / 1.1);
      P.headRoll = (step % 2 ? -1 : 1) * 0.38;
      return { P, yaw: 0.6, look: { kind: 'cursor', weight: 1 } };
    },

    // Chattering at a cursor flying around out of reach (like at a bird).
    chatter(input) {
      if (since() > m.dur) { setMode('sit', { dur: rand(3, 6), nextLook: 0 }, 0.6); return modes.sit(input); }
      const P = { ...CURIOUS };
      const burst = since() % 1.2 < 0.65;
      if (burst && !m.inBurst) effects.push({ type: 'chatter' });
      m.inBurst = burst;
      P.jaw = burst ? 0.2 + 0.25 * Math.abs(Math.sin(now * 30)) : 0;
      P.pupil = 1; P.earBack = -0.3; P.whisker = 0.8;
      P.tailTip = 0.3 * Math.sin(now * 14); P.tailWrap = 0.3;
      return { P, yaw: 0.5, look: { kind: 'cursor', weight: 1 } };
    },

    // A burst of mad dashing back and forth.
    zoomies(input, dt) {
      const [lo, hi] = walkBounds();
      if (m.tx === null) {
        if (m.runs-- <= 0) { setMode('sit', { dur: rand(4, 8), nextLook: 0 }, 0.5); return modes.sit(input); }
        const dir = cat.x - lo > hi - cat.x ? -1 : 1;
        m.tx = clamp(cat.x + dir * rand(S * 2, S * 5), lo, hi);
      }
      const dx = m.tx - cat.x;
      if (Math.abs(dx) < 4) { m.tx = null; return modes.zoomies(input, 0); }
      cat.facing = Math.sign(dx);
      const turning = Math.abs(yaw - yawFor(0.1)) > 0.5;
      const speed = ZOOM_SPEED * (turning ? 0.2 : 1);
      cat.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
      m.phase = (m.phase + (dt * (speed / S) * 0.5) / 0.3) % 1;
      const P = gait(WALK, m.phase, 'trot', 0.3);
      P.earBack = 0.35; P.pupil = 1; P.puff = 0.25; P.whisker = -0.5;
      P.tailBase = -0.9; P.tailCurl = 0.1; P.tailTip = 0.15;
      return { P, yaw: 0.1, look: null };
    },

    // Ignored for a while: comes to attention, tail up, and meows at you.
    attention() {
      if (since() > m.dur) { pickActivity(); return modes[mode](inp, 0); }
      const P = { ...HAPPY };
      let jaw = 0;
      for (const t0 of m.meows) {
        if (since() >= t0 && !m['done' + t0]) { m['done' + t0] = true; effects.push({ type: 'meow' }); }
        jaw = Math.max(jaw, meowJaw(since() - t0));
      }
      P.jaw = jaw;
      P.headPitch = 0.15;
      return { P, yaw: 0.9, look: { kind: 'viewer', weight: 0.9 } };
    },

    play(input, dt) {
      const moving = input.cursorStill < 0.6;
      let off = 0.35;
      let rel = relUnits(input, off);
      // Turn to face the cursor if it gets behind us.
      // (hysteresis so a cursor hovering right over the cat doesn't make it
      // spin back and forth).
      if (rel.x < -0.3 && !m.swipe && now - (m.flipT || 0) > 0.7) {
        cat.facing *= -1;
        m.flipT = now;
        rel = relUnits(input, off);
      }
      const d = Math.hypot(input.cursor.x - cat.x, input.cursor.y - (cat.y - S * 0.3));
      if (d < PLAY_RADIUS * 1.3 && input.cursorStill < 6) { m.lost = now; touch(); }
      const nearFloor = rel.y < 1.3 && rel.y > -0.4;
      const [lo, hi] = walkBounds();

      if (input.cursorStill > 12 || now - (m.lost ?? now) > 1.6) {
        if (!(nearFloor && moving && Math.abs(input.cursor.x - cat.x) < 700)) {
          setMode('sit', { dur: rand(3, 7), nextLook: 0 }, 0.6);
          return modes.sit(input);
        }
      }

      const shoulderRel = Math.hypot(rel.x - 0.15, rel.y - 0.3);
      let want;
      if (input.cursorStill > 4) want = 'watch';
      else if (rel.y > 0.62 && rel.y < 1.3 && Math.abs(rel.x) < 0.75) want = 'rear';
      else if (shoulderRel < 0.5) want = 'bat';
      else if (Math.abs(rel.x) < 1.7 && rel.y < 0.8) want = 'crouch';
      else if (moving && hi - lo > S && ((nearFloor && Math.abs(rel.x) > 1.7) || (rel.y > 0.62 && rel.y < 2.4 && Math.abs(rel.x) > 0.75))) want = 'chase';
      else want = 'watch';
      if (want !== m.sub && now - m.subT > 0.35 && !m.swipe) {
        snapshot = { ...out }; blendStart = now; blendDur = want === 'chase' ? 0.35 : 0.28;
        m.sub = want; m.subT = now; m.crouchT = 0;
      }

      const look = { kind: 'cursor', weight: 1 };
      let P;
      switch (m.sub) {
        case 'chase': {
          // Stop short of a cursor on the ground; get right under one above.
          const tx = clamp(input.cursor.x - cat.facing * S * (rel.y > 0.62 ? 0.25 : 0.9), lo, hi);
          const dx = tx - cat.x;
          if (Math.abs(dx) > 4) {
            cat.x += Math.sign(dx) * Math.min(Math.abs(dx), TROT_SPEED * dt);
            m.phase = ((m.phase || 0) + (dt * (TROT_SPEED / S) * 0.5) / 0.26) % 1;
            P = gait(WALK, m.phase, 'trot', 0.26);
          } else P = { ...READY };
          off = 0.1;
          break;
        }
        case 'crouch': {
          m.crouchT = (m.crouchT || 0) + dt;
          P = { ...CROUCH };
          if (m.crouchT > 0.5 && moving) {
            // Butt wiggle before a pounce.
            const w = Math.sin(now * 15);
            P.hipX += 0.012 * w; P.roll = 0.06 * w;
            P.blY += Math.max(0, w) * 0.012; P.brY += Math.max(0, -w) * 0.012;
          }
          P.tailTip = -0.1 + 0.25 * Math.sin(now * 9);
          if (m.crouchT > 1.1 && moving && rel.x > 0.55 && rel.x < 1.9 && rel.y < 0.4 && Math.random() < dt * 2.5) {
            const tx = clamp(input.cursor.x - cat.facing * S * 0.25, lo, hi);
            setMode('pounce', { x0: cat.x, y0: cat.y, x1: tx, phase: 'prep' }, 0.15);
            return modes.pounce(input, dt);
          }
          off = 0.25;
          break;
        }
        case 'bat':
        case 'rear': {
          const rear = m.sub === 'rear';
          P = { ...(rear ? REAR : READY) };
          const J = jointsFor(P);
          if (!m.swipe && now > (m.nextSwipe || 0)) {
            const leg = m.lastLeg === 'fl' ? 'fr' : 'fl';
            m.lastLeg = Math.random() < 0.75 ? leg : m.lastLeg;
            m.swipe = { leg: m.lastLeg || leg, t0: now, dur: rand(0.34, 0.48) };
          }
          const target = reachTarget(J, rel, rear ? 0.42 : 0.34);
          if (rear) {
            // Idle paw hovers ready in front of the chest.
            for (const leg of ['fl', 'fr']) {
              P[leg + 'X'] = J.shoulder.x + 0.1;
              P[leg + 'Y'] = J.shoulder.y - 0.05 + (leg === 'fl' ? 0.02 : 0);
            }
          }
          if (m.swipe) {
            const u = (now - m.swipe.t0) / m.swipe.dur;
            if (u >= 1) {
              m.swipe = null;
              m.nextSwipe = now + rand(0.1, 0.55) * (moving ? 0.7 : 1.4);
            } else swipePaw(P, m.swipe.leg, J, target, u);
          }
          P.tailSway = 0.7;
          off = 0.35;
          break;
        }
        default: {
          // watch: sit up and track the cursor.
          P = { ...(input.cursorStill > 4 ? SIT : READY) };
          P.tailTip = 0.15 * Math.sin(now * 3);
          off = 0.45;
        }
      }
      P.pupil = 1;
      return { P, yaw: off, look };
    },

    pounce(input, dt) {
      const t = since();
      if (m.phase === 'prep') {
        const P = { ...CROUCH };
        const w = Math.sin(now * 22);
        P.hipX += 0.015 * w; P.roll = 0.08 * w; P.hipY -= 0.02;
        if (t > 0.22) {
          const dist = Math.abs(m.x1 - m.x0);
          m.T = clamp(dist / 700, 0.26, 0.5);
          m.h = S * 0.2 + dist * 0.12;
          m.phase = 'air'; m.ta = now;
          snapshot = { ...out }; blendStart = now; blendDur = 0.1;
        }
        return { P, yaw: 0.2, look: { kind: 'cursor', weight: 1 } };
      }
      if (m.phase === 'air') {
        const u = clamp((now - m.ta) / m.T, 0, 1);
        cat.x = m.x0 + (m.x1 - m.x0) * u;
        cat.y = m.y0 - 4 * m.h * u * (1 - u);
        const P = { ...AIR };
        if (u > 0.6) blendPose(AIR, FALL, (u - 0.6) / 0.4, P);
        if (u >= 1) {
          cat.y = m.y0;
          m.phase = 'land'; m.tl = now;
          snapshot = { ...out }; blendStart = now; blendDur = 0.08;
        }
        return { P, yaw: 0.1, look: { kind: 'cursor', weight: 0.6 } };
      }
      // Land and pin with both front paws.
      const P = { ...CROUCH };
      P.flX += 0.1; P.frX += 0.12; P.hipY -= 0.03; P.neck = 0.2; P.headPitch = -0.35;
      if (now - m.tl > 0.45) {
        setMode('play', { sub: 'watch', subT: now, nextSwipe: now + 0.3, lost: now }, 0.3);
      }
      return { P, yaw: 0.25, look: { kind: 'cursor', weight: 0.8 } };
    },

    jumpDown(input) {
      const t = since();
      if (m.phase === 'prep') {
        const P = { ...CROUCH };
        P.headPitch = -0.5;
        if (t > 0.45) {
          const target = input.world.findFloor(m.x1, m.y0 + 2);
          m.y1 = target.y; m.target = target;
          const vy0 = -380;
          const dy = m.y1 - m.y0;
          m.T = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * GRAVITY * dy)) / GRAVITY;
          m.vy0 = vy0;
          m.phase = 'air'; m.ta = now;
          cat.facing = Math.sign(m.x1 - m.x0) || cat.facing;
          snapshot = { ...out }; blendStart = now; blendDur = 0.12;
        }
        return { P, yaw: 0.15, look: null };
      }
      if (m.phase === 'air') {
        const ta = Math.min(now - m.ta, m.T);
        const u = ta / m.T;
        cat.x = m.x0 + (m.x1 - m.x0) * u;
        cat.y = m.y0 + m.vy0 * ta + 0.5 * GRAVITY * ta * ta;
        const vy = m.vy0 + GRAVITY * ta;
        const P = { ...AIR };
        blendPose(AIR, FALL, clamp(vy / 600, 0, 1), P);
        if (u >= 1) {
          cat.y = m.y1;
          floor = { ...m.target };
          perchedSince = now;
          setMode('land', { impact: vy }, 0.08);
        }
        return { P, yaw: 0.15, look: null };
      }
      return modes.land(input);
    },

    fall(input, dt) {
      cat.vy += GRAVITY * dt;
      cat.y += cat.vy * dt;
      if (cat.y >= m.target.y) {
        cat.y = m.target.y;
        floor = { ...m.target };
        perchedSince = now;
        setMode('land', { impact: cat.vy }, 0.08);
        cat.vy = 0;
        return modes.land(input);
      }
      const P = { ...FALL };
      return { P, yaw: 0.5, look: null };
    },

    land(input) {
      const depth = clamp((m.impact || 0) / 1800, 0.15, 1);
      const u = since() / 0.4;
      const P = blendPose(CROUCH, STAND, ease(u));
      P.hipY -= 0.08 * depth * (1 - ease(u));
      P.earBack = 0.3 * (1 - u);
      if (u >= 1) {
        const d = Math.hypot(input.cursor.x - cat.x, input.cursor.y - cat.y);
        if (grumpy) {
          grumpy = false;
          effects.push({ type: 'hiss' }, { type: 'anger' });
          setMode('hiss', { dur: 1.3, then: 'sulk' }, 0.2);
        } else if ((m.impact || 0) > 1500) {
          effects.push({ type: 'exclaim' });
          setMode('scared', { dur: rand(1.5, 2.5) }, 0.2);
        } else if (d < PLAY_RADIUS) setMode('play', { sub: 'watch', subT: now, nextSwipe: 0, lost: now }, 0.4);
        else startActivity(Math.random() < 0.5 ? 'sit' : 'walk', input);
        return modes[mode](input, 0);
      }
      return { P, yaw: 0.35, look: null };
    },

    dragged(input, dt) {
      // Pendulum swing driven by how fast the hand moves.
      const target = clamp(-input.cursorVel.x * 0.0011, -0.7, 0.7);
      swingVel += (70 * (target - swing) - 6 * swingVel) * dt;
      swing += swingVel * dt;
      const P = hangPose(swing);
      P.tailSway = 0.4 + Math.min(0.6, Math.abs(swingVel) * 0.2);
      P.earBack = 0.35;
      P.eyeOpen = 1;
      // Held too long: ears flatten, fur rises, tail lashes.
      const upset = clamp((since() - 3) / 3, 0, 1);
      P.earBack += upset * 0.6; P.puff = upset * 0.5; P.whisker = -upset; P.pupil = 0.7 + upset * 0.3;
      P.tailSway += upset * 0.5; P.tailHz = 0.7 + upset * 1.2;
      return { P, yaw: 0.95, look: { kind: 'viewer', weight: 0.6 } };
    },
  };

  // ------------------------------------------------------------ public
  function update(dt, t, input) {
    now = t;
    inp = input;
    effects = [];
    const d = Math.hypot(input.cursor.x - cat.x, input.cursor.y - (cat.y - S * 0.3));

    if (mode === null) { lastInteract = now; startActivity('sit', input); }

    // --- interrupts, highest priority first
    if (input.events.grab) {
      touch();
      swing = 0; swingVel = 0;
      setMode('dragged', {}, 0.3);
    } else if (input.events.release && mode === 'dragged') {
      grumpy = since() > 6;
      touch();
      // Keep the hip where it is on screen: re-express the last pose with
      // the hip over the new origin so the cross-fade doesn't jump.
      const hip = input.events.release.hip;
      cat.x = hip.x;
      cat.y = hip.y + FALL.hipY * S;
      shiftPose(out, -out.hipX, FALL.hipY - out.hipY);
      swing = 0; swingVel = 0;
      // Anything below the hip catches the cat, so dropping it with its
      // dangling feet slightly past a window's top edge still lands on it.
      let target = input.world.findFloor(cat.x, hip.y);
      if (target.id == null && target.y - cat.y > S * 0.4) {
        // Nothing to land on: it stays right where it was put, pottering
        // about a small patch around that spot.
        const w = input.world.width;
        target = {
          id: null, spot: true, y: cat.y,
          x0: Math.max(0, cat.x - S * 1.6), x1: Math.min(w, cat.x + S * 1.6),
        };
      }
      if (cat.y > target.y) cat.y = target.y;
      cat.vy = 0;
      setMode('fall', { target }, 0.3);
    } else if (input.events.pet && mode !== 'dragged') {
      touch();
      wakeScore = 0;
      lastPetAt = now;
      pets = pets.filter((t0) => now - t0 < 6);
      pets.push(now);
      if (['fall', 'jumpDown', 'pounce', 'startle'].includes(mode)) {
        effects.push({ type: 'meow' });
      } else if (mode === 'sulk' || mode === 'hiss' || pets.length >= 5) {
        // Poked too much: hiss, then sulk.
        pets = [];
        effects.push({ type: 'hiss' }, { type: 'anger' });
        setMode('hiss', { dur: 1.4, then: 'sulk' }, 0.15);
      } else if (mode === 'purr') {
        m.dur = Math.max(m.dur, since() + 4);
        effects.push({ type: 'heart' });
      } else if (pets.length >= 2) {
        effects.push({ type: 'heart' }, { type: 'prr' });
        setMode('purr', { dur: rand(6, 9), nextFx: now + 0.8 }, 0.5);
      } else {
        effects.push({ type: 'meow' });
        setMode('pet', { dur: 2.2 }, 0.4);
      }
    } else if (mode === 'sleep') {
      if (d < WAKE_RADIUS && input.cursorStill < 0.5) wakeScore += dt;
      else wakeScore = Math.max(0, wakeScore - dt * 0.3);
      if (wakeScore > 0.8) { wakeScore = 0; touch(); setMode('stretch', { dur: 1.9 }, 0.9); }
    } else if (!BUSY.includes(mode)) {
      const speed = Math.hypot(input.cursorVel.x, input.cursorVel.y);
      const above = cat.y - input.cursor.y;
      if (IDLE.includes(mode) && d < 170 && speed > 2600 && now > cooldown.startle) {
        // A cursor whipping right past: jump!
        touch();
        cooldown.startle = now + 25;
        effects.push({ type: 'exclaim' });
        setMode('startle', { y0: cat.y }, 0.1);
      } else if (IDLE.includes(mode) && above > S * 1.4 && Math.abs(input.cursor.x - cat.x) < S * 3
        && input.cursorStill < 0.3 && speed > 150 && now > cooldown.chatter) {
        touch();
        cooldown.chatter = now + 20;
        setMode('chatter', { dur: rand(3, 4.5) }, 0.4);
      } else if (d < PLAY_RADIUS && input.cursorStill < 0.6) {
        touch();
        setMode('play', { sub: 'watch', subT: now, nextSwipe: now + 0.4, lost: now }, 0.4);
      } else if (['sit', 'loaf'].includes(mode) && d < 240 && d > 50 && input.cursorStill > 1.2
        && input.cursorStill < 10 && now > cooldown.curious) {
        cooldown.curious = now + 30;
        effects.push({ type: 'question' });
        setMode('curious', { dur: rand(3.5, 5) }, 0.5);
      }
    }

    // Standing on a window: ride along if it moves, fall if it goes away.
    if (floor.id != null && !['dragged', 'fall', 'jumpDown'].includes(mode)) {
      const s = input.world.surface(floor.id, cat.x);
      if (!s) {
        floor = { ...input.world.taskbar };
        cat.vy = 0;
        setMode('fall', { target: input.world.findFloor(cat.x, cat.y - 4) }, 0.25);
      } else {
        cat.x += s.x0 - floor.x0;
        cat.y = s.y;
        floor = s;
      }
    }

    const res = modes[mode](input, dt);

    // Cross-fade from the snapshot into this mode's pose.
    const k = ease((now - blendStart) / blendDur);
    blendPose(snapshot, res.P, k, out);

    // Occasional ear flick when awake.
    if (now > earTwitch.next && mode !== 'sleep') {
      earTwitch = { until: now + 0.25, side: Math.random() < 0.5 ? 1 : -1, next: now + rand(3, 9) };
    }
    if (now < earTwitch.until && mode !== 'sleep') {
      out.earTwitch = 0.35 * Math.sin((earTwitch.until - now) * 50);
      out.earTwitchSide = earTwitch.side;
    } else if (mode !== 'sleep') {
      out.earTwitch = 0;
    }

    // Turn smoothly (through facing the viewer) toward the wanted yaw.
    const yawTarget = yawFor(res.yaw);
    const dy = yawTarget - yaw;
    yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * (2 + Math.abs(dy) * 6));

    return {
      x: cat.x,
      y: cat.y,
      floorY: mode === 'dragged' ? input.world.findFloor(input.cursor.x, input.cursor.y).y : floor.y,
      onWindow: floor.id != null,
      pose: out,
      yaw,
      look: res.look,
      hang: mode === 'dragged',
      swing: mode === 'dragged' ? swing : 0,
      effects,
      mode,
      sub: mode === 'play' ? m.sub : null,
    };
  }

  function setTaskbar(tb) {
    if (floor.id == null && !floor.spot) {
      const dy = tb.y - floor.y;
      floor = { ...tb };
      if (!['dragged', 'fall', 'jumpDown', 'pounce'].includes(mode)) cat.y += dy;
    }
  }

  return {
    update,
    setTaskbar,
    get mode() { return mode; },
    // For testing: jump straight into an activity ('walk', 'groom', ...).
    debugActivity: (name) => startActivity(name),
  };
}
