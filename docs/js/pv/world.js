// Passenger world: one renderer, one scene, one camera; a light post-processing chain
// (dual-filter bloom, ACES tone mapping, chromatic fringe, grain, vignette, flash and tint),
// and a quality governor that lowers resolution and effects until the frame rate holds.
import * as THREE from "three";

const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN = `precision highp float; varying vec2 vUv; uniform sampler2D t; uniform vec2 px; uniform float thr;
vec3 pre(vec3 c){ float l = max(c.r, max(c.g, c.b)); return c * max(l - thr, 0.0) / max(l, 1e-4); }
void main(){
  vec3 s = texture2D(t, vUv).rgb * 4.0;
  s += texture2D(t, vUv + vec2(-px.x, -px.y)).rgb + texture2D(t, vUv + vec2(px.x, -px.y)).rgb
     + texture2D(t, vUv + vec2(-px.x, px.y)).rgb + texture2D(t, vUv + vec2(px.x, px.y)).rgb;
  vec3 c = s / 8.0;
  gl_FragColor = vec4(thr > 0.0 ? pre(c) : c, 1.0);
}`;
const UP = `precision highp float; varying vec2 vUv; uniform sampler2D t; uniform sampler2D base; uniform vec2 px;
void main(){
  vec3 s = texture2D(t, vUv + vec2(-px.x * 2.0, 0.0)).rgb + texture2D(t, vUv + vec2(px.x * 2.0, 0.0)).rgb
     + texture2D(t, vUv + vec2(0.0, -px.y * 2.0)).rgb + texture2D(t, vUv + vec2(0.0, px.y * 2.0)).rgb;
  s += (texture2D(t, vUv + vec2(-px.x, px.y)).rgb + texture2D(t, vUv + vec2(px.x, px.y)).rgb
     + texture2D(t, vUv + vec2(-px.x, -px.y)).rgb + texture2D(t, vUv + vec2(px.x, -px.y)).rgb) * 2.0;
  gl_FragColor = vec4(s / 12.0 + texture2D(base, vUv).rgb, 1.0);
}`;
const FINAL = `precision highp float; varying vec2 vUv;
uniform sampler2D scene, bloom; uniform float bloomK, exposure, ca, grain, time, flash, vig, red, glitch;
uniform vec2 res;
float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 uv = vUv;
  if (glitch > 0.0){
    float band = step(0.92, h(vec2(floor(uv.y * 40.0), floor(time * 18.0))));
    uv.x += band * (h(vec2(time, uv.y)) - 0.5) * 0.06 * glitch;
  }
  vec2 d = uv - 0.5;
  float k = ca * (0.6 + dot(d, d) * 2.5) + glitch * 0.012;
  vec3 c;
  c.r = texture2D(scene, uv - d * k).r;
  c.g = texture2D(scene, uv).g;
  c.b = texture2D(scene, uv + d * k).b;
  c += texture2D(bloom, uv).rgb * bloomK;
  c *= exposure;
  c = aces(c);
  c = pow(c, vec3(1.0 / 2.2));
  c = mix(c, c * vec3(1.25, 0.55, 0.5) + vec3(0.12, 0.0, 0.0), red);
  c *= mix(1.0, smoothstep(1.05, 0.25, length(d * vec2(1.0, 1.2))), vig);
  c += (h(uv * res + fract(time * 7.3) * 91.0) - 0.5) * grain;
  c = mix(c, vec3(1.0, 0.98, 0.95), flash);
  gl_FragColor = vec4(c, 1.0);
}`;

export const TIERS = [
  { name: "high", dpr: 1.5, bloom: 5, particles: 1 },
  { name: "medium", dpr: 1.0, bloom: 4, particles: 0.7 },
  { name: "low", dpr: 0.75, bloom: 3, particles: 0.45 },
];

export function createWorld(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance", stencil: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x05060a, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 4000);
  const mobile = !!opts.mobile;
  let tier = mobile ? 1 : 0;
  const forced = opts.tier;
  if (forced !== undefined) tier = forced;

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const fsScene = new THREE.Scene(); fsScene.add(quad);
  const fsCam = new THREE.Camera();
  const mk = (frag, u) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms: u, depthTest: false, depthWrite: false });
  const down = mk(DOWN, { t: { value: null }, px: { value: new THREE.Vector2() }, thr: { value: 0 } });
  const up = mk(UP, { t: { value: null }, base: { value: null }, px: { value: new THREE.Vector2() } });
  const post = {
    bloomK: 0.9, exposure: 1.0, ca: 0.0025, grain: 0.035, flash: 0, vig: 1, red: 0, glitch: 0, threshold: 0.85,
  };
  const fin = mk(FINAL, {
    scene: { value: null }, bloom: { value: null }, bloomK: { value: 1 }, exposure: { value: 1 }, ca: { value: 0 }, grain: { value: 0 },
    time: { value: 0 }, flash: { value: 0 }, vig: { value: 1 }, red: { value: 0 }, glitch: { value: 0 }, res: { value: new THREE.Vector2() },
  });

  let rtScene = null, mips = [], W = 1, H = 1;
  function makeTargets() {
    const t = TIERS[tier];
    const dpr = Math.min(window.devicePixelRatio || 1, t.dpr);
    W = Math.max(2, Math.floor(canvas.clientWidth * dpr)); H = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    rtScene?.dispose(); mips.forEach(m => { m.a.dispose(); m.b.dispose(); });
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    rtScene = new THREE.WebGLRenderTarget(W, H, { ...opt, depthBuffer: true, samples: tier === 0 ? 4 : 0 });
    mips = [];
    let w = W, h = H;
    for (let i = 0; i < t.bloom; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); mips.push({ w, h, a: new THREE.WebGLRenderTarget(w, h, opt), b: new THREE.WebGLRenderTarget(w, h, opt) }); }
    camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    camera.updateProjectionMatrix();
    fin.uniforms.res.value.set(W, H);
  }
  makeTargets();
  const ro = new ResizeObserver(() => makeTargets()); ro.observe(canvas);

  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); }
  function render(time) {
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    // bloom: threshold + downsample chain, then upsample back adding each level
    let src = rtScene.texture, sw = W, sh = H;
    for (let i = 0; i < mips.length; i++) {
      down.uniforms.t.value = src; down.uniforms.px.value.set(1 / sw, 1 / sh); down.uniforms.thr.value = i === 0 ? post.threshold : 0;
      pass(down, mips[i].a); src = mips[i].a.texture; sw = mips[i].w; sh = mips[i].h;
    }
    let acc = mips[mips.length - 1].a.texture;
    for (let i = mips.length - 2; i >= 0; i--) {
      up.uniforms.t.value = acc; up.uniforms.base.value = mips[i].a.texture; up.uniforms.px.value.set(1 / mips[i + 1].w, 1 / mips[i + 1].h);
      pass(up, mips[i].b); acc = mips[i].b.texture;
    }
    const u = fin.uniforms;
    u.scene.value = rtScene.texture; u.bloom.value = acc; u.bloomK.value = post.bloomK; u.exposure.value = post.exposure; u.ca.value = post.ca;
    u.grain.value = post.grain; u.time.value = time; u.flash.value = post.flash; u.vig.value = post.vig; u.red.value = post.red; u.glitch.value = post.glitch;
    pass(fin, null);
  }

  // Quality governor: average frame time over 1.5 s windows; two slow windows drop a tier.
  let acc = 0, frames = 0, slow = 0, settled = forced !== undefined;
  function govern(dt) {
    if (settled) return;
    acc += dt; frames++;
    if (acc < 1.5) return;
    const ms = (acc / frames) * 1000;
    acc = 0; frames = 0;
    if (ms > 21) { slow++; if (slow >= 2 && tier < TIERS.length - 1) { tier++; slow = 0; makeTargets(); opts.onTier?.(tier); } }
    else { slow = 0; if (ms < 17) settled = settled || (performance.now() > 20000); }
  }

  return {
    renderer, scene, camera, post, render, govern,
    get tier() { return tier; }, get size() { return { W, H }; },
    resize: makeTargets,
  };
}

// Small helpers shared by the models
export const ease = {
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  smooth: t => t * t * (3 - 2 * t),
};
export const clamp01 = v => Math.max(0, Math.min(1, v));
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
export const lerp = (a, b, t) => a + (b - a) * t;
