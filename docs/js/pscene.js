// Cinematic scene engine for the Passenger tab.
// One full-screen WebGL pass turns a photograph plus an AI depth map (Depth Anything V2, computed
// offline) into a living shot: depth parallax and a slow dolly, depth-correct fog, rain running down
// glass, lens glow and anamorphic streaks on real light sources, drifting sky, shimmering water,
// the sway of a moving coach, rack focus, film grain, and depth-ordered transitions between shots.
import * as THREE from "three";

const MAXL = 4;

// Light positions are in image coordinates (0..1 from the top-left).
export const SCENES = {
  loco: { img: "loco", focal: [0.5, 0.47], par: 0.018, dolly: 0.06, grade: [0.62, 1.22, 0.7, -0.04],
    lights: [[0.477, 0.497, 1.5, 0.026, [1, 0.96, 0.86]], [0.531, 0.497, 1.5, 0.026, [1, 0.96, 0.86]], [0.266, 0.487, 0.6, 0.014, [1, 0.97, 0.92]], [0.744, 0.487, 0.6, 0.014, [1, 0.97, 0.92]]] },
  hero: { img: "hero-sunset", focal: [0.62, 0.55], par: 0.024, dolly: 0.04, sky: 0.6, grade: [1.0, 1.06, 1.05, 0.06],
    lights: [[0.036, 0.47, 1.0, 0.09, [1, 0.62, 0.3]], [0.676, 0.655, 0.9, 0.018, [1, 0.97, 0.9]], [0.83, 0.655, 0.9, 0.018, [1, 0.97, 0.9]]] },
  fog: { img: "fog-headlights", focal: [0.33, 0.52], par: 0.02, dolly: 0.05, fog: 0.85, fogColor: [0.62, 0.64, 0.66], grade: [0.95, 1.05, 0.7, -0.03],
    lights: [[0.266, 0.62, 1.5, 0.03, [1, 0.97, 0.9]], [0.331, 0.62, 1.3, 0.028, [1, 0.97, 0.9]], [0.305, 0.505, 0.8, 0.09, [1, 0.95, 0.85]]] },
  rain: { img: "rain-platform", focal: [0.5, 0.5], par: 0.016, dolly: 0.03, rain: 1.0, grade: [0.95, 1.12, 0.0, 0.0],
    lights: [[0.79, 0.07, 0.6, 0.05, [0.92, 0.95, 1]]] },
  crowd: { img: "festival-crowd", focal: [0.5, 0.55], par: 0.02, dolly: 0.035, bokeh: 0.8, grade: [1.0, 1.05, 1.05, 0.08], lights: [] },
  window: { img: "window-day", focal: [0.5, 0.45], par: 0.03, dolly: 0.02, sway: 1.0, window: [0.205, 0.175, 0.795, 0.6], grade: [1.0, 1.04, 1.02, 0.05], lights: [[0.24, 0.27, 0.45, 0.12, [1, 0.8, 0.5]]] },
  onboard: { img: "onboard-night", video: "onboard-night", focal: [0.5, 0.42], par: 0.012, dolly: 0.015, sway: 0.7, grade: [1.25, 1.08, 1.1, -0.02], lights: [] },
  tracks: { img: "tracks-aerial", focal: [0.5, 0.5], par: 0.008, dolly: 0.05, pan: 1, grade: [0.96, 1.08, 0.95, 0.02], lights: [] },
  platform: { img: "platform-night", focal: [0.6, 0.55], par: 0.024, dolly: 0.04, grade: [1.0, 1.08, 1.0, 0.03],
    lights: [[0.646, 0.555, 1.5, 0.03, [1, 0.88, 0.62]], [0.86, 0.335, 0.6, 0.025, [0.9, 0.96, 1]], [0.71, 0.37, 0.45, 0.02, [0.9, 0.96, 1]]] },
  "city-DDN": { img: "city-dehradun", focal: [0.52, 0.5], par: 0.022, dolly: 0.035, sky: 0.8, grade: [1.0, 1.04, 1.0, 0.03],
    lights: [[0.104, 0.395, 1.0, 0.07, [1, 0.6, 0.25]], [0.487, 0.39, 0.35, 0.012, [1, 0.9, 0.6]], [0.543, 0.39, 0.35, 0.012, [1, 0.9, 0.6]]] },
  "city-HW": { img: "city-haridwar", focal: [0.5, 0.55], par: 0.02, dolly: 0.03, water: [0.84, 1.0], grade: [1.05, 1.06, 1.08, 0.06],
    lights: [[0.21, 0.57, 0.6, 0.03, [1, 0.6, 0.2]], [0.37, 0.6, 0.6, 0.03, [1, 0.6, 0.2]], [0.53, 0.6, 0.6, 0.03, [1, 0.6, 0.2]], [0.75, 0.6, 0.6, 0.03, [1, 0.6, 0.2]]] },
  "city-MB": { img: "city-moradabad", focal: [0.5, 0.45], par: 0.02, dolly: 0.03, sky: 0.7, grade: [1.0, 1.05, 1.0, 0.03], lights: [] },
  "city-BE": { img: "city-bareilly", focal: [0.35, 0.45], par: 0.022, dolly: 0.035, sky: 0.7, grade: [1.0, 1.04, 1.05, 0.05],
    lights: [[0.475, 0.39, 1.1, 0.08, [1, 0.7, 0.35]]] },
  "city-LKO": { img: "city-lucknow", focal: [0.5, 0.45], par: 0.02, dolly: 0.035, sky: 0.7, grade: [1.0, 1.05, 1.02, 0.03], lights: [] },
  "city-NDLS": { img: "city-newdelhi", focal: [0.5, 0.5], par: 0.022, dolly: 0.035, sky: 0.9, grade: [1.0, 1.05, 1.05, 0.04],
    lights: [[0.5, 0.86, 0.5, 0.02, [1, 0.75, 0.4]]] },
};

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime, uMix, uFlood, uBlur, uFocus, uReduce, uIntro, uZoomA, uZoomB, uGrain;
uniform vec2 uRes, uPointer;
uniform sampler2D tA, dA, tB, dB;
uniform vec2 aspA, aspB; // x: image aspect, y: unused
uniform vec2 focA, focB;
uniform vec4 p1A, p1B;    // parallax, dolly, sway, sky
uniform vec4 p2A, p2B;    // fog, rain, bokeh, pan
uniform vec4 wA, wB;      // water y0, y1, amount, -
uniform vec4 winA, winB;  // window rect (x0,y0,x1,y1) in texture uv, for motion outside
uniform vec4 gA, gB;      // exposure, contrast, saturation, warmth
uniform vec3 fcA, fcB;    // fog colour
uniform vec4 LA[${MAXL}], LB[${MAXL}];   // light x, y (texture uv), intensity, size
uniform vec3 CA[${MAXL}], CB[${MAXL}];   // light colour

float sstep(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t*t*(3.0 - 2.0*t); }
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p = p*2.03 + 17.1; a *= 0.5; } return v; }

// Cover-fit the image into the screen around a focal point, with a zoom.
vec2 cover(vec2 uv, float imgAsp, vec2 foc, float zoom){
  float scr = uRes.x / uRes.y;
  vec2 s = scr > imgAsp ? vec2(1.0, imgAsp/scr) : vec2(scr/imgAsp, 1.0);
  vec2 f = vec2(foc.x, 1.0 - foc.y);
  vec2 c = clamp(f, s*0.5, 1.0 - s*0.5);
  return c + (uv - 0.5) * s / zoom;
}

// Rain on glass: returns xy = refraction offset, z = drop mask, w = trail wetness.
vec4 rainLayer(vec2 uv, float t, float scale){
  vec2 a = vec2(uRes.x/uRes.y, 1.0);
  vec2 st = uv * scale * a;
  vec2 id = floor(st * vec2(1.0, 0.25));
  float n = hash(id);
  st.y += t * 0.18 + n;           // falling drops
  vec2 g = fract(st * vec2(1.0, 0.25)) - 0.5;
  float x = (n - 0.5) * 0.7;
  float wig = sin(st.y*1.6 + sin(st.y*0.7))*0.08;
  x += wig;
  float y = -sin(t*0.9 + n*6.2831 + sin(t*0.9 + n*6.2831)*0.5)*0.42;
  vec2 d = (g - vec2(x, y)) / vec2(1.0, 4.0);
  float drop = sstep(0.06, 0.03, length(d));
  vec2 td = (g - vec2(x, g.y)) / vec2(1.0, 4.0);
  float trail = sstep(0.03, 0.01, length(td)) * sstep(-0.05, 0.05, d.y) * (1.0 - sstep(y, 0.5, g.y));
  // small static droplets
  vec2 sp = uv * scale * 7.0 * a;
  vec2 sid = floor(sp);
  vec2 sg = fract(sp) - 0.5 - (vec2(hash(sid), hash(sid+3.1)) - 0.5)*0.6;
  float sd = sstep(0.12, 0.05, length(sg)) * step(0.72, hash(sid + 7.7)) * (0.6 + 0.4*sin(t*0.3 + hash(sid)*9.0));
  vec2 off = d * drop * 1.2 + sg * sd * 0.35;
  return vec4(off, max(drop, sd), trail);
}

vec3 grade(vec3 c, vec4 g){
  c *= g.x;
  c = (c - 0.5) * g.y + 0.5;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, g.z);
  c += vec3(g.w, g.w*0.25, -g.w);
  return c;
}

vec3 shot(sampler2D tex, sampler2D dep, vec2 asp, vec2 foc, vec4 p1, vec4 p2, vec4 w, vec4 win, vec4 g, vec3 fc,
          vec4 L[${MAXL}], vec3 C[${MAXL}], float zoomExtra, vec2 uv){
  float t = uTime;
  float breathe = 1.0 + p1.y * (0.6 + 0.4*sin(t*0.045));
  float zoom = breathe * zoomExtra;
  vec2 tuv = cover(uv, asp.x, foc, zoom);
  if (p2.w > 0.0) tuv.x += sin(t*0.03)*0.03 + t*0.0;                // slow aerial pan
  // depth parallax with a little iterative refinement
  vec2 sway = vec2(sin(t*1.7)*0.4 + sin(t*3.1)*0.15, sin(t*2.3)*0.6 + sin(t*5.7)*0.25) * 0.0016 * p1.z * (1.0 - uReduce);
  vec2 par = uPointer * p1.x * (1.0 - uReduce);
  float d = texture2D(dep, tuv).r;
  vec2 q = tuv;
  for (int i = 0; i < 3; i++){ q = tuv + par * (d - 0.45) + sway * d; d = texture2D(dep, q).r; }
  // drifting sky (the farthest, upper part of the frame)
  if (p1.w > 0.0){
    float sky = p1.w * sstep(0.12, 0.02, d) * sstep(0.35, 0.75, q.y);
    q.x += (fbm(q*3.0 + vec2(t*0.02, 0.0)) - 0.5) * 0.012 * sky;
    q.y += (fbm(q*2.0 + vec2(0.0, t*0.015)) - 0.5) * 0.004 * sky;
  }
  // water shimmer
  if (w.z > 0.0){
    float m = w.z * sstep(1.0 - w.x, 1.0 - w.x - 0.04, q.y);
    q.x += sin(q.y*260.0 + t*2.2) * 0.0018 * m + (noise(q*vec2(40.0, 180.0) + t*0.6) - 0.5)*0.004*m;
  }
  // scenery rushing past the window of a moving coach
  float inWin = 0.0;
  if (win.z > 0.0){
    inWin = sstep(win.x, win.x+0.01, q.x) * sstep(win.z, win.z-0.01, q.x) * sstep(win.y, win.y+0.01, q.y) * sstep(win.w, win.w-0.01, q.y);
  }
  // rain on the glass
  float glassBlur = 0.0; vec4 r = vec4(0.0);
  if (p2.y > 0.0){
    r = rainLayer(uv, t, 2.2) + rainLayer(uv*1.37 + 3.1, t*1.1, 2.2)*0.8;
    q += r.xy * 0.06 * p2.y;
    glassBlur = p2.y * (1.0 - clamp(r.z + r.w, 0.0, 1.0)) * 0.006;
  }
  // rack focus: circle of confusion grows with distance from the focus plane
  float coc = uBlur * abs(d - uFocus) * 0.012 + glassBlur + inWin * 0.0025 * p1.z;
  vec3 col = vec3(0.0);
  if (coc > 0.0004){
    float tot = 0.0;
    for (int i = 0; i < 12; i++){
      float a = float(i) * 2.39996; float rr = sqrt((float(i)+0.5)/12.0);
      vec2 o = vec2(cos(a), sin(a)) * rr * coc * vec2(1.0/asp.x, 1.0);
      if (inWin > 0.5) o.x *= 3.0;      // motion blur outside the window
      col += texture2D(tex, q + o).rgb; tot += 1.0;
    }
    col /= tot;
  } else col = texture2D(tex, q).rgb;
  col = pow(col, vec3(2.2)); // to linear
  // fog that thickens with distance, lit by the lights inside it
  float fogAmt = p2.x;
  float fog = 0.0;
  if (fogAmt > 0.0){
    float far = pow(1.0 - d, 0.9);
    float wisps = fbm(q*vec2(2.5, 5.0) + vec2(t*0.035, t*0.01)) ;
    fog = clamp(fogAmt * far * (0.55 + 0.6*wisps), 0.0, 0.93);
    col = mix(col, pow(fc, vec3(2.2)) * (0.8 + 0.4*wisps), fog);
  }
  // light sources: glow, core, anamorphic streak; bigger and softer in fog
  float sc = uRes.x / uRes.y;
  for (int i = 0; i < ${MAXL}; i++){
    vec4 l = L[i];
    if (l.z <= 0.0) continue;
    // compared in texture space, so the glow stays pinned to the lamp as the camera moves
    vec2 dv = q - l.xy; dv.x *= asp.x;
    float r2 = dot(dv, dv);
    float sz = l.w * (1.0 + fog*2.5 + fogAmt*1.2);
    float flick = 0.92 + 0.08*noise(vec2(t*6.0 + float(i)*13.0, 0.0));
    float glow = exp(-r2 / (sz*sz)) * 0.9 + exp(-r2 / (sz*sz*0.06)) * 1.6;
    float streak = exp(-abs(dv.y) * 900.0 / (1.0 + fogAmt*3.0)) * exp(-abs(dv.x) * 9.0) * 0.55;
    col += C[i] * l.z * flick * (glow + streak) * 0.55;
  }
  // festival bokeh: out-of-focus lights drifting in the foreground
  if (p2.z > 0.0){
    vec2 bu = uv * vec2(sc, 1.0) * 7.0;
    for (int k = 0; k < 2; k++){
      vec2 bp = bu * (1.0 + float(k)*0.6) + vec2(0.0, -t*0.05*(1.0+float(k)));
      vec2 id = floor(bp); vec2 f = fract(bp) - 0.5;
      float h = hash(id + float(k)*11.0);
      if (h > 0.55){
        vec2 c = (vec2(hash(id+1.3), hash(id+2.7)) - 0.5) * 0.6;
        float rad = 0.18 + 0.2*hash(id+5.1);
        float disc = sstep(rad, rad - 0.05, length(f - c));
        vec3 bc = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.82, 0.45), hash(id+9.0));
        col += bc * disc * 0.16 * p2.z * (0.6 + 0.4*sin(t*1.5 + h*20.0));
      }
    }
  }
  col = pow(max(col, 0.0), vec3(1.0/2.2));
  return grade(col, g);
}

void main(){
  vec2 uv = vUv;
  vec3 a = shot(tA, dA, aspA, focA, p1A, p2A, wA, winA, gA, fcA, LA, CA, uZoomA, uv);
  vec3 col = a;
  if (uMix > 0.0){
    vec3 b = shot(tB, dB, aspB, focB, p1B, p2B, wB, winB, gB, fcB, LB, CB, uZoomB, uv);
    // depth-ordered dissolve: the new shot arrives through the noise, near things first
    float n = fbm(uv*vec2(uRes.x/uRes.y, 1.0)*2.2 + uTime*0.05);
    float m = sstep(uMix*1.3 - 0.3, uMix*1.3 - 0.05, n);
    float edge = sstep(0.0, 0.5, 1.0 - abs(m - 0.5)*2.0) * (1.0 - abs(uMix - 0.5)*2.0);
    col = mix(b, a, m);
    col += vec3(1.0, 0.86, 0.66) * edge * 0.35;
  }
  // light flood (headlight into the lens)
  col = mix(col, vec3(1.0, 0.97, 0.92), clamp(uFlood, 0.0, 1.0));
  // filmic finish: vignette, grain, subtle chromatic fringe at the edges
  vec2 cuv = uv - 0.5;
  float vig = sstep(0.95, 0.25, length(cuv * vec2(1.0, 1.15)));
  col *= mix(0.62, 1.0, vig);
  col *= uIntro;
  float gr = hash(uv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
  col += gr * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createScene(canvas, opts = {}) {
  const reduce = !!opts.reduce;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  const dpr = Math.min(window.devicePixelRatio || 1, opts.mobile ? 1.25 : 1.6);
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  const cam = new THREE.Camera();
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
  const grey = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255]), 1, 1); grey.needsUpdate = true;
  const lightArr = () => Array.from({ length: MAXL }, () => new THREE.Vector4(0, 0, 0, 0.01));
  const colArr = () => Array.from({ length: MAXL }, () => new THREE.Vector3(1, 1, 1));
  const U = {
    uTime: { value: 0 }, uMix: { value: 0 }, uFlood: { value: 0 }, uBlur: { value: 0 }, uFocus: { value: 0.6 }, uReduce: { value: reduce ? 1 : 0 },
    uIntro: { value: 1 }, uZoomA: { value: 1 }, uZoomB: { value: 1 }, uGrain: { value: 0.045 },
    uRes: { value: new THREE.Vector2(1, 1) }, uPointer: { value: new THREE.Vector2(0, 0) },
    tA: { value: blank }, dA: { value: grey }, tB: { value: blank }, dB: { value: grey },
    aspA: { value: new THREE.Vector2(1.6, 0) }, aspB: { value: new THREE.Vector2(1.6, 0) },
    focA: { value: new THREE.Vector2(0.5, 0.5) }, focB: { value: new THREE.Vector2(0.5, 0.5) },
    p1A: { value: new THREE.Vector4() }, p1B: { value: new THREE.Vector4() }, p2A: { value: new THREE.Vector4() }, p2B: { value: new THREE.Vector4() },
    wA: { value: new THREE.Vector4() }, wB: { value: new THREE.Vector4() }, winA: { value: new THREE.Vector4() }, winB: { value: new THREE.Vector4() },
    gA: { value: new THREE.Vector4(1, 1, 1, 0) }, gB: { value: new THREE.Vector4(1, 1, 1, 0) },
    fcA: { value: new THREE.Vector3(0.6, 0.6, 0.62) }, fcB: { value: new THREE.Vector3(0.6, 0.6, 0.62) },
    LA: { value: lightArr() }, LB: { value: lightArr() }, CA: { value: colArr() }, CB: { value: colArr() },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, depthTest: false, depthWrite: false });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

  const loader = new THREE.TextureLoader();
  const cache = new Map();
  const base = opts.base || "img/pass/";
  const ver = opts.ver ? `?v=${opts.ver}` : "";
  function loadTex(url) {
    return new Promise((res, rej) => loader.load(url, t => { t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; res(t); }, undefined, rej));
  }
  function load(key) {
    if (cache.has(key)) return cache.get(key);
    const sc = SCENES[key];
    const p = (async () => {
      const dep = await loadTex(`${base}${sc.img}-depth.jpg${ver}`);
      let tex;
      if (sc.video && !reduce) {
        const v = document.createElement("video");
        Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, crossOrigin: "anonymous", preload: "auto" });
        v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
        v.src = `${base}${sc.video}.mp4${ver}`;
        await new Promise(r => { v.addEventListener("loadeddata", r, { once: true }); setTimeout(r, 4000); v.play().catch(() => {}); });
        if (v.readyState >= 2) { tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.userData.video = v; }
      }
      if (!tex) tex = await loadTex(`${base}${sc.img}.jpg${ver}`);
      const img = tex.image;
      const asp = (img.videoWidth || img.width) / (img.videoHeight || img.height);
      return { key, sc, tex, dep, asp };
    })();
    cache.set(key, p);
    return p;
  }

  function apply(slot, s) {
    const sc = s.sc, o = s.over || {};
    U[`t${slot}`].value = s.tex; U[`d${slot}`].value = s.dep;
    U[`asp${slot}`].value.set(s.asp, 0);
    U[`foc${slot}`].value.set(sc.focal[0], sc.focal[1]);
    U[`p1${slot}`].value.set(sc.par || 0, sc.dolly || 0, o.sway ?? sc.sway ?? 0, sc.sky || 0);
    U[`p2${slot}`].value.set(o.fog ?? sc.fog ?? 0, o.rain ?? sc.rain ?? 0, o.bokeh ?? sc.bokeh ?? 0, sc.pan || 0);
    const w = sc.water; U[`w${slot}`].value.set(w ? w[0] : 0, w ? w[1] : 0, w ? 1 : 0, 0);
    const wi = sc.window; U[`win${slot}`].value.set(wi ? wi[0] : 0, wi ? 1 - wi[3] : 0, wi ? wi[2] : 0, wi ? 1 - wi[1] : 0);
    const g = sc.grade; U[`g${slot}`].value.set(g[0] * (o.exposure ?? 1), g[1], g[2], g[3]);
    const fc = sc.fogColor || o.fogColor || [0.6, 0.62, 0.64]; U[`fc${slot}`].value.set(...fc);
    const L = U[`L${slot}`].value, C = U[`C${slot}`].value;
    for (let i = 0; i < MAXL; i++) {
      const l = sc.lights[i];
      if (l) { L[i].set(l[0], 1 - l[1], l[2] * (o.lights ?? 1), l[3]); C[i].set(...l[4]); } else L[i].set(0, 0, 0, 0.01);
    }
  }

  let cur = null, next = null, mix = 0, mixDur = 1.6, mixing = false, kind = "dissolve";
  let resolveMix = null;
  const pointer = new THREE.Vector2(), target = new THREE.Vector2();
  let running = true, last = performance.now(), t = Math.random() * 100;

  async function show(key, o = {}) {
    const s = await load(key);
    const st = { ...s, over: o.over || {} };
    if (!cur) { cur = st; apply("A", st); playVideo(st); return; }
    if (cur.key === key && !mixing) { cur = st; apply("A", st); return; }
    if (mixing && next && next.key === key) { next = st; apply("B", st); return; }
    if (mixing) { // finish the current transition at once
      cur = next; apply("A", cur); mixing = false; U.uMix.value = 0;
      if (resolveMix) resolveMix();
    }
    next = st; apply("B", st); playVideo(st);
    kind = o.kind || "dissolve";
    mixDur = reduce ? 0.6 : (o.duration || 1.8);
    mix = 0; mixing = true;
    return new Promise(r => { resolveMix = r; });
  }
  function playVideo(s) { const v = s.tex.userData && s.tex.userData.video; if (v) v.play().catch(() => {}); }
  function update(o) { if (cur) { cur.over = { ...cur.over, ...o }; apply("A", cur); } }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    U.uRes.value.set(w * dpr, h * dpr);
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  resize();
  window.addEventListener("pointermove", e => { target.set((e.clientX / window.innerWidth - 0.5) * 2, -(e.clientY / window.innerHeight - 0.5) * 2); }, { passive: true });

  const fx = { flood: 0, blur: 0, focus: 0.6, intro: 1 };
  let push = 0, pushV = 0; // a spring that scroll speed kicks, so the camera leans into fast scrolling
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (opts.mobile) target.set(Math.sin(t * 0.25) * 0.5, Math.cos(t * 0.19) * 0.3);
    pointer.lerp(target, 1 - Math.pow(0.04, dt));
    U.uPointer.value.copy(pointer);
    U.uTime.value = t;
    if (mixing) {
      mix = Math.min(1, mix + dt / mixDur);
      const e = mix < 0.5 ? 4 * mix * mix * mix : 1 - Math.pow(-2 * mix + 2, 3) / 2;
      U.uMix.value = e;
      // fly through: the old shot pushes in, the new one settles from slightly closer
      U.uZoomA.value = 1 + e * (kind === "flood" ? 0.35 : 0.12);
      U.uZoomB.value = 1 + (1 - e) * 0.08;
      U.uFlood.value = kind === "flood" ? Math.sin(Math.PI * e) * 0.95 : 0;
      if (mix >= 1) {
        mixing = false; cur = next; next = null; apply("A", cur); U.uMix.value = 0; U.uZoomA.value = 1; U.uZoomB.value = 1; U.uFlood.value = 0;
        if (resolveMix) { resolveMix(); resolveMix = null; }
      }
    }
    pushV += (-push * 60 - pushV * 11) * dt; push += pushV * dt;
    if (!mixing) U.uZoomA.value = 1 + Math.max(-0.04, Math.min(0.08, push));
    U.uBlur.value += (fx.blur - U.uBlur.value) * (1 - Math.pow(0.02, dt));
    U.uFocus.value += (fx.focus - U.uFocus.value) * (1 - Math.pow(0.02, dt));
    U.uIntro.value += (fx.intro - U.uIntro.value) * (1 - Math.pow(0.1, dt));
    if (!mixing) U.uFlood.value += (fx.flood - U.uFlood.value) * (1 - Math.pow(0.001, dt));
    renderer.render(scene, cam);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    load, show, update,
    focus(depth, blur) { fx.focus = depth; fx.blur = reduce ? 0 : blur; },
    flood(v) { fx.flood = v; },
    nudge(v) { if (!reduce) pushV += Math.max(-1.5, Math.min(1.5, v)) * 3.2; },
    exposure(v, instant = false) { fx.intro = v; if (instant) U.uIntro.value = v; },
    pause() { running = false; cache.forEach(p => p.then(s => s.tex.userData?.video?.pause())); },
    resume() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); if (cur) playVideo(cur); },
    get current() { return cur ? cur.key : null; },
  };
}
