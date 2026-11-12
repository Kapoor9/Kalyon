// Opening scene: a night train running through fog on broad-gauge track, with Kalyon's
// forecast path glowing ahead of it and a waypoint marker for the next station.
import { THREE, stage, buildTrain, glow, nameboard, SMALL, REDUCED } from "./fx.js?v=202611121112";

const LOOP = 640; // metres of scenery that recycle around the train

export function mountHero(host, waypoint) {
  const canvas = document.createElement("canvas");
  canvas.className = "gl";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(0x070c0e);
  scene.background = fogCol;
  scene.fog = new THREE.FogExp2(fogCol, 0.0085);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 900);
  const S = stage(canvas, scene, camera, { bloom: SMALL() ? 0.7 : 1.05, radius: 0.6, threshold: 0.22, exposure: 1.05 });

  // Light
  scene.add(new THREE.HemisphereLight(0x5d7d96, 0x0a0d0c, 0.55));
  const moon = new THREE.DirectionalLight(0x9fb8d6, 0.9);
  moon.position.set(-60, 90, 30);
  scene.add(moon);

  // Ground with a faint tactical grid
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: 0x0b1110, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.GridHelper(2400, 240, 0x2f5a4b, 0x17302a);
  grid.material.transparent = true; grid.material.opacity = 0.35; grid.position.y = 0.02;
  scene.add(grid);

  // Ballast bed and rails (1676 mm broad gauge)
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, LOOP * 2), new THREE.MeshStandardMaterial({ color: 0x23282a, roughness: 1 }));
  ballast.position.set(0, 0.15, -LOOP / 2); scene.add(ballast);
  const railMat = new THREE.MeshStandardMaterial({ color: 0xb8c4c8, metalness: 1, roughness: 0.25 });
  for (const x of [-0.838, 0.838]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, LOOP * 2), railMat);
    r.position.set(x, 0.42, -LOOP / 2); scene.add(r);
  }
  // A second, empty track alongside (double line)
  const ballast2 = ballast.clone(); ballast2.position.x = -5.3; scene.add(ballast2);
  for (const x of [-0.838, 0.838]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, LOOP * 2), railMat);
    r.position.set(-5.3 + x, 0.42, -LOOP / 2); scene.add(r);
  }

  // Recycled scenery: sleepers, OHE masts, signals, trees
  const movers = [];
  const sleeperGeo = new THREE.BoxGeometry(2.75, 0.14, 0.26);
  const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.9 });
  const SP = 0.65, NS = Math.floor(LOOP / SP);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, NS * 2);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < NS; i++) {
    m4.makeTranslation(0, 0.34, -i * SP + 40); sleepers.setMatrixAt(i, m4);
    m4.makeTranslation(-5.3, 0.34, -i * SP + 40); sleepers.setMatrixAt(NS + i, m4);
  }
  scene.add(sleepers);
  const sleeperGroup = { obj: sleepers, period: SP };

  const mastMat = new THREE.MeshStandardMaterial({ color: 0x55605f, metalness: 0.6, roughness: 0.5 });
  const masts = new THREE.Group();
  for (let i = 0; i < LOOP / 55; i++) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.35, 9, 0.35), mastMat); pole.position.set(3.4, 4.5, 0); g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 0.18, 0.18), mastMat); arm.position.set(-1.6, 8.3, 0); g.add(arm);
    const pole2 = pole.clone(); pole2.position.x = -8.4; g.add(pole2);
    g.position.z = -i * 55 + 30;
    masts.add(g); movers.push({ obj: g });
  }
  scene.add(masts);
  // catenary wires
  const wireMat = new THREE.LineBasicMaterial({ color: 0x6f7b7a, transparent: true, opacity: 0.6 });
  for (const x of [0, -5.3]) {
    const pts = [new THREE.Vector3(x, 6.4, 60), new THREE.Vector3(x, 6.4, -LOOP)];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  }

  // Colour-light signals with glow
  const sigs = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5.5, 0.25), mastMat); post.position.set(3.0, 2.75, 0); g.add(post);
    const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111 })); headBox.position.set(3.0, 6.0, 0); g.add(headBox);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshBasicMaterial({ color: 0x3cf0a0 }));
    lamp.position.set(3.0, 6.4, -0.22); g.add(lamp);
    const halo = glow(0x3cf0a0, 5); halo.position.copy(lamp.position); g.add(halo);
    g.position.z = -i * 220 - 120;
    g.userData = { lamp, halo };
    scene.add(g); movers.push({ obj: g }); sigs.push(g);
  }

  // Station nameboards along the line (Hindi above English, as on every Indian platform)
  const STNS = [["हरिद्वार", "Haridwar"], ["लक्सर", "Laksar"], ["नजीबाबाद", "Najibabad"], ["मुरादाबाद", "Moradabad"], ["बरेली", "Bareilly"], ["देहरादून", "Dehradun"]];
  const boards = [];
  for (let i = 0; i < 2; i++) {
    const nb = nameboard(...STNS[i]);
    nb.group.position.set(5.2, 0, -i * 320 - 90);
    nb.group.rotation.y = Math.PI / 2 - 0.35; // readable from the camera side, angled towards oncoming view
    nb.idx = i;
    scene.add(nb.group); boards.push(nb);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => boards.forEach(b => b.setText(...STNS[b.idx])));

  // Silhouette trees (instanced) on both sides
  const treeGeo = new THREE.ConeGeometry(2.6, 9, 6);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x0d1714, roughness: 1, flatShading: true });
  const NT = SMALL() ? 120 : 260;
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, NT);
  const treeData = [];
  for (let i = 0; i < NT; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (14 + Math.random() * 120);
    const s = 0.6 + Math.random() * 1.4;
    treeData.push({ x, z: -Math.random() * LOOP + 40, s });
  }
  scene.add(trees);

  // Distant sodium-light glow on the horizon
  const city = glow(0xffa640, 420); city.position.set(-120, 10, -560); city.material.opacity = 0.32; scene.add(city);
  const city2 = glow(0x5fd4ff, 300); city2.position.set(200, 6, -600); city2.material.opacity = 0.14; scene.add(city2);

  // Dust / fog motes
  const NP = SMALL() ? 700 : 1600;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { pPos[i * 3] = (Math.random() - 0.5) * 120; pPos[i * 3 + 1] = Math.random() * 22; pPos[i * 3 + 2] = -Math.random() * 300 + 60; }
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const motes = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xbfd2cc, size: 0.14, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(motes);

  // The train (stationary; the world moves past it)
  const train = buildTrain({ coaches: SMALL() ? 4 : 7 });
  train.position.set(0, 0.42, 0);
  scene.add(train);

  // Kalyon forecast path: glowing amber dashes running ahead of the train
  const pathPts = [];
  for (let i = 0; i <= 120; i++) pathPts.push(new THREE.Vector3(0, 0.55, -10 - i * 3));
  const pathGeo = new THREE.BufferGeometry().setFromPoints(pathPts);
  const pathMat = new THREE.LineDashedMaterial({ color: 0xffc21a, dashSize: 3.2, gapSize: 2.2, transparent: true, opacity: 0.95 });
  const path = new THREE.Line(pathGeo, pathMat);
  path.computeLineDistances();
  scene.add(path);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 360), new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false }));
  band.rotation.x = -Math.PI / 2; band.position.set(0, 0.5, -190); scene.add(band);

  // Waypoint marker (next station) — a holographic ring with an HTML label
  const wp = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.09, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffc21a }));
  wp.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.04, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.5 }));
  wp.add(ring2);
  const beamUp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 40, 8), new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.6 }));
  beamUp.position.y = 20; wp.add(beamUp);
  wp.position.set(0, 7, -260);
  scene.add(wp);
  const wpLabel = document.createElement("div");
  wpLabel.className = "waypoint";
  wpLabel.innerHTML = waypoint ? `<span class="wp-k">Next station</span><b>${waypoint.name}</b><span class="wp-hi">${waypoint.name_hi}</span>
    <span class="wp-row"><em>Kalyon ETA</em> ${waypoint.med}</span><span class="wp-row"><em>Likely</em> ${waypoint.lo}–${waypoint.hi}</span><span class="wp-row dim"><em>Today’s estimate</em> ${waypoint.b1}</span>` : "";
  host.append(wpLabel);

  // Camera choreography
  let progress = 0, mx = 0, my = 0, running = false, raf = 0, last = performance.now(), t = 0;
  const speed = REDUCED() ? 0 : 26; // m/s of apparent motion
  host.addEventListener("pointermove", e => {
    const r = host.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width - 0.5; my = (e.clientY - r.top) / r.height - 0.5;
  });
  const A = new THREE.Vector3(15, 3.8, -24), B = new THREE.Vector3(12, 6.5, 30), TOP = new THREE.Vector3(18, 120, 40);
  const LA = new THREE.Vector3(0, 2.6, 4), LB = new THREE.Vector3(0, 1.8, -60), LTOP = new THREE.Vector3(0, 0, -60);
  const cp = new THREE.Vector3(), lp = new THREE.Vector3(), v = new THREE.Vector3();
  let travel = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now; t += dt;
    if (!S.resize()) return;
    const d = speed * dt;
    travel += d;
    // move scenery towards +z and wrap
    sleepers.position.z = (travel % SP);
    grid.position.z = travel % 10;
    for (const m of movers) { m.obj.position.z += d; if (m.obj.position.z > 70) m.obj.position.z -= LOOP; }
    for (const b of boards) { b.group.position.z += d; if (b.group.position.z > 70) { b.group.position.z -= LOOP; b.idx = (b.idx + 2) % STNS.length; b.setText(...STNS[b.idx]); } }
    for (let i = 0; i < NT; i++) {
      const td = treeData[i];
      td.z += d; if (td.z > 60) td.z -= LOOP;
      m4.makeScale(td.s, td.s, td.s); m4.setPosition(td.x, 4.5 * td.s, td.z); trees.setMatrixAt(i, m4);
    }
    trees.instanceMatrix.needsUpdate = true;
    const arr = pGeo.attributes.position.array;
    for (let i = 0; i < NP; i++) { arr[i * 3 + 2] += d * 1.15; if (arr[i * 3 + 2] > 60) arr[i * 3 + 2] -= 300; }
    pGeo.attributes.position.needsUpdate = true;
    pathMat.dashOffset -= d * 0.9;
    // waypoint approaches, then resets: a new station comes into range
    wp.position.z += d * 0.55;
    if (wp.position.z > -40) wp.position.z = -300;
    ring.rotation.z += dt * 0.8; ring2.rotation.z -= dt * 0.5;
    wp.lookAt(camera.position.x, wp.position.y, camera.position.z);
    train.position.y = 0.42 + Math.sin(t * 9) * 0.015;
    train.userData.tail.material.color.setHex(Math.sin(t * 5) > 0 ? 0xff3020 : 0x330806);
    for (const s of sigs) { const zz = s.position.z; const col = zz > -40 ? 0xffc21a : 0x3cf0a0; s.userData.lamp.material.color.setHex(col); s.userData.halo.material.color.setHex(col); }

    // camera: slow orbit between front and rear quarter, rising to a tactical top view on scroll
    const u = 0.5 + 0.5 * Math.sin(t * 0.07 - 1.2);
    cp.lerpVectors(A, B, u); lp.lerpVectors(LA, LB, u);
    const p = Math.min(1, Math.max(0, progress));
    const e = p * p * (3 - 2 * p);
    cp.lerp(TOP, e); lp.lerp(LTOP, e);
    cp.x += mx * 4 * (1 - e); cp.y += -my * 2 * (1 - e);
    camera.position.copy(cp); camera.lookAt(lp);
    S.render();

    // project the waypoint label
    v.copy(wp.position); v.y += 6; v.project(camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const vis = v.z < 1 && v.x > -1.2 && v.x < 1.2 && e < 0.5;
    wpLabel.style.opacity = vis ? String(Math.min(1, (-wp.position.z - 40) / 60) * (1 - e * 2)) : "0";
    wpLabel.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
  }

  return {
    start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    setProgress(p) { progress = p; },
  };
}
