// Outfits are painted into vertex colours of the body parts plus a few
// extra meshes (skirt, bows, headband...). Paint functions get the vertex
// position `p` in the part's local space (chest/pelvis: x forward, y up,
// z to her right) and, for limbs, `t` = 0 at the joint .. 1 at the far end.
// They return a hex colour.

export const SKIN = 0xffe4d4;
const MIKU_TEAL = 0x2fc0c6;

const dot = (p, scale, size) => {
  // Scattered polka dots from a hashed grid.
  const gx = Math.floor(p.x * scale), gy = Math.floor(p.y * scale), gz = Math.floor(p.z * scale);
  const h = Math.abs(Math.sin(gx * 127.1 + gy * 311.7 + gz * 74.7) * 43758.5453) % 1;
  if (h < 0.55) return false;
  const cx = (gx + 0.5) / scale, cy = (gy + 0.5) / scale, cz = (gz + 0.5) / scale;
  return Math.hypot(p.x - cx, p.y - cy, p.z - cz) < size / scale;
};

export const OUTFITS = {
  miku: {
    label: 'Miku',
    // Grey sleeveless top with a teal-edged collar.
    torso(p) {
      const GREY = 0xa7b1b8;
      if (p.y > 0.2) return 0xd4dadd; // collar
      if (p.y > 0.186) return MIKU_TEAL; // collar trim
      if (p.y < 0.012) return 0x2a2d33; // skirt waistband
      return GREY;
    },
    pelvis: () => 0x2a2d33,
    // Bare shoulders (the red "01" is a decal), black detached sleeves with
    // a teal band at the top.
    upper: (t) => (t > 0.6 ? (t < 0.69 ? MIKU_TEAL : 0x25272d) : SKIN),
    fore: () => 0x25272d,
    // Black thigh-high boots with a teal top band and teal platform soles.
    thigh: (t) => (t > 0.6 ? (t < 0.67 ? MIKU_TEAL : 0x25272d) : SKIN),
    shin: () => 0x25272d,
    hands: 'skin',
    bellSleeve: { color: 0x25272d, trim: MIKU_TEAL, leds: true },
    shoe: { style: 'shoe', color: 0x25272d, sole: MIKU_TEAL, chunky: true },
    skirt: { length: 0.11, flare: 0.72, pleats: 14, pleatDepth: 0.011, color: 0x2a2d33, hemColor: MIKU_TEAL, hem: 0.12 },
    extras: ['mikuTie', 'mikuTattoo', 'headset'],
  },

  sailor: {
    label: 'Sailor uniform',
    torso(p) {
      const WHITE = 0xf7f7fb, NAVY = 0x28345e;
      if (p.y < 0.035) return WHITE;
      if (p.x < 0 && p.y > 0.118) {
        // Square collar flap on the back with a white stripe.
        const e = Math.min(0.2 - p.y + 0.09, 0.075 - Math.abs(p.z));
        if (e > 0) return e > 0.012 && e < 0.02 ? WHITE : NAVY;
      }
      if (p.x > 0 && p.y > 0.09) {
        const d = Math.abs(p.z) - (p.y - 0.09) * 0.95;
        if (d > 0 && d < 0.032) return d > 0.021 && d < 0.027 ? WHITE : NAVY;
      }
      return WHITE;
    },
    pelvis: () => 0x2d3a68,
    upper: () => 0xf7f7fb,
    fore: (t) => (t > 0.8 ? (t > 0.86 && t < 0.9 ? 0xf7f7fb : 0x28345e) : 0xf7f7fb),
    thigh: () => SKIN,
    shin: (t) => (t > 0.2 ? 0x24242c : SKIN),
    hands: 'skin',
    shoe: { style: 'shoe', color: 0x6a3a2a, sole: 0x3a2018 },
    skirt: { length: 0.118, flare: 0.62, pleats: 14, pleatDepth: 0.012, color: 0x2d3a68 },
    extras: ['sailorBow'],
  },

  maid: {
    label: 'Maid dress',
    torso(p) {
      const BLACK = 0x2a2530, WHITE = 0xffffff;
      if (p.y > 0.188) return WHITE; // collar
      if (p.x > 0.01 && p.y < 0.15 && Math.abs(p.z) < 0.04) return WHITE; // apron bib
      if (p.x > 0.01 && p.y < 0.15 && Math.abs(p.z) < 0.047) return 0xe8e4ee; // bib frill
      return BLACK;
    },
    pelvis: () => 0x2a2530,
    upper: (t) => (t < 0.45 ? 0x2a2530 : SKIN),
    fore: (t) => (t > 0.74 && t < 0.86 ? 0xffffff : SKIN),
    thigh: (t) => (t > 0.42 ? (t < 0.48 ? 0xe9e6f2 : 0xfdfdff) : SKIN),
    shin: () => 0xfdfdff,
    hands: 'skin',
    puff: 0x2a2530,
    shoe: { style: 'shoe', color: 0x1e1a22, sole: 0x0e0c10 },
    skirt: {
      length: 0.158, flare: 0.8, pleats: 10, pleatDepth: 0.008, color: 0x2a2530,
      apron: 0xffffff, apronWidth: 0.5, hemColor: 0xffffff, hem: 0.08,
    },
    petticoat: { length: 0.17, flare: 0.66, frill: 0.008, inset: 0.97, color: 0xffffff },
    extras: ['headband', 'maidCollar'],
  },

  hoodie: {
    label: 'Comfy hoodie',
    torso(p) {
      const LAV = 0xb9a5f0, DARK = 0x9d86e0;
      if (p.y < 0.012) return DARK; // ribbed hem
      if (p.x > 0.02 && p.y > 0.025 && p.y < 0.085 && Math.abs(p.z) < 0.052) {
        return Math.abs(p.z) > 0.046 || p.y > 0.08 ? 0x8c74d4 : DARK; // pocket
      }
      return LAV;
    },
    pelvis: () => 0x2b2a35,
    upper: () => 0xb9a5f0,
    fore: (t) => (t > 0.86 ? 0x9d86e0 : 0xb9a5f0),
    thigh: (t) => (t > 0.34 ? (Math.floor(t * 13) % 2 ? 0xffffff : 0xb9a5f0) : SKIN),
    shin: (t) => (Math.floor(t * 12) % 2 ? 0xffffff : 0xb9a5f0),
    hands: 'skin',
    sleeveCover: 0x9d86e0,
    shoe: { style: 'sneaker', color: 0xffffff, sole: 0xf0a8c0 },
    skirt: { length: 0.098, flare: 0.72, pleats: 12, pleatDepth: 0.01, color: 0x2b2a35 },
    extras: ['hood', 'drawstrings'],
  },

  sundress: {
    label: 'Sundress',
    torso(p) {
      const DRESS = 0xfff1b8;
      if (p.y > 0.035 && p.y < 0.052) return 0xf4a25e; // waist ribbon
      if (p.y < 0.135) return DRESS;
      const az = Math.abs(p.z);
      if (az > 0.034 && az < 0.05 && p.y < 0.205) return DRESS; // straps
      return SKIN;
    },
    pelvis: () => 0xfff1b8,
    upper: () => SKIN,
    fore: () => SKIN,
    thigh: () => SKIN,
    shin: () => SKIN,
    hands: 'skin',
    shoe: { style: 'sandal', color: 0x9a6038, sole: 0x7a4a2a },
    skirt: {
      length: 0.19, flare: 0.62, pleats: 0, pleatDepth: 0, color: 0xfff1b8,
      hemColor: 0xffffff, hem: 0.1, wave: 0.006,
    },
    extras: ['flowerClip'],
  },

  pajamas: {
    label: 'Pajamas',
    torso(p) {
      const BLUE = 0xbfdcff;
      if (p.y > 0.186) return 0xffffff; // piping at the collar
      if (p.x > 0.03 && Math.abs(p.z) < 0.004) return 0xffffff; // placket
      return dot(p, 38, 0.3) ? 0xfff3a8 : BLUE;
    },
    pelvis: () => 0xbfdcff,
    upper: (t, p) => (dot(p, 38, 0.3) ? 0xfff3a8 : 0xbfdcff),
    fore: (t, p) => (t > 0.88 ? 0xffffff : dot(p, 38, 0.3) ? 0xfff3a8 : 0xbfdcff),
    thigh: (t, p) => (dot(p, 36, 0.3) ? 0xfff3a8 : 0xbfdcff),
    shin: (t, p) => (t > 0.86 ? 0xffffff : dot(p, 36, 0.3) ? 0xfff3a8 : 0xbfdcff),
    hands: 'skin',
    shoe: { style: 'slipper', color: 0xfff6fa, sole: 0xf4b8cc },
    // The loose top's hem, not a skirt.
    skirt: { length: 0.05, flare: 0.3, pleats: 0, pleatDepth: 0, color: 0xbfdcff, hemColor: 0xffffff, hem: 0.2 },
    extras: [],
  },
};

export const OUTFIT_NAMES = Object.keys(OUTFITS);
