// Effects for the Passenger world: environment light, sky and hills, the particle cloud that condenses
// into the train, the dissolve that turns it solid, the headlight beam and glare, the timetable tunnel,
// and signage drawn from the journey's own data. Everything is procedural: no image or model files.
import * as THREE from "three";

// ---------------------------------------------------------------------------------------------
// Shared GLSL
// ---------------------------------------------------------------------------------------------
const NOISE = `
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

// ---------------------------------------------------------------------------------------------
// Environment map: a night sky with warm strip lights, so the white body, glass and steel pick up
// believable reflections without any HDR file.
// ---------------------------------------------------------------------------------------------
export function makeEnv(renderer) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vD; void main(){ float y = vD.y;
      vec3 c = mix(vec3(0.05, 0.045, 0.04), vec3(0.32, 0.22, 0.14), smoothstep(-0.25, 0.02, y));
      c = mix(c, vec3(0.04, 0.06, 0.11), smoothstep(0.02, 0.6, y));
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  s.add(dome);
  const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.1, 1.6) });
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 0.5), strip); b.position.set(-20 + i * 8, 18, -12 + (i % 2) * 24); s.add(b); }
  const cool = new THREE.Mesh(new THREE.BoxGeometry(40, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.8, 1.6) }));
  cool.position.set(0, 26, 0); s.add(cool);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.035);
  pm.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------------------------------------
// Sky dome (follows the camera): night gradient with a warm horizon glow and twinkling stars.
// ---------------------------------------------------------------------------------------------
export function sky() {
  const u = { uFade: { value: 0 }, uTime: { value: 0 }, uDusk: { value: 0 }, uDay: { value: 0 } };
  const m = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `${NOISE} uniform float uFade, uTime, uDusk, uDay; varying vec3 vD;
      void main(){
        float y = vD.y;
        vec3 zen = mix(mix(vec3(0.006, 0.009, 0.022), vec3(0.05, 0.07, 0.16), uDusk), vec3(0.12, 0.24, 0.48), uDay);
        vec3 hor = mix(mix(vec3(0.10, 0.065, 0.045), vec3(0.55, 0.28, 0.14), uDusk), vec3(0.55, 0.62, 0.7), uDay);
        vec3 c = mix(hor, zen, smoothstep(-0.02, 0.42, y));
        c += vec3(0.28, 0.14, 0.06) * exp(-abs(y - 0.01) * 26.0) * (0.55 + uDusk);   // city glow on the horizon
        vec3 sp = vD * 420.0;
        float st = step(0.9965, h31(floor(sp)));
        float tw = 0.55 + 0.45 * sin(uTime * (1.5 + h31(floor(sp) + 7.0) * 3.0) + h31(floor(sp) + 3.0) * 30.0);
        c += st * tw * smoothstep(0.05, 0.35, y) * vec3(0.9, 0.95, 1.1) * 1.6 * (1.0 - uDusk * 0.8) * (1.0 - uDay);
        gl_FragColor = vec4(c * uFade, 1.0);
      }`,
  }));
  m.renderOrder = -10; m.frustumCulled = false;
  m.userData.u = u;
  return m;
}

// Layered foothill silhouettes (the Shivaliks behind Dehradun), fading into the haze.
export function hills() {
  const g = new THREE.Group();
  const layers = [[520, 34, 0x10131c, 0.0], [760, 58, 0x0c0e15, 1.7], [1100, 95, 0x090a10, 3.1]];
  for (const [r, amp, col, seed] of layers) {
    const n = 220, pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const hgt = amp * (0.45 + 0.35 * Math.sin(a * 3 + seed) + 0.2 * Math.sin(a * 7.3 + seed * 2) + 0.12 * Math.sin(a * 17.1 + seed * 5) + 0.05 * Math.sin(a * 41 + seed));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, -20, z, x, Math.max(4, hgt), z);
      if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, fog: true }));
    m.frustumCulled = false;
    g.add(m);
  }
  return g;
}

export function ground() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.55 }));
  m.rotation.x = -Math.PI / 2; m.position.y = -0.46;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Surface sampling: area-weighted random points on every triangle of the given objects, in world
// space, with each point taking its material's colour. Used to build the particle cloud.
// ---------------------------------------------------------------------------------------------
export function sampleSurface(roots, count, rnd = Math.random) {
  const tris = [], cols = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let total = 0;
  const areas = [];
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
      const pos = o.geometry.attributes.position, idx = o.geometry.index;
      const n = idx ? idx.count / 3 : pos.count / 3;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const col = (mat.emissive && mat.emissiveIntensity > 1) ? new THREE.Color(1, 0.92, 0.75) : (mat.color ? mat.color.clone() : new THREE.Color(1, 1, 1));
      const l = Math.max(col.r, col.g, col.b); if (l < 0.18) col.multiplyScalar(0.18 / Math.max(l, 0.01)).lerp(new THREE.Color(0.25, 0.3, 0.4), 0.4);
      for (let t = 0; t < n; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
        const ar = b.clone().sub(a).cross(c.clone().sub(a)).length() * 0.5;
        if (ar < 1e-6) continue;
        total += ar; areas.push(total);
        tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); cols.push(col);
      }
    });
  }
  const P = new Float32Array(count * 3), C = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rnd() * total;
    let lo = 0, hi = areas.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (areas[mid] < r) lo = mid + 1; else hi = mid; }
    let u = rnd(), v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const k = lo * 9;
    for (let d = 0; d < 3; d++) P[i * 3 + d] = tris[k + d] + (tris[k + 3 + d] - tris[k + d]) * u + (tris[k + 6 + d] - tris[k + d]) * v;
    const col = cols[lo]; C[i * 3] = col.r; C[i * 3 + 1] = col.g; C[i * 3 + 2] = col.b;
  }
  return { P, C };
}

// ---------------------------------------------------------------------------------------------
// Particle cloud: each particle starts in a slow vortex around the track and flies to its sampled
// point on the train, front to back. The solid surface dissolves in behind them (see dissolve()).
// ---------------------------------------------------------------------------------------------
export function particleCloud({ P, C }, xmin, xmax) {
  const n = P.length / 3;
  const start = new Float32Array(n * 3), rnd = new Float32Array(n * 4), delay = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3];
    const ang = Math.random() * Math.PI * 2, rad = 10 + Math.pow(Math.random(), 0.7) * 42;
    start[i * 3] = x + (Math.random() - 0.5) * 60 - 18;
    start[i * 3 + 1] = 2.5 + Math.sin(ang) * rad * 0.55 + 6;
    start[i * 3 + 2] = Math.cos(ang) * rad;
    for (let d = 0; d < 4; d++) rnd[i * 4 + d] = Math.random();
    delay[i] = 0.06 + ((x - xmin) / (xmax - xmin)) * 0.45 + Math.random() * 0.08;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
  geo.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
  geo.setAttribute("aCol", new THREE.BufferAttribute(C, 3));
  geo.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  const u = { uProg: { value: 0 }, uTime: { value: 0 }, uSize: { value: 0.09 }, uPx: { value: 900 }, uFront: { value: -10 }, uI: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float uProg, uTime, uSize, uPx, uFront, uI;
      attribute vec3 aStart; attribute vec4 aRnd; attribute vec3 aCol; attribute float aDelay;
      varying vec3 vCol; varying float vA;
      void main(){
        float e = clamp((uProg - aDelay) / 0.42, 0.0, 1.0);
        e = e < 0.5 ? 4.0 * e * e * e : 1.0 - pow(max(-2.0 * e + 2.0, 0.0), 3.0) / 2.0;
        vec3 p = mix(aStart, position, e);
        float ang = (1.0 - e) * (2.6 + aRnd.y * 3.4);
        vec3 c = vec3(p.x, 2.6, 0.0), q = p - c; float cs = cos(ang), sn = sin(ang);
        p = c + vec3(q.x, q.y * cs - q.z * sn, q.y * sn + q.z * cs);
        float f = 1.0 - e;
        p += f * vec3(sin(uTime * 0.7 + aRnd.z * 6.28), cos(uTime * 0.9 + aRnd.w * 6.28), sin(uTime * 0.5 + aRnd.x * 6.28)) * 1.8;
        p += e * 0.012 * vec3(sin(uTime * 3.1 + aRnd.x * 40.0), sin(uTime * 2.7 + aRnd.y * 40.0), sin(uTime * 2.3 + aRnd.z * 40.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float absorbed = clamp((position.x - (uFront - 2.2)) / 2.2, 0.0, 1.0);
        float land = smoothstep(0.92, 1.0, e);
        vCol = mix(vec3(1.0, 0.62, 0.3) * 1.6, aCol * 1.15 + vec3(0.12, 0.09, 0.05), e) + land * vec3(0.5, 0.42, 0.3) * (1.0 - absorbed * 0.3);
        vA = mix(0.75, 0.9, f) * mix(1.0, absorbed, step(0.999, e)) * uI;
        gl_PointSize = clamp(uSize * mix(2.4, 1.0, e) * (0.6 + aRnd.x * 0.8) * uPx / -mv.z, 1.0, 36.0);
      }`,
    fragmentShader: `varying vec3 vCol; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vCol * a * vA, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.u = u;
  return pts;
}

// Floating dust in the light (beam and platform lamps). Small and cheap; drifts and twinkles.
export function dust(count, box) {
  const P = new Float32Array(count * 3), R = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    P[i * 3] = box.min.x + Math.random() * (box.max.x - box.min.x);
    P[i * 3 + 1] = box.min.y + Math.random() * (box.max.y - box.min.y);
    P[i * 3 + 2] = box.min.z + Math.random() * (box.max.z - box.min.z);
    R[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("aR", new THREE.BufferAttribute(R, 1));
  const u = { uTime: { value: 0 }, uPx: { value: 900 }, uI: { value: 0 }, uBeam: { value: new THREE.Vector3() } };
  const m = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float uTime, uPx, uI; uniform vec3 uBeam; attribute float aR; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uTime * 0.23 + aR * 40.0) * 0.6, sin(uTime * 0.31 + aR * 17.0) * 0.4, cos(uTime * 0.19 + aR * 23.0) * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vec3 d = p - uBeam; float along = -d.x; float rad = length(d.yz);
        float inBeam = step(0.0, along) * smoothstep(0.32 * along + 0.6, 0.0, rad) * exp(-along * 0.02);
        vA = (0.12 + inBeam * 2.2) * uI * (0.5 + 0.5 * sin(uTime * (0.8 + aR * 2.0) + aR * 60.0));
        gl_PointSize = clamp(0.035 * uPx / -mv.z, 1.0, 10.0);
      }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * smoothstep(0.5, 0.0, d) * vA, 1.0); }`,
  }));
  m.frustumCulled = false; m.userData.u = u;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Dissolve: every lit material in `root` is cut along a world-space front (x < uFront is solid) with
// a noisy, glowing amber edge. One shared uniform drives the whole world materialising.
// ---------------------------------------------------------------------------------------------
export function dissolveUniforms() { return { uFront: { value: -100 } }; }
const patched = new WeakSet();
export function dissolve(root, U) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || patched.has(m) || !(m.isMeshStandardMaterial)) continue;
      patched.add(m);
      m.onBeforeCompile = sh => {
        sh.uniforms.uFront = U.uFront;
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
          .replace("#include <project_vertex>", `#include <project_vertex>
            vec4 wpD = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              wpD = instanceMatrix * wpD;
            #endif
            vWP = (modelMatrix * wpD).xyz;`);
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vWP; uniform float uFront;\n${NOISE}`)
          .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
            float dzN = vnoise(vWP * 2.3) * 0.7 + vnoise(vWP * 9.0) * 0.3;
            float dzV = vWP.x - uFront + dzN * 1.6;
            if (dzV > 0.0) discard;
            float dzE = 1.0 - smoothstep(0.0, 0.42, -dzV);`)
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
            totalEmissiveRadiance += vec3(1.0, 0.52, 0.18) * dzE * 7.0;`);
        m.userData.patch?.(sh);
      };
      m.customProgramCacheKey = () => "kalyon-dissolve" + (m.userData.patchKey || "");
      m.needsUpdate = true;
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Headlight: a soft volumetric cone (two layers) and an anamorphic glare that faces the camera.
// ---------------------------------------------------------------------------------------------
export function beam(len = 70) {
  const g = new THREE.Group();
  const u = { uI: { value: 0 }, uTime: { value: 0 } };
  const layer = (r, k) => {
    const geo = new THREE.ConeGeometry(r, len, 48, 24, true);
    geo.translate(0, -len / 2, 0); geo.rotateZ(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { ...u, uK: { value: k }, uLen: { value: len } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `varying vec3 vN, vV, vL; void main(){ vL = position; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `${NOISE} uniform float uI, uTime, uK, uLen; varying vec3 vN, vV, vL;
        void main(){
          float t = clamp(-vL.x / uLen, 0.0, 1.0);
          float f = abs(dot(normalize(vN), normalize(vV)));
          float a = pow(max(f, 0.0), 1.8) * pow(max(1.0 - t, 0.0), 2.2) * smoothstep(0.0, 0.03, t);
          a *= 0.75 + 0.25 * vnoise(vec3(vL.x * 0.35 - uTime * 0.6, vL.y * 0.8, vL.z * 0.8));
          gl_FragColor = vec4(vec3(1.0, 0.92, 0.78) * a * uK * uI, 1.0);
        }`,
    }));
    m.frustumCulled = false;
    return m;
  };
  g.add(layer(5.5, 0.16), layer(2.4, 0.22));
  g.userData.u = u;
  return g;
}

export function glare(size = 4) {
  const u = { uI: { value: 0 }, uTime: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 4, size), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv - 0.5; vUv.x *= 4.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uI, uTime; varying vec2 vUv;
      void main(){
        float r = length(vUv);
        float core = exp(-r * 9.0) * 2.2 + exp(-r * 4.0) * 0.28;
        float streak = exp(-abs(vUv.y) * 55.0) * exp(-abs(vUv.x) * 0.9) * 0.9;
        float ring = smoothstep(0.02, 0.0, abs(r - 0.38)) * 0.05;
        vec3 c = vec3(1.0, 0.9, 0.75) * core + vec3(0.55, 0.7, 1.0) * streak + vec3(0.6, 0.8, 1.0) * ring;
        float win = (1.0 - smoothstep(0.22, 0.5, abs(vUv.y))) * (1.0 - smoothstep(1.3, 2.0, abs(vUv.x)));
        gl_FragColor = vec4(c * win * uI * (0.96 + 0.04 * sin(uTime * 31.0)), 1.0);
      }`,
  }));
  const wp = new THREE.Vector3();
  m.onBeforeRender = (r, s, cam) => { m.quaternion.copy(cam.quaternion); m.getWorldPosition(wp); const k = THREE.MathUtils.clamp(wp.distanceTo(cam.position) / 22, 0.22, 1.0); m.scale.setScalar(k); };
  m.frustumCulled = false; m.renderOrder = 5;
  m.userData.u = u;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Text atlas: labels drawn into a canvas grid, for instanced text in the tunnel and elsewhere.
// ---------------------------------------------------------------------------------------------
export async function fontsReady() {
  try {
    await Promise.all(['600 40px "JetBrains Mono"', '700 40px "Rajdhani"', '600 40px "Rajdhani"', '700 40px "Rajdhani" ', '600 40px "Barlow"'].map(f => document.fonts.load(f, "AZ09:")));
    await document.fonts.load('700 40px "Rajdhani"', "देहरादून");
  } catch { /* fonts are a nicety */ }
}

export function textAtlas(labels, { cols = 4, rows = 16, cw = 512, ch = 64 } = {}) {
  const cv = document.createElement("canvas"); cv.width = cols * cw; cv.height = rows * ch;
  const g = cv.getContext("2d");
  g.textBaseline = "middle";
  labels.slice(0, cols * rows).forEach((lab, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    const [main, sub] = Array.isArray(lab) ? lab : [lab, ""];
    g.fillStyle = "#fff";
    g.font = '600 38px "JetBrains Mono", monospace';
    g.fillText(main, x + 10, y + ch / 2 + 1);
    if (sub) { const w = g.measureText(main).width; g.globalAlpha = 0.55; g.font = '600 26px "JetBrains Mono", monospace'; g.fillText(sub, x + 26 + w, y + ch / 2 + 3); g.globalAlpha = 1; }
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  return { tex, cols, rows, n: Math.min(labels.length, cols * rows) };
}

// ---------------------------------------------------------------------------------------------
// The timetable tunnel: labels from the real timetables stream along the walls of a light tube,
// with speed streaks and rings. Positions are computed in the vertex shader; one draw call each.
// ---------------------------------------------------------------------------------------------
export function tunnel({ count = 900, streaks = 700, len = 260, radius = 7 } = {}) {
  const g = new THREE.Group();
  const u = { uT: { value: 0 }, uLen: { value: len }, uR: { value: radius }, uI: { value: 1 }, uTex: { value: null }, uCols: { value: 4 }, uRows: { value: 16 }, uN: { value: 1 }, uTime: { value: 0 } };
  const quad = new THREE.PlaneGeometry(1, 1);
  const lab = new THREE.InstancedBufferGeometry();
  lab.index = quad.index; lab.setAttribute("position", quad.attributes.position); lab.setAttribute("uv", quad.attributes.uv);
  const A = new Float32Array(count), Z = new Float32Array(count), K = new Float32Array(count), S = new Float32Array(count), H = new Float32Array(count);
  for (let i = 0; i < count; i++) { A[i] = Math.random() * Math.PI * 2; Z[i] = Math.random() * len; K[i] = Math.random(); S[i] = 0.55 + Math.random() * 0.9; H[i] = Math.random(); }
  lab.setAttribute("aA", new THREE.InstancedBufferAttribute(A, 1)); lab.setAttribute("aZ", new THREE.InstancedBufferAttribute(Z, 1));
  lab.setAttribute("aK", new THREE.InstancedBufferAttribute(K, 1)); lab.setAttribute("aS", new THREE.InstancedBufferAttribute(S, 1)); lab.setAttribute("aH", new THREE.InstancedBufferAttribute(H, 1));
  lab.instanceCount = count;
  const labels = new THREE.Mesh(lab, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `uniform float uT, uLen, uR, uCols, uRows, uN; attribute float aA, aZ, aK, aS, aH; varying vec2 vUv; varying float vA, vH;
      void main(){
        float z = mod(aZ - uT * (0.8 + aS * 0.5), uLen);
        float r = uR * (0.82 + aH * 0.2);
        vec3 c = vec3(cos(aA) * r, sin(aA) * r, -z);
        vec3 X = vec3(0.0, 0.0, 1.0), Y = vec3(-sin(aA), cos(aA), 0.0);
        float hgt = 0.38 * aS, w = hgt * 8.0;
        vec3 p = c + X * position.x * w + Y * position.y * hgt;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        float cell = floor(aK * uN);
        vec2 o = vec2(mod(cell, uCols), uRows - 1.0 - floor(cell / uCols));
        vUv = (o + uv) / vec2(uCols, uRows);
        vA = smoothstep(uLen, uLen * 0.5, z) * smoothstep(1.5, 9.0, z);
        vH = aH;
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uI; varying vec2 vUv; varying float vA, vH;
      void main(){
        float t = texture2D(uTex, vUv).r;
        vec3 col = vH < 0.14 ? vec3(1.0, 0.72, 0.12) * 2.4 : vH < 0.2 ? vec3(1.0, 0.32, 0.22) * 2.0 : vec3(1.0, 0.94, 0.86) * 1.25;
        gl_FragColor = vec4(col * t * vA * uI, 1.0);
      }`,
  }));
  labels.frustumCulled = false;
  g.add(labels);

  const st = new THREE.InstancedBufferGeometry();
  st.index = quad.index; st.setAttribute("position", quad.attributes.position); st.setAttribute("uv", quad.attributes.uv);
  const A2 = new Float32Array(streaks), Z2 = new Float32Array(streaks), L2 = new Float32Array(streaks), R2 = new Float32Array(streaks);
  for (let i = 0; i < streaks; i++) { A2[i] = Math.random() * Math.PI * 2; Z2[i] = Math.random() * len; L2[i] = 4 + Math.random() * 18; R2[i] = Math.random(); }
  st.setAttribute("aA", new THREE.InstancedBufferAttribute(A2, 1)); st.setAttribute("aZ", new THREE.InstancedBufferAttribute(Z2, 1));
  st.setAttribute("aL", new THREE.InstancedBufferAttribute(L2, 1)); st.setAttribute("aR", new THREE.InstancedBufferAttribute(R2, 1));
  st.instanceCount = streaks;
  const streak = new THREE.Mesh(st, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `uniform float uT, uLen, uR; attribute float aA, aZ, aL, aR; varying vec2 vUv; varying float vA, vR;
      void main(){
        float z = mod(aZ - uT * (2.2 + aR * 1.6), uLen);
        float r = uR * (0.35 + aR * 0.62);
        vec3 c = vec3(cos(aA) * r, sin(aA) * r, -z);
        vec3 X = vec3(0.0, 0.0, 1.0), Y = vec3(-sin(aA), cos(aA), 0.0);
        vec3 p = c + X * position.x * aL + Y * position.y * 0.035;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        vUv = uv; vR = aR;
        vA = smoothstep(uLen, uLen * 0.4, z) * smoothstep(0.0, 6.0, z);
      }`,
    fragmentShader: `uniform float uI; varying vec2 vUv; varying float vA, vR;
      void main(){
        float a = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.4, vUv.x);
        vec3 col = vR < 0.25 ? vec3(1.0, 0.7, 0.2) : vR < 0.33 ? vec3(0.5, 0.75, 1.0) : vec3(1.0, 0.95, 0.88);
        gl_FragColor = vec4(col * a * vA * uI * 1.4, 1.0);
      }`,
  }));
  streak.frustumCulled = false;
  g.add(streak);

  // rings of light passing every 26 m, and the glow at the vanishing point
  const ringGeo = new THREE.InstancedBufferGeometry();
  const tor = new THREE.TorusGeometry(radius * 1.02, 0.02, 4, 96);
  ringGeo.index = tor.index; ringGeo.setAttribute("position", tor.attributes.position);
  const RZ = new Float32Array(10).map((_, i) => i * (len / 10));
  ringGeo.setAttribute("aZ", new THREE.InstancedBufferAttribute(RZ, 1)); ringGeo.instanceCount = 10;
  const rings = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float uT, uLen; attribute float aZ; varying float vA;
      void main(){ float z = mod(aZ - uT * 1.1, uLen); vec3 p = position + vec3(0.0, 0.0, -z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); vA = smoothstep(uLen, uLen * 0.3, z) * smoothstep(0.0, 10.0, z); }`,
    fragmentShader: `uniform float uI; varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0, 0.78, 0.4) * vA * uI * 0.9, 1.0); }`,
  }));
  rings.frustumCulled = false;
  g.add(rings);
  const end = glare(26); end.position.z = -len * 0.7; end.userData.u.uI.value = 0.5; g.add(end);
  g.userData.u = u; g.userData.end = end;
  g.userData.setAtlas = at => { u.uTex.value?.dispose?.(); u.uTex.value = at.tex; u.uCols.value = at.cols; u.uRows.value = at.rows; u.uN.value = at.n; };
  return g;
}

// ---------------------------------------------------------------------------------------------
// Signage drawn from the journey: the yellow station name board and the coach route boards.
// ---------------------------------------------------------------------------------------------
function canvasPlane(w, h, px, draw, emissive = 0.25) {
  const cv = document.createElement("canvas"); cv.width = px; cv.height = Math.round(px * h / w);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.userData.redraw = (...a) => { draw(cv.getContext("2d"), cv.width, cv.height, ...a); tex.needsUpdate = true; };
  return m;
}

// Indian Railways style: yellow board, black lettering, Hindi above English.
export function stationBoard() {
  const g = new THREE.Group();
  const face = canvasPlane(3.6, 1.15, 1024, (c, W, H, en, hi) => {
    c.fillStyle = "#f2c81f"; c.fillRect(0, 0, W, H);
    c.strokeStyle = "#141210"; c.lineWidth = 10; c.strokeRect(14, 14, W - 28, H - 28);
    c.fillStyle = "#141210"; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = `700 ${Math.round(H * 0.34)}px "Rajdhani", sans-serif`; c.fillText(hi || "", W / 2, H * 0.36);
    c.font = `700 ${Math.round(H * 0.3)}px "Rajdhani", sans-serif`; c.fillText((en || "").toUpperCase(), W / 2, H * 0.72);
  }, 0.35);
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.7, 1.25, 0.08), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6, metalness: 0.5 }));
  back.position.z = -0.05; face.position.z = -0.005;
  g.add(back, face);
  for (const x of [-1.4, 1.4]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x5a5e66, metalness: 0.9, roughness: 0.4 })); rod.position.set(x, 1.15, -0.05); g.add(rod); }
  g.userData.set = (en, hi) => face.userData.redraw(en, hi);
  return g;
}

// The route board on a coach side: train number and name, both scripts. Returns a plane to place.
export function routeBoard() {
  const m = canvasPlane(5.2, 0.42, 1024, (c, W, H, num, en, hi) => {
    c.fillStyle = "#1b1d22"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#f4efe4"; c.textBaseline = "middle";
    c.font = `700 ${Math.round(H * 0.62)}px "Rajdhani", sans-serif`; c.fillText(num || "", 18, H * 0.54);
    const w = c.measureText(num || "").width;
    c.font = `600 ${Math.round(H * 0.5)}px "Rajdhani", sans-serif`; c.fillText((en || "").toUpperCase(), 40 + w, H * 0.56);
    const w2 = c.measureText((en || "").toUpperCase()).width;
    c.globalAlpha = 0.8; c.font = `600 ${Math.round(H * 0.5)}px "Rajdhani", sans-serif`; c.fillText(hi || "", 64 + w + w2, H * 0.56); c.globalAlpha = 1;
  }, 0.6);
  return m;
}

// Decal text (for the locomotive class marking).
export function decal(text, color = "#c8261f", w = 2.6, h = 0.5) {
  const m = canvasPlane(w, h, 512, (c, W, H) => { c.clearRect(0, 0, W, H); c.fillStyle = color; c.font = `700 ${Math.round(H * 0.8)}px "Rajdhani", sans-serif`; c.textBaseline = "middle"; c.fillText(text, 6, H * 0.55); }, 0.05);
  m.material.transparent = true; m.material.depthWrite = false; m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2;
  m.userData.redraw();
  return m;
}

// The warm light behind a door as it opens: a soft vestibule glow.
export function doorway(w, h) {
  const u = { uOpen: { value: 0 }, uTime: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uOpen, uTime; varying vec2 vUv;
      void main(){
        float v = smoothstep(0.0, 0.25, vUv.y) * 0.4 + 0.6;
        float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        vec3 c = mix(vec3(0.9, 0.6, 0.32), vec3(1.0, 0.88, 0.7), vUv.y) * (1.8 + 0.6 * smoothstep(0.75, 1.0, vUv.y));
        gl_FragColor = vec4(c * v * mix(0.6, 1.0, edge) * uOpen, uOpen);
      }`,
  }));
  m.userData.u = u;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Interior mapping: the coach glazing shows a lit chair-car behind the glass with real parallax
// (ceiling light strips, the far wall and its windows, rows of seats and some passengers), traced per
// pixel in world space. Coaches sit along +X, sides at z = ±1.62; `layout` gives the seat geometry.
// ---------------------------------------------------------------------------------------------
export function interiorGlass(mat, { floor, ceil, pitch, coach0, coachPitch }) {
  mat.userData.patchKey = "-glass";
  mat.userData.patch = sh => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      {
        vec3 ro = vWP, rd = normalize(vWP - cameraPosition);
        float side = sign(vWP.z);
        float FL = ${floor.toFixed(3)}, CE = ${ceil.toFixed(3)};
        float ci = floor((ro.x - ${coach0.toFixed(3)} + ${(coachPitch / 2).toFixed(3)}) / ${coachPitch.toFixed(3)});
        float cx = ${coach0.toFixed(3)} + ci * ${coachPitch.toFixed(3)};
        vec3 room = vec3(0.0);
        if (rd.z * side < -0.02) {
          float tW = (-side * 1.5 - ro.z) / rd.z;
          float tY = rd.y < 0.0 ? (FL - ro.y) / rd.y : (CE - ro.y) / rd.y;
          float tH = min(tW, tY);
          vec3 hp = ro + rd * tH;
          if (tW < tY) {           // far wall: warm panels, its windows dark
            float wx = fract((hp.x - cx + 10.11) / ${pitch.toFixed(3)});
            float isWin = step(wx, 0.6) * step(FL + 0.75, hp.y) * step(hp.y, FL + 1.6);
            room = mix(vec3(0.3, 0.22, 0.14), vec3(0.01, 0.014, 0.025), isWin) * (0.4 + 0.6 * smoothstep(FL, CE, hp.y));
            room *= 1.0 - 0.75 * step(CE - 0.62, hp.y) * step(hp.y, CE - 0.5);   // luggage rack shadow line
          } else if (rd.y > 0.0) { // ceiling with its light strips
            float lx = fract((hp.x - cx + 9.85) / 2.1);
            float strip = step(lx, 0.62) * (1.0 - smoothstep(0.08, 0.14, abs(hp.z)));
            room = vec3(0.5, 0.42, 0.32) * 0.75 + vec3(3.0, 2.5, 1.9) * strip;
          } else {
            room = vec3(0.09, 0.08, 0.075);
          }
          // seats and passengers: march the ray through the coach, first solid wins
          for (int i = 1; i <= 9; i++) {
            float t = tH * float(i) / 10.0;
            vec3 q = ro + rd * t;
            float az = abs(q.z);
            float rx = mod(q.x - cx + 9.2 + 0.25, 2.1);
            float row = floor((q.x - cx + 9.2 + 0.25) / 2.1);
            bool seatZ = az > 0.36 && az < 1.38;
            float sz = mod(az - 0.36, 0.5);                       // position across one seat
            float arch = sqrt(max(sin(clamp(sz / 0.5, 0.0, 1.0) * 3.14159), 0.0));
            float top = FL + 1.05 + 0.22 * arch + 0.2 * step(0.13, sz) * step(sz, 0.37); // rounded back, narrower headrest
            if (seatZ && rx < 0.5 && q.y > FL + 0.42 && q.y < top) {
              float shade = 0.55 + 0.45 * smoothstep(FL + 0.4, FL + 1.3, q.y);
              float edge = smoothstep(0.0, 0.05, sz) * smoothstep(0.5, 0.45, sz);
              float cover = step(top - 0.2, q.y) * step(0.13, sz) * step(sz, 0.37);
              room = mix(mix(vec3(0.008, 0.012, 0.02), vec3(0.03, 0.05, 0.1), edge), vec3(0.16, 0.15, 0.13), cover * 0.6) * shade * (1.0 - 0.55 * t / tH);
              break;
            }
            float seatK = floor(az / 0.5);
            float occ = fract(sin(dot(vec2(row + ci * 17.0, seatK + side * 3.0), vec2(12.9898, 78.233))) * 43758.5453);
            vec3 hc = vec3(mod(q.x - cx + 9.2 + 0.25, 2.1) - 0.05, q.y - (FL + 1.62), az - (seatK * 0.5 + 0.25));
            if (occ > 0.55 && seatZ && length(hc * vec3(1.0, 0.8, 1.0)) < 0.13) { room = vec3(0.025, 0.02, 0.018); break; }
          }
        }
        totalEmissiveRadiance = room * emissive.r;
        diffuseColor.rgb *= 0.15;
      }`);
  };
  mat.needsUpdate = true;
}

// The vestibule seen through the opening door: a small lit box traced in the plane's own space.
export function vestibule(w, h, d) {
  const u = { uOpen: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vO, vC; void main(){ vO = position; vC = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uOpen; varying vec3 vO, vC;
      void main(){
        vec3 rd = normalize(vO - vC);
        float W = ${(w / 2).toFixed(3)}, H = ${(h / 2).toFixed(3)}, D = ${d.toFixed(3)};
        vec3 c = vec3(0.0);
        if (rd.z < -0.01) {
          float tB = (-D - vO.z) / rd.z;
          float tX = rd.x > 0.0 ? (W * 1.6 - vO.x) / rd.x : (-W * 1.6 - vO.x) / rd.x;
          float tY = rd.y > 0.0 ? (H - vO.y) / rd.y : (-H - vO.y) / rd.y;
          float t = min(tB, min(tX, tY));
          vec3 p = vO + rd * t;
          if (t == tB) {           // back wall with the opening into the saloon
            float open = step(abs(p.x - W * 0.5), 0.42) * step(p.y, H * 0.82);
            c = mix(vec3(0.36, 0.3, 0.22), vec3(1.6, 1.25, 0.85), open);
          } else if (t == tY && rd.y > 0.0) {
            c = vec3(0.45, 0.39, 0.3) + vec3(2.2, 1.9, 1.4) * step(abs(p.z + D * 0.5), 0.3) * step(abs(p.x), 0.25);
          } else if (t == tY) {
            c = vec3(0.2, 0.19, 0.18) * (0.6 + 0.4 * smoothstep(-D, 0.0, p.z));
          } else {
            c = vec3(0.4, 0.33, 0.24) * (0.45 + 0.55 * smoothstep(-H, H, p.y));
          }
        }
        gl_FragColor = vec4(c * uOpen, uOpen);
      }`,
  }));
  m.userData.u = u;
  return m;
}
