// Shared three.js setup: renderer with bloom, and a procedural Indian Railways train.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export { THREE };
export const SMALL = () => window.innerWidth < 760;
export const REDUCED = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

// Renderer + composer (bloom) bound to a canvas that fills its parent.
export function stage(canvas, scene, camera, { bloom = 0.9, radius = 0.55, threshold = 0.18, exposure = 1.0 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SMALL() ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom, radius, threshold);
  if (bloom > 0) composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const resize = () => {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth, h = canvas.clientHeight || canvas.parentElement.clientHeight;
    if (!w || !h) return false;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloomPass.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    return true;
  };
  return { renderer, composer, bloomPass, resize, render: () => composer.render() };
}

// Canvas texture for a coach side: warm lit windows on a dark band.
function windowTexture(n = 12, warm = "#ffcf7a") {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#070707"; g.fillRect(0, 0, 512, 64);
  const w = 512 / n;
  for (let i = 0; i < n; i++) {
    const lit = Math.random() > 0.12;
    g.fillStyle = lit ? warm : "#1a1712";
    g.globalAlpha = lit ? 0.75 + Math.random() * 0.25 : 1;
    g.fillRect(i * w + w * 0.14, 12, w * 0.72, 40);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A broad-gauge electric locomotive with coaches, running towards -z. Units are metres.
export function buildTrain({ coaches = 6, livery = 0xa3271f } = {}) {
  const train = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f22, metalness: 0.7, roughness: 0.45 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x2c3238, metalness: 0.65, roughness: 0.38 });
  const red = new THREE.MeshStandardMaterial({ color: livery, metalness: 0.35, roughness: 0.5 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xd9d2c0, metalness: 0.2, roughness: 0.6 });
  const amber = new THREE.MeshStandardMaterial({ color: 0xffc21a, emissive: 0xffb000, emissiveIntensity: 2.2 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glass = new THREE.MeshStandardMaterial({ color: 0x05090c, emissive: 0x2d6f91, emissiveIntensity: 0.22, metalness: 0.9, roughness: 0.08 });

  // Locomotive
  const loco = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(3.15, 3.3, 19.5, 4, 0.38), graphite);
  body.position.y = 2.75; loco.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 19.0), red);
  band.position.y = 1.75; loco.add(band);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.22, 0.14, 19.2), amber);
  stripe.position.y = 2.32; loco.add(stripe);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 15), dark);
  roof.position.y = 4.5; loco.add(roof);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.95, 1.25, 0.08), dark);
  frame.position.set(0, 3.55, -9.76); loco.add(frame);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.0, 0.1), glass);
  wind.position.set(0, 3.55, -9.8); loco.add(wind);
  const face = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.1, 0.06), red);
  face.position.set(0, 2.45, -9.79); loco.add(face);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xffc21a, emissive: 0xffb000, emissiveIntensity: 0.9 });
  const nose = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.3, 0.2), noseMat);
  nose.position.set(0, 1.25, -9.8); loco.add(nose);
  for (const x of [-0.95, 0.95]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), white);
    hl.position.set(x, 4.1, -9.82); loco.add(hl);
    const ml = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), white);
    ml.position.set(x, 1.0, -9.82); loco.add(ml);
  }
  // pantograph
  const panto = new THREE.Group();
  const bar = new THREE.MeshStandardMaterial({ color: 0x9aa3a8, metalness: 0.8, roughness: 0.3 });
  const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.4), bar); a1.position.set(0, 5.3, 0.2); a1.rotation.x = 0.5; panto.add(a1);
  const a2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.4), bar); a2.position.set(0, 5.3, -0.9); a2.rotation.x = -0.5; panto.add(a2);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.3), bar); head.position.set(0, 5.85, -0.35); panto.add(head);
  panto.position.z = -4.5; loco.add(panto);
  addBogies(loco, 19.5, dark);
  train.add(loco);

  // headlight beam (fake volumetric cone) + real spot
  const spot = new THREE.SpotLight(0xfff0d0, 900, 220, 0.32, 0.6, 1.4);
  spot.position.set(0, 3.8, -9.9); spot.target.position.set(0, 0, -80);
  loco.add(spot, spot.target);

  // Coaches
  const tex = windowTexture();
  const winMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.6, color: 0x222222 });
  let z = 9.75 + 0.9;
  for (let i = 0; i < coaches; i++) {
    const coach = new THREE.Group();
    const L = 22;
    const cb = new THREE.Mesh(new RoundedBoxGeometry(3.15, 3.5, L, 4, 0.35), i % 3 === 2 ? cream : red);
    cb.position.y = 2.85; coach.add(cb);
    const cr = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.3, L - 0.6), dark);
    cr.position.y = 4.65; coach.add(cr);
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(L - 3, 0.95), winMat);
      w.position.set(sx * 1.585, 3.2, 0); w.rotation.y = sx * Math.PI / 2; coach.add(w);
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, L - 1), amber);
      s2.position.set(sx * 1.59, 2.3, 0); coach.add(s2);
    }
    addBogies(coach, L, dark);
    coach.position.z = z + L / 2;
    z += L + 0.9;
    train.add(coach);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  tail.position.set(0, 1.2, z - 0.85);
  train.add(tail);
  train.userData = { tail, length: z };
  return train;
}

function addBogies(group, L, mat) {
  const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.18, 18);
  for (const bz of [-L / 2 + 3.2, L / 2 - 3.2]) {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 3.4), mat);
    bogie.position.set(0, 0.85, bz); group.add(bogie);
    for (const wz of [-0.95, 0.95]) for (const wx of [-0.84, 0.84]) {
      const w = new THREE.Mesh(wheel, mat);
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.5, bz + wz); group.add(w);
    }
  }
}

// Radial glow sprite texture (for beacons and signals).
let glowTex;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function glow(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

// An Indian Railways station nameboard: yellow, black border, Hindi above English.
export function nameboard(hi, en) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 300;
  const g = c.getContext("2d");
  g.fillStyle = "#ffc21a"; g.fillRect(0, 0, 1024, 300);
  g.strokeStyle = "#15130a"; g.lineWidth = 16; g.strokeRect(22, 22, 980, 256);
  g.fillStyle = "#15130a"; g.textAlign = "center";
  g.font = "700 104px Rajdhani, 'Noto Sans Devanagari', sans-serif"; g.fillText(hi, 512, 140);
  g.font = "700 92px Rajdhani, sans-serif"; g.fillText(en.toUpperCase(), 512, 245);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const grp = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
  board.position.y = 4.2; grp.add(board);
  const post = new THREE.MeshStandardMaterial({ color: 0x3d4744, metalness: 0.5, roughness: 0.6 });
  for (const x of [-2.3, 2.3]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), post); p.position.set(x, 1.6, -0.05); grp.add(p); }
  const lamp = glow(0xfff0c0, 4); lamp.position.set(0, 5.6, 0.3); grp.add(lamp);
  return { group: grp, setText(h2, e2) { g.fillStyle = "#ffc21a"; g.fillRect(30, 30, 964, 240); g.fillStyle = "#15130a"; g.font = "700 104px Rajdhani, 'Noto Sans Devanagari', sans-serif"; g.fillText(h2, 512, 140); g.font = "700 92px Rajdhani, sans-serif"; g.fillText(e2.toUpperCase(), 512, 245); t.needsUpdate = true; } };
}
