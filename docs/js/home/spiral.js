// The spiral of sections: a spine (a rail track coiling down a column of iridescent glass rings) with
// the nine sections as glass cards orbiting it, each joined to the spine by a thread of light that
// carries pulses outward. Scrolling turns the spiral and brings each card to the front.
import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// DY: drop between cards · AST: turn between cards (about 41°, so the neighbours show either side) · R: orbit radius
export const SP = { DY: 4.2, Y0: 0, AST: 0.72, R: 7.6, CW: 6.2, CH: 3.875, TOP: 4.6 };

function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}

// ---------------------------------------------------------------------------------------------
// Card face: the section's preview under glass. The picture refracts a little with the viewing
// angle, the rim picks up an iridescent sheen, and a band of light sweeps across as the card turns.
// ---------------------------------------------------------------------------------------------
function faceMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uTime: { value: 0 }, uHover: { value: 0 }, uDim: { value: 0 }, uFocus: { value: 0 }, uTurn: { value: 0 }, uI: { value: 1 } },
    transparent: true, fog: false,
    vertexShader: `varying vec2 vUv; varying vec3 vN, vV;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D map; uniform float uTime, uHover, uDim, uFocus, uTurn, uI; varying vec2 vUv; varying vec3 vN, vV;
      vec3 rainbow(float t){ return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
      void main(){
        vec3 n = normalize(vN), v = normalize(vV);
        float f = clamp(dot(n, v), 0.0, 1.0);
        vec2 e = min(vUv, 1.0 - vUv);
        float edge = 1.0 - smoothstep(0.0, 0.07, min(e.x, e.y * 1.6));                 // the glass bevel near the rim
        vec2 bend = (v.xy - n.xy) * 0.03 * (0.4 + edge * 2.0);                          // refraction: the picture shifts with the angle
        vec3 c;
        c.r = texture2D(map, vUv + bend * 1.0).r;
        c.g = texture2D(map, vUv + bend * 1.25).g;
        c.b = texture2D(map, vUv + bend * 1.5).b;
        c *= mix(0.42, 1.0, uFocus) * (1.0 + uHover * 0.25) * (1.0 - uDim * 0.75);
        float sx = (vUv.x + vUv.y * 0.6 - fract(uTurn * 0.35 + uTime * 0.04) * 2.6 + 0.5) * 9.0;   // squared by hand: pow() of a negative is undefined on some GPUs
        float sweep = exp(-sx * sx) * 0.04;
        vec3 sheen = rainbow(f * 1.4 + vUv.x * 0.5 + uTime * 0.02) * (pow(1.0 - f, 2.0) * 0.45 + edge * 0.26);
        c += sheen * (0.6 + uHover * 0.8) + sweep * (1.0 - uDim);
        c += vec3(1.0, 0.85, 0.55) * edge * uHover * 0.5;
        gl_FragColor = vec4(c * uI, uI);
      }`,
  });
}

// The picture on each card: the section's screenshot, darkened, with its title in both scripts.
export function cardCanvas() { const c = document.createElement("canvas"); c.width = 1024; c.height = 640; return c; }
export function drawCard(c, img, s, i, n, live) {
  const g = c.getContext("2d"), W = c.width, H = c.height;
  g.fillStyle = "#07090c"; g.fillRect(0, 0, W, H);
  if (img?.complete && img.naturalWidth) {
    // a soft-focus copy (drawn small, then scaled up) so the page's own text does not fight the title
    const sm = drawCard.sm || (drawCard.sm = Object.assign(document.createElement("canvas"), { width: 192, height: 120 }));
    const sg = sm.getContext("2d"); sg.drawImage(img, 0, 0, sm.width, sm.height);
    g.imageSmoothingQuality = "high"; g.globalAlpha = 0.95; g.drawImage(sm, 0, 0, W, H); g.globalAlpha = 1;
  }
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "rgba(5,7,10,.45)"); gr.addColorStop(0.5, "rgba(5,7,10,.62)"); gr.addColorStop(1, "rgba(5,7,10,.88)");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W / 2, H * 0.48, 10, W / 2, H * 0.48, W * 0.55); rg.addColorStop(0, "rgba(5,7,10,.55)"); rg.addColorStop(1, "rgba(5,7,10,0)");
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#ffc21a"; g.font = `700 34px "Rajdhani", sans-serif`; g.fillText(s.hi, W / 2, H * 0.3);
  g.fillStyle = "#f6f1e7"; let size = 104; g.font = `700 ${size}px "Rajdhani", sans-serif`;
  if ("letterSpacing" in g) g.letterSpacing = "4px";
  while (g.measureText(s.title.toUpperCase()).width > W - 110 && size > 56) { size -= 4; g.font = `700 ${size}px "Rajdhani", sans-serif`; }
  g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 24;
  g.fillText(s.title.toUpperCase(), W / 2, H * 0.46);
  g.shadowBlur = 0; if ("letterSpacing" in g) g.letterSpacing = "0px";
  g.fillStyle = "rgba(246,241,231,.82)"; g.font = `500 25px "JetBrains Mono", monospace`; g.fillText(s.desc, W / 2, H * 0.61);
  g.textAlign = "left"; g.fillStyle = "rgba(246,241,231,.6)"; g.font = `500 22px "JetBrains Mono", monospace`;
  g.fillText(`${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`, 70, H - 58);
  if (live) { g.textAlign = "right"; g.fillStyle = "#ffc21a"; g.fillText(live.toUpperCase(), W - 70, H - 58); }
  g.textAlign = "left"; g.fillStyle = "rgba(246,241,231,.5)"; g.font = `500 20px "JetBrains Mono", monospace`; g.fillText("KALYON", 70, 60);
  g.textAlign = "right"; g.fillText("ENTER →", W - 70, 60);
}

// A coil of rail track (two rails and sleepers) around the spine's axis.
function coil(top, bottom, radius, turnsPer, mats) {
  const pts = [], steps = 900;
  for (let i = 0; i <= steps; i++) { const t = i / steps, y = top + (bottom - top) * t, a = (top - y) / turnsPer * Math.PI * 2; pts.push(V(Math.cos(a) * radius, y, Math.sin(a) * radius)); }
  const curve = new THREE.CatmullRomCurve3(pts), N = 1400, F = curve.computeFrenetFrames(N, false);
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const q = []; for (let i = 0; i <= N; i++) { const p = curve.getPointAt(i / N); const out = V(p.x, 0, p.z).normalize(); q.push(p.add(out.multiplyScalar(side * 0.2))); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(q), 2400, 0.034, 6, false), mats.rail));
  }
  const len = curve.getLength(), count = Math.floor(len / 0.32), M = new THREE.Matrix4();
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.045, 0.1), mats.sleeper, count);
  for (let i = 0; i < count; i++) {
    const t = i / count, p = curve.getPointAt(t), tan = curve.getTangentAt(t), out = V(p.x, 0, p.z).normalize(), up = new THREE.Vector3().crossVectors(tan, out).normalize();
    M.makeBasis(out, up, tan).setPosition(p.x, p.y - 0.04, p.z); sl.setMatrixAt(i, M);
  }
  g.add(sl);
  return g;
}

export function buildSpiral(sections, { mobile = false } = {}) {
  const n = sections.length, { DY, Y0, AST, R, CW, CH, TOP } = SP;
  const bottom = Y0 - (n - 1) * DY - 9;
  const g = new THREE.Group();                 // the whole spiral turns as one
  const U = { uTime: { value: 0 }, uI: { value: 0 } };

  // spine: glass rings stacked down the axis, slightly tilted so they catch the light differently
  const ringMat = new THREE.MeshPhysicalMaterial({ color: 0xcfd6e6, metalness: 1, roughness: 0.14, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 1100], envMapIntensity: 1.5, transparent: true });
  const count = Math.floor((TOP - bottom) / 1.15);
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(0.62, 0.17, 18, 48), ringMat, count);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    E.set(Math.PI / 2 + Math.sin(i * 1.7) * 0.5, i * 0.8, Math.cos(i * 1.3) * 0.5); Q.setFromEuler(E);
    const s = 0.75 + 0.45 * Math.abs(Math.sin(i * 0.9));
    M.compose(V(Math.sin(i * 2.1) * 0.18, TOP - i * 1.15, Math.cos(i * 2.1) * 0.18), Q, V(s, s, s)); rings.setMatrixAt(i, M);
  }
  g.add(rings);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, TOP - bottom, 8, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.15, 0.55), transparent: true, opacity: 0.55, fog: false }));
  core.position.y = (TOP + bottom) / 2; g.add(core);
  // the coil of track around the spine
  const railMat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, fog: false,
    vertexShader: `varying float vY; varying vec3 vN, vV; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vY = position.y; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uI; varying float vY; varying vec3 vN, vV;
      void main(){ float f = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.74, 0.28), vec3(0.85, 0.36, 0.3), 0.5 + 0.5 * sin(vY * 0.15));
        col *= 0.3 + 0.9 * pow(1.0 - f, 1.4) + 0.25 * f;
        float d = fract(vY * 0.025 + uTime * 0.06) - 0.5; float tr = exp(-d * d * 900.0) * 3.0;
        gl_FragColor = vec4((col + vec3(1.0, 0.9, 0.7) * tr) * uI, uI); }` });
  const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x23211e, metalness: 0.5, roughness: 0.5, emissive: 0x24170a, emissiveIntensity: 1, transparent: true });
  g.add(coil(TOP, bottom, 2.0, 7.0, { rail: railMat, sleeper: sleeperMat }));

  // cards
  const cards = [], faces = [], threads = [], stations = [];
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1e24, metalness: 0.9, roughness: 0.22, iridescence: 0.9, iridescenceIOR: 1.6, iridescenceThicknessRange: [300, 900], envMapIntensity: 1.3, transparent: true });
  const bodyGeo = new THREE.ExtrudeGeometry(roundRect(CW, CH, 0.26), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 8 });
  const faceGeo = new THREE.ShapeGeometry(roundRect(CW - 0.06, CH - 0.06, 0.23), 8);
  { const uv = faceGeo.attributes.uv, pa = faceGeo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pa.getX(i) / CW + 0.5, pa.getY(i) / CH + 0.5); }
  const threadMat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `varying float vT; void main(){ vT = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uI; varying float vT; void main(){ float d = fract(vT - uTime * 0.35) - 0.5; float p = exp(-d * d * 160.0);
      gl_FragColor = vec4(vec3(1.0, 0.75, 0.35) * (0.25 + p * 2.2) * uI * smoothstep(0.0, 0.1, vT) , 1.0); }` });
  sections.forEach((s, i) => {
    const a = i * AST, y = Y0 - i * DY;
    const card = new THREE.Group();
    card.position.set(Math.sin(a) * R, y, Math.cos(a) * R); card.rotation.y = a;
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.position.z = -0.08; card.add(body);
    const canvas = cardCanvas(), tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const face = new THREE.Mesh(faceGeo, faceMaterial(tex)); face.position.z = 0.09; face.userData.i = i; card.add(face);
    card.userData = { canvas, tex, face, base: card.position.clone(), a, hover: 0, tilt: new THREE.Vector2() };
    g.add(card); cards.push(card); faces.push(face);
    // a thread of light from the spine to the back of the card
    const from = V(Math.sin(a) * 2.35, y + 0.6, Math.cos(a) * 2.35), to = V(Math.sin(a) * (R - 0.2), y, Math.cos(a) * (R - 0.2));
    const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).add(V(0, 1.1, 0)), to);
    const th = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.018, 5, false), threadMat);
    // TubeGeometry uv.x runs along the tube; the shader reads uv.y, so swap them
    const uv = th.geometry.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k), uv.getX(k));
    g.add(th); threads.push(th);
    // a station ring on the spine where the thread leaves
    const st = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.03, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.25, 0.55), transparent: true, opacity: 0.8, fog: false }));
    st.rotation.x = Math.PI / 2; st.position.y = y + 0.6; g.add(st); stations.push(st);
  });

  return { group: g, cards, faces, stations, U, mats: [ringMat, bodyMat, sleeperMat], core, bottom };
}
