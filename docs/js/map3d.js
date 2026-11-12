// Control-room tactical map in 3D: terrain, rivers, double and single lines, station beacons,
// trains with light trails, and Kalyon's projected path with ETA waypoints for a selected train.
import { THREE, stage, glow, SMALL } from "./fx.js?v=202611121112";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { h, hhmm } from "./ui.js?v=202611121112";

const LAT0 = 28.6, LON0 = 79.0, KM = 111.2, COS = Math.cos(28.6 * Math.PI / 180);
const xz = (lat, lon) => [(lon - LON0) * COS * KM, -(lat - LAT0) * KM];
const COLORS = { ok: 0x3cf0a0, late: 0xffc21a, vlate: 0xff4d3d };
const RIVERS = {
  "Ganga": [[30.13, 78.32], [29.95, 78.18], [29.75, 78.17], [29.5, 78.12], [29.2, 78.1], [28.8, 78.13], [28.4, 78.35], [28.0, 79.0], [27.6, 79.45], [27.2, 79.9], [26.8, 80.3], [26.45, 80.4]],
  "Yamuna": [[30.45, 77.6], [30.1, 77.45], [29.7, 77.25], [29.3, 77.15], [28.9, 77.2], [28.6, 77.26], [28.3, 77.4]],
};
const RIVER_HI = { Ganga: "गंगा", Yamuna: "यमुना" };
const LBL_OFF = { HW: [16, 0], RK: [-14, -4], LRJ: [4, 12], GZB: [16, 6], NDLS: [-14, 4], NBD: [14, -2], NGM: [14, 0], DPR: [14, 2], MB: [-12, 6], RMU: [12, -6] };

function height(x, z) {
  // Shivalik and Mussoorie hills rise north of the Doon; the plains are gently rolling.
  const lat = LAT0 - z / KM;
  const hills = Math.max(0, Math.min(1, (lat - 30.05) / 0.35));
  const n = Math.sin(x * 0.045) * Math.cos(z * 0.05) + 0.5 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.09) + 0.25 * Math.sin(x * 0.23 + z * 0.19);
  return hills * hills * (14 + n * 7) + n * 0.5;
}

export function createMap(host, labelsHost, app, { onSelect, onStation } = {}) {
  const canvas = h("canvas", { "aria-label": "3D map of the Dehradun corridor. Drag to rotate, scroll to zoom, click a train." });
  host.prepend(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080a);
  scene.fog = new THREE.FogExp2(0x05080a, 0.0016);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 1, 3000);
  const S = stage(canvas, scene, camera, { bloom: SMALL() ? 0.75 : 1.0, radius: 0.5, threshold: 0.16 });
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.32; controls.minDistance = 60; controls.maxDistance = 900;
  controls.screenSpacePanning = false;

  scene.add(new THREE.HemisphereLight(0x6f93a8, 0x0b0f0e, 0.9));
  const sun = new THREE.DirectionalLight(0xc6dcff, 1.1); sun.position.set(-200, 300, -100); scene.add(sun);

  // Stations and extent
  const st = app.net.stations;
  const P = {};
  st.forEach(s => { const [x, z] = xz(s.lat, s.lon); P[s.code] = new THREE.Vector3(x, height(x, z) + 0.6, z); });
  const xs = Object.values(P).map(p => p.x), zs = Object.values(P).map(p => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const W = Math.max(...xs) - Math.min(...xs) + 700, D = Math.max(...zs) - Math.min(...zs) + 700;

  // Terrain: shaded relief + wire contour overlay
  const seg = SMALL() ? 110 : 200;
  const tg = new THREE.PlaneGeometry(W, D, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color(0x0c1613), cHigh = new THREE.Color(0x24362c), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    const y = height(x, z);
    pos.setXYZ(i, x, y, z);
    c.lerpColors(cLow, cHigh, Math.min(1, y / 16));
    col.set([c.r, c.g, c.b], i * 3);
  }
  tg.setAttribute("color", new THREE.BufferAttribute(col, 3));
  tg.computeVertexNormals();
  scene.add(new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })));
  const wire = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0x2c5446, wireframe: true, transparent: true, opacity: 0.16 }));
  wire.position.y = 0.05; scene.add(wire);

  // Lat/lon graticule
  const gmat = new THREE.LineBasicMaterial({ color: 0x3d6b5c, transparent: true, opacity: 0.35 });
  const labels = [];
  for (let lon = 77; lon <= 81; lon++) {
    const pts = []; for (let lat = 26.4; lat <= 30.7; lat += 0.05) { const [x, z] = xz(lat, lon); pts.push(new THREE.Vector3(x, height(x, z) + 0.3, z)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gmat));
    const [x, z] = xz(26.5, lon); labels.push(mkLabel(`${lon}°E`, "grid", new THREE.Vector3(x, 1, z)));
  }
  for (let lat = 27; lat <= 30; lat++) {
    const pts = []; for (let lon = 76.9; lon <= 81.2; lon += 0.05) { const [x, z] = xz(lat, lon); pts.push(new THREE.Vector3(x, height(x, z) + 0.3, z)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gmat));
    const [x, z] = xz(lat, 76.95); labels.push(mkLabel(`${lat}°N`, "grid", new THREE.Vector3(x, 1, z)));
  }

  // Rivers
  for (const [name, coords] of Object.entries(RIVERS)) {
    const pts = coords.map(([la, lo]) => { const [x, z] = xz(la, lo); return new THREE.Vector3(x, height(x, z) + 0.25, z); });
    const curve = new THREE.CatmullRomCurve3(pts);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.55, 6), new THREE.MeshBasicMaterial({ color: 0x2a7fa3, transparent: true, opacity: 0.42 })));
    const mid = curve.getPoint(0.55);
    labels.push(mkLabel(`<span class="hi">${RIVER_HI[name]}</span> ${name}`, "river", mid.clone().add(new THREE.Vector3(6, 2, 0))));
  }

  // Track: double line = two bright rails, single line = one dimmer dashed rail
  const flowMats = [];
  for (const sec of app.net.sections) {
    const a = P[sec.a], b = P[sec.b];
    const dir = new THREE.Vector3().subVectors(b, a); dir.y = 0; dir.normalize();
    const nrm = new THREE.Vector3(-dir.z, 0, dir.x);
    const offs = sec.single ? [0] : [-0.9, 0.9];
    for (const o of offs) {
      const p1 = a.clone().addScaledVector(nrm, o), p2 = b.clone().addScaledVector(nrm, o);
      const curve = new THREE.LineCurve3(p1.setY(p1.y + 0.5), p2.setY(p2.y + 0.5));
      const m = new THREE.MeshBasicMaterial({ color: sec.single ? 0x3f8a72 : 0x6fd6b0 });
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, sec.single ? 0.45 : 0.38, 6), m));
    }
    // animated flow line on top
    const fm = new THREE.LineDashedMaterial({ color: 0xffc21a, dashSize: 3, gapSize: 9, transparent: true, opacity: 0.55 });
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone().setY(a.y + 1.2), b.clone().setY(b.y + 1.2)]), fm);
    ln.computeLineDistances(); scene.add(ln); flowMats.push(fm);
  }

  // Station beacons
  const beacons = [];
  st.forEach(s => {
    const p = P[s.code];
    const g = new THREE.Group(); g.position.copy(p);
    const hgt = s.major ? 9 : 5;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(s.major ? 1.5 : 1.0, s.major ? 1.5 : 1.0, hgt, 6), new THREE.MeshStandardMaterial({ color: 0x9fb5aa, emissive: 0x6f857a, emissiveIntensity: s.major ? 0.35 : 0.2, flatShading: true }));
    pillar.position.y = hgt / 2; g.add(pillar);
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.major ? 4 : 3, s.major ? 4.6 : 3.4, 6), new THREE.MeshBasicMaterial({ color: 0xffc21a, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.8; g.add(ring);
    const gl = glow(0xffe6a0, s.major ? 9 : 5); gl.position.y = hgt + 1; gl.material.opacity = 0.7; g.add(gl);
    scene.add(g);
    beacons.push({ ring, s });
    const [ox, oz] = LBL_OFF[s.code] || [0, 0];
    const L = mkLabel(`${s.name}<span class="hi">${s.name_hi}</span>`, `stn${s.major ? " major" : ""}`, p.clone().add(new THREE.Vector3(ox, hgt + 4, oz)));
    L.el.addEventListener("click", () => onStation && onStation(s.code));
    labels.push(L);
  });

  // Train geometry (shared)
  const trainGeo = new THREE.BoxGeometry(4.2, 2.6, 13);
  const beamGeo = new THREE.CylinderGeometry(0.45, 0.45, 46, 6, 1, true);
  const trains = new Map(); // runId -> object

  // Selection: ring + projected path + ETA waypoints
  const selRing = new THREE.Mesh(new THREE.RingGeometry(6, 7, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  selRing.rotation.x = -Math.PI / 2; selRing.visible = false; scene.add(selRing);
  const projMat = new THREE.LineDashedMaterial({ color: 0xffc21a, dashSize: 4, gapSize: 3 });
  let projLine = null;
  let wayLabels = [];

  // Route geometry per train: points along its route with cumulative km
  const routeCache = {};
  function route(train) {
    if (routeCache[train.number]) return routeCache[train.number];
    const r = train.route, out = [{ p: P[r[0]], km: 0 }];
    let acc = 0;
    for (let i = 0; i < r.length - 1; i++) {
      const sec = app.net.sections.find(x => (x.a === r[i] && x.b === r[i + 1]) || (x.b === r[i] && x.a === r[i + 1]));
      acc += sec.km; out.push({ p: P[r[i + 1]], km: acc });
    }
    return (routeCache[train.number] = out);
  }
  function posAt(train, km) {
    const R = route(train);
    for (let i = 0; i < R.length - 1; i++) {
      if (km <= R[i + 1].km || i === R.length - 2) {
        const f = Math.max(0, Math.min(1, (km - R[i].km) / (R[i + 1].km - R[i].km)));
        const p = new THREE.Vector3().lerpVectors(R[i].p, R[i + 1].p, f);
        const d = new THREE.Vector3().subVectors(R[i + 1].p, R[i].p);
        return { p, d };
      }
    }
    return { p: R[0].p.clone(), d: new THREE.Vector3(1, 0, 0) };
  }

  function mkLabel(html, cls, world) {
    const el = h("div", { class: `lbl3d ${cls}`, html });
    labelsHost.append(el);
    return { el, world };
  }

  function trainObj(run) {
    let o = trains.get(run.run);
    if (o) return o;
    const train = app.trains[run.train];
    const mat = new THREE.MeshStandardMaterial({ color: 0x3cf0a0, emissive: 0x3cf0a0, emissiveIntensity: 1.6 });
    const mesh = new THREE.Mesh(trainGeo, mat);
    mesh.userData.run = run.run;
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x3cf0a0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 23;
    const halo = glow(0x3cf0a0, 30);
    const g = new THREE.Group(); g.add(mesh, beam, halo);
    scene.add(g);
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(60 * 3);
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x3cf0a0, transparent: true, opacity: 0.7 }));
    scene.add(trail);
    const label = mkLabel(train.number, "trn", new THREE.Vector3(0, -9999, 0));
    label.el.addEventListener("click", () => onSelect && onSelect(run.run));
    labels.push(label);
    o = { g, mesh, beam, halo, mat, trail, trailGeo, trailPos, hist: [], label, train, run };
    trains.set(run.run, o);
    return o;
  }
  function dropTrain(id) {
    const o = trains.get(id);
    if (!o) return;
    scene.remove(o.g); scene.remove(o.trail);
    o.label.el.remove();
    const li = labels.indexOf(o.label); if (li >= 0) labels.splice(li, 1);
    trains.delete(id);
  }

  // Raycast clicks on trains
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null;
  canvas.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...trains.values()].map(o => o.mesh))[0];
    if (hit && onSelect) onSelect(hit.object.userData.run);
  });

  // Camera
  const home = { pos: new THREE.Vector3(cx + 40, 330, cz + 330), target: new THREE.Vector3(cx, 0, cz + 10) };
  camera.position.copy(home.pos); controls.target.copy(home.target);
  let fly = null;
  function flyTo(target, dist = 190) {
    const from = { p: camera.position.clone(), t: controls.target.clone() };
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const to = { t: target.clone(), p: target.clone().addScaledVector(dir, dist) };
    fly = { from, to, t0: performance.now(), dur: 1100 };
  }

  let running = false, raf = 0, selected = null, t0 = performance.now(), lastLbl = 0;
  const v = new THREE.Vector3();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!S.resize()) return;
    const t = (now - t0) / 1000;
    if (fly) {
      const k = Math.min(1, (now - fly.t0) / fly.dur), e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(fly.from.p, fly.to.p, e);
      controls.target.lerpVectors(fly.from.t, fly.to.t, e);
      if (k >= 1) fly = null;
    }
    controls.update();
    flowMats.forEach(m => { m.dashOffset -= 0.25; });
    beacons.forEach((b, i) => { b.ring.rotation.z = t * 0.4 + i; b.ring.material.opacity = 0.55 + 0.35 * Math.sin(t * 2 + i); });
    trains.forEach(o => { o.beam.material.opacity = 0.22 + 0.15 * Math.sin(t * 3 + o.run.run); });
    if (selected && trains.has(selected)) {
      const o = trains.get(selected);
      selRing.visible = true; selRing.position.copy(o.g.position).setY(o.g.position.y + 0.6);
      const s = 1 + 0.15 * Math.sin(t * 4); selRing.scale.set(s, s, s);
    } else selRing.visible = false;
    if (projLine) projMat.dashOffset -= 0.4;
    S.render();
    // HTML labels
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    const camDist = camera.position.distanceTo(controls.target);
    for (const L of labels) {
      v.copy(L.world).project(camera);
      const minor = L.el.classList.contains("stn") && !L.el.classList.contains("major");
      const vis = v.z < 1 && v.x > -0.98 && v.x < 0.98 && v.y > -0.95 && v.y < 0.92 && !(minor && camDist > 520);
      const small = L.el.classList.contains("grid") || L.el.classList.contains("river");
      L.el.style.display = vis ? "" : "none";
      if (!vis) continue;
      L.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * hh).toFixed(1)}px) translate(-50%, -100%)`;
      if (small) L.el.style.opacity = camDist > 700 ? "0.4" : "0.75";
    }
    lastLbl = now;
  }

  function colorFor(delay) { return delay >= 60 ? COLORS.vlate : delay >= 15 ? COLORS.late : COLORS.ok; }

  return {
    start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    reset() { fly = { from: { p: camera.position.clone(), t: controls.target.clone() }, to: { p: home.pos.clone(), t: home.target.clone() }, t0: performance.now(), dur: 1100 }; },
    zoom(f) { const d = new THREE.Vector3().subVectors(camera.position, controls.target).multiplyScalar(f); camera.position.copy(controls.target).add(d); },
    clearTrains() { [...trains.keys()].forEach(dropTrain); this.select(null); },
    // Place every visible train for replay minute t.
    update(t) {
      const seen = new Set();
      for (const run of app.replay.runs) {
        const s = app.status(run, t);
        const train = s.train;
        let km, opacity = 1;
        if (s.state === "waiting") { if (app.dep(run, 0) - t > 25) continue; km = 0; opacity = 0.4; }
        else if (s.state === "done") { if (s.since > 20) continue; km = train.stops[train.stops.length - 1].km; opacity = 0.35; }
        else if (s.state === "running") { const k0 = train.stops[s.from].km, k1 = train.stops[s.to].km; km = k0 + (k1 - k0) * Math.min(1, Math.max(0, s.p)); }
        else km = train.stops[s.at].km;
        seen.add(run.run);
        const o = trainObj(run);
        const { p, d } = posAt(train, km);
        o.g.position.set(p.x, p.y + 2.2, p.z);
        o.mesh.rotation.y = Math.atan2(d.x, d.z);
        const colr = colorFor(s.delay);
        o.mat.color.setHex(colr); o.mat.emissive.setHex(colr);
        o.beam.material.color.setHex(colr); o.halo.material.color.setHex(colr); o.trail.material.color.setHex(colr);
        o.mat.opacity = opacity; o.mat.transparent = opacity < 1;
        o.halo.material.opacity = opacity;
        o.label.world.copy(o.g.position).setY(o.g.position.y + 6);
        o.label.el.style.background = `#${colr.toString(16).padStart(6, "0")}`;
        o.label.el.style.opacity = opacity < 1 ? "0.55" : "1";
        o.label.el.classList.toggle("sel", run.run === selected);
        // trail of recent positions
        const last = o.hist[o.hist.length - 1];
        if (!last || last.distanceTo(o.g.position) > 1.5) { o.hist.push(o.g.position.clone().setY(p.y + 1.2)); if (o.hist.length > 60) o.hist.shift(); }
        o.hist.forEach((q, i) => o.trailPos.set([q.x, q.y, q.z], i * 3));
        o.trailGeo.attributes.position.needsUpdate = true;
        o.trailGeo.setDrawRange(0, o.hist.length);
      }
      [...trains.keys()].forEach(id => { if (!seen.has(id)) dropTrain(id); });
    },
    resetTrails() { trains.forEach(o => { o.hist = []; o.trailGeo.setDrawRange(0, 0); }); },
    select(runId, focus = false) {
      selected = runId;
      if (projLine) { scene.remove(projLine); projLine = null; }
      wayLabels.forEach(L => { L.el.remove(); const li = labels.indexOf(L); if (li >= 0) labels.splice(li, 1); });
      wayLabels = [];
      if (runId === null || runId === undefined) return;
      const run = app.replay.runs.find(r => r.run === runId);
      if (!run) return;
      const s = app.status(run, app.t);
      const train = app.trains[run.train];
      if (s.k >= 0 && s.state !== "done") {
        const fc = app.forecast(run, s.k);
        const o = trains.get(runId);
        const startKm = o ? null : train.stops[s.k].km;
        const pts = [];
        if (o) pts.push(o.g.position.clone()); else pts.push(posAt(train, startKm).p.clone().setY(3));
        for (const f of fc) pts.push(posAt(train, train.stops[f.s].km).p.clone().setY(P[f.code].y + 3));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        projLine = new THREE.Line(geo, projMat); projLine.computeLineDistances(); scene.add(projLine);
        fc.slice(0, 4).forEach((f, i) => {
          const L = mkLabel(`<span class="wk">${app.stations[f.code].name}</span><b>${hhmm(f.med)}</b><span class="wr">${hhmm(f.lo)}–${hhmm(f.hi)}</span>`, `way${i ? "" : " first"}`, P[f.code].clone().add(new THREE.Vector3(0, 16, 0)));
          wayLabels.push(L); labels.push(L);
        });
      }
      if (focus && trains.has(runId)) flyTo(trains.get(runId).g.position, 300);
    },
    focusStation(code) { flyTo(P[code], 160); },
  };
}
