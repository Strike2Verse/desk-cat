import * as THREE from './vendor/three.module.min.js';

// A procedurally sculpted cat in the style of a stylised clay sculpture: a
// smooth, matte, periwinkle-blue body with raised swirling "carved" fur
// ridges (a big spiral on each haunch, flowing S-curves along the flanks,
// chevrons down the chest, cheek ruffs), big yellow eyes and tall ears. No
// model files: every part is a lathe / ellipsoid / swept tube.
//
// Units: 1 unit ~ one cat body length-ish. The rig's local frame has +x
// pointing forward (nose), +y up, +z to the cat's left, ground at y = 0.
// The caller scales the whole thing to pixels.
//
// Legs are driven by 2-bone IK towards paw targets, so every pose is just
// "where is the hip, how is the spine pitched, where are the four paws",
// plus expression numbers (ears, eyes, jaw, whiskers, arch, puff).

export const DIM = {
  hipLocal: new THREE.Vector2(-0.18, -0.01), // hip joint, in torso space
  shoulderLocal: new THREE.Vector2(0.14, -0.02),
  neckLocal: new THREE.Vector2(0.21, 0.06),
  tailLocal: new THREE.Vector2(-0.285, 0.06),
  scruffLocal: new THREE.Vector2(0.15, 0.15),
  front: { a: 0.15, b: 0.165, z: 0.066 },
  hind: { a: 0.145, b: 0.15, c: 0.1, z: 0.076 },
  pawH: 0.03, // wrist height above ground when the paw is planted
  neckLen: 0.12,
  tailSegs: 14,
  tailSegLen: 0.045,
};

// ---------------------------------------------------------------- colours

const CLAY = {
  base: new THREE.Color(0x7f9de2),
  deep: new THREE.Color(0x4a5fa8), // undersides and recesses
  light: new THREE.Color(0xaec4f4), // chest, muzzle, raised ridges
  rim: new THREE.Color(0x232a45), // eye liner
  nose: new THREE.Color(0x6f84b4),
  pad: new THREE.Color(0x7b8fbd),
  mouth: new THREE.Color(0x5a2f40),
  tongue: new THREE.Color(0xc46f80),
};

// ---------------------------------------------------------------- noise

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Clay colour: base, darkened toward `deep`, lightened toward `light`.
function clay(out, deep = 0, light = 0) {
  return out.copy(CLAY.base).lerp(CLAY.deep, deep).lerp(CLAY.light, light);
}

// Writes a colour per vertex from fn(position, normal, outColor).
function paint(geo, fn) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    fn(p, n, c);
    // Faint clay grain so large areas never look flat.
    const g = 0.97 + 0.06 * vnoise(p.x * 60, p.y * 60, p.z * 60);
    colors[i * 3] = c.r * g;
    colors[i * 3 + 1] = c.g * g;
    colors[i * 3 + 2] = c.b * g;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
const solidClay = (deep, light) => (p, n, c) => clay(c, deep, light);

// Concatenate indexed geometries (position, normal, color only).
function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, ov * 3);
    nor.set(g.attributes.normal.array, ov * 3);
    col.set(g.attributes.color.array, ov * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) idx[oi + i] = src[i] + ov;
    ov += g.attributes.position.count;
    oi += src.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ---------------------------------------------------------------- textures

// Iris painted as a vertical gradient: the sphere's pole is rotated to face
// forward, so canvas rows map to rings around the pupil. Bright yellow with
// an olive edge and a dark limbal ring, like the sculpture's glassy eyes.
function makeIrisTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, '#c9b52c');
  grad.addColorStop(0.14, '#f2de4a');
  grad.addColorStop(0.3, '#e8cc38');
  grad.addColorStop(0.37, '#8a7418');
  grad.addColorStop(0.42, '#1a160a');
  grad.addColorStop(0.5, '#0c0b08');
  grad.addColorStop(1.0, '#0c0b08');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 64;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,245,170' : '120,100,20'},0.22)`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, 10);
    g.lineTo(x + (Math.random() - 0.5) * 3, 52);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- geometry

const TORSO_PROFILE = [
  [-0.310, 0.000],
  [-0.301, 0.079],
  [-0.271, 0.135],
  [-0.215, 0.160],
  [-0.129, 0.158],
  [-0.034, 0.145],
  [0.060, 0.152],
  [0.146, 0.163],
  [0.215, 0.151],
  [0.267, 0.116],
  [0.297, 0.060],
  [0.305, 0.000],
];

// Surface of revolution around the x axis from a [x, radius] profile
// (x ascending), smoothed with a Catmull-Rom spline.
function latheAlongX(profile, samples = 44, segs = 36) {
  const curve = new THREE.SplineCurve(profile.map(([x, r]) => new THREE.Vector2(r, x)));
  const pts = curve.getPoints(samples).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  const geo = new THREE.LatheGeometry(pts, segs);
  geo.rotateZ(-Math.PI / 2); // lathe axis (+y) -> +x
  return geo;
}

// Tapered capsule hanging from its pivot along -y: radius r1 at the pivot,
// r2 at distance L.
function limbGeo(L, r1, r2, segs = 16) {
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r2, -L + Math.sin(a) * r2));
  }
  // Pear-shaped taper: stays full near the pivot, narrows toward the end.
  const m = 8;
  for (let i = 1; i < m; i++) {
    const s = 1 - i / m; // 1 at the far end, 0 at the pivot
    const k = s * s * (3 - 2 * s);
    pts.push(new THREE.Vector2(r1 + (r2 - r1) * k, -L * s));
  }
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r1, Math.sin(a) * r1));
  }
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts, segs);
}
// Radius of limbGeo(L, r1, r2) at height y (pivot at 0, end at -L).
function limbRadius(L, r1, r2, y) {
  if (y >= 0) return Math.sqrt(Math.max(0, r1 * r1 - y * y));
  if (y <= -L) return Math.sqrt(Math.max(0, r2 * r2 - (y + L) ** 2));
  return r1 + (r2 - r1) * smooth(0, 1, -y / L);
}

function ellipsoid(r, sx, sy, sz, w = 28, h = 20) {
  const g = new THREE.SphereGeometry(r, w, h);
  g.scale(sx, sy, sz);
  return g;
}

// A "carved fur" ridge swept along a curve, thickest in the middle and
// tapering at both ends (or thinning into a curl). With `outward` (the
// surface normal at a point) the cross-section is a low, wide relief that
// sinks into the surface, like a stroke carved in clay; without it the
// ridge is round.
function ridgeGeo(points, r, taper = (t) => 0.2 + 0.8 * Math.pow(Math.sin(Math.PI * t), 0.6), outward = null, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segs = Math.max(16, points.length * 6);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], idx = [];
  const p = new THREE.Vector3(), T = new THREE.Vector3();
  const U = new THREE.Vector3(), W = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const rr = r * taper(t);
    let wS = 1, hS = 1, sink = 0;
    if (outward) {
      curve.getTangentAt(t, T);
      U.copy(outward(p));
      U.addScaledVector(T, -U.dot(T)).normalize();
      W.crossVectors(U, T).normalize();
      wS = 1.7; hS = 0.7; sink = 0.3;
    } else {
      U.copy(frames.normals[i]);
      W.copy(frames.binormals[i]);
    }
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cw = Math.cos(a) * rr * wS, cu = (Math.sin(a) * hS - sink) * rr;
      pos.push(p.x + W.x * cw + U.x * cu, p.y + W.y * cw + U.y * cu, p.z + W.z * cw + U.z * cu);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial);
      idx.push(a, b, a + radial, b, b + radial, a + radial);
    }
  }
  for (const [ring, flip] of [[0, true], [segs, false]]) {
    const c = new THREE.Vector3();
    for (let j = 0; j < radial; j++) c.add(V3(pos[(ring * radial + j) * 3], pos[(ring * radial + j) * 3 + 1], pos[(ring * radial + j) * 3 + 2]));
    c.divideScalar(radial);
    const ci = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let j = 0; j < radial; j++) {
      const a = ring * radial + j, b = ring * radial + ((j + 1) % radial);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 2D scroll: an optional lead-in polyline followed by a spiral that winds
// `turns` times into its centre. Points are [u, v] pairs.
function scroll({ lead = [], c, r, turns = 1.4, a0 = 0, dir = 1, steps = 20 }) {
  const out = lead.map((q) => q.slice());
  const total = turns * Math.PI * 2;
  const n = Math.ceil(turns * steps);
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * total;
    const rad = r * Math.pow(1 - th / (total * 1.12), 1.15);
    out.push([c[0] + Math.cos(a0 + dir * th) * rad, c[1] + Math.sin(a0 + dir * th) * rad]);
  }
  return out;
}
// Thin toward the inner end of a scroll; full along the lead-in.
const scrollTaper = (t) => 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.62 + 0.12)), 0.5) * (1 - 0.55 * t);

// ---------------------------------------------------------------- build

export function createCat() {
  // Matte clay with a soft cool sheen along the silhouette.
  const clayMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.58,
    metalness: 0,
    sheen: 0.7,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xc4d6ff),
    clearcoat: 0.06,
    clearcoatRoughness: 0.5,
  });
  const flat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  const mesh = (geo, mat = clayMat) => new THREE.Mesh(geo, mat);

  const root = new THREE.Group(); // positioned + scaled by caller
  const tilt = new THREE.Group(); // leans the ground plane toward the viewer
  const yaw = new THREE.Group(); // turning on the ground
  const pose = new THREE.Group(); // ground frame of the rig
  root.add(tilt);
  tilt.add(yaw);
  yaw.add(pose);
  tilt.rotation.x = 0.2;

  // ---- torso, with its carved ridges merged in so the arch / puff morphs
  // move them together with the body.
  const torso = new THREE.Group();
  torso.rotation.order = 'ZYX';
  pose.add(torso);

  const profileCurve = new THREE.SplineCurve(TORSO_PROFILE.map(([x, r]) => new THREE.Vector2(r, x)));
  const profilePts = profileCurve.getPoints(240);
  const torsoR = (x) => {
    for (let i = 1; i < profilePts.length; i++) {
      const a = profilePts[i - 1], b = profilePts[i];
      if (x <= b.y) return Math.max(0, a.x + (b.x - a.x) * clamp((x - a.y) / (b.y - a.y || 1), 0, 1));
    }
    return 0;
  };
  // The lathe is narrowed side to side, deepened below and arched a bit;
  // these map a flank point (x, y) / a chest point (z, y) onto that surface.
  const archAt = (x) => 0.02 * Math.cos((x / 0.31) * Math.PI * 0.5);
  const unshapeY = (x, y) => { const y0 = y - archAt(x); return y0 < 0 ? y0 / 1.08 : y0; };
  const flank = (side, lift = 0.003) => Object.assign(([x, y]) => {
    const y0 = unshapeY(x, y);
    const R = torsoR(x);
    return V3(x, y, side * (Math.sqrt(Math.max(0, R * R - y0 * y0)) * 0.8 + lift));
  }, { out: (p) => flankOut(p) });
  const chest = (lift = 0.004) => Object.assign(([z, y]) => {
    const rho = Math.hypot(unshapeY(0.25, y), z / 0.8);
    let x = 0.305;
    while (x > 0.15 && torsoR(x) < rho) x -= 0.002;
    return V3(x + lift, y, z);
  }, { out: (p) => chestOut(p) });

  const torsoGeo = latheAlongX(TORSO_PROFILE);
  torsoGeo.deleteAttribute('uv');
  {
    const pos = torsoGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      z *= 0.8;
      if (y < 0) y *= 1.08;
      y += archAt(x);
      pos.setXYZ(i, x, y, z);
    }
    torsoGeo.computeVertexNormals();
  }
  paint(torsoGeo, (p, n, c) => {
    const under = smooth(-0.2, -0.85, n.y) * 0.45;
    const bib = smooth(0.18, 0.3, p.x) * smooth(0.25, -0.3, n.y) * 0.45;
    clay(c, under, bib);
  });

  const torsoParts = [torsoGeo];
  // Rough surface normals: out from the torso's axis on the flanks, forward
  // and out on the chest.
  const flankOut = (p) => V3(0, p.y, p.z / 0.64).normalize();
  const chestOut = (p) => V3((p.x - 0.18) * 2.2, p.y, p.z).normalize();
  const addRidge = (pts2, map, r, taper, light = 0.35) => {
    const g = ridgeGeo(pts2.map(map), r, taper, map.out);
    paint(g, (p, n, c) => clay(c, smooth(0.2, -0.8, n.y) * 0.2, light));
    torsoParts.push(g);
  };
  for (const side of [1, -1]) {
    const F = flank(side);
    // Flowing S-curves along the flank, each ending in a small curl.
    addRidge(scroll({ lead: [[0.24, 0.1], [0.17, 0.075], [0.11, 0.02]], c: [0.115, -0.045], r: 0.035, turns: 1.1, a0: Math.PI * 0.95, dir: 1 }), F, 0.012, scrollTaper);
    addRidge(scroll({ lead: [[0.09, 0.14], [0.02, 0.1], [-0.04, 0.04]], c: [-0.02, -0.03], r: 0.04, turns: 1.2, a0: Math.PI * 0.9, dir: 1 }), F, 0.013, scrollTaper);
    addRidge([[-0.1, 0.15], [-0.16, 0.12], [-0.22, 0.06], [-0.25, 0.0], [-0.235, -0.05]].map((q) => q), F, 0.01);
    addRidge([[0.2, 0.135], [0.13, 0.135], [0.05, 0.155], [-0.03, 0.155]], F, 0.008);
  }
  // Chevrons down the chest, each side curling outward.
  const C = chest();
  for (const side of [1, -1]) {
    for (const [v0, r] of [[0.06, 0.02], [0.0, 0.024], [-0.06, 0.026]]) {
      const pts = scroll({ lead: [[side * 0.004, v0], [side * 0.03, v0 - 0.02]], c: [side * 0.072, v0 - 0.02], r, turns: 0.9, a0: Math.PI, dir: side, steps: 16 });
      addRidge(pts, C, 0.009, scrollTaper, 0.45);
    }
  }
  const torsoAll = mergeGeos(torsoParts);
  // Morph targets: 0 = arched back (hissing / startled), 1 = puffed-up fur.
  {
    const base = torsoAll.attributes.position.array;
    const arch = new Float32Array(base.length);
    const puff = new Float32Array(base.length);
    for (let i = 0; i < base.length; i += 3) {
      const x = base[i], y = base[i + 1], z = base[i + 2];
      const hump = 0.075 * Math.cos(clamp(x / 0.31, -1, 1) * Math.PI * 0.5) ** 2 * smooth(-0.12, 0.16, y);
      arch[i] = x; arch[i + 1] = y + hump; arch[i + 2] = z;
      puff[i] = x * 1.03; puff[i + 1] = y * 1.13; puff[i + 2] = z * 1.13;
    }
    torsoAll.morphAttributes.position = [new THREE.BufferAttribute(arch, 3), new THREE.BufferAttribute(puff, 3)];
  }
  const torsoMesh = mesh(torsoAll);
  torso.add(torsoMesh);

  // ---- neck + head
  const neck = new THREE.Group();
  neck.position.set(DIM.neckLocal.x, DIM.neckLocal.y, 0);
  torso.add(neck);
  const neckGeo = limbGeo(DIM.neckLen, 0.105, 0.088);
  neckGeo.rotateZ(Math.PI / 2); // hang along +x
  paint(neckGeo, (p, n, c) => clay(c, smooth(-0.2, -0.8, n.y) * 0.3, smooth(0.0, -0.6, n.y) * 0.35));
  neck.add(mesh(neckGeo));

  const headBase = new THREE.Group();
  headBase.position.set(DIM.neckLen, 0, 0);
  neck.add(headBase);
  const head = new THREE.Group();
  head.rotation.order = 'YZX';
  head.scale.setScalar(1.12);
  headBase.add(head);

  const skullGeo = ellipsoid(0.105, 0.98, 0.86, 1.04, 36, 26);
  skullGeo.translate(0.055, 0.035, 0);
  paint(skullGeo, (p, n, c) => clay(c, smooth(-0.3, -0.8, n.y) * 0.25, smooth(0.08, 0.14, p.x) * 0.2));
  head.add(mesh(skullGeo));

  for (const side of [1, -1]) {
    const cheekGeo = ellipsoid(0.052, 0.95, 0.8, 0.95);
    cheekGeo.translate(0.082, -0.006, side * 0.05);
    paint(cheekGeo, solidClay(0.05, 0.1));
    head.add(mesh(cheekGeo));

    const padGeo = ellipsoid(0.022, 1.0, 0.82, 1.0, 18, 14);
    padGeo.translate(0.146, -0.02, side * 0.016);
    paint(padGeo, solidClay(0, 0.4));
    head.add(mesh(padGeo));
  }
  const bridgeGeo = ellipsoid(0.04, 1.35, 0.72, 0.72, 20, 14);
  bridgeGeo.translate(0.125, 0.018, 0);
  paint(bridgeGeo, solidClay(0, 0.2));
  head.add(mesh(bridgeGeo));

  const nose = mesh(ellipsoid(0.014, 0.6, 0.55, 1.1, 16, 12), flat(CLAY.nose, 0.4));
  nose.position.set(0.168, 0.004, 0);
  head.add(nose);

  // Mouth: a dark interior hidden behind the muzzle, fangs under the upper
  // lip, and a lower jaw (chin + tongue) that swings open to meow / hiss /
  // yawn / chatter.
  const mouthIn = mesh(ellipsoid(0.025, 1.1, 0.5, 0.8, 16, 12), flat(CLAY.mouth, 0.7));
  mouthIn.position.set(0.118, -0.037, 0);
  head.add(mouthIn);
  for (const side of [1, -1]) {
    const fang = mesh(new THREE.ConeGeometry(0.0045, 0.016, 8), flat(0xf4f3ee, 0.3));
    fang.rotation.z = Math.PI;
    fang.position.set(0.143, -0.04, side * 0.012);
    head.add(fang);
  }
  const jaw = new THREE.Group();
  jaw.position.set(0.1, -0.035, 0);
  head.add(jaw);
  {
    const chinGeo = ellipsoid(0.03, 1.35, 0.55, 0.9, 18, 12);
    chinGeo.translate(0.03, -0.014, 0);
    paint(chinGeo, solidClay(0, 0.45));
    jaw.add(mesh(chinGeo));
    const tongue = mesh(ellipsoid(0.018, 1.3, 0.35, 0.85, 14, 8), flat(CLAY.tongue, 0.5));
    tongue.position.set(0.03, -0.006, 0);
    jaw.add(tongue);
  }

  // Eyes: big yellow iris sphere (textured, pole facing forward), a pupil
  // that goes from slit to round, a glossy cornea, a catchlight, a dark
  // liner ring and clay eyelids that close over it.
  const irisTex = makeIrisTexture();
  const EYE_R = 0.032;
  const eyes = [];
  const lidMat = clayMat.clone();
  lidMat.side = THREE.DoubleSide;
  for (const side of [1, -1]) {
    const eye = new THREE.Group();
    eye.position.set(0.122, 0.044, side * 0.05);
    eye.rotation.set(0, side * -0.44, 0.05);
    head.add(eye);

    const irisGeo = new THREE.SphereGeometry(EYE_R, 28, 20);
    irisGeo.rotateZ(-Math.PI / 2);
    eye.add(mesh(irisGeo, new THREE.MeshStandardMaterial({ map: irisTex, roughness: 0.3 })));

    const pupil = mesh(
      new THREE.SphereGeometry(EYE_R * 0.55, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 }),
    );
    pupil.position.x = EYE_R * 0.985;
    pupil.scale.set(0.1, 1, 0.3);
    eye.add(pupil);

    eye.add(mesh(
      new THREE.SphereGeometry(EYE_R * 1.04, 28, 20),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.03,
        clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false,
      }),
    ));

    const glint = mesh(new THREE.SphereGeometry(EYE_R * 0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(EYE_R * 0.86, EYE_R * 0.42, side * EYE_R * 0.18);
    eye.add(glint);

    const liner = mesh(new THREE.TorusGeometry(EYE_R * 1.04, EYE_R * 0.13, 8, 32), flat(CLAY.rim, 0.5));
    liner.rotation.y = Math.PI / 2;
    liner.scale.set(1, 0.9, 1);
    eye.add(liner);

    // Upper lid: top hemisphere rotating forward about the eye's z axis.
    const lidGeo = new THREE.SphereGeometry(EYE_R * 1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    paint(lidGeo, (p, n, c) => clay(c, 0.05, 0).lerp(CLAY.rim, smooth(EYE_R * 0.3, 0, p.y)));
    const lid = mesh(lidGeo, lidMat);
    eye.add(lid);

    const lowGeo = new THREE.SphereGeometry(EYE_R * 1.09, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    paint(lowGeo, (p, n, c) => clay(c, 0, 0.2).lerp(CLAY.rim, smooth(-EYE_R * 0.3, 0, p.y)));
    const lowLid = mesh(lowGeo, lidMat);
    lowLid.rotation.z = -1.0;
    eye.add(lowLid);

    eyes.push({ eye, pupil, lid, glint });
  }

  // Carved details on the head: brow arcs over the eyes and swept-back
  // cheek ruffs.
  const headOut = (p) => V3(p.x - 0.05, p.y - 0.02, p.z).normalize();
  for (const side of [1, -1]) {
    const brow = ridgeGeo([V3(0.142, 0.07, side * 0.024), V3(0.13, 0.086, side * 0.05), V3(0.105, 0.084, side * 0.078), V3(0.085, 0.07, side * 0.09)], 0.0042, undefined, headOut);
    paint(brow, solidClay(0, 0.3));
    head.add(mesh(brow));
    for (const [dy, len, r] of [[0, 1, 0.014], [-0.022, 0.8, 0.011]]) {
      const tuft = ridgeGeo([
        V3(0.11, -0.03 + dy, side * 0.07),
        V3(0.07, -0.055 + dy, side * 0.098),
        V3(0.02, -0.07 + dy * 1.4, side * (0.1 - 0.01 * len)),
        V3(-0.025 * len, -0.06 + dy * 1.6, side * 0.082),
      ], r * 0.85, (t) => 0.3 + 0.7 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.1)), 0.6));
      paint(tuft, solidClay(0, 0.3));
      head.add(mesh(tuft));
    }
  }

  // Ears: tall, thin cones, darker in the hollow at the front, with a
  // carved inner fold.
  const ears = [];
  for (const side of [1, -1]) {
    const earPivot = new THREE.Group();
    earPivot.position.set(0.02, 0.078, side * 0.056);
    head.add(earPivot);
    const earGeo = new THREE.LatheGeometry([
      new THREE.Vector2(0, -0.004), new THREE.Vector2(0.064, 0), new THREE.Vector2(0.056, 0.04),
      new THREE.Vector2(0.036, 0.09), new THREE.Vector2(0.012, 0.13), new THREE.Vector2(0, 0.148),
    ], 24);
    earGeo.scale(0.38, 1, 1);
    earGeo.computeVertexNormals();
    paint(earGeo, (p, n, c) => clay(c, smooth(0.3, 0.9, n.x) * smooth(0.13, 0.05, p.y) * 0.45, smooth(0.12, 0.145, p.y) * 0.2));
    earPivot.add(mesh(earGeo));
    const fold = ridgeGeo([V3(0.02, 0.01, 0), V3(0.021, 0.05, side * 0.004), V3(0.017, 0.09, 0)], 0.005, undefined, () => V3(1, 0, 0));
    paint(fold, solidClay(0, 0.3));
    earPivot.add(mesh(fold));
    ears.push({ pivot: earPivot, side });
  }

  // Whiskers, one fan per side on its own pivot so they can sweep forward
  // (curious) or pin back (scared / angry).
  const whiskers = {};
  for (const side of [1, -1]) {
    const verts = [];
    for (let k = 0; k < 4; k++) {
      const oy = -0.004 * k;
      const len = 0.12 + (k % 2) * 0.02;
      const dir = V3(-0.15 + k * 0.03, 0.12 - k * 0.07, side).normalize();
      verts.push(0, oy, 0, dir.x * len, oy + dir.y * len, dir.z * len);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const w = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xe8efff, transparent: true, opacity: 0.55 }));
    w.position.set(0.15, -0.022, side * 0.036);
    head.add(w);
    whiskers[side] = w;
  }

  // ---- tail: a thick chain of tapered segments.
  const tail = [];
  const tailMeshes = [];
  {
    let parent = torso;
    const n = DIM.tailSegs;
    for (let i = 0; i < n; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.order = 'YZX';
      if (i === 0) pivot.position.set(DIM.tailLocal.x, DIM.tailLocal.y, 0);
      else pivot.position.set(-DIM.tailSegLen, 0, 0);
      parent.add(pivot);
      const r1 = 0.042 - (i / n) * 0.02;
      const r2 = 0.042 - ((i + 1) / n) * 0.02;
      const geo = limbGeo(DIM.tailSegLen, r1, i === n - 1 ? r2 * 0.7 : r2, 14);
      geo.rotateZ(-Math.PI / 2); // hang along -x
      paint(geo, (p, nn, c) => clay(c, smooth(-0.2, -0.9, nn.y) * 0.3, 0.05));
      const m = mesh(geo);
      pivot.add(m);
      tail.push(pivot);
      tailMeshes.push(m);
      parent = pivot;
    }
  }

  // ---- legs
  const legPaint = (p, n, c) => clay(c, smooth(-0.3, -0.9, n.x) * 0.2, 0.05);
  const pawGeo = () => {
    const g = ellipsoid(0.036, 1.3, 0.62, 1.0, 22, 14);
    g.translate(0.012, -0.01, 0);
    paint(g, (p, n, c) => clay(c, 0, 0.15 + smooth(0.0, 0.04, p.x) * 0.2));
    return g;
  };
  const padMesh = () => {
    const m = mesh(ellipsoid(0.028, 1.2, 0.3, 0.8, 14, 8), flat(CLAY.pad, 0.7));
    m.position.set(0.01, -0.03, 0);
    return m;
  };
  // Carved ridge lying on the outer side of a limbGeo(L, r1, r2).
  const limbRidge = (L, r1, r2, side, pts2, r, taper) => {
    const g = ridgeGeo(pts2.map(([u, v]) => {
      const R = limbRadius(L, r1, r2, v);
      return V3(u, v, side * (Math.sqrt(Math.max(0, R * R - u * u)) + 0.003));
    }), r * 1.1, taper, (p) => V3(p.x, 0, p.z).normalize());
    paint(g, solidClay(0, 0.35));
    return mesh(g);
  };

  const legs = {};
  for (const [name, side] of [['fl', 1], ['fr', -1]]) {
    const rootG = new THREE.Group();
    rootG.position.z = side * DIM.front.z;
    pose.add(rootG);
    const upper = new THREE.Group();
    rootG.add(upper);
    const ug = limbGeo(DIM.front.a, 0.082, 0.044);
    paint(ug, legPaint);
    upper.add(mesh(ug));
    // Shoulder curl with a long stroke down the foreleg.
    upper.add(limbRidge(DIM.front.a, 0.082, 0.044, side,
      scroll({ lead: [[-0.01, -0.13], [0.0, -0.08]], c: [0.0, -0.035], r: 0.03, turns: 1.2, a0: -Math.PI / 2, dir: -1 }), 0.009, scrollTaper));
    const lower = new THREE.Group();
    lower.position.y = -DIM.front.a;
    upper.add(lower);
    const lg = limbGeo(DIM.front.b, 0.044, 0.032);
    paint(lg, legPaint);
    lower.add(mesh(lg));
    const wrist = new THREE.Group();
    wrist.position.y = -DIM.front.b;
    lower.add(wrist);
    wrist.add(mesh(pawGeo()));
    wrist.add(padMesh());
    legs[name] = { root: rootG, upper, lower, wrist, side };
  }
  for (const [name, side] of [['bl', 1], ['br', -1]]) {
    const rootG = new THREE.Group();
    rootG.position.z = side * DIM.hind.z;
    pose.add(rootG);
    const thigh = new THREE.Group();
    rootG.add(thigh);
    const tg = limbGeo(DIM.hind.a, 0.115, 0.052);
    paint(tg, legPaint);
    thigh.add(mesh(tg));
    // The big haunch spiral, plus an outer sweep around it.
    thigh.add(limbRidge(DIM.hind.a, 0.115, 0.052, side,
      scroll({ lead: [[0.07, 0.05], [0.065, -0.01]], c: [0.0, -0.045], r: 0.06, turns: 1.6, a0: 0, dir: -1, steps: 24 }), 0.013, scrollTaper));
    thigh.add(limbRidge(DIM.hind.a, 0.115, 0.052, side,
      [[-0.05, 0.075], [-0.085, 0.02], [-0.085, -0.05], [-0.05, -0.11], [0.0, -0.13]], 0.01));
    const shin = new THREE.Group();
    shin.position.y = -DIM.hind.a;
    thigh.add(shin);
    const sg = limbGeo(DIM.hind.b, 0.051, 0.032);
    paint(sg, legPaint);
    shin.add(mesh(sg));
    const meta = new THREE.Group();
    meta.position.y = -DIM.hind.b;
    shin.add(meta);
    const mg = limbGeo(DIM.hind.c, 0.032, 0.029);
    paint(mg, legPaint);
    meta.add(mesh(mg));
    const wrist = new THREE.Group();
    wrist.position.y = -DIM.hind.c;
    meta.add(wrist);
    wrist.add(mesh(pawGeo()));
    wrist.add(padMesh());
    legs[name] = { root: rootG, upper: thigh, lower: shin, meta, wrist, side };
  }

  root.userData.rig = {
    root, tilt, yaw, pose, torso, torsoMesh, neck, headBase, head, jaw, whiskers, eyes, ears, tail, tailMeshes, legs,
    look: { yaw: 0, pitch: 0 },
    blink: { next: 2, t: -1 },
  };
  return root;
}

// ---------------------------------------------------------------- posing

const dirToRot = (dx, dy) => Math.atan2(dx, -dy); // bone hangs along -y

// 2-bone IK in the x/y plane. bend: +1 puts the middle joint forward.
function solve2(sx, sy, tx, ty, a, b, bend) {
  let dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  if (d < 1e-5) { dy = -1e-5; d = 1e-5; }
  const dMax = a + b - 1e-4, dMin = Math.abs(a - b) + 1e-3;
  const dc = clamp(d, dMin, dMax);
  dx *= dc / d; dy *= dc / d;
  const base = Math.atan2(dy, dx);
  const A = Math.acos(clamp((a * a + dc * dc - b * b) / (2 * a * dc), -1, 1));
  const ang1 = base + bend * A;
  const ex = sx + a * Math.cos(ang1), ey = sy + a * Math.sin(ang1);
  const ang2 = Math.atan2(sy + dy - ey, sx + dx - ex);
  return {
    th1: dirToRot(Math.cos(ang1), Math.sin(ang1)),
    th2: dirToRot(Math.cos(ang2), Math.sin(ang2)),
    endX: sx + dx, endY: sy + dy,
  };
}

function rot2(ang, x, y) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [x * c - y * s, x * s + y * c];
}

// Positions of the joints (in the ground frame) implied by a pose.
export function jointsFor(P) {
  const place = (loc) => {
    const [x, y] = rot2(P.pitch, loc.x - DIM.hipLocal.x, loc.y - DIM.hipLocal.y);
    return { x: P.hipX + x, y: P.hipY + y };
  };
  return {
    hip: { x: P.hipX, y: P.hipY },
    shoulder: place(DIM.shoulderLocal),
    neck: place(DIM.neckLocal),
    scruff: place(DIM.scruffLocal),
  };
}

const tmpV = new THREE.Vector3();

/**
 * Apply a pose (plain object of numbers, see brain.js) to the rig.
 * `look` optionally holds a world-space point the head should turn to.
 */
export function applyPose(catRoot, P, t, dt, look) {
  const r = catRoot.userData.rig;
  const J = jointsFor(P);

  // Torso: placed so the hip joint lands at (hipX, hipY).
  const [hx, hy] = rot2(P.pitch, DIM.hipLocal.x, DIM.hipLocal.y);
  r.torso.position.set(P.hipX - hx, P.hipY - hy, 0);
  r.torso.rotation.set(P.roll || 0, 0, P.pitch);
  const b = (P.breath || 0) * Math.sin(t * (P.breathHz || 1.6) * Math.PI * 2);
  r.torsoMesh.scale.set(1, 1 + b, 1 + b * 0.8);
  const puff = clamp(P.puff || 0, 0, 1);
  r.torsoMesh.morphTargetInfluences[0] = clamp(P.arch || 0, 0, 1);
  r.torsoMesh.morphTargetInfluences[1] = puff;
  for (const m of r.tailMeshes) m.scale.set(1, 1 + puff * 0.75, 1 + puff * 0.75);

  r.neck.rotation.z = P.neck;
  r.headBase.rotation.z = -(P.pitch + P.neck);

  // Head: base pose blended with a damped look-at.
  let lookYaw = P.headYaw, lookPitch = P.headPitch;
  const w = look && look.weight > 0 ? look.weight : 0;
  if (w > 0) {
    r.headBase.updateWorldMatrix(true, false);
    tmpV.copy(look.point);
    r.headBase.worldToLocal(tmpV);
    tmpV.x -= 0.1; // measure from roughly the eyes
    const yawA = clamp(Math.atan2(-tmpV.z, tmpV.x), -1.35, 1.35);
    const pitA = clamp(Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z)), -0.9, 0.9);
    lookYaw = P.headYaw + (yawA - P.headYaw) * w;
    lookPitch = P.headPitch + (pitA - P.headPitch) * w;
  }
  const k = 1 - Math.exp(-dt * 9);
  r.look.yaw += (lookYaw - r.look.yaw) * k;
  r.look.pitch += (lookPitch - r.look.pitch) * k;
  r.head.rotation.set(P.headRoll || 0, r.look.yaw, r.look.pitch);

  // Mouth and whiskers.
  r.jaw.rotation.z = -clamp(P.jaw || 0, 0, 1) * 0.6;
  for (const side of [1, -1]) r.whiskers[side].rotation.y = side * (P.whisker || 0) * 0.45;

  // Ears: rotate back (flatten) and splay outward; negative earBack pricks
  // them forward.
  for (const e of r.ears) {
    const tw = P.earTwitch && e.side === P.earTwitchSide ? P.earTwitch : 0;
    e.pivot.rotation.set(e.side * (0.28 + P.earBack * 0.6), e.side * (-0.25 - P.earBack * 0.5), 0.12 + P.earBack * 0.7 + tw);
  }

  // Eyes: lids + pupil dilation + automatic blinking.
  const bl = r.blink;
  bl.next -= dt;
  if (bl.next <= 0 && bl.t < 0) { bl.t = 0; bl.next = 2.5 + Math.random() * 4.5; }
  let blinkClose = 0;
  if (bl.t >= 0) {
    bl.t += dt;
    blinkClose = Math.sin(clamp(bl.t / 0.16, 0, 1) * Math.PI);
    if (bl.t > 0.16) bl.t = -1;
  }
  const open = clamp(P.eyeOpen * (1 - blinkClose), 0, 1);
  for (const e of r.eyes) {
    e.lid.rotation.z = -0.95 + open * 1.95;
    e.pupil.scale.z = 0.22 + clamp(P.pupil, 0, 1) * 0.72;
    e.pupil.scale.y = 1 - clamp(P.pupil, 0, 1) * 0.12;
    e.glint.visible = open > 0.25;
  }

  // Legs.
  const setFront = (leg, tx, ty) => {
    const L = r.legs[leg];
    L.root.position.x = J.shoulder.x;
    L.root.position.y = J.shoulder.y;
    const s = solve2(J.shoulder.x, J.shoulder.y, tx, ty, DIM.front.a, DIM.front.b, -1);
    L.upper.rotation.z = s.th1;
    L.lower.rotation.z = s.th2 - s.th1;
    // Planted paws lie flat; lifted paws follow the forearm with a curl.
    const lift = smooth(DIM.pawH + 0.01, DIM.pawH + 0.08, ty);
    L.wrist.rotation.z = -s.th2 * (1 - lift) + lift * 0.5;
  };
  const setHind = (leg, tx, ty, m, splay) => {
    const L = r.legs[leg];
    L.root.position.x = J.hip.x;
    L.root.position.y = J.hip.y;
    L.root.rotation.x = L.side * (splay || 0);
    const hockX = tx - Math.sin(m) * DIM.hind.c;
    const hockY = ty + Math.cos(m) * DIM.hind.c;
    const s = solve2(J.hip.x, J.hip.y, hockX, hockY, DIM.hind.a, DIM.hind.b, 1);
    const th3 = dirToRot(tx - hockX, ty - hockY);
    L.upper.rotation.z = s.th1;
    L.lower.rotation.z = s.th2 - s.th1;
    L.meta.rotation.z = th3 - s.th2;
    const lift = smooth(DIM.pawH + 0.01, DIM.pawH + 0.08, ty);
    L.wrist.rotation.z = -th3 * (1 - lift) + lift * 0.3;
  };
  setFront('fl', P.flX, P.flY);
  setFront('fr', P.frX, P.frY);
  setHind('bl', P.blX, P.blY, P.blM, P.splay);
  setHind('br', P.brX, P.brY, P.brM, P.splay);

  // Tail: base angle + uniform curl + extra curl toward the tip + a
  // travelling sway wave, both up/down and sideways.
  const n = r.tail.length;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const wave = Math.sin(t * (P.tailHz || 1) * Math.PI * 2 - i * 0.45);
    let z = i === 0 ? P.tailBase : P.tailCurl + (f > 0.6 ? P.tailTip : 0);
    let y = i === 0 ? 0 : P.tailSide;
    // tailWrap: lay the tail on the ground and sweep it round the front
    // paws (sitting / loafing), like the sculpture.
    const wrap = P.tailWrap || 0;
    // Down to the ground, a tight U-turn round behind the haunch, then
    // forward along the side toward the paws.
    if (wrap && i > 0) {
      if (i <= 2) z -= wrap * 0.75;
      else if (i <= 7) y += wrap * 0.6;
      else y += wrap * 0.05;
    }
    y += wave * P.tailSway * (0.25 + f) * 0.35;
    z += wave * P.tailLift * (0.2 + f) * 0.25;
    r.tail[i].rotation.set(0, y, z);
  }

  return J;
}
