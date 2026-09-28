// Key poses for the cat girl as flat bags of numbers (blendable with a
// lerp). Hands (lh*/rh*) are offsets from the shoulders, feet (lf*/rf*) are
// ankle targets in the ground frame; *Z values are "outward" for both sides.
// l = her left, r = her right. See girlModel.js for the frame.

export const STAND = {
  hipX: 0, hipY: 0.36, hipZ: 0, lean: 0.02, roll: 0, twist: 0,
  bend: 0.02, chestRoll: 0, chestTwist: 0, neckBend: 0,
  headPitch: -0.04, headYaw: 0, headRoll: 0,
  lhX: 0.01, lhY: -0.205, lhZ: 0.035, rhX: 0.01, rhY: -0.205, rhZ: 0.035, lPaw: 0, rPaw: 0, elbowOut: 0,
  lfX: 0.0, lfY: 0.034, lfZ: 0.052, rfX: 0.0, rfY: 0.034, rfZ: 0.052, lfP: 0, rfP: 0,
  tailBase: 0.95, tailSide0: 0.15, tailSide: 0.03, tailCurl: -0.13, tailTip: -0.12, tailSway: 0.35, tailLift: 0.2, tailHz: 0.45,
  earBack: 0, breath: 0.012, breathHz: 0.35, seat: 0,
};

// Hands clasped behind the back, a little shy sway.
export const STAND_SHY = {
  ...STAND,
  lhX: -0.08, lhY: -0.17, lhZ: -0.035, rhX: -0.08, rhY: -0.17, rhZ: -0.035,
  headRoll: 0.08, headPitch: -0.02,
};

export const WALK = {
  ...STAND,
  hipY: 0.352, lean: 0.06, bend: 0.0,
  tailBase: 0.6, tailCurl: -0.08, tailSway: 0.4, tailHz: 0.8,
};

// Sitting on a ledge (the taskbar / a window top) with legs hanging over.
export const SIT_EDGE = {
  ...STAND,
  hipX: 0, hipY: 0.066, lean: -0.04, bend: 0.06,
  lhX: 0.085, lhY: -0.165, lhZ: -0.012, rhX: 0.085, rhY: -0.165, rhZ: -0.012,
  lfX: 0.175, lfY: -0.1, lfZ: 0.06, rfX: 0.175, rfY: -0.1, rfZ: 0.06, lfP: 0.45, rfP: 0.45,
  tailBase: 0.1, tailSide0: 0.7, tailSide: 0.2, tailCurl: -0.01, tailTip: -0.18, tailSway: 0.25, tailLift: 0.1, tailHz: 0.35,
  seat: 1,
};

// Leaning back on her hands.
export const SIT_BACK = {
  ...SIT_EDGE,
  lean: -0.22, bend: -0.05, headPitch: 0.1,
  lhX: -0.12, lhY: -0.19, lhZ: 0.04, rhX: -0.12, rhY: -0.19, rhZ: 0.04, elbowOut: 0.2,
};

// Cat-paw hands up by the face (grooming / "nya" pose), seated.
export const SIT_PAW = {
  ...SIT_EDGE,
  bend: 0.12,
  lhX: 0.1, lhY: 0.02, lhZ: -0.035, rhX: 0.1, rhY: 0.02, rhZ: -0.035, lPaw: 1.1, rPaw: 1.1,
};

// Seated doze: slumped, head drooping.
export const DOZE = {
  ...SIT_EDGE,
  lean: 0.03, bend: 0.08, neckBend: 0.04, headPitch: -0.06, headRoll: 0.24,
  lhX: 0.1, lhY: -0.17, lhZ: -0.03, rhX: 0.1, rhY: -0.17, rhZ: -0.03,
  lfX: 0.17, lfY: -0.105, rfX: 0.172, rfY: -0.105,
  tailSway: 0.08, tailHz: 0.2, earBack: 0.35, breath: 0.02, breathHz: 0.25,
};

export const STRETCH = {
  ...STAND,
  hipY: 0.365, lean: -0.05, bend: -0.12, headPitch: 0.25,
  lhX: -0.01, lhY: 0.19, lhZ: 0.1, rhX: -0.01, rhY: 0.19, rhZ: 0.1, elbowOut: 0.9, lPaw: -0.4, rPaw: -0.4,
  lfP: -0.2, rfP: -0.2, lfY: 0.04, rfY: 0.04,
  tailBase: 0.5, tailCurl: -0.18, tailSway: 0.1, earBack: 0.2,
};

export const WAVE = {
  ...STAND,
  headRoll: 0.12,
  rhX: 0.04, rhY: 0.12, rhZ: 0.12, elbowOut: 0.5,
  lhX: 0.03, lhY: -0.2, lhZ: 0.03,
  tailSway: 0.6, tailHz: 0.9,
};

// Playful ready stance: knees bent, paws up.
export const READY = {
  ...STAND,
  hipY: 0.315, lean: 0.14, bend: 0.1, headPitch: 0.05,
  lhX: 0.1, lhY: -0.06, lhZ: -0.02, rhX: 0.1, rhY: -0.06, rhZ: -0.02, lPaw: 1.0, rPaw: 1.0,
  lfX: -0.02, lfZ: 0.07, rfX: 0.02, rfZ: 0.07,
  tailBase: 0.5, tailCurl: -0.16, tailSway: 0.7, tailHz: 1.3, tailLift: 0.3,
};

// Reaching up with both hands (cursor just above her head).
export const REACH = {
  ...STAND,
  hipY: 0.37, lean: -0.04, bend: -0.1, headPitch: 0.5,
  lhX: 0.06, lhY: 0.19, lhZ: 0.09, rhX: 0.06, rhY: 0.19, rhZ: 0.09, lPaw: 0.6, rPaw: 0.6, elbowOut: 0.7,
  lfP: -0.35, rfP: -0.35, lfY: 0.05, rfY: 0.05,
  tailSway: 0.7, tailHz: 1.2,
};

// Held by the scruff: dangling, knees tucked a bit, paws up.
export const HANG = {
  ...STAND,
  hipX: 0, hipY: 0.36, lean: 0, bend: 0.1, neckBend: 0.05, headPitch: 0.0,
  lhX: 0.08, lhY: -0.09, lhZ: -0.01, rhX: 0.08, rhY: -0.09, rhZ: -0.01, lPaw: 1.0, rPaw: 1.0,
  lfX: 0.05, lfY: 0.08, lfZ: 0.05, rfX: 0.02, rfY: 0.06, rfZ: 0.05, lfP: 0.6, rfP: 0.6,
  tailBase: 1.4, tailCurl: 0.02, tailSway: 0.5, tailHz: 1.0, earBack: 0.6,
};

export const FALL = {
  ...STAND,
  lhX: 0.03, lhY: 0.12, lhZ: 0.1, rhX: 0.03, rhY: 0.12, rhZ: 0.1, elbowOut: 0.8,
  lfX: 0.04, lfY: 0.06, rfX: -0.03, rfY: 0.05, lfP: 0.3, rfP: 0.3,
  tailBase: 0.2, tailCurl: -0.2, tailSway: 0.8, tailHz: 2, earBack: 0.5,
};

// Squat on landing / before a hop.
export const CROUCH = {
  ...STAND,
  hipY: 0.24, lean: 0.35, bend: 0.2, headPitch: 0.15,
  lhX: 0.1, lhY: -0.17, lhZ: 0.04, rhX: 0.1, rhY: -0.17, rhZ: 0.04,
  lfX: 0.0, lfZ: 0.07, rfX: 0.0, rfZ: 0.07,
  tailBase: 0.4, tailCurl: -0.1,
};

export function blendPose(a, b, t, out = {}) {
  for (const k in b) {
    const av = a[k] === undefined ? b[k] : a[k];
    out[k] = av + (b[k] - av) * t;
  }
  return out;
}
