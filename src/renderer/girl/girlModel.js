import * as THREE from '../vendor/three.module.min.js';
import { FACE, drawFace, faceKey, defaultFace } from './face.js';
import { OUTFITS, OUTFIT_NAMES, SKIN } from './outfits.js';

// A procedurally built chibi cat girl in a glossy 3D-figure style (smooth
// shading, soft studio reflections, no ink outlines). No model files: every
// part is a lathe / ellipsoid / swept strand, coloured with vertex colours.
// The face is a canvas texture (face.js).
//
// Units: ~1 unit = her height to the top of the head. The pose frame has
// +x forward (where she faces), +y up, +z to her RIGHT, ground at y = 0.
// Arms and legs are separate groups placed by IK every frame, so a pose is
// just numbers: pelvis position/lean, spine bend, hand offsets from the
// shoulders, foot targets, head, tail and ears (see girlPoses.js).

export const DIM = {
  pelvisR: { x: 0.068, y: 0.064, z: 0.094 },
  hip: { x: 0, y: -0.014, z: 0.052 }, // hip joint in pelvis space (z mirrored)
  waistY: 0.03, // chest pivot in pelvis space
  shoulder: { x: -0.004, y: 0.172, z: 0.078 }, // in chest space
  neckY: 0.198,
  neckLen: 0.042,
  headC: new THREE.Vector3(0.012, 0.128, 0), // head centre from the head pivot
  headR: { x: 0.146, y: 0.146, z: 0.16 },
  thigh: 0.165,
  shin: 0.156,
  ankle: 0.034, // ankle height above the sole
  upper: 0.115,
  fore: 0.105,
  tailAnchor: new THREE.Vector3(-0.062, -0.018, 0),
  tailSegs: 12,
  tailSegLen: 0.031,
  scruff: new THREE.Vector3(-0.055, 0.2, 0), // grab point, chest space
  edgeX: 0.09, // seated on a ledge: the ledge's front edge (pose x)
};

// Chibi proportions: the whole head (hair, ears, face, headset) is built at
// DIM.headR and then scaled up by this much.
export const HEAD_SCALE = 1.5;

// Miku-style teal hair.
const HAIR = 0x20b0bb;
const HAIR_LIGHT = 0x93eef0;
const HAIR_DEEP = 0x0f7f8c;
const HAIR_SHEEN = 0x45c8d0;
const EAR_IN = 0xd9f7f3;
const TEAL = 0x2fc0c6;
const GRAPHITE = 0x33363d;
const TIE_PINK = 0xe8408a;

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- materials

const colorCache = new Map();
function hexColor(h) {
  let c = colorCache.get(h);
  if (!c) { c = new THREE.Color(h); colorCache.set(h, c); }
  return c;
}

// Vertex colours from fn(position, normal) -> hex or THREE.Color.
function paint(geo, fn) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const v = fn(p, n);
    const c = typeof v === 'number' ? hexColor(v) : v;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
const solid = (hex) => () => hex;

// ---------------------------------------------------------------- lighting

// Soft studio look for the glossy figure style: a generated reflection
// environment (bright sky, a big key softbox upper-front-left, a rim panel
// behind) plus matching direct lights. No HDR files needed.
export function setupGirlLighting(scene, renderer) {
  const env = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(10, 32, 16);
  paint(skyGeo, (p) => new THREE.Color(0xa8a4b4).lerp(new THREE.Color(0xf4f8ff), smooth(-6, 6, p.y)));
  env.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, pos, strength) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    m.material.color.setScalar(strength);
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(7, 5, V3(-4, 5, 6), 3.2); // key softbox
  panel(5, 3, V3(6, 1, 5), 1.2); // fill
  panel(8, 2.5, V3(0, 4, -7), 2.2); // rim
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.environmentIntensity = 0.75;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb4aac4, 0.6));
  const key = new THREE.DirectionalLight(0xfff6ee, 2.0);
  key.position.set(-0.5, 0.8, 1);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe6fbff, 0.9);
  rim.position.set(0.4, 0.5, -1);
  scene.add(rim);
}

// ---------------------------------------------------------------- geometry

// Tapered capsule hanging from its pivot along -y (r1 at the pivot, r2 at
// distance L). Also returns t (0 at pivot .. 1 at the end) for painting.
function limbGeo(L, r1, r2, segs = 18, rings = 22) {
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r2, -L + Math.sin(a) * r2));
  }
  for (let i = 1; i < rings; i++) {
    const s = 1 - i / rings;
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
const limbT = (L) => (p) => clamp(-p.y / L, 0, 1);

function ellipsoid(rx, ry, rz, w = 24, h = 16) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}

// Smooth lathe around +y from [radius, y] pairs (y ascending).
function latheY(profile, samples = 48, segs = 40) {
  const curve = new THREE.SplineCurve(profile.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(samples).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts, segs);
}

// A hair strand / ribbon swept along a curve: lens-shaped cross section
// whose width lies along the surface (perpendicular to `outward`).
// `round` tapers the thickness along with the width (thick, rounded locks
// like twin tails) instead of thinning it linearly.
function strandGeo(points, { width, thickness = 0.02, taper, center = V3(0, 0, 0), color, segs = 26, radial = 10, round = false }) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const taperFn = taper || ((t) => Math.pow(1 - t, 0.85) * (0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, t * 1.7))));
  const pos = [];
  const col = [];
  const idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), p = new THREE.Vector3();
  const prevN = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, T);
    N.subVectors(p, center);
    N.addScaledVector(T, -N.dot(T));
    if (N.lengthSq() < 1e-10) N.copy(prevN);
    N.normalize();
    prevN.copy(N);
    B.crossVectors(T, N).normalize();
    const w = Math.max(0.0008, width * taperFn(t)) / 2;
    const th = Math.max(0.0006, thickness * (round ? taperFn(t) : 1 - 0.7 * t)) / 2;
    const c = hexColor(typeof color === 'function' ? color(t) : color);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cw = Math.cos(a), sw = Math.sin(a);
      pos.push(
        p.x + B.x * cw * w + N.x * sw * th,
        p.y + B.y * cw * w + N.y * sw * th,
        p.z + B.z * cw * w + N.z * sw * th,
      );
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial);
      const c2 = a + radial, d = b + radial;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  // Cap both ends.
  const capAt = (ring, flip) => {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < radial; j++) {
      cx += pos[(ring * radial + j) * 3];
      cy += pos[(ring * radial + j) * 3 + 1];
      cz += pos[(ring * radial + j) * 3 + 2];
    }
    const ci = pos.length / 3;
    pos.push(cx / radial, cy / radial, cz / radial);
    col.push(col[ring * radial * 3], col[ring * radial * 3 + 1], col[ring * radial * 3 + 2]);
    for (let j = 0; j < radial; j++) {
      const a = ring * radial + j, b = ring * radial + ((j + 1) % radial);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  capAt(0, false);
  capAt(segs, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Point on the head surface for a unit direction (head centre at origin):
// an ellipsoid whose lower half narrows into cheeks and a small chin.
function headPoint(nx, ny, nz, k = 1) {
  const R = DIM.headR;
  const low = smooth(0.05, -0.95, ny);
  const x = nx * R.x * (1 - 0.1 * low);
  const y = ny * R.y * (1 + 0.05 * low);
  const z = nz * R.z * (1 - 0.2 * low);
  return V3(x * k, y * k, z * k);
}
// Direction from polar angle (0 = top) and azimuth (0 = front, + = right).
const polar = (theta, az, k = 1) =>
  headPoint(Math.sin(theta) * Math.cos(az), Math.cos(theta), Math.sin(theta) * Math.sin(az), k);

function headSurfaceGeo(geo, k, extra) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const kk = extra ? k + extra(v) : k;
    const p = headPoint(v.x, v.y, v.z, kk);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Keep only triangles whose vertices all pass keep(unitDirection).
function filterTriangles(geo, keep) {
  const g = geo.index ? geo : geo;
  const pos = g.attributes.position;
  const unit = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    unit.push(keep(v));
  }
  const src = g.index.array;
  const out = [];
  for (let i = 0; i < src.length; i += 3) {
    if (unit[src[i]] && unit[src[i + 1]] && unit[src[i + 2]]) out.push(src[i], src[i + 1], src[i + 2]);
  }
  g.setIndex(out);
  return g;
}

// ---------------------------------------------------------------- skirt

// A skirt is a ring of hanging panels rebuilt every frame: each panel hangs
// under gravity, drapes forward over raised thighs, is pushed out of the
// thighs, and rests on the ledge when she sits.
function createSkirt(spec, mat) {
  const NA = 64, NR = 8;
  const pos = new Float32Array(NA * NR * 3);
  const colors = new Float32Array(NA * NR * 3);
  const idx = [];
  for (let r = 0; r < NR - 1; r++) {
    for (let a = 0; a < NA; a++) {
      const i0 = r * NA + a, i1 = r * NA + ((a + 1) % NA);
      idx.push(i0, i0 + NA, i1, i1, i0 + NA, i1 + NA);
    }
  }
  for (let r = 0; r < NR; r++) {
    const t = r / (NR - 1);
    for (let a = 0; a < NA; a++) {
      const th = (a / NA) * Math.PI * 2;
      let hex = spec.color;
      if (spec.apron && Math.abs(Math.atan2(Math.sin(th), Math.cos(th))) < spec.apronWidth * (0.8 + 0.2 * t)) hex = spec.apron;
      if (spec.hemColor && t > 1 - spec.hem) hex = spec.hemColor;
      const c = hexColor(hex);
      colors.set([c.r, c.g, c.b], (r * NA + a) * 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;


  const top = V3(0, 0, 0), rh = V3(0, 0, 0), d0 = V3(0, 0, 0), dl = V3(0, 0, 0), p = V3(0, 0, 0);
  const inv = new THREE.Matrix4();
  const tmp = V3(0, 0, 0), seg = V3(0, 0, 0), avg = V3(0, 0, 0), avgH = V3(0, 0, 0);
  const inset = spec.inset || 1;
  const rx = (DIM.pelvisR.x + 0.006) * inset, rz = (DIM.pelvisR.z + 0.006) * inset, y0 = 0.028;

  function pushOut(q, a, b, rad) {
    seg.subVectors(b, a);
    const L2 = seg.lengthSq();
    const u = L2 > 0 ? clamp(tmp.subVectors(q, a).dot(seg) / L2, 0, 1) : 0;
    tmp.copy(a).addScaledVector(seg, u);
    const dx = q.x - tmp.x, dy = q.y - tmp.y, dz = q.z - tmp.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < rad) {
      if (d < 1e-5) { q.y = tmp.y + rad; return; }
      const k = rad / d;
      q.set(tmp.x + dx * k, tmp.y + dy * k, tmp.z + dz * k);
    }
  }

  // pm: pelvis matrix (pelvis -> pose frame); legs: [{hip, knee}] in pose
  // frame; seat: 0..1 how much she is sitting on a ledge.
  function update(pm, legs, seat, time) {
    inv.copy(pm).invert();
    avg.set(0, 0, 0);
    for (const L of legs) avg.add(tmp.subVectors(L.knee, L.hip).normalize());
    avg.normalize();
    const raise = clamp((avg.y + 0.9) / 0.8, 0, 1);
    avgH.set(avg.x, 0, avg.z);
    if (avgH.lengthSq() > 1e-6) avgH.normalize();
    const len = spec.length;
    for (let a = 0; a < NA; a++) {
      const th = (a / NA) * Math.PI * 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      top.set(rx * cs, y0, rz * sn).applyMatrix4(pm);
      rh.set(cs, 0, sn).transformDirection(pm);
      rh.y = 0;
      rh.normalize();
      d0.copy(rh).multiplyScalar(spec.flare).add(V3(0, -1, 0)).normalize();
      const w = raise * smooth(-0.1, 0.75, rh.dot(avgH));
      dl.copy(avg).addScaledVector(rh, 0.45).add(V3(0, 0.12, 0)).normalize();
      d0.lerp(dl, w).normalize();
      let pleat = 0;
      if (spec.pleats) {
        const f = ((th * spec.pleats) / (Math.PI * 2)) % 1;
        pleat = (Math.abs(f * 2 - 1) - 0.5) * 2 * spec.pleatDepth;
      }
      for (let r = 0; r < NR; r++) {
        const t = r / (NR - 1);
        p.copy(top).addScaledVector(d0, len * t);
        let out = pleat * t;
        if (spec.frill) out += Math.sin(th * 30) * spec.frill * t * t * t;
        if (spec.wave) out += Math.sin(th * 5 + time * 1.3) * spec.wave * t * t;
        p.addScaledVector(rh, out);
        for (const L of legs) pushOut(p, L.hip, L.knee, 0.058 * inset);
        if (seat > 0 && p.x < DIM.edgeX && p.y < 0.004) {
          // Rest on the ledge instead of hanging through it.
          const drop = 0.004 - p.y;
          p.y += drop * seat;
          p.addScaledVector(rh, drop * 0.15 * seat);
        }
        p.applyMatrix4(inv);
        pos[(r * NA + a) * 3] = p.x;
        pos[(r * NA + a) * 3 + 1] = p.y;
        pos[(r * NA + a) * 3 + 2] = p.z;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }

  return { mesh, update };
}

// ---------------------------------------------------------------- build

export function createGirl() {
  // Satin cloth and props, soft skin, and glossy clear-coated hair, like a
  // painted PVC figure. They rely on scene.environment (studioEnvironment).
  const cloth = (opts) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, ...opts });
  const vmat = cloth();
  const vmatDouble = cloth({ side: THREE.DoubleSide });
  const hairMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.38, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.22,
  });
  const hairMatDouble = hairMat.clone();
  hairMatDouble.side = THREE.DoubleSide;
  const mesh = (geo, mat = vmat) => new THREE.Mesh(geo, mat);
  const hairMesh = (geo) => mesh(geo, hairMat);
  const paintedMesh = (geo, fn, mat = vmat) => mesh(paint(geo, fn), mat);

  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const yaw = new THREE.Group();
  const pose = new THREE.Group();
  root.add(tilt);
  tilt.add(yaw);
  yaw.add(pose);
  tilt.rotation.x = 0.1;

  // ---- skeleton
  const pelvis = new THREE.Group();
  pose.add(pelvis);
  const chest = new THREE.Group();
  chest.position.set(0, DIM.waistY, 0);
  pelvis.add(chest);
  const neck = new THREE.Group();
  neck.position.set(0.004, DIM.neckY, 0);
  chest.add(neck);
  const head = new THREE.Group();
  head.position.set(0, DIM.neckLen, 0);
  head.rotation.order = 'YZX';
  neck.add(head);
  const limb = () => { const g = new THREE.Group(); pose.add(g); return g; };
  const side = { L: -1, R: 1 };
  const arms = {}, legs = {};
  for (const s of ['L', 'R']) {
    arms[s] = { side: side[s], upper: limb(), fore: limb(), hand: limb() };
    legs[s] = { side: side[s], thigh: limb(), shin: limb(), foot: limb() };
  }

  // ---- shared (outfit-independent) parts
  const neckGeo = limbGeo(DIM.neckLen + 0.03, 0.025, 0.023, 16, 6);
  neckGeo.rotateZ(Math.PI);
  neckGeo.translate(0, -0.02, 0);
  neck.add(paintedMesh(neckGeo, solid(SKIN)));

  const headGroup = new THREE.Group();
  headGroup.position.copy(DIM.headC).multiplyScalar(HEAD_SCALE);
  headGroup.scale.setScalar(HEAD_SCALE);
  head.add(headGroup);
  const headGeo = headSurfaceGeo(new THREE.SphereGeometry(1, 56, 40), 1);
  const skinMat = cloth({ roughness: 0.8 });
  headGroup.add(mesh(paint(headGeo, solid(SKIN)), skinMat));

  // Face decal: the front of the head, projected planar from the front.
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = faceCanvas.height = FACE.PX;
  const faceCtx = faceCanvas.getContext('2d');
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  {
    const g = headSurfaceGeo(new THREE.SphereGeometry(1, 56, 40, Math.PI - 1.3, 2.6, 0.5, 2.1), 1.004);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, 0.5 - pos.getZ(i) / FACE.W, 0.5 + pos.getY(i) / FACE.H);
    }
    const faceMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      map: faceTex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    faceMesh.renderOrder = 1;
    headGroup.add(faceMesh);
  }

  // ---- hair
  const hairColor = (t) => (t < 0.08 ? HAIR_DEEP : HAIR);
  {
    const capGeo = headSurfaceGeo(new THREE.SphereGeometry(1, 56, 40), 1.08, (v) => 0.03 * Math.max(0, v.y));
    filterTriangles(capGeo, (v) => {
      const theta = Math.acos(clamp(v.y, -1, 1));
      const h = Math.hypot(v.x, v.z);
      const f = h > 1e-4 ? v.x / h : 0;
      return theta < 0.98 + ((1 - f) / 2) * 1.12 + 0.06 * Math.cos(Math.atan2(v.z, v.x) * 9) * (f > 0 ? 0 : 1);
    });
    paint(capGeo, (p, n) => {
      const theta = Math.acos(clamp(p.clone().normalize().y, -1, 1));
      return theta > 0.5 && theta < 0.64 && p.x > -0.06 ? HAIR_LIGHT : HAIR;
    });
    headGroup.add(hairMesh(capGeo));

    // Bangs: big soft clumps over the forehead, with Miku's longer lock
    // hanging between the eyes.
    const bangs = [
      [-1.05, 1.62, 0.16, -0.12], [-0.7, 1.42, 0.17, -0.1], [-0.36, 1.34, 0.16, -0.05],
      [0.0, 1.48, 0.1, 0.0], [0.36, 1.34, 0.16, 0.05], [0.7, 1.42, 0.17, 0.1],
      [1.05, 1.62, 0.16, 0.12],
    ];
    for (const [az, tipTheta, width, sweep] of bangs) {
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const u = i / 5;
        const th = 0.3 + (tipTheta - 0.3) * u;
        const k = 1.075 + 0.04 * Math.sin(Math.PI * Math.min(1, u * 1.2)) - (u > 0.9 ? 0.012 : 0);
        pts.push(polar(th, az + sweep * u * u, k));
      }
      headGroup.add(hairMesh(strandGeo(pts, {
        width, thickness: 0.045, color: hairColor,
        taper: (t) => Math.pow(1 - t, 0.5) * (0.85 + 0.15 * Math.sin(Math.PI * Math.min(1, t * 1.7))),
      })));
    }

    // Wide side locks framing the face, down to about the chin.
    for (const s of [-1, 1]) {
      for (const [az, len, w] of [[1.3, 0.13, 0.13], [1.62, 0.16, 0.12]]) {
        const a = az * s;
        const p1 = polar(0.55, a, 1.09);
        const p2 = polar(1.35, a, 1.1);
        const p3 = polar(1.95, a, 1.1);
        const p4 = V3(p3.x + 0.005, p3.y - len * 0.5, p3.z * 1.02);
        const p5 = V3(p3.x + 0.01, p3.y - len, p3.z * 0.95);
        headGroup.add(hairMesh(strandGeo([p1, p2, p3, p4, p5], {
          width: w, thickness: 0.04, color: hairColor, center: V3(0, 0.02, 0),
          taper: (t) => Math.pow(1 - t, 0.55),
        })));
      }
    }

    // Ahoge (the springy antenna lock on top).
    const ahoge = new THREE.Group();
    ahoge.position.copy(polar(0.12, 0, 1.08));
    headGroup.add(ahoge);
    ahoge.add(hairMesh(strandGeo([V3(0, -0.01, 0), V3(0.004, 0.035, -0.006), V3(0.012, 0.065, -0.03), V3(0.016, 0.06, -0.058), V3(0.014, 0.042, -0.064)], {
      width: 0.024, thickness: 0.012, color: hairColor, center: V3(0.02, 0.0, -0.03),
      taper: (t) => 0.6 + 0.4 * Math.sin(Math.PI * t * 0.8) - t * 0.55,
    })));
    headGroup.userData.ahoge = ahoge;
  }

  // Long back hair, on a pivot so it can keep hanging down when the head
  // tilts.
  const hairBack = new THREE.Group();
  hairBack.position.set(-0.11, -0.01, 0);
  headGroup.add(hairBack);
  for (const az of [2.1, 2.62, Math.PI, -2.62, -2.1]) {
    const o = hairBack.position;
    const p0 = polar(0.85, az, 1.07).sub(o);
    const p1 = polar(1.85, az, 1.11).sub(o);
    const spread = Math.sin(az);
    const p2 = V3(p1.x - 0.02, p1.y - 0.07, p1.z * 1.08 + spread * 0.01);
    const p3 = V3(p1.x - 0.015, p1.y - 0.14, p1.z * 1.12 + spread * 0.015);
    const p4 = V3(p1.x + 0.0, p1.y - 0.19, p1.z * 1.12 + spread * 0.01);
    hairBack.add(hairMesh(strandGeo([p0, p1, p2, p3, p4], {
      width: 0.17, thickness: 0.045, color: hairColor, center: V3(0.05, 0.05, 0),
      // Narrow at the root so the flat lock stays inside the rounded cap.
      taper: (t) => (0.3 + 0.7 * smooth(0, 0.4, t)) * Math.pow(1 - t, 0.45),
    })));
  }

  // Miku's twin tails: thick, rounded bunches tied high on the sides of the
  // head that puff up out of the tie, flare out wider than her shoulders and
  // hang to about her knees. Each is on a springy pivot (see applyPose).
  const twinTails = [];
  const tailColor = (t) => (t < 0.05 ? HAIR_DEEP : t > 0.1 && t < 0.18 ? HAIR_SHEEN : HAIR);
  const tailTaper = (t) => (0.45 + 0.55 * Math.sin(Math.min(1, t * 3.5) * Math.PI / 2)) * Math.pow(1 - t, 0.75);
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.copy(polar(0.74, s * 2.2, 1.07));
    headGroup.add(pivot);
    const toCenter = pivot.position.clone().negate();
    // One smooth mass that arcs up out of the tie, hangs to about her knees
    // and flicks outward at the tip.
    const pts = [
      V3(0, 0, 0),
      V3(-0.012, 0.025, s * 0.06),
      V3(-0.03, 0.005, s * 0.13),
      V3(-0.04, -0.09, s * 0.165),
      V3(-0.045, -0.24, s * 0.17),
      V3(-0.04, -0.38, s * 0.145),
      V3(-0.03, -0.47, s * 0.14),
      V3(-0.02, -0.52, s * 0.18),
    ];
    pivot.add(hairMesh(strandGeo(pts, {
      width: 0.21, thickness: 0.18, color: tailColor, center: toCenter, segs: 56, radial: 18,
      taper: tailTaper, round: true,
    })));
    // Hair tie: a big dark square plate with pink accent lines, set on the
    // head just in front of the tail root and facing out, so it reads from
    // the front. It stays with the head rather than swaying with the tail.
    const tie = new THREE.Group();
    const tp = polar(0.78, s * 1.8, 1.3);
    tie.position.copy(tp);
    tie.lookAt(tp.clone().multiplyScalar(2));
    tie.rotateY(s * 0.5); // turn toward the front
    tie.add(paintedMesh(new THREE.BoxGeometry(0.085, 0.085, 0.026), solid(GRAPHITE)));
    for (const dy of [-0.017, 0.017]) {
      const line = paintedMesh(new THREE.BoxGeometry(0.064, 0.009, 0.004), solid(TIE_PINK));
      line.position.set(0, dy, 0.013);
      tie.add(line);
    }
    headGroup.add(tie);
    twinTails.push({ pivot, side: s });
  }

  // ---- cat ears: a rounded back shell with a flat pink front.
  const ears = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.004, 0.118, 0.092 * s);
    headGroup.add(pivot);
    const H = 0.118, R = 0.058;
    const shell = new THREE.ConeGeometry(R, H, 20, 4, false, Math.PI, Math.PI);
    shell.translate(0, H / 2 - 0.012, 0);
    shell.scale(0.55, 1, 1);
    pivot.add(paintedMesh(shell, (p) => (p.y > 0.085 ? HAIR_DEEP : HAIR), hairMat));
    const tri = (w, h, y0, x, hex) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([x, y0, w, x, y0, -w, x, y0 + h, 0], 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(paint(g, solid(hex)), hex === HAIR ? hairMatDouble : vmatDouble);
      pivot.add(m);
      return m;
    };
    tri(R, H, -0.012, -0.001, HAIR);
    tri(R * 0.66, H * 0.72, -0.004, 0.001, EAR_IN);
    const fluff = new THREE.ConeGeometry(0.016, 0.04, 10, 1);
    fluff.translate(0, 0.02, 0);
    fluff.scale(0.6, 1, 1);
    const fluffM = paintedMesh(fluff, solid(0xffffff));
    fluffM.position.set(0.004, 0.0, -s * 0.012);
    fluffM.rotation.x = -s * 0.3;
    pivot.add(fluffM);
    ears.push({ pivot, side: s });
  }

  // ---- tail
  const tail = [];
  {
    let parent = pelvis;
    const n = DIM.tailSegs;
    for (let i = 0; i < n; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.order = 'YZX';
      if (i === 0) pivot.position.copy(DIM.tailAnchor);
      else pivot.position.set(-DIM.tailSegLen, 0, 0);
      parent.add(pivot);
      const r1 = 0.02 - (i / n) * 0.004;
      const r2 = 0.02 - ((i + 1) / n) * 0.004;
      const geo = limbGeo(DIM.tailSegLen, r1, r2, 12, 3);
      geo.rotateZ(-Math.PI / 2);
      pivot.add(paintedMesh(geo, solid(i >= n - 2 ? HAIR_LIGHT : HAIR), hairMat));
      if (i === n - 1) {
        const tuft = paintedMesh(ellipsoid(0.03, 0.021, 0.021, 16, 12), solid(0xffffff));
        tuft.position.set(-0.03, 0, 0);
        pivot.add(tuft);
      }
      tail.push(pivot);
      parent = pivot;
    }
  }

  // ---- hands (skin mittens, shared)
  for (const s of ['L', 'R']) {
    const A = arms[s];
    const palm = paintedMesh(ellipsoid(0.026, 0.031, 0.022, 18, 12), solid(SKIN));
    palm.position.set(0.002, -0.024, 0);
    A.hand.add(palm);
    const thumb = paintedMesh(ellipsoid(0.0095, 0.015, 0.0095, 10, 8), solid(SKIN));
    thumb.position.set(0.019, -0.015, 0);
    thumb.rotation.z = 0.5;
    A.hand.add(thumb);
  }

  // ---- outfits
  const outfitParts = {};
  const torsoProfile = [
    [0.0, -0.036], [0.08, -0.03], [0.082, -0.012], [0.07, 0.018], [0.063, 0.05],
    [0.066, 0.09], [0.074, 0.128], [0.079, 0.158], [0.075, 0.184], [0.058, 0.2],
    [0.033, 0.212], [0.0, 0.216],
  ];
  const torsoShape = (geo) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const y = pos.getY(i), z = pos.getZ(i);
      x *= 0.72;
      const r = Math.hypot(x, z);
      if (x > 0 && r > 1e-4) x += 0.008 * Math.exp(-(((y - 0.125) / 0.03) ** 2)) * (x / r) ** 2;
      pos.setX(i, x);
    }
    geo.computeVertexNormals();
    return geo;
  };

  function shoeMeshes(spec) {
    const parts = [];
    const add = (geo, hex, x, y, z = 0) => {
      const m = paintedMesh(geo, solid(hex));
      m.position.set(x, y, z);
      parts.push(m);
      return m;
    };
    if (spec.style === 'sandal') {
      add(ellipsoid(0.046, 0.016, 0.026), SKIN, 0.02, -0.016);
      add(ellipsoid(0.052, 0.006, 0.03), spec.sole, 0.02, -0.03);
      const strap = new THREE.TorusGeometry(0.024, 0.004, 6, 20);
      strap.rotateY(Math.PI / 2);
      strap.scale(1, 0.75, 1.1);
      add(strap, spec.color, 0.03, -0.018);
    } else if (spec.style === 'slipper') {
      add(ellipsoid(0.058, 0.03, 0.037), spec.color, 0.022, -0.008);
      add(ellipsoid(0.058, 0.007, 0.037), spec.sole, 0.022, -0.03);
      for (const s of [-1, 1]) {
        const e = new THREE.ConeGeometry(0.013, 0.024, 10);
        const m = add(e, spec.sole, 0.05, 0.02, s * 0.018);
        m.rotation.x = s * 0.35;
      }
    } else {
      const big = spec.style === 'sneaker' ? 1.08 : spec.chunky ? 1.3 : 1;
      add(ellipsoid(0.05 * big, 0.022 * big, 0.029 * big), spec.color, 0.02, -0.012);
      add(ellipsoid(0.052 * big, 0.007, 0.031 * big), spec.sole, 0.02, -0.029);
    }
    return parts;
  }

  function extraMeshes(name, color) {
    const out = []; // [parent, mesh]
    switch (name) {
      case 'sailorBow': {
        const g = new THREE.Group();
        g.position.set(0.056, 0.098, 0);
        for (const s of [-1, 1]) {
          const lobe = paintedMesh(ellipsoid(0.009, 0.016, 0.022), solid(0xe0404e));
          lobe.position.set(0, 0, s * 0.02);
          lobe.rotation.x = s * 0.25;
          g.add(lobe);
          const tail2 = paintedMesh(ellipsoid(0.006, 0.026, 0.01), solid(0xd4323f));
          tail2.position.set(-0.003, -0.028, s * 0.009);
          tail2.rotation.x = -s * 0.25;
          g.add(tail2);
        }
        g.add(paintedMesh(ellipsoid(0.01, 0.011, 0.01), solid(0xc92a38)));
        out.push([chest, g]);
        break;
      }
      case 'maidCollar': {
        const g = new THREE.Group();
        g.position.set(0.04, 0.198, 0);
        for (const s of [-1, 1]) {
          const lobe = paintedMesh(ellipsoid(0.006, 0.01, 0.014), solid(0x2a2530));
          lobe.position.set(0, 0, s * 0.012);
          g.add(lobe);
        }
        out.push([chest, g]);
        break;
      }
      case 'headband': {
        const g = new THREE.Group();
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const a = -1.25 + (2.5 * i) / 8;
          pts.push(polar(Math.abs(a), a < 0 ? -Math.PI / 2 : Math.PI / 2, 1.1).add(V3(0.03, 0, 0)));
        }
        g.add(mesh(strandGeo(pts, { width: 0.022, thickness: 0.012, color: 0xffffff, taper: () => 1, center: V3(0, -0.1, 0) })));
        for (let i = 1; i < 8; i++) {
          const a = -1.1 + (2.2 * i) / 8;
          const p = polar(Math.abs(a), a < 0 ? -Math.PI / 2 : Math.PI / 2, 1.16).add(V3(0.036, 0, 0));
          const frill = paintedMesh(ellipsoid(0.01, 0.02, 0.017, 12, 8), solid(0xffffff));
          frill.position.copy(p);
          frill.rotation.x = -a;
          g.add(frill);
        }
        out.push([headGroup, g]);
        break;
      }
      case 'hood': {
        const g = new THREE.Group();
        g.position.set(-0.058, 0.188, 0);
        g.add(paintedMesh(ellipsoid(0.042, 0.036, 0.084), solid(color || 0xb9a5f0)));
        const lip = paintedMesh(ellipsoid(0.03, 0.02, 0.07), solid(0x9d86e0));
        lip.position.set(0.012, 0.018, 0);
        g.add(lip);
        for (const s of [-1, 1]) {
          const e = new THREE.ConeGeometry(0.014, 0.028, 10);
          const m = paintedMesh(e, solid(0xb9a5f0));
          m.position.set(-0.01, 0.04, s * 0.045);
          m.rotation.x = s * 0.4;
          g.add(m);
        }
        out.push([chest, g]);
        break;
      }
      case 'drawstrings': {
        for (const s of [-1, 1]) {
          const g = new THREE.Group();
          g.position.set(0.05, 0.178, s * 0.02);
          const cord = new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 6);
          cord.translate(0, -0.025, 0);
          const m = paintedMesh(cord, solid(0xffffff));
          m.rotation.z = -0.25;
          g.add(m);
          const tip = paintedMesh(ellipsoid(0.005, 0.008, 0.005, 8, 6), solid(0xf0a8c0));
          tip.position.set(0.012, -0.05, 0);
          g.add(tip);
          out.push([chest, g]);
        }
        break;
      }
      case 'mikuTie': {
        const g = new THREE.Group();
        const knot = paintedMesh(ellipsoid(0.009, 0.011, 0.012, 12, 8), solid(TEAL));
        knot.position.set(0.06, 0.186, 0);
        g.add(knot);
        const blade = paintedMesh(ellipsoid(0.006, 0.066, 0.019, 12, 10), solid(TEAL));
        blade.position.set(0.069, 0.12, 0);
        blade.rotation.z = -0.12;
        g.add(blade);
        out.push([chest, g]);
        break;
      }
      case 'mikuTattoo': {
        // The red "01" on her left shoulder: a canvas decal wrapped around
        // the outside of the upper arm, just above the sleeve.
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 64;
        const g2 = c.getContext('2d');
        g2.fillStyle = '#d8203c';
        g2.font = 'bold 54px Arial, sans-serif';
        g2.textAlign = 'center';
        g2.textBaseline = 'middle';
        g2.fillText('01', 64, 34);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const r = 0.0252;
        const geo = new THREE.CylinderGeometry(r, r, 0.022, 10, 1, true, Math.PI - 0.55, 1.1);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          map: tex, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        }));
        m.position.y = -0.036;
        m.renderOrder = 1;
        out.push([arms.L.upper, m]);
        break;
      }
      case 'headset': {
        for (const s of [-1, 1]) {
          const g = new THREE.Group();
          const p = polar(1.6, s * 1.62, 1.14);
          g.position.copy(p);
          g.lookAt(p.clone().multiplyScalar(2));
          const cup = new THREE.CylinderGeometry(0.034, 0.036, 0.024, 20);
          cup.rotateX(Math.PI / 2);
          g.add(paintedMesh(cup, solid(GRAPHITE)));
          const ring = new THREE.TorusGeometry(0.026, 0.005, 8, 24);
          const r = paintedMesh(ring, solid(TEAL));
          r.position.z = 0.013;
          g.add(r);
          out.push([headGroup, g]);
        }
        // Microphone boom from her left ear cup toward the mouth.
        const a = polar(1.66, -1.62, 1.16);
        const mic = paintedMesh(strandGeo([a, V3(0.03, -0.075, -0.15), V3(0.1, -0.1, -0.1), V3(0.135, -0.095, -0.045)], {
          width: 0.008, thickness: 0.008, color: GRAPHITE, taper: () => 1, center: V3(0, 0, 0),
        }), (p) => GRAPHITE);
        const tip = paintedMesh(ellipsoid(0.012, 0.009, 0.01, 12, 8), solid(GRAPHITE));
        tip.position.set(0.138, -0.094, -0.04);
        const g = new THREE.Group();
        g.add(mic, tip);
        out.push([headGroup, g]);
        break;
      }
      case 'flowerClip': {
        const g = new THREE.Group();
        const p = polar(0.95, 1.2, 1.1);
        g.position.copy(p);
        g.lookAt(p.clone().multiplyScalar(2));
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const petal = paintedMesh(ellipsoid(0.013, 0.006, 0.004, 10, 6), solid(0xffd23f));
          petal.position.set(Math.cos(a) * 0.017, Math.sin(a) * 0.017, 0);
          petal.rotation.z = a;
          g.add(petal);
        }
        const c = paintedMesh(ellipsoid(0.01, 0.01, 0.006, 12, 8), solid(0x8a5a2a));
        c.position.z = 0.003;
        g.add(c);
        out.push([headGroup, g]);
        break;
      }
      default:
    }
    return out;
  }

  const skirtMat = vmatDouble;
  for (const name of OUTFIT_NAMES) {
    const O = OUTFITS[name];
    const parts = []; // [parent, object]
    const torso = paintedMesh(torsoShape(latheY(torsoProfile)), (p, n) => O.torso(p, n));
    parts.push([chest, torso]);
    const pel = paintedMesh(ellipsoid(DIM.pelvisR.x, DIM.pelvisR.y, DIM.pelvisR.z, 28, 18), (p, n) => O.pelvis(p, n));
    parts.push([pelvis, pel]);
    for (const s of ['L', 'R']) {
      const A = arms[s], G = legs[s];
      const tU = limbT(DIM.upper), tF = limbT(DIM.fore), tT = limbT(DIM.thigh), tS = limbT(DIM.shin);
      parts.push([A.upper, paintedMesh(limbGeo(DIM.upper, 0.031, 0.025), (p, n) => O.upper(tU(p), p, n))]);
      parts.push([A.fore, paintedMesh(limbGeo(DIM.fore, 0.0255, 0.021), (p, n) => O.fore(tF(p), p, n))]);
      parts.push([G.thigh, paintedMesh(limbGeo(DIM.thigh, 0.05, 0.035), (p, n) => O.thigh(tT(p), p, n))]);
      parts.push([G.shin, paintedMesh(limbGeo(DIM.shin, 0.04, 0.032), (p, n) => O.shin(tS(p), p, n))]);
      for (const m of shoeMeshes(O.shoe)) parts.push([G.foot, m]);
      if (O.puff) {
        const puff = paintedMesh(ellipsoid(0.04, 0.042, 0.04, 18, 12), solid(O.puff));
        puff.position.set(0, -0.02, 0);
        parts.push([A.upper, puff]);
      }
      if (O.sleeveCover) {
        const cov = new THREE.CylinderGeometry(0.027, 0.033, 0.042, 18, 1, true);
        cov.translate(0, -0.012, 0);
        const m = new THREE.Mesh(paint(cov, solid(O.sleeveCover)), vmatDouble);
        parts.push([A.hand, m]);
      }
      if (O.bellSleeve) {
        // Wide detached sleeve flaring out over the wrist, trimmed at the
        // cuff, optionally with Miku's panel of glowing level-meter bars.
        const bs = O.bellSleeve;
        const cov = new THREE.CylinderGeometry(0.03, 0.064, 0.1, 64, 20, true);
        cov.translate(0, 0.024, 0);
        const m = new THREE.Mesh(paint(cov, (p) => {
          if (p.y < -0.014) return bs.trim;
          if (bs.leds) {
            const col = Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 32);
            const h = 0.012 + 0.028 * Math.abs(Math.sin(col * 12.9898) * 43758.5453 % 1);
            if (col % 2 === 0 && p.y > -0.006 && p.y < -0.006 + h) return bs.trim;
          }
          return bs.color;
        }), vmatDouble);
        parts.push([A.hand, m]);
      }
    }
    const skirts = [];
    if (O.petticoat) {
      const pc = createSkirt(O.petticoat, skirtMat);
      skirts.push(pc);
      parts.push([pelvis, pc.mesh]);
    }
    if (O.skirt) {
      const sk = createSkirt(O.skirt, skirtMat);
      skirts.push(sk);
      parts.push([pelvis, sk.mesh]);
    }
    for (const e of O.extras || []) parts.push(...extraMeshes(e));
    for (const [parent, obj] of parts) {
      obj.visible = false;
      parent.add(obj);
    }
    outfitParts[name] = { parts, skirts };
  }

  const faceState = defaultFace();
  const rig = {
    root, tilt, yaw, pose, pelvis, chest, neck, head, headGroup, hairBack, twinTails, ears, tail, arms, legs,
    face: { canvas: faceCanvas, ctx: faceCtx, tex: faceTex, key: '', state: faceState },
    outfitParts,
    outfit: null,
    look: { yaw: 0, pitch: 0, gx: 0, gy: 0 },
    blink: { next: 2, t: -1 },
    hair: { z: 0, vz: 0, x: 0, vx: 0 },
    ahoge: { a: 0, v: 0, lastY: null },
    joints: {},
  };
  root.userData.rig = rig;
  setOutfit(root, 'miku');
  return root;
}

export function setOutfit(girl, name) {
  const r = girl.userData.rig;
  if (!r.outfitParts[name]) name = OUTFIT_NAMES[0];
  for (const [n, o] of Object.entries(r.outfitParts)) {
    for (const [, obj] of o.parts) obj.visible = n === name;
  }
  r.outfit = name;
}

// ---------------------------------------------------------------- posing

const _m = new THREE.Matrix4();
const _x = V3(0, 0, 0), _y = V3(0, 0, 0), _z = V3(0, 0, 0);
const HINT = V3(0, 0, 1);

// Place `obj` at `from` with its local -y axis pointing at `to`.
function orient(obj, from, to, hint = HINT) {
  _y.subVectors(from, to).normalize();
  _z.copy(hint).addScaledVector(_y, -hint.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  obj.quaternion.setFromRotationMatrix(_m);
  obj.position.copy(from);
}

// Two-bone IK: returns the middle joint, bending toward `pole`.
function ik(S, T, a, b, pole, mid, end) {
  const d = _x.subVectors(T, S);
  let dist = d.length();
  if (dist < 1e-6) { d.set(0, -1, 0); dist = 1e-6; }
  d.divideScalar(dist);
  dist = clamp(dist, Math.abs(a - b) + 1e-3, a + b - 1e-4);
  const x = (a * a - b * b + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const pv = _z.subVectors(pole, S);
  pv.addScaledVector(d, -pv.dot(d));
  if (pv.lengthSq() < 1e-8) pv.set(0, 0, 1);
  pv.normalize();
  mid.copy(S).addScaledVector(d, x).addScaledVector(pv, h);
  end.copy(S).addScaledVector(d, dist);
}

const tmpA = V3(0, 0, 0), tmpB = V3(0, 0, 0), tmpC = V3(0, 0, 0), tmpD = V3(0, 0, 0), tmpE = V3(0, 0, 0);
const chestM = new THREE.Matrix4();

// Joint positions (pose frame) for a pose, e.g. for grabbing.
export function jointsFor(P) {
  return { hip: V3(P.hipX, P.hipY, P.hipZ || 0) };
}

/**
 * Apply a pose to the rig. `look` optionally holds a world-space point for
 * the head/eyes, `face` the expression (face.js), `extraTilt` an additional
 * whole-body rotation (swinging while held) the hair should counter.
 */
export function applyPose(girl, P, t, dt, look, face, extraTilt = 0) {
  const r = girl.userData.rig;

  // Spine.
  r.pelvis.position.set(P.hipX, P.hipY, P.hipZ || 0);
  r.pelvis.rotation.set(P.roll || 0, P.twist || 0, -P.lean);
  const b = (P.breath || 0.01) * Math.sin(t * (P.breathHz || 0.4) * Math.PI * 2);
  r.chest.rotation.set(P.chestRoll || 0, P.chestTwist || 0, -P.bend);
  r.chest.scale.set(1 + b * 0.6, 1 + b, 1 + b * 0.3);
  r.neck.rotation.z = -(P.neckBend || 0);
  r.pelvis.updateMatrix();
  r.chest.updateMatrix();
  chestM.multiplyMatrices(r.pelvis.matrix, r.chest.matrix);

  // Head: base pose plus a damped look-at; eyes take the rest.
  let yawT = P.headYaw, pitchT = P.headPitch;
  let gxT = 0, gyT = 0;
  const w = look && look.weight > 0 ? look.weight : 0;
  if (w > 0) {
    r.neck.updateWorldMatrix(true, false);
    tmpA.copy(look.point);
    r.neck.worldToLocal(tmpA);
    tmpA.sub(tmpB.set(0, DIM.neckLen, 0).add(DIM.headC));
    const yawA = Math.atan2(-tmpA.z, tmpA.x);
    const pitA = Math.atan2(tmpA.y, Math.hypot(tmpA.x, tmpA.z));
    const yawC = clamp(yawA, -1.0, 1.0), pitC = clamp(pitA, -0.55, 0.6);
    yawT = P.headYaw + (yawC * 0.8 - P.headYaw) * w;
    pitchT = P.headPitch + (pitC * 0.75 - P.headPitch) * w;
    gxT = clamp((yawA - yawT) / 0.45, -1, 1) * w;
    gyT = clamp(-(pitA - pitchT) / 0.35, -1, 1) * w;
  }
  const k = 1 - Math.exp(-dt * 8);
  r.look.yaw += (yawT - r.look.yaw) * k;
  r.look.pitch += (pitchT - r.look.pitch) * k;
  const kg = 1 - Math.exp(-dt * 14);
  r.look.gx += (gxT - r.look.gx) * kg;
  r.look.gy += (gyT - r.look.gy) * kg;
  r.head.rotation.set(P.headRoll || 0, r.look.yaw, r.look.pitch);

  // Ears.
  for (const e of r.ears) {
    const tw = P.earTwitch && e.side === P.earTwitchSide ? P.earTwitch : 0;
    e.pivot.rotation.set(e.side * (0.32 + P.earBack * 0.55), -e.side * (0.15 + P.earBack * 0.3), 0.05 + P.earBack * 0.75 + tw);
  }

  // Arms.
  for (const s of ['L', 'R']) {
    const A = r.arms[s];
    const sd = A.side;
    const k2 = s.toLowerCase();
    tmpA.set(DIM.shoulder.x, DIM.shoulder.y, DIM.shoulder.z * sd).applyMatrix4(chestM); // shoulder
    tmpB.set(P[k2 + 'hX'], P[k2 + 'hY'], P[k2 + 'hZ'] * sd).add(tmpA); // hand target
    const out = P.elbowOut || 0;
    tmpC.set(-0.08, -0.1 + out * 0.12, sd * (0.06 + out * 0.14)).add(tmpA); // pole
    ik(tmpA, tmpB, DIM.upper, DIM.fore, tmpC, tmpD, tmpE);
    orient(A.upper, tmpA, tmpD);
    orient(A.fore, tmpD, tmpE);
    tmpC.subVectors(tmpE, tmpD).normalize().add(tmpE); // continue the forearm
    orient(A.hand, tmpE, tmpC);
    A.hand.rotateZ(P[k2 + 'Paw'] || 0);
    A.hand.rotateY(sd * 0.3);
  }

  // Legs.
  const skirtLegs = [];
  for (const s of ['L', 'R']) {
    const G = r.legs[s];
    const sd = G.side;
    const k2 = s.toLowerCase();
    tmpA.set(DIM.hip.x, DIM.hip.y, DIM.hip.z * sd).applyMatrix4(r.pelvis.matrix);
    tmpB.set(P[k2 + 'fX'], P[k2 + 'fY'], P[k2 + 'fZ'] * sd);
    tmpC.set(0.4, 0.0, sd * 0.06).add(tmpA);
    ik(tmpA, tmpB, DIM.thigh, DIM.shin, tmpC, tmpD, tmpE);
    orient(G.thigh, tmpA, tmpD);
    orient(G.shin, tmpD, tmpE);
    G.foot.position.copy(tmpE);
    G.foot.rotation.set(0, -sd * 0.12, -(P[k2 + 'fP'] || 0));
    skirtLegs.push({ hip: tmpA.clone(), knee: tmpD.clone() });
  }
  r.joints.knees = skirtLegs.map((l) => l.knee);

  // Skirt(s).
  const outfit = r.outfitParts[r.outfit];
  for (const sk of outfit.skirts) sk.update(r.pelvis.matrix, skirtLegs, P.seat || 0, t);

  // Tail: base angles + curl + a travelling sway wave.
  const n = r.tail.length;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const wave = Math.sin(t * (P.tailHz || 0.6) * Math.PI * 2 - i * 0.5);
    let z = i === 0 ? P.tailBase : P.tailCurl + (f > 0.6 ? P.tailTip : 0);
    let y = i === 0 ? P.tailSide0 || 0 : P.tailSide;
    y += wave * P.tailSway * (0.3 + f) * 0.35;
    z += Math.sin(t * (P.tailHz || 0.6) * Math.PI * 2 * 0.7 - i * 0.4) * (P.tailLift || 0) * (0.2 + f) * 0.3;
    r.tail[i].rotation.set(0, y, z);
  }

  // Back hair keeps hanging roughly downward (spring), the ahoge bounces.
  const worldPitch = r.look.pitch - P.lean - P.bend - (P.neckBend || 0) + extraTilt;
  const worldRoll = (P.roll || 0) + (P.chestRoll || 0) + (P.headRoll || 0);
  const H = r.hair;
  const dts = Math.min(dt, 0.05);
  H.vz += (60 * (clamp(-worldPitch * 0.85, -1.2, 1.2) - H.z) - 7 * H.vz) * dts;
  H.z += H.vz * dts;
  H.vx += (60 * (clamp(-worldRoll * 0.7, -0.8, 0.8) - H.x) - 7 * H.vx) * dts;
  H.x += H.vx * dts;
  r.hairBack.rotation.set(H.x, 0, H.z);
  for (const tt of r.twinTails) {
    const sway = 0.05 * Math.sin(t * 1.1 + tt.side) + H.vz * 0.02;
    tt.pivot.rotation.set(H.x * 1.2 + tt.side * sway, 0, H.z * 1.1 + 0.3 * sway);
  }
  const Ah = r.ahoge;
  const hy = P.hipY;
  if (Ah.lastY !== null && dts > 0) Ah.v -= ((hy - Ah.lastY) / dts) * 3;
  Ah.lastY = hy;
  Ah.v += (-120 * Ah.a - 6 * Ah.v) * dts;
  Ah.a += Ah.v * dts;
  r.headGroup.userData.ahoge.rotation.z = clamp(Ah.a, -0.6, 0.6) + Math.sin(t * 1.3) * 0.04;

  // Face: blink + gaze, redrawn only when the drawing would change.
  const bl = r.blink;
  bl.next -= dt;
  if (bl.next <= 0 && bl.t < 0) { bl.t = 0; bl.next = 2.2 + Math.random() * 4; }
  let blink = 0;
  if (bl.t >= 0) {
    bl.t += dt;
    blink = Math.sin(clamp(bl.t / 0.15, 0, 1) * Math.PI);
    if (bl.t > 0.15) bl.t = -1;
  }
  const F = r.face.state;
  Object.assign(F, face || defaultFace());
  F.open = (face ? face.open : 1) * (1 - blink);
  F.gx = clamp((face && face.gx !== undefined ? face.gx : 0) + r.look.gx, -1, 1);
  F.gy = clamp((face && face.gy !== undefined ? face.gy : 0) + r.look.gy, -1, 1);
  const key = faceKey(F);
  if (key !== r.face.key) {
    r.face.key = key;
    drawFace(r.face.ctx, F);
    r.face.tex.needsUpdate = true;
  }
}

// Grab point (scruff) in pose space for the given pose.
export function scruffFor(girl) {
  const r = girl.userData.rig;
  return DIM.scruff.clone().applyMatrix4(chestM.multiplyMatrices(r.pelvis.matrix, r.chest.matrix));
}

export { OUTFITS, OUTFIT_NAMES };
