import {
  STAND, STAND_SHY, WALK, SIT_EDGE, SIT_BACK, SIT_PAW, DOZE, STRETCH, WAVE, READY, REACH, HANG, FALL, CROUCH,
  blendPose,
} from './girlPoses.js';
import { OUTFIT_NAMES } from './outfits.js';

// The cat girl's behaviour: a mode machine driven by timers, weighted random
// picks and distance checks (no AI), same idea as the cat's brain.js. Each
// mode returns a target pose (+ face, look target, yaw) every frame, and mode
// switches cross-fade from a snapshot of the last pose.
//
// Screen space is px with y DOWN; (x, y) is where she touches the floor: her
// soles when standing, her seat when sitting on a ledge.

const GRAVITY = 2600;
const WALK_SPEED = 58;
const RUN_SPEED = 150;
const PLAY_RADIUS = 170;
const OUTFIT_MIN_GAP = 8 * 60; // s between outfit changes of her own

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ease = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function face(over) {
  return {
    eyes: 'open', open: 1, mouth: 'smile', blush: 0.25, brow: 'normal',
    gx: 0, gy: 0, pupil: 0, small: 0, sparkle: 0, ...over,
  };
}

// Biped gait: foot trajectories + counter-swinging arms.
function gait(base, phase, stride, run) {
  const P = { ...base };
  const duty = run ? 0.42 : 0.56;
  const lift = run ? 0.07 : 0.045;
  for (const [k, off] of [['l', 0], ['r', 0.5]]) {
    const ph = (phase + off) % 1;
    let dx, dy = 0, pitch = 0;
    if (ph < duty) {
      dx = stride * (0.5 - ph / duty);
    } else {
      const s = (ph - duty) / (1 - duty);
      dx = stride * (-0.5 + ease(s));
      dy = lift * Math.sin(Math.PI * s);
      pitch = 0.5 * Math.sin(Math.PI * s) * (s < 0.5 ? 1 : -0.4);
    }
    P[k + 'fX'] += dx;
    P[k + 'fY'] += dy;
    P[k + 'fP'] = pitch;
    P[k + 'hX'] -= dx * (run ? 0.9 : 0.55);
  }
  const w = phase * Math.PI * 2;
  P.hipY += (run ? 0.012 : 0.007) * Math.cos(w * 2) - (run ? 0.03 : 0.004);
  P.hipZ = (run ? 0.004 : 0.007) * Math.sin(w);
  P.roll = 0.035 * Math.sin(w);
  P.chestTwist = 0.08 * Math.sin(w);
  P.headRoll = 0.03 * Math.sin(w);
  if (run) { P.lean = 0.22; P.bend = 0.06; P.elbowOut = 0.1; }
  return P;
}

export function createGirlBrain({ scale, taskbarFloor, outfit, autoOutfit = true }) {
  const S = scale;
  const g = { x: taskbarFloor.x0 + (taskbarFloor.x1 - taskbarFloor.x0) * 0.62, y: taskbarFloor.y, facing: -1, vy: 0 };
  let floor = { ...taskbarFloor };
  let posture = 'sit'; // 'sit' on a ledge, or 'stand'
  let yaw = -1.4;
  let spin = 0; // extra yaw for twirls
  let now = 0;
  let mode = null;
  let m = {};
  let snapshot = { ...SIT_EDGE };
  let out = { ...SIT_EDGE };
  let blendStart = 0;
  let blendDur = 0.001;
  let lastInteract = 0;
  let perchedSince = 0;
  let effects = [];
  let earTwitch = { until: 0, side: 1, next: 4 };
  let swing = 0, swingVel = 0;
  let patScore = 0;
  let pokes = []; // times of recent pokes
  let wakeScore = 0;
  let currentOutfit = outfit || 'miku';
  let outfitChanged = null;
  let lastOutfitChange = 0;
  let auto = autoOutfit;
  let inp = null;
  let nextSpeech = 0;

  function setMode(name, data = {}, blend = 0.45) {
    snapshot = { ...out };
    blendStart = now;
    blendDur = Math.max(0.001, blend);
    mode = name;
    m = { t0: now, ...data };
  }
  const since = () => now - m.t0;
  const yawFor = (off) => (g.facing > 0 ? -off : -Math.PI + off);
  const touch = () => { lastInteract = now; };
  const drowsiness = () => clamp((now - lastInteract - 70) / 160, 0, 1);
  const say = (word, minGap = 0) => {
    if (now < nextSpeech && minGap > 0) return;
    nextSpeech = now + minGap;
    effects.push({ type: 'text', word });
  };
  const distToCursor = (input) => Math.hypot(input.cursor.x - g.x, input.cursor.y - (g.y - S * (posture === 'sit' ? 0.3 : 0.45)));

  function walkBounds() {
    const pad = S * 0.3;
    return [floor.x0 + pad, floor.x1 - pad];
  }

  // ------------------------------------------------------------ schedule
  function pickActivity(input = inp) {
    const drowsy = drowsiness();
    const [lo, hi] = walkBounds();
    const canWalk = hi - lo > S * 0.8;
    const canChange = auto && now - lastOutfitChange > OUTFIT_MIN_GAP;
    let options;
    if (posture === 'sit') {
      options = [
        ['sit', 5],
        ['groom', 1.1],
        ['wave', 0.35],
        ['doze', drowsy > 0.1 ? 7 * drowsy : 0],
        ['walk', canWalk ? 1.4 * (1 - drowsy) : 0],
        ['stroll', canWalk ? 0.45 * (1 - drowsy) : 0],
        ['stretch', 0.35],
        ['change', canChange ? 0.25 : 0],
      ];
    } else {
      const bored = floor.id != null && now - perchedSince > 180;
      options = [
        ['sit', 4 + 3 * drowsy],
        ['walk', canWalk ? 2.4 : 0],
        ['stroll', canWalk ? 0.5 : 0],
        ['stand', 1.4],
        ['stretch', 0.5],
        ['dance', 0.55 * (1 - drowsy)],
        ['wave', 0.35],
        ['change', canChange ? 0.3 : 0],
        ['jumpDown', bored ? 0.6 : 0],
      ];
    }
    const total = options.reduce((s, o) => s + o[1], 0);
    let r = Math.random() * total;
    let choice = 'sit';
    for (const [name, w] of options) { if (r < w) { choice = name; break; } r -= w; }
    startActivity(choice, input);
  }

  function startActivity(name, input = inp) {
    const [lo, hi] = walkBounds();
    switch (name) {
      case 'sit':
        if (posture === 'stand') { posture = 'sit'; setMode('sit', sitData(), 0.75); }
        else setMode('sit', sitData(), 0.6);
        break;
      case 'stand': posture = 'stand'; setMode('stand', { dur: rand(5, 11), nextLook: 0, shy: Math.random() < 0.4 }, 0.6); break;
      case 'walk':
      case 'stroll': {
        let tx;
        if (name === 'stroll') tx = g.x < (lo + hi) / 2 ? hi - rand(0, S) : lo + rand(0, S);
        else {
          tx = rand(lo, hi);
          if (Math.abs(tx - g.x) < S * 0.8) tx = clamp(g.x + (Math.random() < 0.5 ? -1 : 1) * S * rand(1.2, 3.5), lo, hi);
        }
        const blend = posture === 'sit' ? 0.7 : 0.4;
        posture = 'stand';
        setMode('walk', { tx, phase: 0, stroll: name === 'stroll' }, blend);
        if (name === 'stroll' && Math.random() < 0.5) say(pick(['♪', 'la la ♪', 'hmm~']));
        break;
      }
      case 'stretch': posture = 'stand'; setMode('stretch', { dur: 2.6 }, 0.6); break;
      case 'wave': setMode('wave', { dur: 2.4 }, 0.45); break;
      case 'groom': setMode('groom', { dur: rand(4, 7) }, 0.6); break;
      case 'doze': setMode('doze', { dur: rand(60, 200), nextZ: 2.5 }, 2.2); break;
      case 'dance': posture = 'stand'; setMode('dance', { dur: rand(4, 7), nextNote: 0 }, 0.4); break;
      case 'change': {
        const next = pick(OUTFIT_NAMES.filter((n) => n !== currentOutfit));
        setMode('change', { dur: posture === 'stand' ? 1.3 : 1.0, next, swapped: false }, 0.3);
        break;
      }
      case 'jumpDown': {
        const dir = g.facing;
        const toEdge = dir > 0 ? floor.x1 - g.x : g.x - floor.x0;
        const x1 = clamp(g.x + dir * (toEdge + S * 0.3), S * 0.4, input.world.width - S * 0.4);
        posture = 'stand';
        setMode('jumpDown', { x0: g.x, y0: g.y, x1, phase: 'prep' }, 0.35);
        break;
      }
      default: posture = 'stand'; setMode('stand', { dur: 4, nextLook: 0 });
    }
  }

  function sitData() {
    return {
      dur: rand(14, 40),
      sub: pick(['swing', 'swing', 'hum', 'still', 'back']),
      subT: now,
      nextSub: now + rand(5, 11),
      nextLook: 0,
      swingHz: rand(0.55, 0.85),
    };
  }

  // Default look behaviour: glance between viewer, cursor and random spots.
  function idleLook(input, cursorBias = 0.35) {
    if (now > (m.nextLook || 0)) {
      m.nextLook = now + rand(1.6, 4.5);
      const d = distToCursor(input);
      const r = Math.random();
      if (d < 500 && r < cursorBias) m.look = { kind: 'cursor', weight: 0.8 };
      else if (r < 0.7) m.look = { kind: 'viewer', weight: 0.85 };
      else m.look = { kind: 'point', x: g.x + rand(-500, 500), y: g.y - rand(0, 400), weight: 0.7 };
    }
    return m.look || { kind: 'viewer', weight: 0.8 };
  }

  // Legs dangling over the ledge.
  function dangle(P, hz, amp, phase = 0) {
    const w = now * hz * Math.PI * 2 + phase;
    P.lfX += amp * Math.sin(w);
    P.rfX += amp * Math.sin(w + Math.PI);
    P.lfY += amp * 0.35 * Math.max(0, Math.sin(w));
    P.rfY += amp * 0.35 * Math.max(0, Math.sin(w + Math.PI));
    P.lfP += 0.4 * amp * Math.sin(w);
    P.rfP += 0.4 * amp * Math.sin(w + Math.PI);
  }

  // Base pose for "whatever posture she's in right now".
  const restPose = () => ({ ...(posture === 'sit' ? SIT_EDGE : STAND) });

  // ------------------------------------------------------------ modes
  const modes = {
    sit(input) {
      if (since() > m.dur) { pickActivity(input); return modes[mode](input, 0); }
      if (now > m.nextSub) {
        m.sub = pick(['swing', 'hum', 'still', 'back', 'kick', 'swing']);
        m.subT = now;
        m.nextSub = now + rand(5, 12);
        snapshot = { ...out }; blendStart = now; blendDur = 0.8;
      }
      const drowsy = drowsiness();
      let P;
      let f = face({ open: 1 - drowsy * 0.45 });
      switch (m.sub) {
        case 'back':
          P = { ...SIT_BACK };
          dangle(P, m.swingHz * 0.8, 0.03);
          break;
        case 'hum':
          P = { ...SIT_EDGE };
          dangle(P, 0.9, 0.04);
          P.headRoll = 0.14 * Math.sin(now * 1.8);
          P.chestRoll = 0.03 * Math.sin(now * 1.8);
          f = face({ eyes: Math.sin(now * 0.7) > 0.2 ? 'happy' : 'open', mouth: 'cat', blush: 0.35 });
          if (now > (m.nextNote || 0)) { m.nextNote = now + rand(0.9, 1.6); effects.push({ type: 'note' }); }
          break;
        case 'kick':
          P = { ...SIT_EDGE };
          dangle(P, 1.6, 0.06);
          f = face({ mouth: 'fang', blush: 0.35 });
          break;
        case 'still':
          P = { ...SIT_EDGE };
          P.lfX -= 0.02; P.rfX += 0.02; P.lfZ -= 0.02; P.rfZ -= 0.02; // ankles together
          break;
        default:
          P = { ...SIT_EDGE };
          dangle(P, m.swingHz, 0.045);
      }
      P.tailSway = 0.3;
      return { P, yaw: 1.4, look: idleLook(input), face: f };
    },

    stand(input) {
      if (since() > m.dur) { pickActivity(input); return modes[mode](input, 0); }
      const P = { ...(m.shy ? STAND_SHY : STAND) };
      const w = Math.sin(now * 1.3);
      P.hipZ = 0.006 * w;
      P.roll = 0.03 * w;
      P.headRoll += 0.05 * w;
      P.lfY += 0.012 * Math.max(0, -w); // shift weight foot to foot
      P.rfY += 0.012 * Math.max(0, w);
      return { P, yaw: 0.95, look: idleLook(input, 0.45), face: face({ blush: m.shy ? 0.45 : 0.25 }) };
    },

    walk(input, dt) {
      const [lo, hi] = walkBounds();
      m.tx = clamp(m.tx, lo, hi);
      const dx = m.tx - g.x;
      if (Math.abs(dx) < 3) { pickActivity(input); return modes[mode](input, 0); }
      g.facing = Math.sign(dx);
      const turning = Math.abs(yaw - yawFor(0.5)) > 0.5;
      const speed = WALK_SPEED * (turning ? 0.1 : 1);
      g.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
      const stride = 0.13;
      m.phase = (m.phase + (dt * (speed / S)) / (stride * 2)) % 1;
      const P = gait(WALK, m.phase, stride, false);
      const d = distToCursor(input);
      return {
        P, yaw: 0.5,
        look: d < 300 ? { kind: 'cursor', weight: 0.5 } : m.stroll ? { kind: 'viewer', weight: 0.25 } : null,
        face: face({ mouth: m.stroll ? 'cat' : 'smile' }),
      };
    },

    stretch() {
      if (since() > m.dur) { pickActivity(); return modes[mode](inp, 0); }
      const u = since() / m.dur;
      const P = { ...STRETCH };
      if (u > 0.7) blendPose(STRETCH, STAND, ease((u - 0.7) / 0.3), P);
      const yawn = u > 0.15 && u < 0.65;
      if (yawn && !m.said) { m.said = true; say('yawn~'); }
      return {
        P, yaw: 1.3, look: null,
        face: face({ eyes: yawn ? 'closed' : 'open', mouth: yawn ? 'yawn' : 'smile', blush: 0.35 }),
      };
    },

    wave(input) {
      if (since() > m.dur) {
        if (posture === 'sit') { setMode('sit', sitData(), 0.5); return modes.sit(input); }
        pickActivity(input);
        return modes[mode](input, 0);
      }
      const seatedNow = posture === 'sit';
      const P = seatedNow ? { ...SIT_EDGE, rhX: 0.05, rhY: 0.12, rhZ: 0.12, elbowOut: 0.5, headRoll: 0.12 } : { ...WAVE };
      const w = Math.sin(since() * 11);
      P.rhZ += 0.035 * w;
      P.rPaw = 0.25 * w;
      if (seatedNow) dangle(P, 1.1, 0.04);
      if (!m.said) { m.said = true; say(pick(['hi hi~', 'nya~!', 'hello!'])); }
      return { P, yaw: 1.4, look: { kind: 'viewer', weight: 1 }, face: face({ eyes: since() > 0.6 ? 'happy' : 'open', mouth: 'open', blush: 0.4 }) };
    },

    groom() {
      if (since() > m.dur) { setMode('sit', sitData(), 0.6); return modes.sit(inp); }
      const P = { ...SIT_PAW };
      const t = since();
      const cyc = t % 2.2;
      // Lick a paw, then rub it over the face / ear.
      if (cyc < 1.2) {
        P.lhY -= 0.03; P.lhX += 0.02;
        P.rhY -= 0.09; P.rhX -= 0.03; P.rPaw = 0.3;
        P.headPitch = -0.12 + 0.05 * Math.sin(t * 16);
        P.headYaw = 0.2;
      } else {
        const u = (cyc - 1.2) / 1.0;
        const a = Math.sin(u * Math.PI);
        P.lhY += a * 0.07; P.lhZ += a * 0.04;
        P.rhY -= 0.09; P.rhX -= 0.03;
        P.headRoll = -0.25 * a;
        P.headPitch = -0.05;
      }
      dangle(P, 0.5, 0.02);
      P.tailSway = 0.15;
      if (!m.said && t > 0.6) { m.said = true; if (Math.random() < 0.5) say('mrrp'); }
      return { P, yaw: 1.35, look: null, face: face({ eyes: 'closed', mouth: cyc < 1.2 ? 'o' : 'cat', blush: 0.3 }) };
    },

    doze(input) {
      if (since() > m.dur) {
        lastInteract = now - 30;
        setMode('sit', sitData(), 1.2);
        say('...nya?');
        return modes.sit(input);
      }
      if (since() > m.nextZ) { m.nextZ += 2.4; effects.push({ type: 'zzz' }); }
      const P = { ...DOZE };
      // Nodding off: head sinks slowly then bobs back.
      const nod = (since() % 6) / 6;
      P.headPitch -= 0.08 * ease(nod * 1.3) - (nod > 0.85 ? 0.08 * ease((nod - 0.85) / 0.15) : 0);
      const drift = clamp(since() / 3, 0, 1);
      if (wakeScore > 0.2) { P.earBack = 0; P.earTwitch = 0.3 * Math.sin(now * 30); P.earTwitchSide = 1; }
      return {
        P, yaw: 1.4, look: null,
        face: face({ eyes: drift < 1 ? 'open' : 'closed', open: 0.5 - drift * 0.5, mouth: 'o', blush: 0.35 }),
      };
    },

    dance(input) {
      if (since() > m.dur) { pickActivity(input); return modes[mode](input, 0); }
      const t = since();
      const beat = t * 2.2 * Math.PI;
      const P = { ...STAND };
      P.hipY -= 0.02 * (0.5 + 0.5 * Math.cos(beat * 2));
      P.hipZ = 0.02 * Math.sin(beat);
      P.roll = 0.08 * Math.sin(beat);
      P.chestRoll = -0.06 * Math.sin(beat);
      P.headRoll = 0.15 * Math.sin(beat);
      P.lhX = 0.07; P.lhY = -0.06 + 0.05 * Math.sin(beat); P.lhZ = -0.01; P.lPaw = 1;
      P.rhX = 0.07; P.rhY = -0.06 - 0.05 * Math.sin(beat); P.rhZ = -0.01; P.rPaw = 1;
      P.lfY += 0.03 * Math.max(0, Math.sin(beat));
      P.rfY += 0.03 * Math.max(0, -Math.sin(beat));
      P.tailSway = 0.8; P.tailHz = 1.1;
      if (now > m.nextNote) { m.nextNote = now + rand(0.5, 0.9); effects.push({ type: 'note' }); }
      return { P, yaw: 1.3, look: { kind: 'viewer', weight: 0.6 }, face: face({ eyes: 'happy', mouth: 'open', blush: 0.4 }) };
    },

    change() {
      const t = since();
      const standing = posture === 'stand';
      if (!m.swapped && t > m.dur * 0.45) {
        m.swapped = true;
        currentOutfit = m.next;
        outfitChanged = m.next;
        lastOutfitChange = now;
        effects.push({ type: 'poof' });
      }
      if (t === 0 || !m.sparkled) { m.sparkled = true; effects.push({ type: 'sparkles' }); }
      if (t > m.dur) {
        spin = 0;
        say(pick(['ta-da!', '✧', 'nya~♪']));
        if (standing) { setMode('wave', { dur: 1.6, said: true }, 0.3); return modes.wave(inp); }
        setMode('sit', sitData(), 0.5);
        return modes.sit(inp);
      }
      let P;
      if (standing) {
        // Twirl on the spot.
        spin = -Math.PI * 2 * ease(t / m.dur);
        P = { ...STAND, lhZ: 0.1, rhZ: 0.1, lhY: -0.15, rhY: -0.15, elbowOut: 0.5 };
        P.hipY += 0.015 * Math.sin((t / m.dur) * Math.PI);
      } else {
        P = { ...SIT_PAW };
      }
      return { P, yaw: 1.4, look: null, face: face({ eyes: 'happy', mouth: 'open', blush: 0.5 }) };
    },

    pet(input) {
      if (now > m.until) {
        if (posture === 'sit') { setMode('sit', sitData(), 0.6); return modes.sit(input); }
        setMode('stand', { dur: rand(3, 6), nextLook: 0 }, 0.5);
        return modes.stand(input);
      }
      if (now > m.nextHeart) { m.nextHeart = now + rand(0.35, 0.7); effects.push({ type: 'heart' }); }
      const P = restPose();
      const w = Math.sin(since() * 5);
      P.headRoll = 0.18 + 0.08 * w;
      P.headPitch = -0.1;
      P.earBack = 0.55 + 0.1 * w;
      P.tailSway = 1.0; P.tailHz = 1.4; P.tailLift = 0.4;
      if (posture === 'sit') {
        P.lhX = 0.07; P.lhY = -0.12; P.rhX = 0.07; P.rhY = -0.12; P.lPaw = 0.8; P.rPaw = 0.8;
        dangle(P, 1.3, 0.05);
      } else {
        P.lhX = 0.07; P.lhY = -0.13; P.lhZ = -0.03; P.rhX = 0.07; P.rhY = -0.13; P.rhZ = -0.03;
        P.hipY -= 0.01; P.roll = 0.05 * w;
      }
      return { P, yaw: 1.45, look: null, face: face({ eyes: 'happy', mouth: m.purr ? 'cat' : 'open', blush: 0.75 }) };
    },

    poke(input) {
      const t = since();
      if (t > m.dur) {
        if (posture === 'sit') { setMode('sit', sitData(), 0.5); return modes.sit(input); }
        setMode('stand', { dur: rand(3, 6), nextLook: 0 }, 0.5);
        return modes.stand(input);
      }
      const P = restPose();
      let f;
      if (m.pout) {
        // Arms crossed-ish, looking away, cheeks puffed.
        P.lhX = 0.1; P.lhY = -0.12; P.lhZ = -0.07; P.rhX = 0.11; P.rhY = -0.1; P.rhZ = -0.07;
        P.headYaw = -0.45; P.headPitch = 0.12; P.headRoll = -0.1;
        P.earBack = 0.5;
        P.tailSway = 0.9; P.tailHz = 1.8;
        f = face({ eyes: 'closed', mouth: 'pout', blush: 0.8, brow: 'angry' });
      } else {
        const jump = t < 0.3 ? Math.sin((t / 0.3) * Math.PI) : 0;
        if (posture === 'stand') P.hipY += 0.03 * jump;
        P.earBack = t < 0.4 ? 0 : 0.2;
        P.headPitch = 0.08;
        f = t < 0.5
          ? face({ small: 1, mouth: 'o', blush: 0.5, brow: 'up' })
          : face({ eyes: 'happy', mouth: 'fang', blush: 0.5 });
      }
      return { P, yaw: 1.35, look: m.pout ? null : { kind: 'viewer', weight: 0.8 }, face: f };
    },

    play(input, dt) {
      const moving = input.cursorStill < 0.6;
      const d = distToCursor(input);
      if (d < PLAY_RADIUS * 1.4 && input.cursorStill < 5) { m.lost = now; touch(); }
      const rel = {
        x: (input.cursor.x - g.x) * g.facing / S,
        y: (g.y - input.cursor.y) / S,
      };
      const [lo, hi] = walkBounds();
      if (input.cursorStill > 8 || now - m.lost > 2) {
        if (posture === 'sit') setMode('sit', sitData(), 0.6);
        else setMode('stand', { dur: rand(3, 6), nextLook: 0 }, 0.5);
        return modes[mode](input, 0);
      }
      if (Math.abs(rel.x) > 0.25 && now - (m.flipT || 0) > 0.8 && rel.x < 0) {
        g.facing *= -1; m.flipT = now; rel.x = -rel.x;
      }
      const f = face({ pupil: 0.8, mouth: 'fang', blush: 0.35, sparkle: 1 });
      const look = { kind: 'cursor', weight: 1 };

      // Seated: bat at it with paws, stand up if it runs off.
      const farAlong = Math.abs(rel.x) > 1.5 && rel.y < 1.2 && moving;
      if (posture === 'sit') {
        if (farAlong && since() > 1.5 && hi - lo > S) {
          posture = 'stand';
          snapshot = { ...out }; blendStart = now; blendDur = 0.5;
        } else {
          const P = { ...SIT_PAW };
          const u = (now * 3.2) % 1;
          const k = u < 0.5 ? Math.sin(u * 2 * Math.PI) : 0;
          if (rel.y > 0.1 || Math.abs(rel.x) < 1.4) {
            const leg = Math.floor(now * 3.2) % 2 ? 'l' : 'r';
            P[leg + 'hX'] += 0.06 * k;
            P[leg + 'hY'] += 0.04 * k;
            P[leg + 'hZ'] += 0.03 * k;
          }
          dangle(P, 1.4, 0.05);
          return { P, yaw: 1.2, look, face: f };
        }
      }

      // Standing.
      let P;
      if (farAlong || (Math.abs(rel.x) > 0.9 && moving && rel.y < 1.6)) {
        const tx = clamp(input.cursor.x - g.facing * S * 0.45, lo, hi);
        const dx = tx - g.x;
        if (Math.abs(dx) > 5) {
          g.facing = Math.sign(dx);
          g.x += Math.sign(dx) * Math.min(Math.abs(dx), RUN_SPEED * dt);
          m.phase = ((m.phase || 0) + (dt * (RUN_SPEED / S)) / 0.36) % 1;
          P = gait(WALK, m.phase, 0.18, true);
          return { P, yaw: 0.45, look, face: f };
        }
      }
      if (rel.y > 0.75 && Math.abs(rel.x) < 0.6) {
        // Reach / hop for a cursor above her head.
        P = { ...REACH };
        const hop = Math.max(0, Math.sin(now * 5));
        P.hipY += 0.04 * hop; P.lfY += 0.04 * hop; P.rfY += 0.04 * hop;
        P.lhY += 0.03 * Math.sin(now * 9); P.rhY -= 0.03 * Math.sin(now * 9);
        return { P, yaw: 1.2, look, face: face({ pupil: 1, mouth: 'open', blush: 0.4, sparkle: 1 }) };
      }
      P = { ...READY };
      if (moving && Math.abs(rel.x) < 1.2) {
        const u = (now * 3.4) % 1;
        const k = u < 0.5 ? Math.sin(u * 2 * Math.PI) : 0;
        const leg = Math.floor(now * 3.4) % 2 ? 'l' : 'r';
        P[leg + 'hX'] += 0.08 * k;
        P[leg + 'hY'] += clamp(rel.y - 0.3, -0.1, 0.12) * k;
      }
      P.hipY += 0.008 * Math.sin(now * 8);
      return { P, yaw: 0.8, look, face: f };
    },

    jumpDown(input) {
      const t = since();
      if (m.phase === 'prep') {
        const P = { ...CROUCH };
        if (t > 0.4) {
          const target = input.world.findFloor(m.x1, m.y0 + 2);
          m.y1 = target.y; m.target = target;
          const vy0 = -420;
          const dy = m.y1 - m.y0;
          m.T = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * GRAVITY * dy)) / GRAVITY;
          m.vy0 = vy0;
          m.phase = 'air'; m.ta = now;
          g.facing = Math.sign(m.x1 - m.x0) || g.facing;
          snapshot = { ...out }; blendStart = now; blendDur = 0.12;
          say('hup!');
        }
        return { P, yaw: 0.6, look: null, face: face({ mouth: 'flat', brow: 'up' }) };
      }
      if (m.phase === 'air') {
        const ta = Math.min(now - m.ta, m.T);
        const u = ta / m.T;
        g.x = m.x0 + (m.x1 - m.x0) * u;
        g.y = m.y0 + m.vy0 * ta + 0.5 * GRAVITY * ta * ta;
        if (u >= 1) {
          g.y = m.y1;
          floor = { ...m.target };
          perchedSince = now;
          setMode('land', { impact: m.vy0 + GRAVITY * ta }, 0.08);
          return modes.land(input);
        }
        return { P: { ...FALL }, yaw: 0.8, look: null, face: face({ eyes: 'x', mouth: 'open', blush: 0.4 }) };
      }
      return modes.land(input);
    },

    fall(input, dt) {
      g.vy += GRAVITY * dt;
      g.y += g.vy * dt;
      if (g.y >= m.target.y) {
        g.y = m.target.y;
        floor = { ...m.target };
        perchedSince = now;
        const impact = g.vy;
        g.vy = 0;
        setMode('land', { impact }, 0.08);
        return modes.land(input);
      }
      return { P: { ...FALL }, yaw: 1.3, look: null, face: face({ eyes: 'x', mouth: 'open', blush: 0.5 }) };
    },

    land(input) {
      const depth = clamp((m.impact || 0) / 1600, 0.2, 1);
      const u = since() / 0.55;
      const P = blendPose(CROUCH, STAND, ease(u));
      P.hipY -= 0.06 * depth * (1 - ease(u));
      if (u >= 1) {
        posture = 'stand';
        if (distToCursor(input) < PLAY_RADIUS) setMode('play', { lost: now }, 0.4);
        else if (depth > 0.5) { setMode('poke', { dur: 1.2 }, 0.3); say('phew~'); }
        else startActivity(Math.random() < 0.5 ? 'sit' : 'walk', input);
        return modes[mode](input, 0);
      }
      return { P, yaw: 1.1, look: null, face: face({ eyes: u < 0.5 ? 'x' : 'open', mouth: 'o', blush: 0.5 }) };
    },

    dragged(input, dt) {
      const target = clamp(-input.cursorVel.x * 0.0009, -0.6, 0.6);
      swingVel += (60 * (target - swing) - 5 * swingVel) * dt;
      swing += swingVel * dt;
      const P = { ...HANG };
      const calm = since() > 1.2 && Math.abs(input.cursorVel.x) + Math.abs(input.cursorVel.y) < 150;
      const kick = calm ? 0.3 : 1;
      const w = now * 9;
      P.lfY += 0.04 * kick * Math.sin(w); P.rfY += 0.04 * kick * Math.sin(w + Math.PI);
      P.lfX += 0.03 * kick * Math.sin(w + 0.8); P.rfX += 0.03 * kick * Math.sin(w + 0.8 + Math.PI);
      P.lhY += 0.02 * kick * Math.sin(w * 1.3); P.rhY += 0.02 * kick * Math.sin(w * 1.3 + 1);
      P.tailSway = 0.5 + Math.min(0.7, Math.abs(swingVel) * 0.3);
      const f = calm
        ? face({ mouth: 'pout', blush: 0.7, brow: 'worried', gy: 0.4 })
        : face({ eyes: 'x', mouth: 'wavy', blush: 0.8, brow: 'worried' });
      return { P, yaw: 1.5, look: calm ? { kind: 'viewer', weight: 0.7 } : null, face: f };
    },
  };

  // ------------------------------------------------------------ public
  function update(dt, t, input) {
    now = t;
    inp = input;
    effects = [];
    outfitChanged = null;
    const d = distToCursor(input);
    const ev = input.events;

    if (mode === null) { lastInteract = now; startActivity('sit', input); }

    // Head pats: rubbing the cursor back and forth over her head.
    const overHead = input.headPos && Math.hypot(input.cursor.x - input.headPos.x, input.cursor.y - input.headPos.y) < input.headR * 1.15;
    const rubbing = overHead && Math.abs(input.cursorVel.x) + Math.abs(input.cursorVel.y) > 120;
    patScore = rubbing ? patScore + dt : Math.max(0, patScore - dt * 0.8);

    const busy = ['dragged', 'fall', 'jumpDown', 'land'].includes(mode);

    if (ev.grab) {
      touch();
      swing = 0; swingVel = 0; spin = 0;
      setMode('dragged', {}, 0.25);
      say(pick(['nya?!', 'eep!', 'hey!']));
    } else if (ev.release && mode === 'dragged') {
      touch();
      // Keep the pelvis where it is on screen while switching to falling.
      const hip = ev.release.hip;
      g.x = hip.x;
      g.y = hip.y + STAND.hipY * S;
      out.hipX = 0;
      out.hipY = STAND.hipY;
      swing = 0; swingVel = 0;
      const target = input.world.findFloor(g.x, hip.y);
      if (g.y > target.y) g.y = target.y;
      g.vy = 0;
      posture = 'stand';
      setMode('fall', { target }, 0.2);
    } else if (ev.command && !busy) {
      touch();
      const c = ev.command;
      if (c.startsWith('outfit:')) {
        const name = c.slice(7);
        if (name !== currentOutfit) {
          setMode('change', { dur: posture === 'stand' ? 1.3 : 1.0, next: name, swapped: false }, 0.3);
        }
      } else if (c === 'nap') {
        if (posture === 'stand') posture = 'sit';
        setMode('doze', { dur: rand(60, 150), nextZ: 2.5 }, 1.5);
      } else if (c === 'walk') startActivity('stroll', input);
      else if (['sit', 'wave', 'dance', 'stretch'].includes(c)) startActivity(c, input);
      else if (c === 'pet') ev.pet = { onHead: true };
    }

    if ((ev.pet || patScore > 0.35) && !busy && mode !== 'change') {
      touch();
      wakeScore = 0;
      const onHead = patScore > 0.35 || (ev.pet && ev.pet.onHead);
      if (onHead) {
        if (mode !== 'pet') {
          setMode('pet', { until: now + 2.6, nextHeart: now, purr: Math.random() < 0.5 }, 0.35);
          say(m.purr ? 'purr~' : pick(['nya~♡', 'ehehe~', 'nyaa~']));
        } else {
          m.until = Math.max(m.until, now + (ev.pet ? 1.8 : 0.6));
        }
        if (patScore > 0.35) patScore = 0.36;
      } else {
        pokes = pokes.filter((p) => now - p < 4);
        pokes.push(now);
        if (pokes.length >= 4) {
          pokes = [];
          setMode('poke', { dur: 3.2, pout: true }, 0.3);
          say('hmph!');
          effects.push({ type: 'anger' });
        } else {
          setMode('poke', { dur: 1.6 }, 0.2);
          say(pick(['nya?', '!?', 'hehe', 'mew!']));
        }
      }
    } else if (mode === 'doze') {
      if (d < 120 && input.cursorStill < 0.5) wakeScore += dt;
      else wakeScore = Math.max(0, wakeScore - dt * 0.3);
      if (wakeScore > 1) {
        wakeScore = 0;
        touch();
        setMode('sit', sitData(), 1.0);
        say('...nya?');
      }
    } else if (!busy && !['play', 'pet', 'poke', 'change', 'dragged'].includes(mode)) {
      if (d < PLAY_RADIUS && input.cursorStill < 0.4 && Math.hypot(input.cursorVel.x, input.cursorVel.y) > 250) {
        touch();
        setMode('play', { lost: now }, 0.4);
        if (Math.random() < 0.6) say(pick(['!', 'nya!', 'ooh?']));
      }
    }

    // Standing on a window: ride along if it moves, fall if it goes away.
    if (floor.id != null && !['dragged', 'fall', 'jumpDown'].includes(mode)) {
      const s = input.world.surface(floor.id, g.x);
      if (!s) {
        floor = { ...input.world.taskbar };
        g.vy = 0;
        posture = 'stand';
        setMode('fall', { target: input.world.findFloor(g.x, g.y - 4) }, 0.25);
        say('eek!');
      } else {
        g.x += s.x0 - floor.x0;
        g.y = s.y;
        floor = s;
      }
    }

    const res = modes[mode](input, dt);

    const k = ease((now - blendStart) / blendDur);
    blendPose(snapshot, res.P, k, out);

    // Occasional ear flick.
    if (now > earTwitch.next && mode !== 'doze') {
      earTwitch = { until: now + 0.22, side: Math.random() < 0.5 ? 1 : -1, next: now + rand(3, 8) };
    }
    if (now < earTwitch.until && mode !== 'doze') {
      out.earTwitch = 0.4 * Math.sin((earTwitch.until - now) * 55);
      out.earTwitchSide = earTwitch.side;
    } else if (mode !== 'doze') {
      out.earTwitch = 0;
    }

    const yawTarget = yawFor(res.yaw);
    const dy = yawTarget - yaw;
    yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * (2 + Math.abs(dy) * 6));

    return {
      x: g.x,
      y: g.y,
      floorY: mode === 'dragged' ? input.world.findFloor(input.cursor.x, input.cursor.y).y : floor.y,
      onWindow: floor.id != null,
      seated: out.seat > 0.5,
      pose: out,
      yaw: yaw + spin,
      look: res.look,
      face: res.face,
      hang: mode === 'dragged',
      swing: mode === 'dragged' ? swing : 0,
      effects,
      mode,
      outfit: outfitChanged,
    };
  }

  function setTaskbar(tb) {
    if (floor.id == null) {
      const dy = tb.y - floor.y;
      floor = { ...tb };
      if (!['dragged', 'fall', 'jumpDown'].includes(mode)) g.y += dy;
    }
  }

  return {
    update,
    setTaskbar,
    setAutoOutfit: (v) => { auto = v; },
    get outfit() { return currentOutfit; },
    get mode() { return mode; },
    debugActivity: (name) => startActivity(name),
  };
}
