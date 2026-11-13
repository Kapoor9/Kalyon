// Kalyon home: one three.js world. The opening is the KALYON nameboard standing inside a railway clock
// ring (its hands show the replay clock), with a ribbon of rail track looping around it and a living
// network of stations and lines in the background. Scrolling bursts the logo into particles and
// re-forms it beside the statement; then (round 2) the spiral of section cards.
// Scroll position arrives as a clock T (0 = opening, 1 = statement, 2+ = spiral).
import * as THREE from "three";
import { createWorld, ease, clamp01, seg, lerp } from "../pv/world.js?v=202611131338";
import { makeEnv, sampleSurface, fontsReady } from "../pv/fx.js?v=202611131338";
import { buildSpiral, drawCard, SP } from "./spiral.js?v=202611131338";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RING_R = 3.3;

// ---------------------------------------------------------------------------------------------
// The living network: stations (nodes) joined to their nearest neighbours by thin lines, every node
// drifting on its own slow orbit, with pulses of light running along the lines like trains.
// Node motion is one function used by both the points and the lines, so lines never come apart.
// ---------------------------------------------------------------------------------------------
const DRIFT = `
vec3 drift(vec3 p, vec4 r, float t){
  return p + vec3(sin(t * (0.11 + r.x * 0.12) + r.y * 6.28), sin(t * (0.09 + r.y * 0.1) + r.z * 6.28), sin(t * (0.1 + r.z * 0.1) + r.w * 6.28)) * (0.8 + r.w * 1.4);
}`;
function network(n) {
  const P = [], R = [];
  for (let i = 0; i < n; i++) {
    // a wide shell behind and around the logo, never between the camera and it
    let p;
    do { p = V((Math.random() - 0.5) * 150, (Math.random() - 0.5) * 90, -10 - Math.random() * 80); } while (Math.abs(p.x) < 9 && Math.abs(p.y) < 7 && p.z > -18);
    P.push(p); R.push([Math.random(), Math.random(), Math.random(), Math.random()]);
  }
  const pos = new Float32Array(n * 3), rnd = new Float32Array(n * 4), big = new Float32Array(n);
  P.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); rnd.set(R[i], i * 4); big[i] = Math.random() < 0.12 ? 1 : 0; });
  const u = { uTime: { value: 0 }, uPx: { value: 900 }, uI: { value: 0 }, uWarm: { value: 0 } };
  const ng = new THREE.BufferGeometry();
  ng.setAttribute("position", new THREE.BufferAttribute(pos, 3)); ng.setAttribute("aR", new THREE.BufferAttribute(rnd, 4)); ng.setAttribute("aBig", new THREE.BufferAttribute(big, 1));
  const nodes = new THREE.Points(ng, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `${DRIFT} uniform float uTime, uPx, uI; attribute vec4 aR; attribute float aBig; varying float vA, vBig;
      void main(){ vec3 p = drift(position, aR, uTime); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vBig = aBig; vA = uI * smoothstep(-140.0, -20.0, mv.z) * (0.6 + 0.4 * sin(uTime * (0.6 + aR.x) + aR.y * 30.0));
        gl_PointSize = clamp((aBig > 0.5 ? 0.55 : 0.28) * uPx / -mv.z, 1.0, 16.0); }`,
    fragmentShader: `uniform float uWarm; varying float vA, vBig; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
      vec3 c = vBig > 0.5 ? vec3(1.0, 0.72, 0.28) * 1.8 : mix(vec3(0.45, 0.7, 0.8), vec3(1.0, 0.8, 0.55), uWarm) * 0.9; gl_FragColor = vec4(c * a * a * vA, 1.0); }`,
  }));
  nodes.frustumCulled = false;
  // edges: each node to its three nearest neighbours (no duplicates, no very long lines)
  const seen = new Set(), E = [];
  for (let i = 0; i < n; i++) {
    const near = P.map((q, j) => [j, P[i].distanceToSquared(q)]).filter(x => x[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 3);
    for (const [j, d2] of near) { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (!seen.has(k) && d2 < 26 * 26) { seen.add(k); E.push([i, j]); } }
  }
  const m = E.length, eA = new Float32Array(m * 6), eB = new Float32Array(m * 6), rA = new Float32Array(m * 8), rB = new Float32Array(m * 8), end = new Float32Array(m * 2), ph = new Float32Array(m * 2);
  E.forEach(([i, j], k) => {
    for (const s of [0, 1]) {
      eA.set([P[i].x, P[i].y, P[i].z], (k * 2 + s) * 3); eB.set([P[j].x, P[j].y, P[j].z], (k * 2 + s) * 3);
      rA.set(R[i], (k * 2 + s) * 4); rB.set(R[j], (k * 2 + s) * 4); end[k * 2 + s] = s;
    }
    const p0 = Math.random(); ph[k * 2] = ph[k * 2 + 1] = p0;
  });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.BufferAttribute(eA, 3)); lg.setAttribute("aB", new THREE.BufferAttribute(eB, 3));
  lg.setAttribute("aRA", new THREE.BufferAttribute(rA, 4)); lg.setAttribute("aRB", new THREE.BufferAttribute(rB, 4));
  lg.setAttribute("aEnd", new THREE.BufferAttribute(end, 1)); lg.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
  const lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `${DRIFT} uniform float uTime, uI; attribute vec3 aB; attribute vec4 aRA, aRB; attribute float aEnd, aPh; varying float vT, vPh, vA;
      void main(){ vec3 a = drift(position, aRA, uTime), b = drift(aB, aRB, uTime); vec3 p = mix(a, b, aEnd);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vT = aEnd; vPh = aPh; vA = uI * smoothstep(-140.0, -20.0, mv.z) * smoothstep(26.0, 8.0, distance(a, b)); }`,
    fragmentShader: `uniform float uTime, uWarm; varying float vT, vPh, vA;
      void main(){
        float run = fract(uTime * (0.05 + vPh * 0.08) + vPh * 13.0);
        float dir = step(0.5, fract(vPh * 7.0));
        float at = mix(run, 1.0 - run, dir);
        float pulse = smoothstep(0.07, 0.0, abs(vT - at)) * step(0.55, fract(vPh * 31.0));   // only some lines carry a train
        vec3 base = mix(vec3(0.3, 0.5, 0.58), vec3(0.6, 0.48, 0.32), uWarm) * 0.22;
        gl_FragColor = vec4((base + vec3(1.0, 0.72, 0.3) * pulse * 2.6) * vA, 1.0);
      }`,
  }));
  lines.frustumCulled = false;
  const g = new THREE.Group(); g.add(lines, nodes); g.userData.u = u;
  return g;
}

// ---------------------------------------------------------------------------------------------
// The logo: the yellow KALYON nameboard (Hindi above English, double black border, two posts) standing
// inside a railway clock: an iridescent ring, hour and minute ticks, hands set to the replay clock.
// ---------------------------------------------------------------------------------------------
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function boardFace(w, h) {
  const c = document.createElement("canvas"); c.width = 1400; c.height = Math.round(1400 * h / w);
  const g = c.getContext("2d"), W = c.width, H = c.height;
  // Each line is measured and placed from its left edge, so it sits dead centre and never runs past the border,
  // whatever font the browser falls back to for Devanagari.
  const line = (txt, px, y, spacing) => {
    if ("letterSpacing" in g) g.letterSpacing = `${spacing}px`;
    g.font = `700 ${px}px "Rajdhani", "Noto Sans Devanagari", sans-serif`;
    let w = g.measureText(txt).width - spacing;
    const max = W - 220;
    if (w > max) { px = Math.floor(px * max / w); g.font = `700 ${px}px "Rajdhani", "Noto Sans Devanagari", sans-serif`; w = g.measureText(txt).width - spacing; }
    g.fillText(txt, (W - w) / 2, y);
  };
  const paint = () => {
    g.letterSpacing && (g.letterSpacing = "0px");
    g.fillStyle = "#ffc21a"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#15130a"; g.lineWidth = 16; g.strokeRect(26, 26, W - 52, H - 52);        // the double border of the site's nameboard
    g.strokeStyle = "#15130a"; g.lineWidth = 4; g.strokeRect(50, 50, W - 100, H - 100);
    g.fillStyle = "#15130a"; g.textAlign = "left"; g.textBaseline = "middle"; g.direction = "ltr";
    line("काल + नियोजन", Math.round(H * 0.26), H * 0.33, 0);
    line("KALYON", Math.round(H * 0.34), H * 0.7, Math.round(H * 0.05));
  };
  paint();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  // Repaint once the web font (with its Devanagari glyphs) has loaded, so the measured widths are the real ones.
  if (document.fonts) {
    const sz = Math.round(H * 0.26);
    Promise.all([document.fonts.load(`700 ${sz}px "Rajdhani"`, "काल नियोजन KALYON"), document.fonts.ready])
      .then(() => { paint(); t.needsUpdate = true; }).catch(() => {});
  }
  return t;
}
function logo() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3e45, metalness: 0.85, roughness: 0.32 });
  const ringMat = new THREE.MeshPhysicalMaterial({ color: 0xe9e2d6, metalness: 1, roughness: 0.16, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [250, 950], envMapIntensity: 1.6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.17, 40, 200), ringMat); g.add(ring);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(RING_R - 0.27, 0.025, 12, 200), new THREE.MeshStandardMaterial({ color: 0x1a1408, emissive: 0xffb43a, emissiveIntensity: 1.6, roughness: 0.4 })); g.add(lip);
  // the dial: a dark glass face with faint rings, so the clock has depth
  const dial = new THREE.Mesh(new THREE.CircleGeometry(RING_R - 0.2, 96), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uO: { value: 1 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uO; varying vec2 vP; void main(){ float r = length(vP) / ${(RING_R - 0.2).toFixed(2)};
      float rings = smoothstep(0.012, 0.0, abs(fract(r * 6.0) - 0.5) - 0.48) * 0.4;
      vec3 c = mix(vec3(0.05, 0.05, 0.06), vec3(0.015, 0.016, 0.02), r) + vec3(0.5, 0.42, 0.3) * rings * 0.12;
      gl_FragColor = vec4(c, (0.55 + 0.35 * r) * uO); }`,
  }));
  dial.position.z = -0.42; g.add(dial);
  // ticks
  const tickGold = new THREE.MeshStandardMaterial({ color: 0x2a1d06, emissive: 0xffc24a, emissiveIntensity: 2.2, roughness: 0.3 });
  const tickDim = new THREE.MeshStandardMaterial({ color: 0x8a8478, emissive: 0xd9d0c0, emissiveIntensity: 0.5, roughness: 0.4 });
  const big = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.36, 0.05), tickGold, 12);
  const small = new THREE.InstancedMesh(new THREE.BoxGeometry(0.028, 0.14, 0.03), tickDim, 48);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = V(1, 1, 1);
  let bi = 0, si = 0;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, hour = i % 5 === 0, r = RING_R - (hour ? 0.52 : 0.42);
    Q.setFromAxisAngle(V(0, 0, 1), a);
    M.compose(V(Math.sin(a) * r, Math.cos(a) * r, -0.3), Q.setFromAxisAngle(V(0, 0, 1), -a), S);
    if (hour) big.setMatrixAt(bi++, M); else small.setMatrixAt(si++, M);
  }
  g.add(big, small);
  // hands (behind the board; their tips show around it), and a red sweep hand like a station clock
  const hand = (len, w, mat, z) => { const pv = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.04), mat); m.position.y = len / 2 - 0.25; pv.add(m); pv.position.z = z; g.add(pv); return pv; };
  const handMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c4, metalness: 0.9, roughness: 0.25, emissive: 0xffe2b0, emissiveIntensity: 0.35 });
  const hourH = hand(1.95, 0.11, handMat, -0.24), minH = hand(2.75, 0.07, handMat, -0.2);
  const secMat = new THREE.MeshStandardMaterial({ color: 0x3a0603, emissive: 0xff3b24, emissiveIntensity: 2.4 });
  const secH = hand(2.85, 0.022, secMat, -0.16);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), secMat); disc.position.y = 2.15; disc.position.z = 0.005; secH.add(disc);
  // the nameboard: enamel face, steel body, two posts down to the ring
  const BW = 3.5, BH = 1.72, BD = 0.16;
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRect(BW, BH, 0.1), { depth: BD, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 6 }), steel);
  body.position.z = -BD / 2; g.add(body);
  const faceMat = new THREE.MeshPhysicalMaterial({ map: null, roughness: 0.38, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0xffffff, emissiveIntensity: 0.22, envMapIntensity: 1.1 });
  const faceGeo = new THREE.ShapeGeometry(roundRect(BW - 0.02, BH - 0.02, 0.09), 6);
  const uv = faceGeo.attributes.uv, pa = faceGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pa.getX(i) / BW + 0.5, pa.getY(i) / BH + 0.5);
  const face = new THREE.Mesh(faceGeo, faceMat); face.position.z = BD / 2 + 0.027; g.add(face);
  for (const x of [-1.05, 1.05]) {
    const yTop = -BH / 2, yBot = -Math.sqrt((RING_R - 0.12) ** 2 - x * x);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, yTop - yBot, 16), steel); post.position.set(x, (yTop + yBot) / 2, -0.02); g.add(post);
  }
  g.userData = {
    ring, dial, faceMat,
    setFace(tex) { faceMat.map = tex; faceMat.emissiveMap = tex; faceMat.needsUpdate = true; },
    setTime(min, sec) {                      // replay clock: hours and minutes; the red hand sweeps in real seconds
      hourH.rotation.z = -((min / 60) % 12) / 12 * Math.PI * 2;
      minH.rotation.z = -(min % 60) / 60 * Math.PI * 2;
      secH.rotation.z = -(sec % 60) / 60 * Math.PI * 2;
    },
    mats: [ringMat, lip.material, tickGold, tickDim, handMat, secMat, steel, faceMat],
  };
  return g;
}

// ---------------------------------------------------------------------------------------------
// The ribbon: a short line of rail track (two rails and sleepers) bent into a figure of eight that
// wraps the clock, twisting as it goes. Light runs along the rails like two trains.
// ---------------------------------------------------------------------------------------------
function ribbon() {
  const pts = [];
  for (let i = 0; i < 260; i++) {
    const t = (i / 260) * Math.PI * 2, st = Math.sin(t);
    pts.push(V(4.9 * Math.sin(2 * t) * (st < 0 ? 0.62 : 1), (st > 0 ? 8.3 : 6.2) * st - 2.95, 2.4 * Math.cos(t)));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
  const N = 600, F = curve.computeFrenetFrames(N, true);
  const rail = side => { const q = []; for (let i = 0; i <= N; i++) { const p = curve.getPointAt(i / N); q.push(p.addScaledVector(F.binormals[i % N], side * 0.23)); } return new THREE.CatmullRomCurve3(q, true); };
  const u = { uTime: { value: 0 }, uDraw: { value: 0 }, uI: { value: 1 } };
  const railMat = new THREE.ShaderMaterial({
    uniforms: u, fog: false, transparent: true, depthWrite: true,
    vertexShader: `varying float vU; varying vec3 vN, vV; void main(){ vU = uv.x; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uDraw, uI; varying float vU; varying vec3 vN, vV;
      void main(){
        if (vU > uDraw) discard;
        float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        vec3 a = vec3(1.0, 0.76, 0.26), b = vec3(0.95, 0.32, 0.18), c = vec3(0.55, 0.32, 0.85);
        float k = 0.5 + 0.5 * sin(vU * 6.2831 * 2.0 + 1.0);
        vec3 col = mix(mix(a, b, k), c, smoothstep(0.55, 1.0, sin(vU * 6.2831 + 2.4) * 0.5 + 0.5) * 0.6);
        col *= 0.35 + 0.9 * pow(1.0 - f, 1.5) + 0.25 * f;                     // brighter at the edges, like polished steel
        float t1 = fract(vU - uTime * 0.045), t2 = fract(vU - uTime * 0.045 + 0.5);
        float train = exp(-pow(min(t1, 1.0 - t1) * 34.0, 2.0)) + exp(-pow(min(t2, 1.0 - t2) * 34.0, 2.0));
        float head = smoothstep(0.012, 0.0, abs(vU - uDraw)) * step(uDraw, 0.999);
        gl_FragColor = vec4((col + vec3(1.0, 0.9, 0.7) * (train * 3.0 + head * 4.0)) * uI, uI);
      }`,
  });
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.TubeGeometry(rail(s), 900, 0.038, 8, true), railMat));
  // sleepers
  const len = curve.getLength(), count = Math.floor(len / 0.3);
  const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x24221f, metalness: 0.5, roughness: 0.5, emissive: 0x2a1a08, emissiveIntensity: 1, transparent: true });
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.66, 0.045, 0.11), sleeperMat, count);
  const M = new THREE.Matrix4(), B = new THREE.Matrix4(), along = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / count, k = Math.round(t * N) % N, p = curve.getPointAt(t);
    B.makeBasis(F.binormals[k], F.normals[k], F.tangents[k]).setPosition(p);
    M.copy(B).multiply(new THREE.Matrix4().makeTranslation(0, -0.04, 0));
    sl.setMatrixAt(i, M); along[i] = t;
  }
  sl.geometry.setAttribute("aU", new THREE.InstancedBufferAttribute(along, 1));
  sleeperMat.onBeforeCompile = sh => {
    sh.uniforms.uDraw = u.uDraw;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aU; varying float vSU;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSU = aU;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vSU; uniform float uDraw;").replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (vSU > uDraw) discard;");
  };
  g.add(sl);
  g.userData = { u, sleeperMat };
  return g;
}

// ---------------------------------------------------------------------------------------------
// Burst: points sampled from the logo's own surfaces fly apart and come back together.
// ---------------------------------------------------------------------------------------------
function burstCloud(logoG, n) {
  logoG.updateMatrixWorld(true);
  const { P } = sampleSurface([logoG], n);
  const C = new Float32Array(n * 3), D = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const onBoard = Math.abs(x) < 1.76 && Math.abs(y) < 0.87 && z > 0;
    const hue = Math.atan2(y, x) / 6.2831 + 0.5;
    const col = onBoard ? new THREE.Color(1.0, 0.74, 0.12) : new THREE.Color().setHSL(0.08 + hue * 0.7, 0.55, 0.62);
    C.set([col.r, col.g, col.b], i * 3);
    const d = V(x, y, z * 3 + (Math.random() - 0.5) * 2).normalize().multiplyScalar(0.8 + Math.random() * 2.6);
    D.set([d.x + (Math.random() - 0.5) * 1.6, d.y + (Math.random() - 0.5) * 1.6, d.z + (Math.random() - 0.5) * 1.6, Math.random()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("aCol", new THREE.BufferAttribute(C, 3)); geo.setAttribute("aD", new THREE.BufferAttribute(D, 4));
  const u = { uB: { value: 0 }, uTime: { value: 0 }, uPx: { value: 900 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float uB, uTime, uPx; attribute vec3 aCol; attribute vec4 aD; varying vec3 vC; varying float vA;
      void main(){
        float b = smoothstep(aD.w * 0.25, 1.0, uB);
        vec3 p = position + aD.xyz * b;
        float a = b * (0.35 + aD.w * 0.8); float c = cos(a), s = sin(a); p.xy = mat2(c, -s, s, c) * p.xy;   // a gentle swirl in the logo's own plane
        p += 0.25 * b * vec3(sin(uTime * 0.7 + aD.w * 40.0), cos(uTime * 0.6 + aD.w * 30.0), sin(uTime * 0.5 + aD.w * 20.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vC = aCol * (1.0 + (1.0 - b) * 0.8); vA = smoothstep(0.0, 0.12, uB) * (0.4 + 0.5 * (1.0 - b));
        gl_PointSize = clamp(0.05 * uPx / -mv.z * (0.7 + aD.w), 1.0, 7.0);
      }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC * smoothstep(0.5, 0.0, d) * vA, 1.0); }`,
  }));
  pts.frustumCulled = false; pts.userData.u = u;
  return pts;
}

// Fine sparks drifting round the logo, catching the light.
function motes(n) {
  const P = new Float32Array(n * 3), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = 3 + Math.random() * 9; P.set([Math.cos(a) * r, (Math.random() - 0.5) * 14, Math.sin(a) * r * 0.6 - 2], i * 3); R[i] = Math.random(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("aR", new THREE.BufferAttribute(R, 1));
  const u = { uTime: { value: 0 }, uPx: { value: 900 }, uI: { value: 0 } };
  const m = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float uTime, uPx, uI; attribute float aR; varying float vA, vR;
      void main(){ vec3 p = position; float a = uTime * (0.03 + aR * 0.05); p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz; p.y += sin(uTime * 0.3 + aR * 20.0) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vR = aR;
        vA = uI * (0.3 + 0.7 * pow(max(0.0, 0.5 + 0.5 * sin(uTime * (1.0 + aR * 2.0) + aR * 50.0)), 3.0)); gl_PointSize = clamp(0.045 * uPx / -mv.z, 1.0, 6.0); }`,
    fragmentShader: `varying float vA, vR; void main(){ float d = length(gl_PointCoord - 0.5); vec3 c = mix(vec3(1.0, 0.75, 0.4), vec3(0.6, 0.75, 1.0), step(0.7, vR)); gl_FragColor = vec4(c * smoothstep(0.5, 0.0, d) * vA * 1.4, 1.0); }` }));
  m.frustumCulled = false; m.userData.u = u;
  return m;
}

// ---------------------------------------------------------------------------------------------
export async function createHome(canvas, { mobile = false, reduce = false, sections = [] } = {}) {
  await fontsReady();
  const W = createWorld(canvas, { mobile });
  const { scene, camera, post, renderer } = W;
  scene.environment = makeEnv(renderer);
  renderer.setClearColor(0x05070a, 1);

  const bg = network(mobile ? 150 : 260); scene.add(bg);
  const lg = logo(); lg.userData.setFace(boardFace(3.5, 1.72));
  const holder = new THREE.Group(); holder.add(lg); scene.add(holder);
  const rib = ribbon(); holder.add(rib);
  const burst = burstCloud(lg, mobile ? 9000 : 16000); lg.add(burst);
  const mo = motes(mobile ? 180 : 320); scene.add(mo);
  // light: a soft key from upper left, a warm rim from behind, a cool fill
  const hemi = new THREE.HemisphereLight(0x8aa6c8, 0x1a120a, 0.5); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0dc, 1.3); key.position.set(-6, 8, 10); scene.add(key);
  const rim = new THREE.PointLight(0xffa64a, 34, 30, 1.6); rim.position.set(3, 2, -5); scene.add(rim);
  const cool = new THREE.PointLight(0x6f8cff, 18, 30, 1.6); cool.position.set(-5, -3, 4); scene.add(cool);
  lg.userData.mats.forEach(m => { m.transparent = true; });

  // ----- the spiral of sections -----
  const spi = buildSpiral(sections, { mobile }); scene.add(spi.group);
  const NC = sections.length;
  const imgs = sections.map(sct => { const im = new Image(); im.decoding = "async"; im.src = sct.img; return im; });
  const live = sections.map(() => "");
  const redraw = i => { drawCard(spi.cards[i].userData.canvas, imgs[i], sections[i], i, NC, live[i]); spi.cards[i].userData.tex.needsUpdate = true; };
  imgs.forEach((im, i) => { redraw(i); im.onload = () => redraw(i); });
  const spiralMotes = motes(mobile ? 160 : 300); spiralMotes.scale.set(1.2, (SP.Y0 - (NC - 1) * SP.DY - 8) / -14, 1.2); spiralMotes.position.y = (SP.Y0 - (NC - 1) * SP.DY) / 2; scene.add(spiralMotes);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hoverI = -1, filter = null, fly = null;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpN = new THREE.Vector3();
  // scroll position (0–1) → card position s. The spiral turns continuously but eases off near each card,
  // so every card settles in front for a moment without the motion ever stopping dead.
  const cardOf = T => { const raw = Math.max(0, Math.min(NC - 1, T * (NC - 0.85))); return raw - Math.sin(raw * Math.PI * 2) / (Math.PI * 2) * 0.82; };
  const CROWN = mobile ? 0.5 : 0.4, HERO = mobile ? 0.78 : 1;            // logo size on the spine, and while it forms
  const lift = mobile ? 4.9 : 4.3;                                       // logo height above the card in front
  { const bot = SP.Y0 - (NC - 1) * SP.DY - 9; spiralMotes.scale.set(1.3, (SP.TOP - bot) / 14, 1.3); spiralMotes.position.y = (SP.TOP + bot) / 2; }

  let T = 0, Tt = 0, Tp = 0, F = reduce ? 1 : 0, introAt = -1, paused = false, t0 = performance.now(), last = t0, raf = 0;
  let mx = 0, my = 0, smx = 0, smy = 0, clockMin = 420, vel = 0, spread = 0, forcedF = null, wantIntro = false, frames = 0;
  addEventListener("pointermove", e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  const setPx = () => { const f = W.size.H * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2); bg.userData.u.uPx.value = f; burst.userData.u.uPx.value = f; mo.userData.u.uPx.value = f; spiralMotes.userData.u.uPx.value = f; };
  const Q = new THREE.Quaternion();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (paused) { last = now; return; }
    const dt = Math.min(0.05, Math.max(1e-3, (now - last) / 1000)); last = now;
    const time = (now - t0) / 1000;
    W.govern(dt);
    // the opening's clock starts only once a few frames have drawn, so a slow first frame cannot eat into it
    if (wantIntro && introAt < 0 && ++frames > 3) introAt = now;
    if (introAt >= 0 && F < 1) F = Math.min(1, (now - introAt) / 5600);
    if (forcedF !== null) F = forcedF;
    T += (Tt - T) * (reduce ? 1 : 1 - Math.exp(-dt * 2.6)); if (Math.abs(Tt - T) < 1e-5) T = Tt;
    smx = lerp(smx, mx, 1 - Math.exp(-dt * 2.5)); smy = lerp(smy, my, 1 - Math.exp(-dt * 2.5));
    // how fast the spiral is turning: the cards fan out and lean while it moves, and close up when it stops
    vel = lerp(vel, (T - Tp) / dt, 1 - Math.exp(-dt * 6)); Tp = T;
    spread = lerp(spread, reduce ? 0 : Math.min(1, Math.abs(vel) * 3.2), 1 - Math.exp(-dt * 3.5));
    const dir = Math.sign(vel) || 1;
    const s = cardOf(T);
    const sNear = Math.max(0, Math.min(NC - 1, Math.round(s)));
    const ySp = SP.Y0 - s * SP.DY;

    // ----- the opening: light condenses into the logo, the track draws itself, the cards unfold -----
    const form = ease.inOut(seg(F, 0.0, 0.5));
    const settle = ease.inOut(seg(F, 0.5, 1));                         // the camera pulls back to the spiral
    const b = 1 - form;
    burst.userData.u.uB.value = b;
    const solid = 1 - smoothBand(b);
    lg.userData.mats.forEach(m => { m.opacity = solid; m.depthWrite = solid > 0.95; });
    lg.userData.dial.material.uniforms.uO.value = solid;
    const crownY = ySp + lift;
    holder.position.set(0, crownY + Math.sin(time * 0.7) * 0.06, 2.3);
    holder.rotation.set((reduce ? 0 : smy * 0.12), (reduce ? 0 : smx * 0.3) + Math.sin(time * 0.25) * 0.05 + vel * 0.6, 0);
    holder.scale.setScalar(lerp(HERO, CROWN, settle));
    const ru = rib.userData.u;
    ru.uDraw.value = ease.inOut(seg(F, 0.12, 0.55)) * (1 - ease.inOut(seg(F, 0.6, 0.92)));   // the track draws in round the clock, then winds back up
    ru.uTime.value = time; ru.uI.value = 1;
    rib.visible = ru.uDraw.value > 0.001;
    rib.userData.sleeperMat.opacity = 1;
    lg.userData.setTime(clockMin, time);
    // background: wakes with the opening, turns slowly, follows the camera down
    const bu = bg.userData.u; bu.uTime.value = time; bu.uI.value = ease.out(seg(F, 0.1, 0.9)); bu.uWarm.value = 0.25 + spread * 0.5;
    bg.rotation.y = time * 0.008 + T * 0.6; bg.rotation.x = T * 0.1;
    mo.position.y = crownY - 2; mo.userData.u.uTime.value = time; mo.userData.u.uI.value = ease.out(seg(F, 0.3, 1));
    burst.userData.u.uTime.value = time;

    // ----- the spiral: the card in front faces the camera; the others wrap round the spine -----
    spi.group.rotation.set(0, -s * SP.AST + (reduce ? 0 : smx * 0.22) + Math.sin(time * 0.2) * 0.03, (reduce ? 0 : -vel * 0.25));
    const su = spi.U; su.uTime.value = time; su.uI.value = ease.smooth(seg(F, 0.42, 0.9));
    spi.mats.forEach(m => { m.opacity = su.uI.value; });
    spi.core.material.opacity = 0.55 * su.uI.value;
    spi.stations.forEach((st, i) => { st.material.opacity = su.uI.value * (0.35 + 0.65 * Math.max(0, 1 - Math.abs(s - i))); });
    spi.cards.forEach((c, i) => {
      const u = c.userData, f = u.face.material.uniforms, focus = Math.max(0, 1 - Math.abs(s - i));
      const un = reduce ? 1 : ease.out(seg(F, 0.45 + i * 0.035, 0.85 + i * 0.035));   // each card swings out from the spine in turn
      u.hover += ((i === hoverI ? 1 : 0) - u.hover) * (1 - Math.exp(-dt * 8));
      f.uTime.value = time; f.uFocus.value = focus; f.uHover.value = u.hover; f.uTurn.value = s;
      f.uDim.value += ((filter && !filter.includes(i) ? 1 : 0) - f.uDim.value) * (1 - Math.exp(-dt * 5));
      f.uI.value = un;
      const off = i - s;                                               // cards away from the front fan out further while moving
      const r = SP.R * (0.12 + 0.88 * un) + spread * (0.6 + Math.min(2, Math.abs(off)) * 0.7);
      const a = u.a + (1 - un) * 2.6;
      c.position.set(Math.sin(a) * r, u.base.y * (1 + spread * 0.08) + Math.sin(time * 0.6 + i) * 0.12, Math.cos(a) * r);
      c.rotation.set((reduce ? 0 : -smy * 0.25 * focus) + Math.sin(time * 0.4 + i) * 0.02 + spread * 0.12 * dir,
        a + (reduce ? 0 : smx * 0.35 * focus) + spread * 0.35 * Math.max(-1, Math.min(1, off)), spread * 0.05 * off);
      c.scale.setScalar((0.35 + 0.65 * un) * (1 + u.hover * 0.04));
      c.visible = un > 0.001;
    });
    spiralMotes.userData.u.uTime.value = time; spiralMotes.userData.u.uI.value = su.uI.value;

    // ----- camera: starts close on the logo, pulls back to frame the card in front, eases out while turning -----
    const portrait = camera.aspect < 1;
    const frac = portrait ? 0.84 : 0.42;
    const dist = Math.max(12.5, SP.CW / (frac * 2 * Math.tan(THREE.MathUtils.degToRad(19)) * camera.aspect)) * (1 + spread * 0.22);
    const heroPos = tmpA.set(0, crownY + 0.2, 2.3 + (portrait ? 27 : 19));
    const spPos = tmpB.set((reduce ? 0 : smx * 1.2), ySp + 0.9 - (reduce ? 0 : smy * 0.7), SP.R + dist);
    camPos.lerpVectors(heroPos, spPos, settle);
    camLook.set(0, lerp(crownY, ySp + 0.35, settle), lerp(2.3, SP.R * 0.4, settle));
    if (fly) {
      const e = ease.inOut(clamp01((now - fly.t0) / fly.ms));
      const c = spi.cards[fly.i]; c.updateMatrixWorld(); c.getWorldPosition(tmpA); tmpN.set(0, 0, 1).applyQuaternion(c.getWorldQuaternion(Q));
      camPos.lerp(tmpB.copy(tmpA).addScaledVector(tmpN, 1.6), e);
      camLook.lerp(tmpA, e);
      fly.e = e;
      if (e >= 1 && !fly.done) { fly.done = true; fly.resolve(); }
    }
    camera.position.copy(camPos); camera.lookAt(camLook);
    if (camera.fov !== 38) { camera.fov = 38; camera.updateProjectionMatrix(); setPx(); }
    bg.position.y = camera.position.y * 0.85;
    stageState.s = s; stageState.near = sNear; stageState.ready = F > 0.85;

    post.exposure = lerp(0.15, 1, ease.out(seg(F, 0, 0.4))) * (fly ? 1 - ease.in(seg(fly.e || 0, 0.55, 1)) : 1);
    post.bloomK = 0.72; post.threshold = 0.95; post.ca = 0.0028 + b * 0.004 + spread * 0.003; post.vig = 1; post.flash = 0; post.grain = 0.04;
    W.render(time);
  }
  function smoothBand(b) { return ease.smooth(seg(b, 0.04, 0.3)); }
  const stageState = { s: 0, near: 0, ready: false };
  setPx();
  // compile every shader before the first frame so the opening starts smoothly
  try { await renderer.compileAsync?.(scene, camera); } catch (e) { /* compiled on first use instead */ }
  raf = requestAnimationFrame(frame);

  return {
    world: W,
    setT(v) { Tt = Math.max(0, v); if (reduce) T = Tt; },
    jump(v) { Tt = T = Math.max(0, v); },
    get T() { return T; },
    get F() { return F; },
    forceF(v) { forcedF = v; if (v === null) F = 1; },   // for screenshots of the opening
    intro() { if (F < 1) wantIntro = true; },
    skip() { F = 1; },
    setClock(min) { clockMin = min; },
    get state() { return stageState; },
    setLive(i, text) { if (live[i] === text) return; live[i] = text; redraw(i); },
    setFilter(list) { filter = list; },
    // which card is under the pointer (client pixels), or -1
    pick(x, y) {
      if (F < 0.85 || fly) return -1;
      const r = canvas.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(spi.faces, false)[0];
      return hit ? hit.object.userData.i : -1;
    },
    hover(i) { hoverI = i; },
    // fly the camera into card i; resolves when the screen has gone dark
    fly(i) { return new Promise(res => { if (reduce) { res(); return; } fly = { i, t0: performance.now(), ms: 950, resolve: res }; }); },
    land() { fly = null; },
    pause() { paused = true; }, resume() { paused = false; },
    dispose() { cancelAnimationFrame(raf); },
  };
}
