// The Passenger stage: one continuous world the camera flies through as the page scrolls.
// Scroll position becomes a chapter clock T (chapter n spans T = n-1 .. n); the camera follows smooth
// splines between keyframes, and each chapter's effects are a function of T, so scrubbing backwards
// replays everything in reverse. The opening (particles condensing into the train) runs on its own
// clock F, once, then hands over to scroll.
import * as THREE from "three";
import { createWorld, ease, clamp01, seg, lerp, TIERS } from "./world.js";
import { locomotive, coach, interior, track, catenary, platform, MAT } from "./train.js";
import * as FX from "./fx.js";

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
const TUN = V(0, -600, 0);                        // the tunnel lives far below the world

// Camera keyframes: [T, position, look-at, fov]. Segments are separate splines so the camera can cut
// (through a white-out) from the headlight into the tunnel, and from the tunnel onto the platform.
const SEGMENTS = [
  { t0: 0, t1: 1.52, keys: [
    [0.00, V(-27, 1.7, 15.5), V(5.8, 3.4, -7.4), 34],
    [0.50, V(-21, 1.9, 10.5), V(4.5, 3.2, -4.6), 34],
    [1.00, V(-14, 2.6, 4.2), V(0, 3.0, 0.0), 33],
    [1.25, V(-6.8, 3.05, 0.7), V(0, 3.12, 0.0), 32],
    [1.45, V(-1.7, 3.15, 0.0), V(1.0, 3.15, 0.0), 28],
    [1.52, V(-0.35, 3.15, 0.0), V(2.0, 3.15, 0.0), 24],
  ] },
  { t0: 1.52, t1: 1.94, tunnel: true },
  { t0: 1.94, t1: 99, keys: [
    [1.94, V(DOOR_X - 13, 2.7, -7.4), V(DOOR_X + 3, 2.7, -1.8), 42],
    [2.15, V(DOOR_X - 5.0, 2.7, -5.6), V(DOOR_X + 0.6, 2.65, -1.7), 40],
    [2.38, V(DOOR_X - 1.5, 2.72, -4.5), V(DOOR_X + 0.15, 2.62, -1.6), 40],
    [2.52, V(DOOR_X - 0.1, 2.95, -2.7), V(DOOR_X + 0.2, 3.0, 0.5), 42],
    [2.60, V(DOOR_X + 0.05, 3.15, -1.4), V(DOOR_X + 1.6, 3.2, 1.0), 44],
    [2.72, V(DOOR_X + 0.8, EYE - 0.05, -0.2), V(DOOR_X + 4, EYE - 0.1, 0.4), 46],
    [2.85, V(DOOR_X + 2.0, EYE, 0.0), V(DOOR_X + 14, EYE - 0.3, 0.0), 46],
    [3.00, V(DOOR_X + 4.9, EYE, 0.0), V(DOOR_X + 16, EYE - 0.35, -0.2), 46],
    [4.00, V(DOOR_X + 7.9, EYE - 0.05, 0.0), V(DOOR_X + 18, EYE - 0.4, -0.5), 46],
  ] },
];
for (const s of SEGMENTS) if (s.keys) {
  s.pos = new THREE.CatmullRomCurve3(s.keys.map(k => k[1]), false, "centripetal");
  s.look = new THREE.CatmullRomCurve3(s.keys.map(k => k[2]), false, "centripetal");
}
function cameraAt(T, out) {
  const s = SEGMENTS.find(x => T >= x.t0 && T < x.t1) || SEGMENTS[SEGMENTS.length - 1];
  if (s.tunnel) { out.pos.copy(TUN); out.look.copy(TUN).add(V(0, 0, -10)); out.fov = 62; out.tunnel = true; return out; }
  const k = s.keys;
  let i = 0; while (i < k.length - 2 && T >= k[i + 1][0]) i++;
  const f = clamp01((T - k[i][0]) / (k[i + 1][0] - k[i][0]));
  const u = (i + f) / (k.length - 1);
  s.pos.getPoint(u, out.pos); s.look.getPoint(u, out.look);
  out.fov = lerp(k[i][3], k[i + 1][3], ease.smooth(f)); out.tunnel = false;
  return out;
}

export function createStage(canvas, { mobile = false, reduce = false, onTier } = {}) {
  const W = createWorld(canvas, { mobile, onTier });
  const { scene, camera, post, renderer } = W;
  const tier = () => TIERS[W.tier];
  scene.fog = new THREE.FogExp2(0x090b11, 0.013);
  scene.environment = FX.makeEnv(renderer);

  // ----- the world -----
  const exterior = new THREE.Group(); scene.add(exterior);
  const skyM = FX.sky(); scene.add(skyM);
  const hillsG = FX.hills(); exterior.add(hillsG);
  exterior.add(FX.ground());
  const world = new THREE.Group(); exterior.add(world);
  const tr = track(1400); tr.position.set(200, 0, 0); world.add(tr);
  const cat = catenary(1400); cat.position.set(200, 0, 0); world.add(cat);
  const plat = platform(260, -1); plat.position.set(60, 0, 0); world.add(plat);
  const board = FX.stationBoard(); board.position.set(DOOR_X - 7, 4.25, -6.2); board.rotation.y = -Math.PI / 2; world.add(board);
  const board2 = FX.stationBoard(); board2.position.set(-6, 4.25, -6.2); board2.rotation.y = -Math.PI / 2; world.add(board2);

  const train = new THREE.Group(); train.position.y = RAIL; world.add(train);
  const loco = locomotive(); loco.rotation.y = Math.PI; loco.position.x = LOCO_L / 2; train.add(loco);
  for (const z of [-1, 1]) { const d = FX.decal("WAP-7", "#c8261f", 2.2, 0.45); d.position.set(LOCO_L / 2 - 4.5, 2.1, z * 1.615); if (z > 0) d.rotation.y = 0; else d.rotation.y = Math.PI; loco.add(d); }
  const coaches = [], routes = [];
  for (let i = 0; i < 4; i++) {
    const c = coach(); c.position.x = coachX(i); train.add(c); coaches.push(c);
    for (const z of [-1, 1]) { const rb = FX.routeBoard(); rb.position.set(0, 3.85, z * 1.635); rb.rotation.y = z > 0 ? 0 : Math.PI; c.add(rb); routes.push(rb); }
  }
  const bc = coaches[BOARD];
  const door = bc.userData.door, door0 = door.position.clone();
  FX.interiorGlass(bc.userData.windowMat, { floor: FLOOR, ceil: FLOOR + 2.45, pitch: 2.35, coach0: coachX(0), coachPitch: COACH_L + GAP });
  const dw = FX.vestibule(0.95, 2.2, 1.7); dw.position.set(door0.x, door0.y, -1.634); dw.rotation.y = Math.PI; bc.add(dw);

  const inside = interior(); inside.position.set(BX, FLOOR, 0); inside.visible = false; scene.add(inside);

  // ----- materialise: dissolve uniforms on every lit material, particles sampled from the train -----
  const DU = FX.dissolveUniforms();
  FX.dissolve(world, DU); FX.dissolve(inside, DU);
  const nP = Math.round(42000 * tier().particles * (mobile ? 0.7 : 1));
  const cloud = FX.particleCloud(FX.sampleSurface([loco, coaches[0], coaches[1]], nP), -0.5, coachX(1) + COACH_L / 2);
  scene.add(cloud);
  const xSpan = [-0.5, coachX(1) + COACH_L / 2];
  const dustP = FX.dust(mobile ? 900 : 1800, new THREE.Box3(V(-60, 0.3, -9), V(60, 7, 9)));
  scene.add(dustP);

  // ----- headlight -----
  const headW = V(-0.06, RAIL + 2.95, 0);
  const beamG = FX.beam(80); beamG.position.copy(headW); world.add(beamG);
  const glareM = FX.glare(3.2); glareM.position.copy(headW).add(V(-0.25, 0, 0)); world.add(glareM);
  const spot = new THREE.SpotLight(0xfff0dc, 0, 140, 0.32, 0.55, 1.3);
  spot.position.copy(headW); spot.target.position.copy(headW).add(V(-40, -3.2, 0)); scene.add(spot, spot.target);
  const lampMat = MAT.lamp, lampBase = lampMat.emissiveIntensity;

  // ----- fixed light rig (never changes count, so shaders compile once) -----
  const HEMI = 0.22, MOON = 0.9;
  const hemi = new THREE.HemisphereLight(0x2a3a5c, 0x0b0907, HEMI); scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fa6ff, MOON); moon.position.set(30, 26, -60); scene.add(moon); // backlight: rims the train
  const key = new THREE.PointLight(0xffd6a0, 0, 26, 1.6); scene.add(key);
  const fill = new THREE.PointLight(0xffe2c0, 0, 22, 1.6); scene.add(fill);

  // ----- the tunnel -----
  const tun = FX.tunnel({ count: mobile ? 520 : 900, streaks: mobile ? 420 : 700 });
  tun.position.copy(TUN); tun.visible = false; scene.add(tun);

  // ----- state -----
  let rush = false, T = 0, Tt = 0, F = reduce ? 1 : 0, introStart = -1, introDone = reduce, paused = false, t0 = performance.now(), last = t0;
  let mx = 0, my = 0, smx = 0, smy = 0, tunT = 0, lastT = 0, vel = 0, insideNow = false;
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
  const tmp = new THREE.Vector3(), up = V(0, 1, 0);
  addEventListener("pointermove", e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });

  function setPx() { const s = W.size; cloud.userData.u.uPx.value = s.H * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2); dustP.userData.u.uPx.value = cloud.userData.u.uPx.value; }

  // Opening: F 0→1 over ~6 s. Particles fly in; the surface sweeps in behind them; then the headlight.
  function applyFormation() {
    const prog = clamp01(F / 0.86) * 1.05;
    cloud.userData.u.uProg.value = prog;
    const front = xSpan[0] + ((prog - 0.42 - 0.13) / 0.45) * (xSpan[1] - xSpan[0]);
    DU.uFront.value = F >= 1 ? 1e6 : front;
    cloud.visible = F < 1 || T < 0.02;
    cloud.userData.u.uI.value = 1 - seg(F, 0.9, 1);
    const env = ease.smooth(seg(F, 0.3, 0.95));
    skyM.userData.u.uFade.value = env;
    scene.fog.density = lerp(0.06, 0.013, env);
    hemi.intensity = HEMI * env; moon.intensity = MOON * env;
    // ignition: a fluorescent stutter, then full beam
    const ig = seg(F, 0.82, 0.97);
    const stutter = ig <= 0 ? 0 : ig >= 1 ? 1 : (ig < 0.35 ? (Math.sin(ig * 90) > 0.2 ? 0.6 : 0.05) : ig < 0.5 ? 0.15 : ease.out(seg(ig, 0.5, 1)));
    return stutter;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (paused) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = (now - t0) / 1000;
    W.govern(dt);
    if (!introDone && rush) { F = Math.min(1, F + dt * 0.9); if (F >= 1) introDone = true; }
    else if (!introDone && introStart >= 0) { F = Math.min(1, (now - introStart) / 6200); if (F >= 1) introDone = true; }
    // scroll clock, eased
    const k = reduce ? 1 : 1 - Math.exp(-dt * 5.5);
    T += (Tt - T) * k; if (Math.abs(Tt - T) < 1e-4) T = Tt;
    vel = lerp(vel, Math.abs(T - lastT) / Math.max(dt, 1e-3), 0.1); lastT = T;
    smx = lerp(smx, mx, 1 - Math.exp(-dt * 3)); smy = lerp(smy, my, 1 - Math.exp(-dt * 3));

    const lamp = applyFormation();
    cameraAt(T, cam);

    // ----- per-chapter state -----
    const tunnelOn = cam.tunnel;
    insideNow = T > 2.4 && cam.pos.z > -1.5;
    exterior.visible = !tunnelOn && !insideNow;
    skyM.visible = exterior.visible;
    inside.visible = T >= 2.3;
    tun.visible = T > 1.46 && T < 2.0;
    dustP.visible = exterior.visible;

    // headlight: on after ignition; brightens as the camera pushes in
    const push = ease.in(seg(T, 1.0, 1.52));
    lampMat.emissiveIntensity = lampBase * lamp * (1 + push * 3);
    beamG.userData.u.uI.value = lamp * (1 - push * 0.6);
    glareM.userData.u.uI.value = lamp * (0.65 + push * 2.2);
    spot.intensity = lamp * 220 * (exterior.visible ? 1 : 0);
    dustP.userData.u.uI.value = lamp;
    dustP.userData.u.uBeam.value.copy(headW);

    // door: plug out, then slide
    const d = seg(T, 2.12, 2.42);
    const pop = ease.out(seg(d, 0, 0.25)), slide = ease.inOut(seg(d, 0.2, 1));
    door.position.set(door0.x + slide * 1.0, door0.y, door0.z - pop * 0.07);
    dw.userData.u.uOpen.value = ease.smooth(seg(d, 0.05, 0.6));

    // roaming lights
    const envK = hemi.intensity / HEMI;
    if (insideNow) {
      key.position.set(cam.pos.x + 5, FLOOR + 2.0, 0); key.intensity = 5; key.distance = 9;
      fill.position.set(cam.pos.x + 9, FLOOR + 2.15, -0.25); fill.intensity = 6; fill.distance = 11;
    } else if (T >= 1.9) {
      key.position.set(DOOR_X + 0.3, FLOOR + 1.2, -2.2); key.intensity = 4.5 * dw.userData.u.uOpen.value; key.distance = 6;
      fill.position.set(DOOR_X - 7, 5.6, -6.4); fill.intensity = 14; fill.distance = 16;
    } else {
      key.position.set(6, 5.6, -6.0); key.intensity = 26 * envK; key.distance = 18;
      fill.position.set(30, 5.6, -6.0); fill.intensity = 22 * envK; fill.distance = 18;
    }

    // tunnel
    if (tun.visible) {
      tunT += dt * (34 + vel * 520);
      const tu = tun.userData.u; tu.uT.value = tunT; tu.uTime.value = time;
      tu.uI.value = seg(T, 1.5, 1.6) * (1 - seg(T, 1.86, 1.94));
    }

    // ----- camera -----
    camera.position.copy(cam.pos);
    if (!reduce && !tunnelOn) {
      const amp = insideNow ? 0.08 : 0.5 * (1 - push);
      tmp.set(0, 0, 0).subVectors(cam.look, cam.pos).normalize();
      const right = tmp.clone().cross(up).normalize();
      camera.position.addScaledVector(right, smx * amp).addScaledVector(up, -smy * amp * 0.5);
      camera.position.y += Math.sin(time * 0.6) * 0.03 * (1 - push);
      if (insideNow) camera.position.y += Math.sin(time * 1.7) * 0.006, camera.position.z += Math.sin(time * 1.1) * 0.008; // the coach rocks
    }
    camera.lookAt(cam.look);
    if (tunnelOn) camera.rotateZ(time * 0.08 + T * 2.0);
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); setPx(); }
    skyM.position.copy(camera.position);

    // ----- post -----
    const whiteIn = seg(T, 1.38, 1.52), whiteOut = 1 - seg(T, 1.52, 1.62);
    const whiteIn2 = seg(T, 1.86, 1.94), whiteOut2 = 1 - seg(T, 1.94, 2.06);
    const cross = Math.exp(-Math.pow((T - 2.565) / 0.045, 2)) * 0.92; // stepping through the door: a warm wash of light
    post.flash = Math.max(T < 1.52 ? ease.in(whiteIn) : T < 1.7 ? whiteOut : 0, T < 1.94 ? ease.in(whiteIn2) * 0.95 : T < 2.1 ? whiteOut2 * 0.95 : 0, cross, F < 1 ? seg(F, 0.86, 0.9) * (1 - seg(F, 0.9, 1)) * 0.25 : 0);
    post.exposure = (reduce ? 1 : lerp(0.25, 1, ease.out(seg(F, 0, 0.5)))) * (1 + push * 0.6);
    post.bloomK = tunnelOn ? 1.25 : (insideNow ? 0.55 : 0.8) + push * 0.6;
    post.threshold = tunnelOn ? 0.5 : 1.0;
    post.ca = tunnelOn ? 0.006 + Math.min(0.01, vel * 0.02) : 0.0022 + push * 0.004;
    post.vig = 1;
    skyM.userData.u.uTime.value = time;
    cloud.userData.u.uTime.value = time;
    dustP.userData.u.uTime.value = time;
    beamG.userData.u.uTime.value = time;
    glareM.userData.u.uTime.value = time;
    W.render(time);
  }
  setPx();
  let raf = requestAnimationFrame(frame);

  return {
    world: W,
    setT(v) { Tt = Math.max(0, v); if (reduce) T = Tt; },
    get T() { return T; },
    jump(v) { Tt = T = Math.max(0, v); },
    intro() { if (introDone) return; introStart = performance.now(); },
    skip() { if (introDone) return; if (introStart < 0 || reduce) { F = 1; introDone = true; } else rush = true; },
    get formed() { return introDone; },
    pause() { paused = true; },
    resume() { paused = false; },
    // Data-driven signs and the tunnel's timetable labels.
    setJourney({ boardEn, boardHi, number, name, nameHi, labels }) {
      board.userData.set(boardEn, boardHi); board2.userData.set(boardEn, boardHi);
      routes.forEach(r => r.userData.redraw(number, name, nameHi));
      if (labels?.length) tun.userData.setAtlas(FX.textAtlas(labels));
    },
    dispose() { cancelAnimationFrame(raf); },
  };
}

export { FX };
