// Sets for chapters 4–14. Each builder returns a group (or mesh) with a small API. None of them
// computes a time or a number: they draw the strings and values handed to them by passenger.js.
import * as THREE from "three";

const HASH = `
float hh(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hh2(vec2 p){ return vec2(hh(p), hh(p + 17.31)); }
`;
const cv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const ctex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const SERIF = '"Fraunces", Georgia, serif', SANS = '"Barlow", "Inter", sans-serif', DISP = '"Rajdhani", sans-serif', MONO = '"JetBrains Mono", monospace';

// A billboard that only turns about Y (stays upright), for signs and labels.
export function upright(obj) { const v = new THREE.Vector3(); obj.onBeforeRender = (r, s, cam) => { obj.getWorldPosition(v); obj.rotation.set(0, Math.atan2(cam.position.x - v.x, cam.position.z - v.z), 0); }; return obj; }

// ---------------------------------------------------------------------------------------------
// Ch4 · The window seat: the night-berth video on the glass, with water drops that slide and refract.
// ---------------------------------------------------------------------------------------------
export function videoWindow(w, h, src) {
  const video = document.createElement("video");
  Object.assign(video, { src, muted: true, loop: true, playsInline: true, preload: "none", crossOrigin: "anonymous" });
  video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
  const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace;
  const u = { uVid: { value: tex }, uTime: { value: 0 }, uRain: { value: 0.3 }, uI: { value: 1 }, uReady: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
    uniforms: u, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `${HASH} uniform sampler2D uVid; uniform float uTime, uRain, uI, uReady; varying vec2 vUv;
      // sliding drops: some cells carry a drop that runs down, leaving a thin trail
      vec3 sliding(vec2 uv, float t, vec2 cells, float sp){
        vec2 g = uv * cells, id = floor(g), f = fract(g) - 0.5;
        float hs = hh(id), on = step(0.45, hs);
        float ph = fract(t * sp * (0.4 + hs) + hs * 7.0);
        vec2 c = vec2((hh(id + 3.1) - 0.5) * 0.5, 0.42 - ph * 0.84);
        vec2 dv = (f - c) * vec2(1.0, 0.75);
        float r = 0.1 + 0.07 * hh(id + 9.0);
        float m = smoothstep(r, r * 0.55, length(dv)) * on;
        float tr = smoothstep(0.035, 0.0, abs(f.x - c.x)) * step(c.y, f.y) * (1.0 - smoothstep(0.0, 0.45, f.y - c.y)) * on * 0.5;
        return vec3(dv / r * m, max(m, tr));
      }
      vec3 still(vec2 uv, vec2 cells){
        vec2 g = uv * cells, id = floor(g), f = fract(g) - 0.5;
        vec2 c = (hh2(id) - 0.5) * 0.55; float r = 0.08 + 0.16 * hh(id + 1.0);
        vec2 dv = f - c; float m = smoothstep(r, r * 0.5, length(dv)) * step(0.55, hh(id + 5.0));
        return vec3(dv / r * m, m);
      }
      void main(){
        vec2 uv = vUv;
        vec3 a = sliding(uv * vec2(1.6, 1.0), uTime, vec2(9.0, 4.0), 0.18);
        vec3 b = sliding(uv * vec2(1.6, 1.0) + 0.37, uTime * 0.8, vec2(15.0, 7.0), 0.12);
        vec3 c = still(uv * vec2(1.6, 1.0), vec2(26.0, 16.0));
        vec2 off = (a.xy * 0.022 + b.xy * 0.014 + c.xy * 0.01) * uRain;
        float wet = clamp(a.z + b.z * 0.7 + c.z * 0.6, 0.0, 1.0) * uRain;
        vec2 vu = vec2(uv.x, uv.y) - off;
        vec3 col = texture2D(uVid, vu).rgb;
        // condensation blur where there is no drop
        vec3 blur = (texture2D(uVid, vu + vec2(0.006, 0.0)).rgb + texture2D(uVid, vu - vec2(0.006, 0.0)).rgb + texture2D(uVid, vu + vec2(0.0, 0.008)).rgb + texture2D(uVid, vu - vec2(0.0, 0.008)).rgb) * 0.25;
        col = mix(mix(col, blur, 0.55 * uRain), col * 1.25 + 0.02, wet);
        col = mix(vec3(0.015, 0.02, 0.035), col, uReady);
        col += vec3(0.05, 0.035, 0.02) * (1.0 - uv.y) * 0.6;   // a faint warm reflection of the coach
        gl_FragColor = vec4(col * uI, 1.0);
      }`,
  }));
  let playing = false;
  video.addEventListener("playing", () => { u.uReady.value = 1; });
  m.userData = { u, play() { if (playing) return; playing = true; if (video.preload === "none") { video.preload = "auto"; video.load(); } video.play().catch(() => { playing = false; }); }, pause() { if (!playing) return; playing = false; video.pause(); } };
  return m;
}

// ---------------------------------------------------------------------------------------------
// Ch5 · LED dot-matrix destination board. Two text states; the new one wipes in column by column.
// ---------------------------------------------------------------------------------------------
export function ledBoard(w = 2.4, h = 0.43, cols = 224, rows = 40) {
  const mk = () => { const c = cv(cols, rows); const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; return { c, t }; };
  const A = mk(), B = mk();
  const u = { tA: { value: A.t }, tB: { value: B.t }, uMix: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(cols, rows) }, uI: { value: 1 } };
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5, metalness: 0.6 }));
  frame.position.z = -0.03; g.add(frame);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
    uniforms: u, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `${HASH} uniform sampler2D tA, tB; uniform float uMix, uTime, uI; uniform vec2 uRes; varying vec2 vUv;
      void main(){
        vec2 g = vUv * uRes, cell = floor(g), f = fract(g) - 0.5;
        vec2 st = (cell + 0.5) / uRes;
        float a = step(0.45, texture2D(tA, st).r), b = step(0.45, texture2D(tB, st).r);
        float edge = uMix * (uRes.x + 40.0) - 20.0 + (hh(vec2(cell.y, 3.0)) - 0.5) * 14.0;
        float k = step(cell.x, edge);
        float spark = step(abs(cell.x - edge), 2.0) * step(0.6, hh(cell + floor(uTime * 24.0)));
        float lit = max(mix(a, b, k), spark);
        float dot0 = smoothstep(0.44, 0.26, length(f));
        vec3 on = vec3(1.0, 0.5, 0.1) * 3.2, off = vec3(0.05, 0.022, 0.008);
        vec3 c = mix(off, on, lit) * dot0 + vec3(0.01, 0.006, 0.004);
        c *= 0.96 + 0.04 * sin(uTime * 50.0 + cell.y);       // refresh shimmer
        gl_FragColor = vec4(c * uI, 1.0);
      }`,
  }));
  g.add(face);
  const draw = (c, lines) => {
    const x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, cols, rows);
    x.fillStyle = "#fff"; x.textBaseline = "middle"; x.textAlign = "center";
    x.font = `700 ${Math.round(rows * 0.44)}px ${DISP}`;
    const fit = (t, y) => { let s = rows * 0.44; while (x.measureText(t).width > cols - 6 && s > 8) { s -= 1; x.font = `700 ${s}px ${DISP}`; } x.fillText(t, cols / 2, y); x.font = `700 ${Math.round(rows * 0.44)}px ${DISP}`; };
    fit(lines[0] || "", rows * 0.27); fit(lines[1] || "", rows * 0.76);
  };
  let key = "";
  g.userData = { u, set(led) { const k = JSON.stringify(led); if (k === key) return; key = k; draw(A.c, led.old); draw(B.c, led.now); A.t.needsUpdate = B.t.needsUpdate = true; } };
  return g;
}

// ---------------------------------------------------------------------------------------------
// Ch6 · Boarding pass as a 3D card: printed face, holographic foil, a back, and a stub that tears.
// ---------------------------------------------------------------------------------------------
const PASS_W = 0.62, PASS_H = 0.36, STUB_W = 0.19;
function holoMat(map, foil) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, foil: { value: foil }, uTime: { value: 0 }, uI: { value: 1 } }, fog: false, side: THREE.FrontSide,
    vertexShader: `varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `${HASH} uniform sampler2D map, foil; uniform float uTime, uI; varying vec2 vUv; varying vec3 vN, vV;
      vec3 rainbow(float t){ return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
      void main(){
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.5) discard;
        float fm = texture2D(foil, vUv).r;
        float ang = dot(vN, vV);
        vec3 holo = rainbow(ang * 1.6 + vUv.x * 1.2 - vUv.y * 0.6 + uTime * 0.05);
        float sp = step(0.985, hh(floor(vUv * vec2(260.0, 150.0)) + floor(ang * 30.0))) * 1.5;
        vec3 col = c.rgb * (0.82 + 0.25 * ang);
        col = mix(col, col * 0.4 + holo * 0.9 + sp, fm * 0.75);
        col += pow(1.0 - ang, 3.0) * 0.12;
        gl_FragColor = vec4(col * uI, 1.0);
      }`,
  });
}
export function passCard() {
  const g = new THREE.Group();
  const F = cv(1240, 720), FB = cv(1240, 720), Ff = cv(1240, 720), S = cv(380, 720), Sf = cv(380, 720), SB = cv(380, 720);
  const tF = ctex(F), tFB = ctex(FB), tFf = ctex(Ff), tS = ctex(S), tSf = ctex(Sf), tSB = ctex(SB);
  const main = new THREE.Group(); g.add(main);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(PASS_W, PASS_H), holoMat(tF, tFf)); main.add(front);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(PASS_W, PASS_H), holoMat(tFB, tFf)); back.rotation.y = Math.PI; main.add(back);
  const stub = new THREE.Group(); stub.position.x = PASS_W / 2; main.add(stub);    // hinge at the perforation
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(STUB_W, PASS_H), holoMat(tS, tSf)); sf.position.x = STUB_W / 2; stub.add(sf);
  const sb = new THREE.Mesh(new THREE.PlaneGeometry(STUB_W, PASS_H), holoMat(tSB, tSf)); sb.position.x = STUB_W / 2; sb.rotation.y = Math.PI; stub.add(sb);
  const mats = [front, back, sf, sb].map(m => m.material);
  main.position.x = -STUB_W / 2;
  const paper = "#f6f1e7", ink = "#17130e", gold = "#c9952f";
  function card(x, W, H, rL, rR) { x.clearRect(0, 0, W, H); x.fillStyle = paper; x.beginPath(); x.moveTo(rL, 0); x.lineTo(W - rR, 0); x.arcTo(W, 0, W, rR, rR); x.lineTo(W, H - rR); x.arcTo(W, H, W - rR, H, rR); x.lineTo(rL, H); x.arcTo(0, H, 0, H - rL, rL); x.lineTo(0, rL); x.arcTo(0, 0, rL, 0, rL); x.closePath(); x.fill(); }
  function notch(x, cx, H) { x.save(); x.globalCompositeOperation = "destination-out"; for (const y of [0, H]) { x.beginPath(); x.arc(cx, y, 26, 0, Math.PI * 2); x.fill(); } x.restore(); }
  function draw(P) {
    let x = F.getContext("2d"); const W = F.width, H = F.height;
    card(x, W, H, 44, 0); notch(x, W, H);
    x.fillStyle = ink; x.textBaseline = "alphabetic";
    x.font = `700 34px ${DISP}`; x.fillText("KALYON", 56, 86); x.fillStyle = gold; x.font = `600 30px ${DISP}`; x.fillText("यात्री पास", 196, 86);
    const live = P.live.toUpperCase(); x.font = `600 24px ${SANS}`; const lw = x.measureText(live).width + 54;
    x.fillStyle = P.phase === "arrived" ? "#1f7a4a" : "#14130f"; rrect(x, W - 56 - lw, 52, lw, 46, 23); x.fill();
    x.fillStyle = P.phase === "arrived" ? "#bff0d2" : "#7ee2a8"; x.beginPath(); x.arc(W - 56 - lw + 24, 75, 7, 0, 7); x.fill();
    x.fillStyle = "#f6f1e7"; x.fillText(live, W - 56 - lw + 40, 84);
    x.fillStyle = ink; x.font = `600 108px ${SERIF}`; x.fillText(P.number, 54, 214);
    const nw = x.measureText(P.number).width;
    x.font = `600 34px ${SANS}`; x.fillText(P.name, 84 + nw, 168); x.fillStyle = "#6b5a40"; x.font = `600 30px ${DISP}`; x.fillText(P.nameHi, 84 + nw, 210);
    x.fillStyle = ink; x.font = `600 72px ${SERIF}`; x.fillText(P.from.code, 54, 330); x.textAlign = "right"; x.fillText(P.to.code, W - 56, 330);
    x.font = `500 28px ${SANS}`; x.fillStyle = "#4b4134"; x.fillText(`${P.to.name} · ${P.to.time}`, W - 56, 374); x.textAlign = "left"; x.fillText(`${P.from.name} · ${P.from.time}`, 56, 374);
    x.strokeStyle = "#8a7a62"; x.setLineDash([10, 14]); x.lineWidth = 3; x.beginPath(); x.moveTo(380, 306); x.lineTo(W - 380, 306); x.stroke(); x.setLineDash([]);
    x.strokeStyle = "#d8cdb9"; x.setLineDash([6, 10]); x.beginPath(); x.moveTo(40, 420); x.lineTo(W - 40, 420); x.stroke(); x.setLineDash([]);
    P.cells.forEach(([a, v], i) => {
      const cx = 56 + (i % 2) * 580, cy = 482 + Math.floor(i / 2) * 118;
      x.fillStyle = "#7c6c55"; x.font = `600 22px ${SANS}`; x.fillText(a.toUpperCase(), cx, cy);
      x.fillStyle = ink; x.font = `600 46px ${SERIF}`; let s = 46; while (x.measureText(v).width > 540 && s > 24) { s -= 2; x.font = `600 ${s}px ${SERIF}`; } x.fillText(v, cx, cy + 54);
    });
    x.fillStyle = "#8a7a62"; x.font = `500 19px ${SANS}`; x.fillText(P.foot, 56, H - 22);
    // foil: a band across the top and the brand mark
    x = Ff.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, W, H); x.fillStyle = "#fff"; x.fillRect(0, 0, W, 16); x.fillRect(0, 118, W, 4); x.font = `700 34px ${DISP}`; x.fillText("KALYON", 56, 86);
    x.globalAlpha = 0.5; for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(W - 150 + (i % 3) * 30, 610 + Math.floor(i / 3) * 30, 9, 0, 7); x.fill(); } x.globalAlpha = 1;
    // back
    x = FB.getContext("2d"); card(x, W, H, 0, 44); x.save(); x.translate(W, 0); x.scale(-1, 1); notch(x, W, H); x.restore();
    x.fillStyle = "#f2c81f"; rrect(x, W / 2 - 230, 150, 460, 190, 10); x.fill(); x.fillStyle = ink; x.textAlign = "center";
    x.font = `700 70px ${DISP}`; x.fillText("काल + नियोजन", W / 2, 236); x.font = `700 72px ${DISP}`; x.fillText("KALYON", W / 2, 312);
    x.fillStyle = "#4b4134"; x.font = `500 28px ${SANS}`; x.fillText("A demonstration pass. Replay of synthetic data, not a ticket.", W / 2, 430);
    x.font = `500 24px ${SANS}`; x.fillText("Times are Kalyon’s forecasts with the Station-board rules.", W / 2, 474);
    let seed = [...P.number].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    for (let i = 0, bx = W / 2 - 300; bx < W / 2 + 300; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const bw = 3 + (seed % 9); if (i % 2 === 0) { x.fillStyle = ink; x.fillRect(bx, 540, bw, 110); } bx += bw; }
    x.textAlign = "left";
    // stub (front, foil, back)
    const SW = S.width;
    x = S.getContext("2d"); card(x, SW, H, 0, 44); x.save(); x.translate(0, 0); x.globalCompositeOperation = "destination-out"; for (const y of [0, H]) { x.beginPath(); x.arc(0, y, 26, 0, 7); x.fill(); } x.restore();
    x.strokeStyle = "#cbbfa8"; x.setLineDash([4, 10]); x.lineWidth = 3; x.beginPath(); x.moveTo(3, 30); x.lineTo(3, H - 30); x.stroke(); x.setLineDash([]);
    x.fillStyle = "#7c6c55"; x.font = `600 22px ${SANS}`; x.fillText(P.cells[0][0].toUpperCase(), 40, 120);
    x.fillStyle = ink; x.font = `600 76px ${SERIF}`; let s2 = 76; while (x.measureText(P.cells[0][1]).width > SW - 70 && s2 > 26) { s2 -= 2; x.font = `600 ${s2}px ${SERIF}`; } x.fillText(P.cells[0][1], 40, 200);
    x.fillStyle = "#7c6c55"; x.font = `600 22px ${SANS}`; x.fillText(P.cells[1][0].toUpperCase(), 40, 290);
    x.fillStyle = ink; x.font = `600 38px ${SERIF}`; s2 = 38; while (x.measureText(P.cells[1][1]).width > SW - 70 && s2 > 18) { s2 -= 2; x.font = `600 ${s2}px ${SERIF}`; } x.fillText(P.cells[1][1], 40, 338);
    x.font = `600 46px ${SERIF}`; x.fillText(P.number, 40, 470); x.fillStyle = "#6b5a40"; x.font = `600 30px ${DISP}`; x.fillText(`${P.from.code} → ${P.to.code}`, 40, 516);
    x = Sf.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, SW, H); x.fillStyle = "#fff"; x.fillRect(0, 0, SW, 16); x.fillRect(30, 560, SW - 60, 90);
    x = SB.getContext("2d"); card(x, SW, H, 44, 0); x.fillStyle = "#e9e1d1"; x.fillRect(30, 40, SW - 60, H - 80);
    x.fillStyle = "#7c6c55"; x.font = `600 24px ${SANS}`; x.save(); x.translate(SW / 2 + 8, H / 2); x.rotate(-Math.PI / 2); x.textAlign = "center"; x.fillText("KEEP THIS STUB · यह भाग रखें", 0, 0); x.restore();
    [tF, tFB, tFf, tS, tSf, tSB].forEach(t => { t.needsUpdate = true; });
  }
  let key = "";
  g.userData = {
    mats, main, stub,
    set(P) { const k = JSON.stringify(P); if (k === key) return; key = k; draw(P); },
  };
  return g;
}

// ---------------------------------------------------------------------------------------------
// Ch7–9 · The corridor from above: terrain with contour light, every section of line, stations as
// pillars of light, your route in gold with the part already run brighter, the train as a comet,
// and floating bilingual station signs carrying the road-ahead times.
// ---------------------------------------------------------------------------------------------
export const LAT0 = 28.6, LON0 = 78.6;
export const proj = (lat, lon) => new THREE.Vector3((lon - LON0) * 97.0, 0, -(lat - LAT0) * 111.0);
export function corridor(net) {
  const g = new THREE.Group();
  const U = { uTime: { value: 0 }, uNight: { value: 1 }, uKm: { value: 0 }, uTot: { value: 1 } };
  // terrain: flat plains, foothills rising north of Dehradun; contour lines and a 10 km dot grid
  const terr = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100, 240, 240).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: U, fog: false,
    vertexShader: `${HASH} varying vec3 vP; varying float vH, vN;
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1,0)), f.x), mix(hh(i + vec2(0,1)), hh(i + vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 p = position;
        float n = vn(p.xz * 0.012) * 0.6 + vn(p.xz * 0.035) * 0.3 + vn(p.xz * 0.09) * 0.1;
        float hills = smoothstep(-185.0, -250.0, p.z) * 60.0 * n;
        float roll = (n - 0.5) * 2.0 * smoothstep(-150.0, -60.0, p.z) * smoothstep(-185.0, -150.0, p.z + 0.0) * 0.0;
        p.y = hills + roll - 0.4;
        vH = p.y; vP = p; vN = n;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform float uNight; varying vec3 vP; varying float vH, vN;
      void main(){
        float d = length(vP.xz) / 520.0;
        vec3 base = mix(vec3(0.018, 0.022, 0.03), vec3(0.05, 0.056, 0.06), 1.0 - uNight) * (0.75 + 0.5 * vN);
        // topographic contours: tight in the hills, faint over the plains
        float hc = vH > 1.0 ? vH / 4.0 : vN * 9.0;
        float cl = smoothstep(0.9, 1.0, 1.0 - abs(fract(hc) - 0.5) * 2.0) * (vH > 1.0 ? 1.0 : 0.35);
        vec2 gd = abs(fract(vP.xz / 10.0) - 0.5);
        float dots = smoothstep(0.05, 0.0, length(0.5 - gd));
        float grid = smoothstep(0.488, 0.5, max(abs(fract(vP.x / 50.0) - 0.5), abs(fract(vP.z / 50.0) - 0.5)));
        vec3 c = base + vec3(0.12, 0.2, 0.32) * cl * 0.4 + vec3(0.25, 0.28, 0.34) * dots * 0.5 + vec3(0.06, 0.07, 0.09) * grid * 0.5;
        c *= 1.0 - smoothstep(0.55, 1.0, d);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  g.add(terr);
  const P = Object.fromEntries(net.stations.map(s => [s.code, proj(s.lat, s.lon)]));
  // all sections: thin dim lines of light
  const ribbon = (pts, wid, kAttr) => {
    const pos = [], kk = [], idx = []; let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const t = b.clone().sub(a).setY(0).normalize(), n = new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(wid / 2);
      if (i > 0) acc += pts[i].distanceTo(pts[i - 1]);
      const p = pts[i];
      pos.push(p.x + n.x, 0.35, p.z + n.z, p.x - n.x, 0.35, p.z - n.z);
      const kv = kAttr ? kAttr[i] : acc; kk.push(kv, kv);
      if (i < pts.length - 1) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("aK", new THREE.Float32BufferAttribute(kk, 1)); geo.setIndex(idx);
    return geo;
  };
  const lineMat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    vertexShader: `attribute float aK; varying float vK; void main(){ vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying float vK; void main(){ float d = 0.6 + 0.4 * step(0.5, fract(vK / 6.0 - uTime * 0.4)); gl_FragColor = vec4(vec3(0.55, 0.62, 0.75) * 0.55 * d, 1.0); }` });
  for (const s of net.sections) g.add(new THREE.Mesh(ribbon([P[s.a], P[s.b]], 0.7), lineMat));
  // stations: pillars of light, rings, labels
  const pill = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    vertexShader: `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uNight; varying float vY; void main(){ gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * pow(1.0 - vY, 2.0) * (0.35 + 0.65 * uNight) * 0.9, 1.0); }` });
  const stations = {};
  for (const s of net.stations) {
    const grp = new THREE.Group(); grp.position.copy(P[s.code]);
    const h0 = s.major ? 16 : 9;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(s.major ? 0.7 : 0.4, s.major ? 0.7 : 0.4, h0, 16, 1, true), pill); p.position.y = h0 / 2; grp.add(p);
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.major ? 2.2 : 1.3, s.major ? 2.5 : 1.5, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.7), transparent: true, opacity: 0.8, fog: false }));
    ring.position.y = 0.45; grp.add(ring);
    const lc = cv(512, 160), lx = lc.getContext("2d");
    lx.textAlign = "center"; lx.fillStyle = "#f4eee2"; lx.shadowColor = "rgba(0,0,0,.8)"; lx.shadowBlur = 12;
    lx.font = `700 ${s.major ? 56 : 44}px ${DISP}`; lx.fillText(s.name.toUpperCase(), 256, 70); lx.fillStyle = "#e7c27a"; lx.font = `600 ${s.major ? 44 : 36}px ${DISP}`; lx.fillText(s.name_hi, 256, 128);
    const lab = upright(new THREE.Mesh(new THREE.PlaneGeometry(s.major ? 26 : 19, s.major ? 8.1 : 5.9), new THREE.MeshBasicMaterial({ map: ctex(lc), transparent: true, depthWrite: false, fog: false })));
    lab.position.y = h0 + 4.5; grp.add(lab);
    g.add(grp); stations[s.code] = { grp, lab };
  }
  // the selected route, the train, the road signs
  const routeMat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    vertexShader: `attribute float aK; varying float vK; void main(){ vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uKm, uTime; varying float vK;
      void main(){
        float done = step(vK, uKm);
        float head = exp(-pow((vK - uKm) / 6.0, 2.0)) * 2.5;
        float flow = 0.7 + 0.3 * sin(vK * 0.6 - uTime * 3.0);
        vec3 c = mix(vec3(1.0, 0.72, 0.25) * 0.35 * flow, vec3(1.0, 0.78, 0.35) * 1.6, done) + vec3(1.0, 0.9, 0.7) * head;
        gl_FragColor = vec4(c, 1.0);
      }` });
  let route = null, path = null, kms = null;
  const comet = new THREE.Group(); g.add(comet);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2.4), fog: false })); comet.add(head);
  const haloC = cv(128, 128), hx = haloC.getContext("2d"); const rg = hx.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, "rgba(255,230,180,1)"); rg.addColorStop(0.25, "rgba(255,190,110,.45)"); rg.addColorStop(1, "rgba(255,160,80,0)"); hx.fillStyle = rg; hx.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloC), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.set(16, 16, 1); comet.add(halo);
  const signs = new THREE.Group(); g.add(signs);
  let signKey = "";
  function signTexture(x) {
    const c = cv(900, 340), q = c.getContext("2d");
    const glow = x.next && !x.passed, dim = x.passed;
    q.fillStyle = dim ? "rgba(14,13,12,.55)" : "rgba(14,12,10,.82)"; rrect(q, 6, 6, 888, 328, 26); q.fill();
    q.lineWidth = glow ? 6 : 2; q.strokeStyle = glow ? "#ffc65a" : x.mine ? "rgba(255,198,90,.7)" : "rgba(255,255,255,.18)"; rrect(q, 6, 6, 888, 328, 26); q.stroke();
    q.globalAlpha = dim ? 0.45 : 1;
    q.fillStyle = "#f4eee2"; q.font = `700 74px ${DISP}`; q.fillText(x.name.toUpperCase(), 44, 104);
    const nw = q.measureText(x.name.toUpperCase()).width; q.fillStyle = "#e7c27a"; q.font = `600 58px ${DISP}`; q.fillText(x.hi, 66 + nw, 104);
    if (x.mine) { q.font = `600 26px ${SANS}`; q.fillStyle = "#ffc65a"; q.fillText(x.mine.toUpperCase(), 46, 150); }
    q.fillStyle = glow ? "#ffd27a" : "#f4eee2"; q.font = `600 64px ${SERIF}`; q.fillText(x.main, 44, x.mine ? 236 : 220);
    q.fillStyle = "rgba(244,238,226,.72)"; q.font = `500 30px ${SANS}`; q.fillText(x.sub, 46, x.mine ? 292 : 280);
    return ctex(c);
  }
  function setRoad(road) {
    const key = JSON.stringify(road.map(x => [x.code, x.main, x.sub, x.passed, x.next, x.mine]));
    if (key === signKey) return;
    const sameRoute = route && route.userData.codes === road.map(x => x.code).join(",");
    signKey = key;
    if (!sameRoute) {
      if (route) { g.remove(route); route.geometry.dispose(); }
      path = road.map(x => proj(x.lat, x.lon)); kms = road.map(x => x.km);
      route = new THREE.Mesh(ribbon(path, 1.8, kms), routeMat); route.userData.codes = road.map(x => x.code).join(",");
      g.add(route); U.uTot.value = kms[kms.length - 1];
    }
    signs.children.forEach(m => { m.material.map.dispose(); m.material.dispose(); m.geometry.dispose(); });
    signs.clear();
    road.forEach((x, i) => {
      const m = upright(new THREE.Mesh(new THREE.PlaneGeometry(22, 8.3), new THREE.MeshBasicMaterial({ map: signTexture(x), transparent: true, depthWrite: false, fog: false })));
      m.position.copy(path[i]).add(new THREE.Vector3(0, x.major ? 30 : 22, 0)); m.userData.x = x; m.renderOrder = 4;
      signs.add(m);
    });
  }
  // position along the route for a km value
  const at = (km, out = new THREE.Vector3()) => {
    if (!path) return out.set(0, 0, 0);
    let i = 0; while (i < kms.length - 2 && km > kms[i + 1]) i++;
    const f = THREE.MathUtils.clamp((km - kms[i]) / Math.max(1e-6, kms[i + 1] - kms[i]), 0, 1);
    return out.copy(path[i]).lerp(path[i + 1], f).setY(1.4);
  };
  let kmNow = 0;
  g.userData = {
    U, setRoad, at, signs, stations, comet,
    get path() { return path; }, get kms() { return kms; },
    setKm(km, dt) { kmNow += (km - kmNow) * (dt > 0 ? 1 - Math.exp(-dt * 6) : 1); U.uKm.value = kmNow; at(kmNow, comet.position); comet.position.y = 1.4; },
    get km() { return kmNow; },
  };
  return g;
}

// ---------------------------------------------------------------------------------------------
// Ch10 · Saathi: a particle sculpture that morphs between shapes (sphere, clock, wave, fog, rain, crowd).
// ---------------------------------------------------------------------------------------------
export const SHAPE = { sphere: 0, clock: 1, wave: 2, fog: 3, rain: 4, crowd: 5 };
export function sculpture(n) {
  const S = Array.from({ length: 6 }, () => new Float32Array(n * 3));
  const R = Math.random, set = (a, i, x, y, z) => { a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z; };
  for (let i = 0; i < n; i++) {
    // sphere (fibonacci, with a breathing shell)
    const k = i + 0.5, ph = Math.acos(1 - 2 * k / n), th = Math.PI * (1 + Math.sqrt(5)) * k, r = 6 + (R() - 0.5) * 0.5;
    set(S[0], i, r * Math.cos(th) * Math.sin(ph), r * Math.cos(ph), r * Math.sin(th) * Math.sin(ph));
    // clock: rim, ticks and two hands
    const u = R();
    if (u < 0.55) { const a = R() * Math.PI * 2, rr = 7 + (R() - 0.5) * 0.35; set(S[1], i, Math.cos(a) * rr, Math.sin(a) * rr, (R() - 0.5) * 0.6); }
    else if (u < 0.72) { const t = Math.floor(R() * 12), a = t / 12 * Math.PI * 2, rr = 5.6 + R() * 1.0; set(S[1], i, Math.cos(a) * rr, Math.sin(a) * rr, (R() - 0.5) * 0.3); }
    else if (u < 0.86) { const l = R() * 4.4, a = Math.PI / 2 - 0.9; set(S[1], i, Math.cos(a) * l + (R() - 0.5) * 0.18, Math.sin(a) * l + (R() - 0.5) * 0.18, (R() - 0.5) * 0.2); }
    else { const l = R() * 6.0, a = Math.PI / 2 - 3.0; set(S[1], i, Math.cos(a) * l + (R() - 0.5) * 0.12, Math.sin(a) * l + (R() - 0.5) * 0.12, (R() - 0.5) * 0.2); }
    // wave: a sheet with a rising swell (time grows on the stretch ahead)
    { const x = (R() - 0.5) * 18, z = (R() - 0.5) * 8; set(S[2], i, x, Math.sin(x * 0.55) * 1.6 + x * 0.18 + Math.sin(z * 0.8) * 0.3, z); }
    // fog: low drifting layers
    { const x = (R() - 0.5) * 22, z = (R() - 0.5) * 14, layer = Math.floor(R() * 4); set(S[3], i, x, -3 + layer * 1.6 + (R() - 0.5) * 0.9 + Math.sin(x * 0.3 + layer) * 0.5, z); }
    // rain: vertical streak columns (falling in the shader)
    { const x = (R() - 0.5) * 18, z = (R() - 0.5) * 10; set(S[4], i, x, (R() - 0.5) * 16, z); }
    // crowd: small figures standing on a plane
    { const fx = Math.floor(R() * 14) - 7, fz = Math.floor(R() * 9) - 4, ox = fx * 1.25 + (Math.sin(fz * 7.1) * 0.3), oz = fz * 1.25, w = R();
      if (w < 0.3) { const a = R() * 6.28, b = Math.acos(2 * R() - 1); set(S[5], i, ox + Math.sin(b) * Math.cos(a) * 0.2, -1.9 + Math.cos(b) * 0.2, oz + Math.sin(b) * Math.sin(a) * 0.2); }
      else { const y = R() * 1.55, rr = 0.26 * (1 - y / 2.4); const a = R() * 6.28; set(S[5], i, ox + Math.cos(a) * rr, -3.75 + y, oz + Math.sin(a) * rr); } }
  }
  const geo = new THREE.BufferGeometry();
  S.forEach((a, k) => geo.setAttribute(k === 0 ? "position" : `aS${k}`, new THREE.BufferAttribute(a, 3)));
  const rnd = new Float32Array(n); for (let i = 0; i < n; i++) rnd[i] = R(); geo.setAttribute("aR", new THREE.BufferAttribute(rnd, 1));
  const u = { uA: { value: 0 }, uB: { value: 0 }, uMix: { value: 0 }, uTime: { value: 0 }, uPx: { value: 900 }, uI: { value: 1 } };
  const m = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float uA, uB, uMix, uTime, uPx, uI; attribute vec3 aS1, aS2, aS3, aS4, aS5; attribute float aR; varying vec3 vC; varying float vA;
      vec3 shape(float k){
        vec3 p = k < 0.5 ? position : k < 1.5 ? aS1 : k < 2.5 ? aS2 : k < 3.5 ? aS3 : k < 4.5 ? aS4 : aS5;
        if (k > 3.5 && k < 4.5) p.y = 8.0 - mod(8.0 - p.y + uTime * (6.0 + aR * 6.0), 16.0);
        if (k > 2.5 && k < 3.5) p.x += sin(uTime * 0.2 + p.y) * 1.5;
        if (k > 1.5 && k < 2.5) p.y += sin(p.x * 0.7 - uTime * 1.2) * 0.35;
        if (k < 0.5) p *= 1.0 + 0.04 * sin(uTime * 1.3 + aR * 6.28);
        return p;
      }
      vec3 tint(float k){ return k < 0.5 ? vec3(1.0, 0.75, 0.45) : k < 1.5 ? vec3(1.0, 0.82, 0.5) : k < 2.5 ? vec3(0.95, 0.7, 0.55) : k < 3.5 ? vec3(0.7, 0.78, 0.9) : k < 4.5 ? vec3(0.6, 0.8, 1.0) : vec3(1.0, 0.65, 0.5); }
      void main(){
        float e = smoothstep(aR * 0.35, 0.65 + aR * 0.35, uMix);
        vec3 a = shape(uA), b = shape(uB);
        vec3 mid = (a + b) * 0.5 + vec3(sin(aR * 40.0), cos(aR * 31.0), sin(aR * 17.0)) * 3.0;
        vec3 p = mix(mix(a, mid, smoothstep(0.0, 0.5, e)), b, smoothstep(0.5, 1.0, e));
        float c = cos(uTime * 0.1), s = sin(uTime * 0.1); p.xz = mat2(c, -s, s, c) * p.xz;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        vC = mix(tint(uA), tint(uB), e); vA = uI * (0.55 + 0.45 * sin(uTime * 2.0 + aR * 30.0));
        gl_PointSize = clamp(0.07 * uPx / -mv.z * (0.6 + aR), 1.0, 14.0);
      }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC * smoothstep(0.5, 0.0, d) * vA * 1.3, 1.0); }`,
  }));
  m.frustumCulled = false; m.userData.u = u;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Ch11 · Weather: rain streaks around the camera and drifting fog sheets the headlight cuts through.
// ---------------------------------------------------------------------------------------------
export function rain(n = 5000) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute("position", quad.attributes.position); geo.setAttribute("uv", quad.attributes.uv);
  const O = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) O[i] = Math.random();
  geo.setAttribute("aO", new THREE.InstancedBufferAttribute(O, 3)); geo.instanceCount = n;
  const u = { uTime: { value: 0 }, uI: { value: 0 }, uC: { value: new THREE.Vector3() }, uBeam: { value: new THREE.Vector3() } };
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float uTime, uI; uniform vec3 uC, uBeam; attribute vec3 aO; varying float vA; varying vec2 vUv;
      void main(){
        vec3 box = vec3(40.0, 18.0, 26.0);
        vec3 p = aO * box; p.y -= uTime * (14.0 + aO.x * 6.0); p.x -= uTime * 2.0;
        p = mod(p - uC + box * 0.5, box) + uC - box * 0.5;
        vec3 view = normalize(cameraPosition - p); vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), view));
        vec3 w = p + side * position.x * 0.012 + vec3(0.0, 1.0, 0.0) * position.y * 0.55;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        vec3 d = p - uBeam; float along = -d.x, rad = length(d.yz);
        float lit = step(0.0, along) * smoothstep(0.3 * along + 1.0, 0.0, rad) * exp(-along * 0.015);
        vA = uI * (0.12 + lit * 1.6); vUv = uv;
      }`,
    fragmentShader: `varying float vA; varying vec2 vUv; void main(){ gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * vA * smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.6, vUv.y), 1.0); }` }));
  m.frustumCulled = false; m.userData.u = u;
  return m;
}
export function fogSheets(count = 14) {
  const g = new THREE.Group();
  const u = { uTime: { value: 0 }, uI: { value: 0 }, uBeam: { value: new THREE.Vector3() } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${HASH} uniform float uTime, uI; uniform vec3 uBeam; varying vec2 vUv; varying vec3 vW;
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1,0)), f.x), mix(hh(i + vec2(0,1)), hh(i + vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 q = vUv * vec2(4.0, 1.5) + vec2(uTime * 0.04, 0.0);
        float n = vn(q) * 0.55 + vn(q * 2.3 + 4.0) * 0.3 + vn(q * 5.1) * 0.15;
        float a = smoothstep(0.35, 0.8, n) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y) * smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
        vec3 d = vW - uBeam; float along = -d.x, rad = length(d.yz);
        float lit = step(0.0, along) * smoothstep(0.33 * along + 1.5, 0.0, rad) * exp(-along * 0.012);
        vec3 c = vec3(0.32, 0.36, 0.44) * 0.35 + vec3(1.0, 0.92, 0.78) * lit * 1.4;
        gl_FragColor = vec4(c, a * uI * (0.25 + lit * 0.6));
      }` });
  for (let i = 0; i < count; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 7), mat); m.position.set(-180 - i * 9, 2.6 + (i % 3) * 0.8, (i % 2 ? -1 : 1) * (2 + (i % 4) * 2.5)); g.add(m); }
  g.userData.u = u;
  return g;
}

// ---------------------------------------------------------------------------------------------
// Ch12 · The forecast river: the likely range as a flowing band of light along a time axis, with
// posts for the timetable, today's display and Kalyon. Values arrive as minutes plus their labels.
// ---------------------------------------------------------------------------------------------
export function river() {
  const g = new THREE.Group();
  const u = { uTime: { value: 0 }, uLo: { value: -10 }, uHi: { value: 10 }, uI: { value: 1 } };
  const PX = 0.6; // metres per minute
  const band = new THREE.Mesh(new THREE.PlaneGeometry(400, 14, 400, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `${HASH} uniform float uTime, uLo, uHi, uI; varying vec3 vP;
      void main(){
        float inR = smoothstep(uLo - 1.5, uLo + 1.5, vP.x) * smoothstep(uHi + 1.5, uHi - 1.5, vP.x);
        float across = 1.0 - smoothstep(0.0, 7.0, abs(vP.z));
        float flow = 0.6 + 0.4 * sin(vP.x * 0.5 - uTime * 2.0 + sin(vP.z * 0.9 + uTime) * 1.5);
        float edge = (exp(-abs(vP.x - uLo) * 1.6) + exp(-abs(vP.x - uHi) * 1.6)) * across;
        float axis = exp(-abs(vP.z) * 6.0) * 0.25;
        vec3 c = vec3(1.0, 0.72, 0.3) * inR * across * flow * 0.65 + vec3(1.0, 0.85, 0.55) * edge * 1.3 + vec3(0.7, 0.75, 0.85) * axis;
        c *= 1.0 - smoothstep(60.0, 200.0, abs(vP.x));
        gl_FragColor = vec4(c * uI, 1.0);
      }`,
  }));
  g.add(band);
  // drifting motes on the river
  const n = 2400, P = new Float32Array(n * 3); for (let i = 0; i < n; i++) { P[i * 3] = (Math.random() - 0.5) * 300; P[i * 3 + 1] = Math.random() * 3; P[i * 3 + 2] = (Math.random() - 0.5) * 12; }
  const mg = new THREE.BufferGeometry(); mg.setAttribute("position", new THREE.BufferAttribute(P, 3));
  const motes = new THREE.Points(mg, new THREE.ShaderMaterial({ uniforms: { ...u, uPx: { value: 900 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float uTime, uLo, uHi, uPx; varying float vA; void main(){ vec3 p = position; p.x = mod(p.x + uTime * 3.0 + 150.0, 300.0) - 150.0;
      float inR = smoothstep(uLo - 4.0, uLo, p.x) * smoothstep(uHi + 4.0, uHi, p.x); vA = 0.15 + inR * 0.9;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(0.12 * uPx / -mv.z, 1.0, 8.0); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * smoothstep(0.5, 0.0, d) * vA, 1.0); }` }));
  motes.frustumCulled = false; g.add(motes);
  const posts = new THREE.Group(); g.add(posts);
  const postMat = c => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, uniforms: { c: { value: new THREE.Color(c) } },
    vertexShader: `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 c; varying float vY; void main(){ gl_FragColor = vec4(c * (0.4 + 1.6 * pow(1.0 - vY, 1.5)), 1.0); }` });
  function post(x, h0, color, title, value, z = 0) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, h0, 12, 1, true), postMat(color)); p.position.y = h0 / 2; grp.add(p);
    const c = cv(640, 220), q = c.getContext("2d");
    q.fillStyle = "#" + new THREE.Color(color).getHexString(); q.font = `600 34px ${SANS}`; q.fillText(title.toUpperCase(), 10, 56);
    q.fillStyle = "#f6f1e7"; q.font = `500 112px ${SERIF}`; q.fillText(value, 6, 178);
    const lab = upright(new THREE.Mesh(new THREE.PlaneGeometry(8.7, 3), new THREE.MeshBasicMaterial({ map: ctex(c), transparent: true, depthWrite: false, fog: false })));
    lab.position.set(2.6, h0 + 1.0, 0); lab.renderOrder = 4; grp.add(lab);
    posts.add(grp);
  }
  let key = "";
  g.userData = {
    u, PX,
    set(range, note) {
      const k = JSON.stringify([range, note]); if (k === key) return; key = k;
      posts.children.forEach(o => o.traverse(m => { if (m.material) { m.material.map?.dispose(); m.material.dispose(); m.geometry.dispose(); } }));
      posts.clear();
      if (range) {
        const X = v => (v - range.med) * PX;
        u.uLo.value = X(range.lo); u.uHi.value = X(range.hi);
        post(X(range.sched), 5, 0xd9d2c4, "Timetable", range.labels.sched, -3);
        post(X(range.b1), 6.5, 0xff7a5c, "Today’s display", range.labels.b1, 3);
        post(0, 9, 0xffc65a, "Kalyon", range.labels.med, 0);
        post(X(range.lo), 3.2, 0xffd9a0, "Likely from", range.labels.lo, -6);
        post(X(range.hi), 3.2, 0xffd9a0, "Likely until", range.labels.hi, 6);
      } else {
        u.uLo.value = 1e4; u.uHi.value = 1e4;
        post(0, 7, 0xd9d2c4, note?.label?.split(" ")[0] || "Timetable", note?.t || "", 0);
      }
    },
  };
  return g;
}

// ---------------------------------------------------------------------------------------------
// Ch13 · A railway colour-light signal: its aspect follows the most serious alert in your list.
// ---------------------------------------------------------------------------------------------
export function signal() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.45, metalness: 0.7 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 16), dark); mast.position.y = 3.5; g.add(mast);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.9, 0.5), dark); head.position.set(0, 7.9, 0); g.add(head);
  const back = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 })); back.position.set(0, 7.9, -0.27); back.rotation.y = Math.PI; g.add(back);
  const lamps = [["green", 0x2bff7a], ["yellow", 0xffc21a], ["red", 0xff2a1a]].map(([k, c], i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 0, roughness: 0.2 });
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), mat); l.position.set(0, 8.85 - i * 0.92, 0.26); g.add(l);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 24, 1, true, 0, Math.PI), dark); hood.rotation.x = Math.PI / 2; hood.rotation.z = Math.PI; hood.position.set(0, 8.85 - i * 0.92 + 0.02, 0.4); g.add(hood);
    return { k, mat, l };
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.25, metalness: 0.2 })); g.add(floor);
  // no light of its own (the stage's roaming key light plays it), so the shader light count never changes
  g.userData = {
    lamps, color: new THREE.Color(),
    set(level, pulse, time) {
      const on = level === "critical" ? "red" : level === "warn" ? "yellow" : "green";
      const col = { red: 0xff2a1a, yellow: 0xffc21a, green: 0x2bff7a }[on];
      lamps.forEach(L => { L.mat.emissiveIntensity = L.k === on ? 9 * (1 + pulse * 1.5) * (0.97 + 0.03 * Math.sin(time * 40)) : 0.02; });
      this.color.setHex(col); this.glow = 26 * (1 + pulse);
    },
  };
  return g;
}

// ---------------------------------------------------------------------------------------------
// Ch14 · Arrival: the destination photograph as a depth mesh; the pick-up dial; a sticker burst.
// ---------------------------------------------------------------------------------------------
export function depthPhoto(w = 32, h = 18) {
  const u = { map: { value: null }, depth: { value: null }, uK: { value: 5.5 }, uI: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 256, 144), new THREE.ShaderMaterial({ uniforms: u, fog: false,
    vertexShader: `uniform sampler2D depth; uniform float uK; varying vec2 vUv; varying float vD;
      void main(){ vUv = uv; float d = texture2D(depth, uv).r; vD = d; vec3 p = position + vec3(0.0, 0.0, d * uK); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float uI; varying vec2 vUv; varying float vD;
      void main(){ vec3 c = texture2D(map, vUv).rgb; float e = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
        gl_FragColor = vec4(c * uI * mix(0.85, 1.1, vD) * e, 1.0); }` }));
  let cur = "";
  const loader = new THREE.TextureLoader();
  m.userData = { u, load(name, ver) {
    if (name === cur) return; cur = name;
    loader.load(`img/pass/${name}.jpg?v=${ver}`, t => { t.colorSpace = THREE.SRGBColorSpace; u.map.value?.dispose(); u.map.value = t; });
    loader.load(`img/pass/${name}-depth.jpg?v=${ver}`, t => { u.depth.value?.dispose(); u.depth.value = t; });
  } };
  return m;
}

export function pickDial() {
  const c = cv(1024, 1024), t = ctex(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  m.renderOrder = 6;
  let key = "";
  m.userData.set = (pk, title) => {
    const k = JSON.stringify([pk, title]); if (k === key) return; key = k;
    const q = c.getContext("2d"); q.clearRect(0, 0, 1024, 1024);
    const C = 512, R = 400;
    q.fillStyle = "rgba(10,9,8,.72)"; q.beginPath(); q.arc(C, C, R + 70, 0, 7); q.fill();
    q.strokeStyle = "rgba(244,238,226,.18)"; q.lineWidth = 2; q.beginPath(); q.arc(C, C, R, 0, 7); q.stroke();
    q.textAlign = "center"; q.fillStyle = "#e7c27a"; q.font = `600 30px ${SANS}`; q.fillText(title.toUpperCase(), C, C - 150);
    if (pk.state !== "fc") {
      q.fillStyle = "#f6f1e7"; q.font = `500 150px ${SERIF}`; q.fillText(pk.state === "arrived" ? pk.arrived : pk.sched, C, C + 40);
      q.fillStyle = "rgba(244,238,226,.7)"; q.font = `500 32px ${SANS}`; q.fillText(pk.state === "arrived" ? "Arrived. Head to the exit gate." : "Timetable. Kalyon forecasts after departure.", C, C + 110);
    } else {
      // a two-hour window ending a little after the likely range
      const [leave, plat, likely, lo, hi] = pk.m, end = hi + 15, start = end - 120;
      const A = v => -Math.PI / 2 + ((v - start) / 120) * Math.PI * 2;
      for (let i = 0; i <= 120; i += 5) { const a = A(start + i), r0 = i % 15 === 0 ? R - 34 : R - 16; q.strokeStyle = i % 15 === 0 ? "rgba(244,238,226,.55)" : "rgba(244,238,226,.22)"; q.lineWidth = i % 15 === 0 ? 4 : 2; q.beginPath(); q.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); q.lineTo(C + Math.cos(a) * R, C + Math.sin(a) * R); q.stroke(); }
      q.strokeStyle = "#ffc65a"; q.lineWidth = 22; q.lineCap = "round"; q.shadowColor = "#ffb347"; q.shadowBlur = 30; q.beginPath(); q.arc(C, C, R + 34, A(Math.max(lo, start)), A(Math.min(hi, end))); q.stroke(); q.shadowBlur = 0;
      const mark = (v, col, label, time, rr) => { if (v < start || v > end) return; const a = A(v); q.fillStyle = col; q.beginPath(); q.arc(C + Math.cos(a) * (R + 34), C + Math.sin(a) * (R + 34), 16, 0, 7); q.fill();
        q.font = `600 24px ${SANS}`; q.fillText(label.toUpperCase(), C + Math.cos(a) * rr, C + Math.sin(a) * rr - 8); q.fillStyle = "#f6f1e7"; q.font = `500 34px ${SERIF}`; q.fillText(time, C + Math.cos(a) * rr, C + Math.sin(a) * rr + 30); };
      mark(leave, "#9cc9ff", "Leave home", pk.leave, R - 120);
      mark(plat, "#ffc65a", "On platform", pk.platform, R - 120);
      mark(likely, "#ffffff", "Most likely", pk.likely, R - 200);
      q.fillStyle = "#f6f1e7"; q.font = `500 132px ${SERIF}`; q.fillText(pk.leave, C, C + 30);
      q.fillStyle = "rgba(244,238,226,.75)"; q.font = `500 30px ${SANS}`; q.fillText(`leave home · ${pk.travel} min to the station`, C, C + 84);
    }
    t.needsUpdate = true;
  };
  return m;
}

export function stickers(labels, n = 70) {
  const cols = 4, rows = 4, cw = 256, ch = 128, c = cv(cols * cw, rows * ch), q = c.getContext("2d");
  const pal = ["#ffc21a", "#f6f1e7", "#ff7a5c", "#7ee2a8", "#9cc9ff", "#ffd9a0"];
  labels.slice(0, cols * rows).forEach((t, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    q.fillStyle = pal[i % pal.length]; rrect(q, x + 10, y + 14, cw - 20, ch - 28, 40); q.fill();
    q.strokeStyle = "rgba(0,0,0,.25)"; q.lineWidth = 4; q.stroke();
    q.fillStyle = "#17130e"; q.textAlign = "center"; q.textBaseline = "middle"; let s = 50; q.font = `700 ${s}px ${DISP}`;
    while (q.measureText(t).width > cw - 50 && s > 18) { s -= 2; q.font = `700 ${s}px ${DISP}`; } q.fillText(t, x + cw / 2, y + ch / 2 + 2);
  });
  const tex = ctex(c);
  const quad = new THREE.PlaneGeometry(1, 0.5);
  const geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute("position", quad.attributes.position); geo.setAttribute("uv", quad.attributes.uv);
  const D = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, e = 0.3 + Math.random() * 1.0; D[i * 4] = Math.cos(a) * e; D[i * 4 + 1] = 0.7 + Math.random() * 1.2; D[i * 4 + 2] = Math.sin(a) * e * 0.6; D[i * 4 + 3] = Math.random(); }
  geo.setAttribute("aD", new THREE.InstancedBufferAttribute(D, 4)); geo.instanceCount = n;
  const u = { uB: { value: 0 }, map: { value: tex }, uN: { value: Math.min(labels.length, cols * rows) } };
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: `uniform float uB, uN; attribute vec4 aD; varying vec2 vUv; varying float vA;
      void main(){
        float t = uB * 1.6;
        vec3 v = aD.xyz * 9.0; vec3 p = v * t + vec3(0.0, -6.0, 0.0) * t * t;
        float ang = (aD.w - 0.5) * 8.0 * t;
        float sc = 0.9 + aD.w * 0.8;
        vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (position.xy * sc);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); mv.xy += q;
        gl_Position = projectionMatrix * mv;
        float cell = floor(aD.w * uN);
        vec2 o = vec2(mod(cell, 4.0), 3.0 - floor(cell / 4.0));
        vUv = (o + uv) / 4.0; vA = smoothstep(0.0, 0.05, uB) * (1.0 - smoothstep(0.85, 1.0, uB));
      }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vA; void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb * 1.05, vA); }` }));
  m.frustumCulled = false; m.userData.u = u;
  return m;
}
