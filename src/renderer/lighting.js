import * as THREE from './vendor/three.module.min.js';

// Soft studio lighting: warm sky/ground fill, a key from upper-front-left and
// a back rim light that catches the fur sheen along the silhouette.
export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xfff3e6, 0x5a4a3c, 1.6));
  const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
  key.position.set(-0.45, 0.8, 0.9);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6);
  fill.position.set(0.8, 0.2, 0.6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe2c4, 1.8);
  rim.position.set(0.3, 0.6, -1);
  scene.add(rim);
}
