// The Passenger stage: one continuous world the camera flies through as the page scrolls.
// Scroll position becomes a chapter clock T (chapter n spans T = n-1 .. n); the camera follows smooth
// splines between keyframes, and each chapter's effects are a function of T, so scrubbing backwards
// replays everything in reverse. The opening (particles condensing into the train) runs on its own
// clock F, once, then hands over to scroll. Every time and number on screen arrives through setData()
// as finished text from passenger.js; the stage never computes one.
import * as THREE from "three";
import { createWorld, ease, clamp01, seg, lerp, TIERS } from "./world.js?v=202611130818";
import { locomotive, coach, interior, track, catenary, platform, MAT } from "./train.js?v=202611130818";
import * as FX from "./fx.js?v=202611130818";
import * as S from "./sets.js?v=202611130818";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// World layout (metres). The train faces −X; its nose is at x = 0. Platform on the −Z side.
const LOCO_L = 20.5, COACH_L = 24, GAP = 0.6;
const coachX = i => LOCO_L + GAP + COACH_L / 2 + i * (COACH_L + GAP);
const BOARD = 1;                                  // the coach we board
const BX = coachX(BOARD);                         // its centre
const DOOR_X = BX - (COACH_L / 2 - 0.9);          // the boarding door (platform side, front end)
const RAIL = 0.2;                                 // wheel tread height above ground
const FLOOR = RAIL + 1.6;                         // coach floor
const EYE = FLOOR + 1.6;                          // standing eye height inside
// Sets that live far from the station, reached through a cut (white-out or a dip to black).
const TUN = V(0, -600, 0), MAPO = V(0, 0, 40000), SCULPT = V(0, 0, -40000), RIVO = V(3000, 0, -40000), SIGO = V(6000, 0, -40000), CITYO = V(9000, 0, -40000);
const DIPS = [9.0, 10.0, 11.0, 12.0, 13.0];      // cuts through black between sets
const WEATHER_X = [-110, -290];                   // the train approaches through the weather (nose x)

// Camera keyframes: [T, position, look-at, fov]. "fn" segments are computed from live data (the map).
const SEGMENTS = [
  { t0: 0, t1: 1.52, keys: [
    [0.00, V(-27, 1.7, 15.5), V(5.8, 3.4, -7.4), 34],
    [0.50, V(-21, 1.9, 10.5), V(4.5, 3.2, -4.6), 34],
    [1.00, V(-14, 2.6, 4.2), V(0, 3.0, 0.0), 33],
    [1.25, V(-6.8, 3.05, 0.7), V(0, 3.12, 0.0), 32],
    [1.45, V(-1.7, 3.15, 0.0), V(1.0, 3.15, 0.0), 28],
    [1.52, V(-0.35, 3.15, 0.0), V(2.0, 3.15, 0.0), 24],
  ] },
  { t0: 1.52, t1: 1.94, fn: "tunnel" },
  { t0: 1.94, t1: 6.22, keys: [
    [1.94, V(DOOR_X - 13, 2.7, -7.4), V(DOOR_X + 3, 2.7, -1.8), 42],
    [2.15, V(DOOR_X - 5.0, 2.7, -5.6), V(DOOR_X + 0.6, 2.65, -1.7), 40],
    [2.38, V(DOOR_X - 1.5, 2.72, -4.5), V(DOOR_X + 0.15, 2.62, -1.6), 40],
    [2.52, V(DOOR_X - 0.1, 2.95, -2.7), V(DOOR_X + 0.2, 3.0, 0.5), 42],
    [2.60, V(DOOR_X + 0.05, 3.15, -1.4), V(DOOR_X + 1.6, 3.2, 1.0), 44],
    [2.72, V(DOOR_X + 0.8, EYE - 0.05, -0.2), V(DOOR_X + 4, EYE - 0.1, 0.4), 46],
    [2.85, V(DOOR_X + 2.0, EYE, 0.0), V(DOOR_X + 14, EYE - 0.3, 0.0), 46],
    [3.00, V(DOOR_X + 4.9, EYE, 0.0), V(DOOR_X + 16, EYE - 0.35, -0.2), 46],
    // 4 · the window seat
    [3.30, V(BX - 2.6, EYE - 0.25, -0.25), V(BX + 2.5, FLOOR + 1.3, -1.4), 48],
    [3.60, V(BX - 0.65, FLOOR + 1.22, -0.95), V(BX + 0.72, FLOOR + 1.42, -1.5), 50],
    [4.00, V(BX - 0.6, FLOOR + 1.2, -0.98), V(BX + 0.76, FLOOR + 1.4, -1.5), 48],
    // 5 · the LED board at the end of the coach
    [4.30, V(BX + 0.2, EYE - 0.2, -0.35), V(BX + 11, FLOOR + 2.05, 0), 46],
    [4.70, V(BX + 5.2, EYE - 0.25, 0), V(BX + 10.9, FLOOR + 2.05, 0), 40],
    [5.00, V(BX + 7.4, FLOOR + 1.95, 0), V(BX + 10.9, FLOOR + 2.05, 0), 34],
    // 6 · the pass, then turn to a window and go through it
    [5.40, V(BX + 7.0, FLOOR + 1.8, 0.1), V(BX + 10.9, FLOOR + 1.8, 0.1), 40],
    [5.80, V(BX + 5.8, FLOOR + 1.45, -0.7), V(BX + 5.5, FLOOR + 1.42, -1.6), 44],
    [6.10, V(BX + 5.45, FLOOR + 1.42, -1.25), V(BX + 5.4, FLOOR + 1.45, -3), 50],
    [6.22, V(BX + 5.4, FLOOR + 1.42, -1.46), V(BX + 5.4, FLOOR + 1.5, -4), 56],
  ] },
  { t0: 6.22, t1: 9.0, fn: "map" },
  { t0: 9.0, t1: 10.0, fn: "sculpt" },
  { t0: 10.0, t1: 11.0, keys: [
    [10.0, V(-332, 1.6, 6.0), V(-200, 3.0, 0), 38],
    [10.5, V(-330, 1.5, 5.6), V(-230, 3.1, 0), 36],
    [11.0, V(-326, 1.4, 5.0), V(-262, 3.1, 0), 34],
  ] },
  { t0: 11.0, t1: 12.0, keys: [
    [11.0, RIVO.clone().add(V(-70, 16, 30)), RIVO.clone().add(V(-30, 0, 0)), 40],
    [11.5, RIVO.clone().add(V(-24, 8, 21)), RIVO.clone().add(V(-3, 4.2, 0)), 40],
    [12.0, RIVO.clone().add(V(6, 9, 21)), RIVO.clone().add(V(1, 4.8, 0)), 40],
  ] },
  { t0: 12.0, t1: 13.0, keys: [
    [12.0, SIGO.clone().add(V(-10, 1.8, 13)), SIGO.clone().add(V(0, 7.2, 0)), 40],
    [12.5, SIGO.clone().add(V(-3, 2.5, 11)), SIGO.clone().add(V(0, 7.6, 0)), 38],
    [13.0, SIGO.clone().add(V(6, 3.4, 9.5)), SIGO.clone().add(V(0, 7.8, 0)), 36],
  ] },
  { t0: 13.0, t1: 99, keys: [
    [13.0, CITYO.clone().add(V(0, 9.5, 16)), CITYO.clone().add(V(0, 9, -10)), 40],
    [13.6, CITYO.clone().add(V(-1.5, 9.2, 13)), CITYO.clone().add(V(0, 9, -10)), 40],
    [14.0, CITYO.clone().add(V(1.0, 9.0, 8.5)), CITYO.clone().add(V(0, 9, -10)), 44],
    [14.5, CITYO.clone().add(V(1.2, 9.0, 8.0)), CITYO.clone().add(V(0, 9, -10)), 44],
  ] },
];
for (const s of SEGMENTS) if (s.keys) {
  s.pos = new THREE.CatmullRomCurve3(s.keys.map(k => k[1]), false, "centripetal");
  s.look = new THREE.CatmullRomCurve3(s.keys.map(k => k[2]), false, "centripetal");
}
function keyed(s, T, out) {
  const k = s.keys;
  let i = 0; while (i < k.length - 2 && T >= k[i + 1][0]) i++;
  const f = clamp01((T - k[i][0]) / (k[i + 1][0] - k[i][0]));
  const u = (i + f) / (k.length - 1);
  s.pos.getPoint(u, out.pos); s.look.getPoint(u, out.look);
  out.fov = lerp(k[i][3], k[i + 1][3], ease.smooth(f));
  return out;
}

export function createStage(canvas, { mobile = false, reduce = false, onTier, ver = "" } = {}) {
  const W = createWorld(canvas, { mobile, onTier });
  const { scene, camera, post, renderer } = W;
  const tier = () => TIERS[W.tier];
  scene.fog = new THREE.FogExp2(0x090b11, 0.013);
  scene.environment = FX.makeEnv(renderer);

  // ===== chapters 1–3, 11: the station and the train =====
  const exterior = new THREE.Group(); scene.add(exterior);
  const skyM = FX.sky(); scene.add(skyM);
  exterior.add(FX.hills(), FX.ground());
  const world = new THREE.Group(); exterior.add(world);
  const tr = track(1400); tr.position.set(200, 0, 0); world.add(tr);
  const cat = catenary(1400); cat.position.set(200, 0, 0); world.add(cat);
  const plat = platform(260, -1); plat.position.set(60, 0, 0); world.add(plat);
  const board = FX.stationBoard(); board.position.set(DOOR_X - 7, 4.25, -6.2); board.rotation.y = -Math.PI / 2; world.add(board);
  const board2 = FX.stationBoard(); board2.position.set(-6, 4.25, -6.2); board2.rotation.y = -Math.PI / 2; world.add(board2);

  const train = new THREE.Group(); train.position.y = RAIL; world.add(train);
  const loco = locomotive(); loco.rotation.y = Math.PI; loco.position.x = LOCO_L / 2; train.add(loco);
  for (const z of [-1, 1]) { const d = FX.decal("WAP-7", "#c8261f", 2.2, 0.45); d.position.set(LOCO_L / 2 - 4.5, 2.1, z * 1.615); d.rotation.y = z > 0 ? 0 : Math.PI; loco.add(d); }
  const coaches = [], routes = [];
  for (let i = 0; i < 4; i++) {
    const c = coach(); c.position.x = coachX(i); train.add(c); coaches.push(c);
    for (const z of [-1, 1]) { const rb = FX.routeBoard(); rb.position.set(0, 3.85, z * 1.635); rb.rotation.y = z > 0 ? 0 : Math.PI; c.add(rb); routes.push(rb); }
  }
  const bc = coaches[BOARD];
  const door = bc.userData.door, door0 = door.position.clone();
  FX.interiorGlass(bc.userData.windowMat, { floor: FLOOR, ceil: FLOOR + 2.45, pitch: 2.35, coach0: coachX(0), coachPitch: COACH_L + GAP });
  const dw = FX.vestibule(0.95, 2.2, 1.7); dw.position.set(door0.x, door0.y, -1.634); dw.rotation.y = Math.PI; bc.add(dw);

  // ===== chapters 3–6: inside the coach =====
  const inside = interior(); inside.position.set(BX, FLOOR, 0); inside.visible = false; scene.add(inside);
  const vid = S.videoWindow(1.42, 0.86, `img/pass/onboard-night.mp4?v=${ver}`);
  vid.position.set(0.7, 1.45, -1.462); inside.add(vid);
  inside.userData.boardMesh.visible = false;
  const led = S.ledBoard(2.4, 0.43); led.position.set(10.95, 2.05, 0); led.rotation.y = -Math.PI / 2; inside.add(led);
  const pass = S.passCard(); pass.visible = false; scene.add(pass);
  pass.traverse(o => { if (o.material) { o.material.depthTest = false; o.renderOrder = 20; } });

  // ===== materialise: dissolve uniforms on every lit material, particles sampled from the train =====
  const DU = FX.dissolveUniforms();
  FX.dissolve(world, DU); FX.dissolve(inside, DU);
  const nP = Math.round(42000 * tier().particles * (mobile ? 0.7 : 1));
  const cloud = FX.particleCloud(FX.sampleSurface([loco, coaches[0], coaches[1]], nP), -0.5, coachX(1) + COACH_L / 2);
  scene.add(cloud);
  const xSpan = [-0.5, coachX(1) + COACH_L / 2];
  const dustP = FX.dust(mobile ? 900 : 1800, new THREE.Box3(V(-60, 0.3, -9), V(60, 7, 9)));
  scene.add(dustP);

  // ===== headlight =====
  const head0 = V(-0.06, RAIL + 2.95, 0), headW = head0.clone();
  const beamG = FX.beam(80); world.add(beamG);
  const glareM = FX.glare(3.2); world.add(glareM);
  const spot = new THREE.SpotLight(0xfff0dc, 0, 140, 0.32, 0.55, 1.3); scene.add(spot, spot.target);
  const lampMat = MAT.lamp, lampBase = lampMat.emissiveIntensity;

  // ===== fixed light rig (never changes count, so shaders compile once) =====
  const HEMI = 0.22, MOON = 0.9;
  const hemi = new THREE.HemisphereLight(0x2a3a5c, 0x0b0907, HEMI); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fa6ff, MOON); moon.position.set(30, 26, -60); scene.add(moon); // backlight: rims the train
  const key = new THREE.PointLight(0xffd6a0, 0, 26, 1.6); scene.add(key);
  const fill = new THREE.PointLight(0xffe2c0, 0, 22, 1.6); scene.add(fill);
  const KEYC = new THREE.Color(0xffd6a0);

  // ===== chapter 2: the tunnel =====
  const tun = FX.tunnel({ count: mobile ? 520 : 900, streaks: mobile ? 420 : 700 });
  tun.position.copy(TUN); tun.visible = false; scene.add(tun);

  // ===== chapters 7–9: the corridor from above (built when the network arrives) =====
  let corr = null; const mapG = new THREE.Group(); mapG.position.copy(MAPO); mapG.visible = false; scene.add(mapG);
  const routeBox = { c: new THREE.Vector3(), r: 150 };

  // ===== chapter 10: Saathi =====
  const sculpt = S.sculpture(Math.round((mobile ? 14000 : 24000) * tier().particles));
  sculpt.position.copy(SCULPT); sculpt.visible = false; scene.add(sculpt);

  // ===== chapter 11: weather on the open line =====
  const rainM = S.rain(mobile ? 2500 : 5000); rainM.visible = false; scene.add(rainM);
  const fogS = S.fogSheets(); fogS.visible = false; world.add(fogS);

  // ===== chapter 12: the forecast river =====
  const riv = S.river(); riv.position.copy(RIVO); riv.visible = false; scene.add(riv);

  // ===== chapter 13: the signal =====
  const sig = S.signal(); sig.position.copy(SIGO); sig.visible = false; scene.add(sig);

  // ===== chapter 14: arrival =====
  const city = new THREE.Group(); city.position.copy(CITYO); city.visible = false; scene.add(city);
  const photo = S.depthPhoto(32, 18); photo.position.set(0, 9, -10); city.add(photo);
  const dial = S.upright(S.pickDial()); dial.position.set(3.6, 8.2, 1.5); dial.scale.setScalar(0.62); city.add(dial);
  let stick = null; const stickHolder = new THREE.Group(); stickHolder.position.set(0, 8.6, 3); city.add(stickHolder);

  // ===== state =====
  let rush = false, T = 0, Tt = 0, F = reduce ? 1 : 0, introStart = -1, introDone = reduce, paused = false, t0 = performance.now(), last = t0;
  let mx = 0, my = 0, smx = 0, smy = 0, tunT = 0, lastT = 0, vel = 0, insideNow = false;
  let data = null, shake = 0, glitch = 0, red = 0, sigPulse = 0;
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, cut: false };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = V(0, 1, 0);
  const A = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 }, B = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
  const LP = new THREE.Vector3(), LQ = new THREE.Vector3(), LD = new THREE.Vector3(), LS = new THREE.Vector3(), ZERO = new THREE.Vector3();
  addEventListener("pointermove", e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });

  function setPx() {
    const f = W.size.H * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    cloud.userData.u.uPx.value = f; dustP.userData.u.uPx.value = f; sculpt.userData.u.uPx.value = f;
  }

  // ----- camera for the data-driven segments -----
  function mapPose(T, out) {
    const C = tmp.copy(corr ? corr.userData.comet.position : ZERO).add(MAPO);
    const ctr = tmp2.copy(routeBox.c).add(MAPO), R = routeBox.r;
    const over = (t, o) => {
      const a = -0.5 + (t - 6.6) * 0.32, r = R * 1.15 + 70;
      o.pos.set(ctr.x + Math.sin(a) * r * 0.6, r * 0.78, ctr.z + Math.cos(a) * r * 0.95);
      o.look.copy(ctr).lerp(C, 0.45); o.fov = 42; return o;
    };
    const rise = (t, o) => {
      const f = ease.inOut(seg(t, 6.22, 6.75));
      over(6.75, B);
      o.pos.set(C.x, C.y + 2.5, C.z + 6).lerp(B.pos, f);
      o.look.set(C.x - 4, C.y, C.z - 25).lerp(B.look, ease.smooth(f));
      o.fov = lerp(60, B.fov, f); return o;
    };
    const low = (t, o) => {
      if (!corr?.userData.path || !data) return over(t, o);
      const kms = corr.userData.kms, kb = kms[data.b], kd = kms[data.d];
      const u = ease.inOut(seg(t, 8.0, 9.0));
      const km = lerp(kb - 12, kd + 4, u);
      const P = corr.userData.at(km, LP), Q = corr.userData.at(km + 40, LQ);
      const dir = LD.copy(Q).sub(P).setY(0).normalize(), side = LS.set(dir.z, 0, -dir.x);
      o.pos.copy(P).addScaledVector(side, 26).addScaledVector(dir, -28).add(MAPO); o.pos.y = 22;
      o.look.copy(corr.userData.at(km + 26, LQ)).add(MAPO); o.look.y = 19; o.fov = 46; return o;
    };
    if (T < 6.75) return rise(T, out);
    if (T < 7.85) return over(T, out);
    if (T < 8.1) { over(T, A); low(T, B); const f = ease.smooth(seg(T, 7.85, 8.1)); out.pos.copy(A.pos).lerp(B.pos, f); out.look.copy(A.look).lerp(B.look, f); out.fov = lerp(A.fov, B.fov, f); return out; }
    return low(T, out);
  }
  function sculptPose(T, out, time) {
    const a = (T - 9) * 0.45 + time * 0.02;
    out.pos.set(SCULPT.x + Math.sin(a) * 29, SCULPT.y + 1.5 + (T - 9) * 1.5, SCULPT.z + Math.cos(a) * 29);
    out.look.copy(SCULPT); out.look.y += 0.5;
    if (camera.aspect >= 1.3) { out.look.x -= Math.cos(a) * 7; out.look.z += Math.sin(a) * 7; }   // shape on the right, tip on the left
    else out.look.y -= 4.5;                                                                       // phones: shape above the tip
    out.fov = 40; return out;
  }
  function cameraAt(T, out, time) {
    const s = SEGMENTS.find(x => T >= x.t0 && T < x.t1) || SEGMENTS[SEGMENTS.length - 1];
    out.seg = s.fn || "keys";
    if (s.fn === "tunnel") { out.pos.copy(TUN); out.look.copy(TUN); out.look.z -= 10; out.fov = 62; return out; }
    if (s.fn === "map") return mapPose(T, out);
    if (s.fn === "sculpt") return sculptPose(T, out, time);
    return keyed(s, T, out);
  }

  // Opening: F 0→1 over ~6 s. Particles fly in; the surface sweeps in behind them; then the headlight.
  function applyFormation() {
    const prog = clamp01(F / 0.86) * 1.05;
    cloud.userData.u.uProg.value = prog;
    const front = xSpan[0] + ((prog - 0.42 - 0.13) / 0.45) * (xSpan[1] - xSpan[0]);
    DU.uFront.value = F >= 1 ? 1e6 : front;
    cloud.visible = F < 1 || T < 0.02;
    cloud.userData.u.uI.value = 1 - seg(F, 0.9, 1);
    const ig = seg(F, 0.82, 0.97);
    return ig <= 0 ? 0 : ig >= 1 ? 1 : (ig < 0.35 ? (Math.sin(ig * 90) > 0.2 ? 0.6 : 0.05) : ig < 0.5 ? 0.15 : ease.out(seg(ig, 0.5, 1)));
  }
  // daylight from the replay clock: 0 at night, 1 in full day, with a warm dusk/dawn bell
  const dayOf = h => ease.smooth(seg(h, 5.6, 7.4)) * (1 - ease.smooth(seg(h, 17.4, 19.2)));
  const duskOf = h => Math.max(Math.exp(-Math.pow((h - 18.3) / 0.9, 2)), Math.exp(-Math.pow((h - 6.2) / 0.8, 2)));

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (paused) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = (now - t0) / 1000;
    W.govern(dt);
    if (!introDone && rush) { F = Math.min(1, F + dt * 0.9); if (F >= 1) introDone = true; }
    else if (!introDone && introStart >= 0) { F = Math.min(1, (now - introStart) / 6200); if (F >= 1) introDone = true; }
    const k = reduce ? 1 : 1 - Math.exp(-dt * 3.2);
    T += (Tt - T) * k; if (Math.abs(Tt - T) < 1e-4) T = Tt;
    vel = lerp(vel, Math.abs(T - lastT) / Math.max(dt, 1e-3), 0.1); lastT = T;
    smx = lerp(smx, mx, 1 - Math.exp(-dt * 3)); smy = lerp(smy, my, 1 - Math.exp(-dt * 3));
    shake = Math.max(0, shake - dt * 1.6); glitch = Math.max(0, glitch - dt * 1.4); red = Math.max(0, red - dt * 0.7); sigPulse = Math.max(0, sigPulse - dt * 0.8);

    const lamp = applyFormation();
    if (corr && data) corr.userData.setKm(data.km, dt);
    cameraAt(T, cam, time);
    // narrow screens keep the desktop's horizontal framing (the train, the LED board and the pass stay whole)
    if (camera.aspect < 1.3) cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * Math.min(1.6 / camera.aspect, 2.6)));

    // ----- which set is on screen -----
    const tunnelOn = cam.seg === "tunnel";
    const wxOn = T >= 10 && T < 11;
    insideNow = T > 2.4 && T < 6.22 && cam.pos.z > -1.5;
    const stationOn = T < 1.52 || (T >= 1.94 && T < 3 && !insideNow) || wxOn;
    exterior.visible = stationOn;
    inside.visible = T >= 2.3 && T < 6.22;
    tun.visible = T > 1.46 && T < 2.0;
    mapG.visible = !!corr && T >= 6.15 && T < 9.02;
    skyM.visible = stationOn || mapG.visible;
    dustP.visible = stationOn && !wxOn;
    sculpt.visible = T > 8.98 && T < 10.02;
    rainM.visible = wxOn && !!data && data.wx.rain > 0.5;
    fogS.visible = wxOn;
    riv.visible = T > 10.98 && T < 12.02;
    sig.visible = T > 11.98 && T < 13.02;
    city.visible = T > 12.98;

    // ----- time of day (the corridor and the weather follow the replay clock; the station opening is night) -----
    const h = data ? data.hour : 22;
    const day = (mapG.visible || wxOn) ? dayOf(h) : 0, dusk = (mapG.visible || wxOn) ? duskOf(h) : 0;
    const su = skyM.userData.u; su.uDay.value = day; su.uDusk.value = dusk;
    const env = ease.smooth(seg(F, 0.3, 0.95));
    const fogVeil = wxOn && data ? THREE.MathUtils.clamp((1.2 - data.wx.vis) / 1.0, 0, 0.85) : 0;
    su.uFade.value = env * (1 - fogVeil);   // in thick fog the stars go
    hemi.intensity = (HEMI + day * 0.9) * env; moon.intensity = MOON * env * (1 - day * 0.5);
    if (corr) corr.userData.U.uNight.value = 1 - day;

    // ----- fog per set -----
    if (wxOn && data) {
      const vis = Math.max(0.05, data.wx.vis);
      scene.fog.density = THREE.MathUtils.clamp(1.98 / (vis * 1000), 0.006, 0.035);
      scene.fog.color.setRGB(0.035 + day * 0.25, 0.04 + day * 0.27, 0.05 + day * 0.3);
    } else if (stationOn || insideNow) { scene.fog.density = lerp(0.06, 0.013, env); scene.fog.color.setHex(0x090b11); }
    else { scene.fog.density = 0.004; scene.fog.color.setRGB(0, 0, 0); }

    // ----- the train runs in for the weather chapter -----
    const wxP = seg(T, 10, 11);
    train.position.x = wxOn ? lerp(WEATHER_X[0], WEATHER_X[1], ease.out(wxP)) : 0;
    headW.copy(head0); headW.x += train.position.x;
    beamG.position.copy(headW); glareM.position.copy(headW); glareM.position.x -= 0.25;
    spot.position.copy(headW); spot.target.position.set(headW.x - 40, headW.y - 3.2, headW.z);

    // headlight: on after ignition; brightens as the camera pushes in; stronger in fog
    const push = ease.in(seg(T, 1.0, 1.52));
    const fogK = wxOn && data ? THREE.MathUtils.clamp(1.4 - data.wx.vis, 0, 1) : 0;
    lampMat.emissiveIntensity = lampBase * lamp * (1 + push * 3);
    beamG.userData.u.uI.value = lamp * (1 - push * 0.6) * (1 + fogK * 2.5);
    glareM.userData.u.uI.value = lamp * (0.65 + push * 2.2);
    spot.intensity = lamp * 220 * (stationOn ? 1 : 0);
    dustP.userData.u.uI.value = lamp;
    dustP.userData.u.uBeam.value.copy(headW);

    // door: plug out, then slide
    const d = seg(T, 2.12, 2.42);
    const pop = ease.out(seg(d, 0, 0.25)), slide = ease.inOut(seg(d, 0.2, 1));
    door.position.set(door0.x + slide * 1.0, door0.y, door0.z - pop * 0.07);
    dw.userData.u.uOpen.value = ease.smooth(seg(d, 0.05, 0.6));

    // ----- roaming lights -----
    key.color.copy(KEYC);
    const envK = hemi.intensity / HEMI;
    if (insideNow) {
      key.position.set(cam.pos.x + 5, FLOOR + 2.0, 0); key.intensity = 5; key.distance = 9;
      fill.position.set(cam.pos.x + 9, FLOOR + 2.15, -0.25); fill.intensity = 6; fill.distance = 11;
      if (T > 3.2 && T < 4.4) { fill.position.set(BX + 0.7, FLOOR + 1.45, -1.1); fill.color.setRGB(0.55, 0.65, 1.0); fill.intensity = 1.6; fill.distance = 3; } else fill.color.setHex(0xffe2c0);
    } else if (sig.visible) {
      key.position.set(SIGO.x, SIGO.y + 7.9, SIGO.z + 2.2); key.color.copy(sig.userData.color); key.intensity = sig.userData.glow || 20; key.distance = 30;
      fill.intensity = 0;
    } else if (wxOn) {
      key.position.set(-310, 6, -7); key.intensity = 10; key.distance = 30; fill.intensity = 0;
    } else if (T >= 1.9) {
      key.position.set(DOOR_X + 0.3, FLOOR + 1.2, -2.2); key.intensity = 4.5 * dw.userData.u.uOpen.value; key.distance = 6;
      fill.position.set(DOOR_X - 7, 5.6, -6.4); fill.intensity = 14; fill.distance = 16; fill.color.setHex(0xffe2c0);
    } else {
      key.position.set(6, 5.6, -6.0); key.intensity = 26 * Math.min(1, envK); key.distance = 18;
      fill.position.set(30, 5.6, -6.0); fill.intensity = 22 * Math.min(1, envK); fill.distance = 18;
    }

    // ----- chapter effects -----
    if (tun.visible) {
      tunT += dt * (34 + vel * 520);
      const tu = tun.userData.u; tu.uT.value = tunT; tu.uTime.value = time;
      tu.uI.value = seg(T, 1.5, 1.6) * (1 - seg(T, 1.86, 1.94));
    }
    // 4 · window seat: the video plays only while it can be seen
    const vu = vid.userData.u; vu.uTime.value = time;
    if (inside.visible && T > 3.05 && T < 4.6) vid.userData.play(); else vid.userData.pause();
    if (data) vu.uRain.value = 0.32 + Math.min(1, data.wx.rain / 30) * 0.6;
    // 5 · LED board: the display's estimate, then Kalyon's, wiping in
    led.userData.u.uMix.value = ease.inOut(seg(T, 4.45, 4.82)); led.userData.u.uTime.value = time;
    // 6 · the pass
    const pp = T - 5;
    pass.visible = pp > -0.02 && pp < 1.12 && inside.visible;
    // 7–9 · the corridor
    if (corr && mapG.visible) {
      corr.userData.U.uTime.value = time;
      const sg = corr.userData.signs; sg.visible = T > 7.6;
      const labA = 1 - ease.smooth(seg(T, 7.6, 7.95));
      for (const k in corr.userData.stations) { const L = corr.userData.stations[k].lab; L.material.opacity = labA; L.visible = labA > 0.01; }
      sg.children.forEach(m => { m.material.opacity = (m.userData.x.passed ? 0.5 : 1) * ease.smooth(seg(T, 7.6, 8.05)); });
    }
    // 10 · Saathi: morph through one shape per tip as the tips scroll by
    if (sculpt.visible) {
      const su2 = sculpt.userData.u; su2.uTime.value = time;
      // same shape for each tip type as passenger.js SHAPE_OF (clock, wave, fog, rain, crowd; else the sphere)
      const shapes = (data?.tips?.length ? data.tips : ["why"]).map(i => ({ clock: 1, home: 1, trend: 2, range: 2, fog: 3, rain: 4, crowd: 5 }[i] ?? 0));
      const p = clamp01((T - 9) / 0.95) * shapes.length, i = Math.min(shapes.length - 1, Math.floor(p));
      const nx = Math.min(shapes.length - 1, i + 1);
      su2.uA.value = shapes[i]; su2.uB.value = shapes[nx]; su2.uMix.value = nx === i ? 0 : ease.inOut(seg(p - i, 0.82, 1));
      su2.uI.value = seg(T, 9.0, 9.12) * (1 - seg(T, 9.9, 10.0));
    }
    // 11 · weather
    if (wxOn && data) {
      rainM.userData.u.uTime.value = time; rainM.userData.u.uI.value = Math.min(1, data.wx.rain / 25) * 1.2; rainM.userData.u.uC.value.copy(cam.pos); rainM.userData.u.uC.value.x += 10; rainM.userData.u.uBeam.value.copy(headW);
      fogS.userData.u.uTime.value = time; fogS.userData.u.uI.value = THREE.MathUtils.clamp((1.6 - data.wx.vis) / 1.2, 0.08, 1); fogS.userData.u.uBeam.value.copy(headW);
    }
    // 12 · river
    if (riv.visible) riv.userData.u.uTime.value = time;
    // 13 · signal
    if (sig.visible) sig.userData.set(data?.alert || "ok", sigPulse, time);
    // 14 · arrival
    if (city.visible) {
      photo.userData.u.uI.value = seg(T, 13.0, 13.12);
      dial.material.opacity = seg(T, 13.05, 13.2) * (1 - seg(T, 13.5, 13.7));
      if (stick) stick.userData.u.uB.value = seg(T, 13.82, 14.0) > 0 ? seg(T, 13.82, 14.25) : 0;
      if (stick) stick.visible = T > 13.82;
    }

    // ----- camera -----
    camera.position.copy(cam.pos);
    if (!reduce && !tunnelOn) {
      const amp = insideNow ? 0.08 : cam.seg === "map" ? 3 : 0.5 * (1 - push);
      tmp.subVectors(cam.look, cam.pos).normalize();
      const right = tmp.clone().cross(up).normalize();
      camera.position.addScaledVector(right, smx * amp).addScaledVector(up, -smy * amp * 0.5);
      if (!insideNow && cam.seg === "keys") camera.position.y += Math.sin(time * 0.6) * 0.03 * (1 - push);
      if (insideNow) { camera.position.y += Math.sin(time * 1.7) * 0.006; camera.position.z += Math.sin(time * 1.1) * 0.008; }
      if (shake > 0) camera.position.add(tmp2.set(Math.sin(time * 61), Math.sin(time * 47 + 1), Math.sin(time * 53 + 2)).multiplyScalar(shake * shake * 0.12));
    }
    camera.lookAt(cam.look);
    if (tunnelOn) camera.rotateZ(time * 0.08 + T * 2.0);
    if (insideNow && !reduce) camera.rotateZ(Math.sin(time * 0.7) * 0.004); // sway
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); setPx(); }
    skyM.position.copy(camera.position);
    if (pass.visible) {
      const inP = ease.out(seg(pp, 0.0, 0.22)), outP = ease.in(seg(pp, 0.9, 1.1));
      pass.position.copy(camera.position); pass.quaternion.copy(camera.quaternion);
      pass.translateZ(-1.05); pass.translateY(-0.55 * (1 - inP) - 0.7 * outP + 0.02);
      const flip = ease.inOut(seg(pp, 0.52, 0.78)) * Math.PI * 2;
      pass.rotateX(-0.9 * (1 - inP) + 0.6 * outP + (reduce ? 0 : smy * 0.25)); pass.rotateY(flip + (reduce ? 0 : smx * 0.4)); pass.rotateZ(0.06 * (1 - inP));
      const tear = ease.inOut(seg(pp, 0.8, 0.95));
      const st = pass.userData.stub; st.rotation.set(0, tear * 0.9, -tear * 0.5); st.position.set(0.31 + tear * 0.18, -tear * tear * 0.5, tear * 0.15);
      pass.userData.mats.forEach(m => { m.uniforms.uTime.value = time + T * 8; m.uniforms.uI.value = inP * (1 - outP); });
    }

    // ----- post -----
    const whiteIn = seg(T, 1.38, 1.52), whiteOut = 1 - seg(T, 1.52, 1.62);
    const whiteIn2 = seg(T, 1.86, 1.94), whiteOut2 = 1 - seg(T, 1.94, 2.06);
    const cross = Math.exp(-Math.pow((T - 2.565) / 0.045, 2)) * 0.92;   // stepping through the door: a warm wash of light
    const glass = Math.exp(-Math.pow((T - 6.22) / 0.05, 2));             // out through the window
    post.flash = Math.max(T < 1.52 ? ease.in(whiteIn) : T < 1.7 ? whiteOut : 0, T < 1.94 ? ease.in(whiteIn2) * 0.95 : T < 2.1 ? whiteOut2 * 0.95 : 0, cross, glass, F < 1 ? seg(F, 0.86, 0.9) * (1 - seg(F, 0.9, 1)) * 0.25 : 0);
    const dip = DIPS.reduce((a, c) => Math.max(a, Math.exp(-Math.pow((T - c) / 0.045, 2))), 0);
    post.exposure = (reduce ? 1 : lerp(0.25, 1, ease.out(seg(F, 0, 0.5)))) * (1 + push * 0.6) * (1 - dip) * (insideNow && T > 4.95 && T < 6.1 ? 0.78 : 1);
    post.bloomK = tunnelOn ? 1.25 : cam.seg === "map" ? 1.05 : (insideNow ? 0.55 : 0.8) + push * 0.6;
    post.threshold = tunnelOn ? 0.5 : cam.seg === "map" ? 0.9 : 1.0;
    post.ca = tunnelOn ? 0.006 + Math.min(0.01, vel * 0.02) : 0.0022 + push * 0.004 + glitch * 0.01;
    post.vig = 1;
    post.glitch = reduce ? 0 : glitch;
    post.red = red * 0.55;
    skyM.userData.u.uTime.value = time;
    cloud.userData.u.uTime.value = time;
    dustP.userData.u.uTime.value = time;
    beamG.userData.u.uTime.value = time;
    glareM.userData.u.uTime.value = time;
    W.render(time);
  }
  setPx();
  let raf = requestAnimationFrame(frame);

  // Compile every set's shaders while the page is idle, so no chapter hitches the first time it appears.
  const ALL = [exterior, inside, tun, mapG, sculpt, rainM, fogS, riv, sig, city, pass, cloud, dustP];
  let warmT = 0;
  function warm() {
    clearTimeout(warmT);
    warmT = setTimeout(() => {
      const vis = ALL.map(o => o.visible);
      ALL.forEach(o => { o.visible = true; });
      const done = () => ALL.forEach((o, i) => { o.visible = vis[i]; });
      try { (renderer.compileAsync && renderer.extensions.has("KHR_parallel_shader_compile") ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera))).then(done, done); done(); } catch { done(); }
    }, 1200);
  }
  warm();

  let destKey = "";
  return {
    world: W,
    setT(v) { Tt = Math.max(0, v); if (reduce) T = Tt; },
    get T() { return T; },
    get target() { return Tt; },
    jump(v) { Tt = T = Math.max(0, v); },
    intro() { if (introDone) return; introStart = performance.now(); },
    skip() { if (introDone) return; if (introStart < 0 || reduce) { F = 1; introDone = true; } else rush = true; },
    get formed() { return introDone; },
    pause() { paused = true; vid.userData.pause(); },
    resume() { paused = false; },
    // The corridor's stations and lines (static), once.
    setNetwork(net) {
      if (corr) return;
      corr = S.corridor(net); mapG.add(corr); warm();
    },
    // Data-driven signs and the tunnel's timetable labels.
    setJourney({ boardEn, boardHi, number, name, nameHi, labels }) {
      board.userData.set(boardEn, boardHi); board2.userData.set(boardEn, boardHi);
      routes.forEach(r => r.userData.redraw(number, name, nameHi));
      if (labels?.length) tun.userData.setAtlas(FX.textAtlas(labels));
    },
    // Everything else the world shows, as finished strings and minute values from passenger.js.
    setData(m) {
      data = m;
      led.userData.set(m.led);
      pass.userData.set(m.pass);
      if (corr) {
        corr.userData.setRoad(m.road);
        const pts = m.road.map(x => S.proj(x.lat, x.lon)), box = new THREE.Box3().setFromPoints(pts);
        box.getCenter(routeBox.c); routeBox.r = Math.max(60, box.getSize(new THREE.Vector3()).length() / 2);
      }
      riv.userData.set(m.range, m.rangeNote);
      dial.userData.set(m.pick, `Picking someone up at ${m.dest.name}`);
      photo.userData.load(m.dest.img, ver);
      const dk = [m.dest.code, m.number, m.pass.cells[0][1], m.pass.cells[2][1]].join("|");
      if (dk !== destKey) {
        destKey = dk;
        if (stick) { stickHolder.remove(stick); stick.geometry.dispose(); stick.material.uniforms.map.value.dispose(); stick.material.dispose(); }
        const arrivedLine = m.phase === "arrived" ? m.pass.cells[0][1] : `ETA ${m.pass.cells[0][1]}`;
        stick = S.stickers([m.number, m.dest.code, "स्वागत है", "KALYON", m.dest.name.toUpperCase(), arrivedLine, "काल + नियोजन", m.pass.cells[2][1].toUpperCase(), m.dest.hi, `${m.pass.from.code} → ${m.pass.to.code}`]);
        stick.visible = false; stickHolder.add(stick); warm();
      }
    },
    // A real alert just fired: shake, glitch, and for critical ones a red pulse.
    alert(level, quiet = false) {
      const k = quiet ? 0.5 : 1;
      if (level === "critical") { red = 1 * k; glitch = 1 * k; shake = 0.9 * k; }
      else if (level === "warn") { glitch = 0.55 * k; shake = 0.45 * k; }
      else glitch = Math.max(glitch, 0.18 * k);
      sigPulse = 1;
    },
    dispose() { cancelAnimationFrame(raf); },
  };
}

export { FX };
