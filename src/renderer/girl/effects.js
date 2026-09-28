import * as THREE from '../vendor/three.module.min.js';

// Little sprites around the cat girl: hearts, music notes, z's, sparkles,
// a poof cloud for outfit changes, an anger mark and speech words.
// Everything is drawn on canvases at startup; no image files.

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.1, y + s * 0.2, x - s * 0.5, y + s * 0.05, x - s * 0.5, y - s * 0.18);
  g.bezierCurveTo(x - s * 0.5, y - s * 0.45, x - s * 0.1, y - s * 0.5, x, y - s * 0.22);
  g.bezierCurveTo(x + s * 0.1, y - s * 0.5, x + s * 0.5, y - s * 0.45, x + s * 0.5, y - s * 0.18);
  g.bezierCurveTo(x + s * 0.5, y + s * 0.05, x + s * 0.1, y + s * 0.2, x, y + s * 0.35);
  g.closePath();
}

function starPath(g, x, y, r, inner = 0.28) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

const TEX = {};
function textures() {
  if (TEX.heart) return TEX;
  TEX.heart = canvasTexture(64, 64, (g) => {
    heartPath(g, 32, 34, 52);
    g.lineWidth = 5;
    g.strokeStyle = '#b8325c';
    g.stroke();
    g.fillStyle = '#ff7aa5';
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.ellipse(21, 22, 5, 7, -0.5, 0, Math.PI * 2);
    g.fill();
  });
  TEX.note = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#9b6ee8';
    g.strokeStyle = '#4a2d80';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(24, 46, 11, 8, -0.4, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillRect(32, 10, 5, 36);
    g.strokeRect(32, 10, 5, 36);
    g.beginPath();
    g.moveTo(37, 10);
    g.quadraticCurveTo(52, 16, 48, 30);
    g.quadraticCurveTo(46, 20, 37, 20);
    g.closePath();
    g.fill();
    g.stroke();
  });
  TEX.zzz = canvasTexture(64, 64, (g) => {
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(40,50,90,0.9)';
    g.strokeText('z', 32, 34);
    g.fillStyle = '#e8eeff';
    g.fillText('z', 32, 34);
  });
  TEX.sparkle = canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,220,0.9)');
    grad.addColorStop(1, 'rgba(255,240,160,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    starPath(g, 32, 32, 28, 0.22);
    g.fillStyle = '#fffbe0';
    g.fill();
  });
  TEX.poof = canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(28, 26, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.7, 'rgba(250,235,255,0.85)');
    grad.addColorStop(1, 'rgba(240,220,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
  });
  TEX.anger = canvasTexture(64, 64, (g) => {
    g.strokeStyle = '#e8364f';
    g.lineWidth = 6;
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      g.save();
      g.translate(32, 32);
      g.rotate((i * Math.PI) / 2);
      g.beginPath();
      g.moveTo(6, -20);
      g.quadraticCurveTo(6, -6, 20, -6);
      g.stroke();
      g.restore();
    }
  });
  return TEX;
}

const wordCache = new Map();
function wordTexture(word) {
  let t = wordCache.get(word);
  if (t) return t;
  const font = 'bold 40px "Comic Sans MS", "Comic Neue", "Nunito", "DejaVu Sans", sans-serif';
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const w = Math.ceil(probe.measureText(word).width + 24);
  t = canvasTexture(w, 64, (g, W, H) => {
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(130,40,80,0.95)';
    g.strokeText(word, W / 2, H / 2 + 2);
    g.fillStyle = '#fff0f6';
    g.fillText(word, W / 2, H / 2 + 2);
  });
  t.userData = { aspect: w / 64 };
  wordCache.set(word, t);
  return t;
}

export function createEffects(scene) {
  const T = textures();
  const list = [];

  function add(map, x, y, data) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
    s.position.set(x, y, 400);
    s.userData = { age: 0, phase: Math.random() * 6, vx: 0, vy: 0, aspect: 1, ...data };
    s.renderOrder = 10;
    s.visible = s.userData.age >= 0;
    scene.add(s);
    list.push(s);
    return s;
  }

  // head: world position above her head; body: { x, y, w, h } world box.
  function spawn(e, head, body, S) {
    const r = Math.random;
    switch (e.type) {
      case 'heart':
        add(T.heart, head.x + (r() - 0.5) * S * 0.35, head.y + S * 0.05, { kind: 'float', life: 1.6, vy: 45, vx: (r() - 0.5) * 20, base: S * 0.1 });
        break;
      case 'note':
        add(T.note, head.x + (r() < 0.5 ? -1 : 1) * S * 0.18, head.y - S * 0.02, { kind: 'float', life: 1.8, vy: 32, vx: (r() - 0.5) * 30, base: S * 0.1 });
        break;
      case 'zzz':
        add(T.zzz, head.x + S * 0.12, head.y, { kind: 'grow', life: 2.6, vx: 10, vy: 24, base: S * 0.08 });
        break;
      case 'anger':
        add(T.anger, head.x + S * 0.17, head.y - S * 0.02, { kind: 'pulse', life: 1.4, base: S * 0.1 });
        break;
      case 'sparkles':
        for (let i = 0; i < 12; i++) {
          add(T.sparkle, body.x + (r() - 0.5) * body.w * 1.3, body.y + (r() - 0.3) * body.h * 1.1, {
            kind: 'twinkle', life: 0.9 + r() * 0.5, age: -r() * 0.5, base: S * (0.06 + r() * 0.07), vy: 20,
          });
        }
        break;
      case 'poof':
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          add(T.poof, body.x + Math.cos(a) * body.w * 0.35, body.y + Math.sin(a) * body.h * 0.4, {
            kind: 'poof', life: 0.55, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, base: S * (0.2 + r() * 0.1),
          });
        }
        break;
      case 'text': {
        const tex = wordTexture(e.word);
        add(tex, head.x, head.y + S * 0.12, { kind: 'word', life: 1.7, vy: 14, base: S * 0.13, aspect: tex.userData.aspect });
        break;
      }
      default:
    }
  }

  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      const u = s.userData;
      u.age += dt;
      s.visible = u.age >= 0;
      if (u.age < 0) continue;
      const k = u.age / u.life;
      let sc = u.base;
      let alpha = Math.min(1, (1 - k) * 3, u.age * 10);
      switch (u.kind) {
        case 'float':
          s.position.x += (u.vx + Math.sin(u.age * 5 + u.phase) * 18) * dt;
          s.position.y += u.vy * dt;
          sc = u.base * (u.age < 0.15 ? (u.age / 0.15) * 1.2 : 1);
          break;
        case 'grow':
          s.position.x += (u.vx + Math.sin(u.age * 3 + u.phase) * 12) * dt;
          s.position.y += u.vy * dt;
          sc = u.base * (0.6 + k * 0.9);
          break;
        case 'pulse':
          sc = u.base * (1 + 0.2 * Math.sin(u.age * 18));
          break;
        case 'twinkle':
          s.position.y += u.vy * dt;
          sc = u.base * Math.sin(Math.PI * k);
          s.material.rotation = u.age * 2;
          alpha = 1;
          break;
        case 'poof':
          s.position.x += u.vx * dt;
          s.position.y += u.vy * dt;
          u.vx *= 0.9; u.vy *= 0.9;
          sc = u.base * (0.6 + k * 0.8);
          alpha = (1 - k) * 0.95;
          break;
        case 'word': {
          s.position.y += u.vy * dt;
          const pop = Math.min(1, u.age / 0.12);
          sc = u.base * (pop < 1 ? pop * 1.2 : 1 + 0.2 * Math.max(0, 1 - (u.age - 0.12) / 0.15));
          break;
        }
        default:
      }
      s.scale.set(sc * u.aspect, sc, 1);
      s.material.opacity = Math.max(0, alpha);
      if (k >= 1) {
        scene.remove(s);
        s.material.dispose();
        list.splice(i, 1);
      }
    }
  }

  return { spawn, update, get count() { return list.length; } };
}
