import { DIM, jointsFor } from './catModel.js';

// Key poses as flat bags of numbers so any two can be blended with a lerp.
// Paw targets (flX/flY...) are wrist points in the ground frame; blM/brM is
// the angle of the hind metatarsal (0 = vertical, larger = hock further
// back / lower, ~1.4 = lying flat on the ground as when sitting).
// Expression: earBack (<0 pricked forward, 1 flat), eyeOpen, pupil (0 slit
// .. 1 round), jaw (mouth open), whisker (-1 pinned back .. 1 forward),
// arch (Halloween-cat back), puff (fur standing on end).

const H = DIM.pawH;

export const STAND = {
  hipX: -0.18, hipY: 0.335, pitch: 0, roll: 0,
  neck: 0.75, headPitch: -0.12, headYaw: 0, headRoll: 0,
  flX: 0.15, flY: H, frX: 0.15, frY: H,
  blX: -0.185, blY: H, brX: -0.185, brY: H, blM: 0.4, brM: 0.4, splay: 0,
  tailBase: -0.35, tailCurl: 0.07, tailTip: -0.08, tailSide: 0, tailSway: 0.35, tailLift: 0.2, tailHz: 0.5,
  earBack: 0, eyeOpen: 1, pupil: 0.3, breath: 0.012, breathHz: 0.5,
  jaw: 0, whisker: 0, arch: 0, puff: 0, tailWrap: 0,
};

export const WALK = {
  ...STAND,
  tailBase: -1.15, tailCurl: 0.1, tailTip: -0.25, tailSway: 0.3, tailLift: 0.4, tailHz: 0.9,
  headPitch: -0.05,
};

export const SIT = {
  ...STAND,
  hipX: -0.131, hipY: 0.13, pitch: 0.62,
  neck: 0.55, headPitch: 0,
  flX: 0.174, flY: H, frX: 0.183, frY: H,
  blX: 0.017, blY: H, brX: 0.026, brY: H, blM: 1.38, brM: 1.38,
  // Tail laid on the ground and wrapped around the front paws.
  tailBase: 0.9, tailCurl: 0, tailTip: 0.02, tailSide: 0, tailSway: 0.06, tailLift: 0.03, tailHz: 0.4, tailWrap: 1,
};

export const LOAF = {
  ...STAND,
  hipX: -0.191, hipY: 0.14, pitch: 0.02,
  neck: 0.6, headPitch: -0.08,
  flX: 0.200, flY: H, frX: 0.209, frY: H,
  blX: -0.026, blY: H, brX: -0.026, brY: H, blM: 1.45, brM: 1.45, splay: 0.15,
  tailBase: 0.55, tailCurl: 0.02, tailTip: 0, tailSide: 0.2, tailSway: 0.15, tailLift: 0.05, tailHz: 0.3,
  eyeOpen: 0.55, breath: 0.02, breathHz: 0.35,
};

export const SLEEP = {
  ...LOAF,
  hipY: 0.12, pitch: -0.02, roll: -0.12,
  neck: 0.05, headPitch: -0.45, headYaw: -0.7, headRoll: 0.35,
  flX: 0.174, frX: 0.183,
  tailBase: 0.1, tailCurl: 0.06, tailSide: 0.24, tailSway: 0.04, tailLift: 0, tailHz: 0.2,
  earBack: 0.25, eyeOpen: 0, pupil: 0, breath: 0.035, breathHz: 0.28,
};

export const STRETCH = {
  ...STAND,
  hipX: -0.174, hipY: 0.35, pitch: -0.42,
  neck: 0.45, headPitch: 0.15,
  flX: 0.365, flY: H, frX: 0.383, frY: H,
  blX: -0.226, blY: H, brX: -0.209, brY: H, blM: 0.1, brM: 0.1,
  tailBase: -1.3, tailCurl: 0.08, tailTip: -0.1, tailSway: 0.1, tailLift: 0.1,
  eyeOpen: 0.3, earBack: 0.35,
};

export const CROUCH = {
  ...STAND,
  hipX: -0.174, hipY: 0.22, pitch: -0.08,
  neck: 0.35, headPitch: 0.0,
  flX: 0.209, flY: H, frX: 0.217, frY: H,
  blX: -0.087, blY: H, brX: -0.078, brY: H, blM: 1.0, brM: 1.0,
  tailBase: 0.15, tailCurl: 0.02, tailTip: -0.05, tailSway: 0.35, tailLift: 0.05, tailHz: 1.6,
  earBack: 0.1, pupil: 1,
};

// Half-sitting ready-to-bat stance.
export const READY = {
  ...STAND,
  hipX: -0.148, hipY: 0.17, pitch: 0.38,
  neck: 0.55, headPitch: 0,
  flX: 0.200, flY: H, frX: 0.209, frY: H,
  blX: -0.017, blY: H, brX: -0.009, brY: H, blM: 1.2, brM: 1.2,
  tailBase: 0.5, tailCurl: 0.0, tailTip: -0.1, tailSway: 0.6, tailLift: 0.2, tailHz: 1.3,
  pupil: 1,
};

// Up on the hind legs, front paws free.
export const REAR = {
  ...STAND,
  hipX: -0.104, hipY: 0.2, pitch: 1.2,
  neck: 0.15, headPitch: 0.3,
  flX: 0.044, flY: 0.55, frX: 0.070, frY: 0.52,
  blX: -0.052, blY: H, brX: -0.044, brY: H, blM: 1.05, brM: 1.05,
  tailBase: -1.05, tailCurl: 0.02, tailTip: -0.08, tailSide: 0.08, tailSway: 0.4, tailLift: 0.1, tailHz: 1.1,
  pupil: 1,
};

// Airborne, stretched out (pounce / leap).
export const AIR = {
  ...STAND,
  hipX: -0.191, hipY: 0.36, pitch: 0.12,
  neck: 0.55, headPitch: -0.15,
  flX: 0.348, flY: 0.16, frX: 0.365, frY: 0.2,
  blX: -0.383, blY: 0.12, brX: -0.365, brY: 0.15, blM: -0.5, brM: -0.5,
  tailBase: -0.1, tailCurl: -0.04, tailTip: 0, tailSway: 0.1, tailLift: 0.1,
  pupil: 1, earBack: 0.2,
};

// Falling feet-first, legs reaching for the ground.
export const FALL = {
  ...STAND,
  hipY: 0.36,
  flX: 0.244, flY: 0.0, frX: 0.226, frY: 0.02,
  blX: -0.261, blY: 0.0, brX: -0.244, brY: 0.02, blM: 0.2, brM: 0.2,
  tailBase: -0.6, tailCurl: -0.08, tailSway: 0.6, tailLift: 0.6, tailHz: 2,
  earBack: 0.5, pupil: 1,
};

// Held by the scruff: body hangs, legs dangle. Paw targets are filled in
// relative to the joints by hangPose().
export const HANG = {
  ...STAND,
  hipX: 0.000, hipY: 0, pitch: 1.3,
  neck: -0.05, headPitch: 0.05,
  tailBase: 0.15, tailCurl: 0.03, tailTip: 0.02, tailSway: 0.3, tailLift: 0, tailHz: 0.7,
  earBack: 0.35, pupil: 0.7, blM: 0.2, brM: 0.2,
};

// ---- emotions

// Happy / greeting: standing with the tail straight up and hooked at the tip.
export const HAPPY = {
  ...STAND,
  tailBase: -1.45, tailCurl: 0.02, tailTip: 0.32, tailSway: 0.12, tailLift: 0.05, tailHz: 0.6,
  earBack: -0.15, eyeOpen: 0.75, pupil: 0.45, whisker: 0.4,
};

// Hissing Halloween cat: back arched, fur on end, legs stiff and gathered,
// ears flat, mouth wide, whiskers pinned back.
export const HISS = {
  ...STAND,
  hipX: -0.17, hipY: 0.36, pitch: 0.04,
  neck: 0.3, headPitch: -0.05, headYaw: 0.25,
  flX: 0.1, flY: H, frX: 0.11, frY: H,
  blX: -0.14, blY: H, brX: -0.13, brY: H, blM: 0.2, brM: 0.2,
  tailBase: -1.2, tailCurl: 0.06, tailTip: 0.2, tailSway: 0.08, tailLift: 0.3, tailHz: 1.8,
  earBack: 1, eyeOpen: 1, pupil: 1, jaw: 0.95, whisker: -1, arch: 1, puff: 1,
};

// Frightened: flattened low to the ground, tail tucked, pupils huge.
export const SCARED = {
  ...CROUCH,
  hipY: 0.19, pitch: 0.02, neck: 0.25, headPitch: -0.1,
  tailBase: 0.35, tailCurl: -0.04, tailTip: 0.05, tailSway: 0.05, tailLift: 0.02, tailHz: 2,
  earBack: 1, pupil: 1, whisker: -1, puff: 0.5, breath: 0.03, breathHz: 1.6,
};

// Curious: sitting up tall, ears and whiskers forward.
export const CURIOUS = {
  ...SIT,
  neck: 0.7, headPitch: 0.08,
  earBack: -0.35, pupil: 0.8, whisker: 1, tailSway: 0.1,
};

export function hangPose(sway) {
  const P = { ...HANG };
  const J = jointsFor(P);
  P.flX = J.shoulder.x + 0.05 + sway * 0.04;
  P.flY = J.shoulder.y - 0.29;
  P.frX = J.shoulder.x + 0.08 + sway * 0.05;
  P.frY = J.shoulder.y - 0.28;
  P.blX = J.hip.x + 0.1 + sway * 0.05;
  P.blY = J.hip.y - 0.36;
  P.brX = J.hip.x + 0.13 + sway * 0.06;
  P.brY = J.hip.y - 0.35;
  return P;
}

export function blendPose(a, b, t, out = {}) {
  for (const k in b) {
    const av = a[k] === undefined ? b[k] : a[k];
    out[k] = av + (b[k] - av) * t;
  }
  return out;
}
