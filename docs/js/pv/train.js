// A stylised WAP-7 locomotive and LHB coaches, built from primitives with physically based materials.
// Units: metres. The train runs along +X; the camera approaches from the front (−X).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const M = {
  white: new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.34, metalness: 0.3, envMapIntensity: 0.7 }),
  stainless: new THREE.MeshStandardMaterial({ color: 0x858a92, roughness: 0.32, metalness: 0.8, envMapIntensity: 0.7 }),
  coachWin: new THREE.MeshStandardMaterial({ color: 0x1a140c, roughness: 0.12, metalness: 0, emissive: 0xffffff, emissiveIntensity: 1.0, envMapIntensity: 0.9 }),
  winBand: new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.12, metalness: 0.4, envMapIntensity: 1.2 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa81d18, roughness: 0.38, metalness: 0.3 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xc8461a, roughness: 0.38, metalness: 0.3 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.75, metalness: 0.5 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.35, metalness: 0.9 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0d1118, roughness: 0.06, metalness: 0.0, transmission: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.5 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0f0f10, roughness: 0.95, metalness: 0 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe3b0, emissiveIntensity: 6, roughness: 0.3 }),
  lampDim: new THREE.MeshStandardMaterial({ color: 0x664d33, emissive: 0x000000, roughness: 0.3 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 4, roughness: 0.3 }),
  cabinLight: new THREE.MeshStandardMaterial({ color: 0xfff4e2, emissive: 0xffe9c8, emissiveIntensity: 2.4 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x24416e, roughness: 0.9 }),
  seatDark: new THREE.MeshStandardMaterial({ color: 0x1a2d4b, roughness: 0.9 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x3f3d39, roughness: 0.5, metalness: 0.1 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xa8a092, roughness: 0.62 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xbfb8aa, roughness: 0.75 }),
  rail: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.95 }),
  sleeper: new THREE.MeshStandardMaterial({ color: 0x4e4a45, roughness: 0.95 }),
  ballast: new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 1 }),
};
export const MAT = M;

const box = (w, h, d, mat, r = 0.04) => new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), mat);
const cyl = (r, h, mat, s = 24) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, s), mat);

function bogie(x) {
  const g = new THREE.Group();
  const frame = box(3.2, 0.5, 2.6, M.dark, 0.05); frame.position.set(0, 0.85, 0); g.add(frame);
  for (const dx of [-1.1, 1.1]) for (const dz of [-1.3, 1.3]) {
    const w = cyl(0.55, 0.22, M.steel, 36); w.rotation.x = Math.PI / 2; w.position.set(dx, 0.55, dz); g.add(w);
    const hub = cyl(0.14, 0.26, M.dark, 16); hub.rotation.x = Math.PI / 2; hub.position.set(dx, 0.55, dz); g.add(hub);
  }
  g.position.x = x;
  g.userData.wheels = g.children.filter(c => c.geometry.type === "CylinderGeometry");
  return g;
}

// WAP-7: 20.5 m long, 4.3 m tall; white body, red band at the nose, grey underframe, two cabs.
export function locomotive() {
  const g = new THREE.Group();
  const L = 20.5, Hb = 2.6, Wd = 3.2;
  const body = box(L - 1.6, Hb, Wd, M.white, 0.18); body.position.y = 1.55 + Hb / 2; g.add(body);
  // noses
  for (const s of [-1, 1]) {
    const nose = new THREE.Mesh(new RoundedBoxGeometry(1.9, Hb - 0.2, Wd - 0.15, 4, 0.45), M.white);
    nose.position.set(s * (L / 2 - 0.95), 1.55 + Hb / 2 - 0.05, 0); g.add(nose);
    const band = box(1.0, 0.42, Wd - 0.1, M.red, 0.02); band.position.set(s * (L / 2 - 0.5), 2.55, 0); g.add(band);
    // windscreens
    const visor = box(0.05, 1.0, Wd - 0.5, M.winBand, 0.04); visor.position.set(s * (L / 2 - 0.005), 3.5, 0); g.add(visor);
    for (const z of [-0.74, 0.74]) { const ws = box(0.03, 0.82, 1.12, M.glass, 0.03); ws.position.set(s * (L / 2 + 0.02), 3.52, z); g.add(ws); }
    const pillar = box(0.05, 0.9, 0.12, M.white, 0.01); pillar.position.set(s * (L / 2 + 0.03), 3.52, 0); g.add(pillar);
    // headlights: twin centre lamps and two marker lamps
    const head = new THREE.Group(); head.position.set(s * (L / 2 + 0.01), 2.95, 0);
    for (const z of [-0.26, 0.26]) { const l = cyl(0.17, 0.06, M.lamp, 20); l.rotation.z = Math.PI / 2; l.position.z = z; head.add(l); }
    for (const z of [-1.25, 1.25]) { const m = cyl(0.1, 0.05, M.lamp, 16); m.rotation.z = Math.PI / 2; m.position.set(0, 0.3, z); head.add(m); const t = cyl(0.08, 0.05, M.tail, 16); t.rotation.z = Math.PI / 2; t.position.set(0, 0.05, z); t.visible = false; head.add(t); }
    head.userData.side = s;
    g.add(head);
    g.userData[s > 0 ? "headF" : "headB"] = head;
  }
  // roof equipment: pantographs, hood
  const roof = box(L - 4, 0.25, Wd - 0.6, M.steel, 0.05); roof.position.y = 1.55 + Hb + 0.12; g.add(roof);
  for (const x of [-5.5, 5.5]) {
    const base = box(1.6, 0.12, 2.0, M.dark, 0.02); base.position.set(x, 4.35, 0); g.add(base);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), M.steel); arm.position.set(x - 0.5, 4.95, 0); arm.rotation.z = 0.5; g.add(arm);
    const arm2 = arm.clone(); arm2.position.set(x + 0.25, 5.45, 0); arm2.rotation.z = -0.65; g.add(arm2);
    const pan = box(0.1, 0.05, 1.7, M.dark, 0.01); pan.position.set(x + 0.55, 5.95, 0); g.add(pan);
  }
  // side grilles and the number
  for (const z of [-1, 1]) for (let i = -3; i <= 3; i++) { const gr = box(1.4, 0.9, 0.04, M.dark, 0.01); gr.position.set(i * 2.3, 3.1, z * (Wd / 2 + 0.01)); g.add(gr); }
  const under = box(L - 3, 0.9, Wd - 0.5, M.dark, 0.03); under.position.y = 1.1; g.add(under);
  g.add(bogie(-5.8), bogie(5.8));
  // couplers
  for (const s of [-1, 1]) { const c = box(0.6, 0.3, 0.3, M.steel, 0.02); c.position.set(s * (L / 2 + 0.2), 1.0, 0); g.add(c); }
  g.userData.length = L;
  return g;
}

// LHB coach: 24 m, stainless body with an orange/red band (Utkrisht style), windows, doors, lit interior.
export function coach(opts = {}) {
  const g = new THREE.Group();
  const L = 24, Hb = 2.9, Wd = 3.24;
  const body = box(L, Hb, Wd, M.stainless, 0.22); body.position.y = 1.5 + Hb / 2; g.add(body);
  const roof = box(L - 0.6, 0.18, Wd - 0.5, M.dark, 0.08); roof.position.y = 1.5 + Hb + 0.02; g.add(roof);
  const band = box(L - 0.2, 0.22, Wd + 0.02, opts.band || M.orange, 0.02); band.position.y = 3.62; g.add(band);
  const band2 = box(L - 0.2, 0.12, Wd + 0.02, M.red, 0.01); band2.position.y = 2.22; g.add(band2);
  // a continuous dark window band; the glazing glows warm because the coach is lit inside
  const strip = box(L - 3.6, 1.12, Wd + 0.012, M.winBand, 0.03); strip.position.y = 2.95; g.add(strip);
  const win = M.coachWin; // shared by every coach, so one shader draws all the lit glazing
  g.userData.windowMat = win;
  for (const z of [-1, 1]) for (let i = 0; i < 9; i++) {
    const w = box(1.42, 0.86, 0.02, win, 0.05); w.position.set(-L / 2 + 2.6 + i * 2.35, 2.97, z * (Wd / 2 + 0.008)); g.add(w);
  }
  // doors at both ends, flush with a dark seam
  for (const z of [-1, 1]) for (const s0 of [-1, 1]) {
    const seam = box(1.02, 2.27, 0.012, M.winBand, 0.02); seam.position.set(s0 * (L / 2 - 0.9), 2.3, z * (Wd / 2 + 0.004)); g.add(seam);
    const d = box(0.95, 2.2, 0.03, M.stainless, 0.03); d.position.set(s0 * (L / 2 - 0.9), 2.3, z * (Wd / 2 + 0.018)); g.add(d);
    const dw = box(0.46, 0.58, 0.012, win, 0.03); dw.position.set(0, 0.62, z * 0.018); d.add(dw);
    const handle = box(0.03, 0.4, 0.04, M.steel, 0.01); handle.position.set(-s0 * 0.36, 0, z * 0.03); d.add(handle);
    if (s0 < 0 && z < 0) g.userData.door = d; // the door we board through
  }
  const under = box(L - 2, 0.8, Wd - 0.6, M.dark, 0.03); under.position.y = 1.1; g.add(under);
  g.add(bogie(-8), bogie(8));
  g.userData.length = L;
  return g;
}

// The interior of one coach as a separate group, placed where the camera enters. Chair-car layout:
// aisle down the middle, 2+2 seats, warm ceiling lights, luggage racks, a destination LED board.
export function interior() {
  const g = new THREE.Group();
  const L = 22, W = 3.0, H = 2.45;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), M.floor); floor.rotation.x = -Math.PI / 2; floor.position.y = 0; g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L, W), M.ceiling); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; g.add(ceil);
  for (const z of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, H), M.wall); wall.position.set(0, H / 2, z * W / 2); wall.rotation.y = z > 0 ? Math.PI : 0; g.add(wall);
    // windows along the wall: a dark glass with the night outside; one is the "hero" window with video
    for (let i = 0; i < 9; i++) {
      const wn = box(1.5, 0.95, 0.04, M.glass, 0.04); wn.position.set(-L / 2 + 2.3 + i * 2.35, 1.45, z * (W / 2 - 0.01)); g.add(wn);
      if (z < 0 && i === 4) g.userData.heroWindow = wn;
    }
    // luggage rack
    const rack = box(L - 1, 0.04, 0.55, M.steel, 0.01); rack.position.set(0, H - 0.5, z * (W / 2 - 0.35)); g.add(rack);
    // seats: pairs facing +X
    for (let i = 0; i < 10; i++) {
      for (const k of [0.62, 1.12]) {
        const row = new THREE.Group();
        const base = box(0.5, 0.12, 0.48, M.seatDark, 0.03); base.position.set(0, 0.45, 0); row.add(base);
        const cushion = box(0.5, 0.1, 0.46, M.seat, 0.04); cushion.position.set(0, 0.56, 0); row.add(cushion);
        const back = box(0.12, 0.75, 0.46, M.seat, 0.05); back.position.set(-0.2, 0.95, 0); back.rotation.z = -0.1; row.add(back);
        const head = box(0.1, 0.22, 0.3, M.seatDark, 0.04); head.position.set(-0.3, 1.42, 0); row.add(head);
        const leg = cyl(0.03, 0.4, M.steel, 8); leg.position.set(0, 0.2, 0); row.add(leg);
        row.position.set(-L / 2 + 1.8 + i * 2.1, 0, z * k);
        g.add(row);
      }
    }
  }
  // ceiling light strips (emissive only: the stage keeps a fixed rig of roaming lights, so shaders never
  // loop over dozens of point lights and never recompile when one switches on)
  g.userData.lights = [];
  for (let i = 0; i < 10; i++) {
    const lt = box(1.3, 0.03, 0.16, M.cabinLight, 0.01); lt.position.set(-L / 2 + 1.8 + i * 2.1, H - 0.02, 0); g.add(lt);
    g.userData.lights.push(lt.position.clone());
  }
  // LED destination board at the far end
  const board = box(0.06, 0.3, 1.4, M.dark, 0.02); board.position.set(L / 2 - 0.4, H - 0.35, 0); g.add(board);
  g.userData.boardMesh = board;
  g.userData.boardAnchor = new THREE.Vector3(L / 2 - 0.43, H - 0.35, 0);
  // end wall with the vestibule door (open)
  const endWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), M.wall); endWall.position.set(L / 2, H / 2, 0); endWall.rotation.y = -Math.PI / 2; g.add(endWall);
  g.userData.size = { L, W, H };
  return g;
}

// Track: two rails, sleepers and ballast, instanced along +X. Length in metres.
export function track(length = 400, { sleepers = true } = {}) {
  const g = new THREE.Group();
  for (const z of [-0.72, 0.72]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.07), M.rail); r.position.set(0, 0.08, z); g.add(r);
    const head = new THREE.Mesh(new THREE.BoxGeometry(length, 0.03, 0.09), M.rail); head.position.set(0, 0.17, z); g.add(head);
  }
  if (sleepers) {
    const n = Math.floor(length / 0.65);
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.14, 2.5), M.sleeper, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m.makeTranslation(-length / 2 + i * 0.65, -0.05, 0); inst.setMatrixAt(i, m); }
    g.add(inst);
  }
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(length, 0.3, 4.2), M.ballast); ballast.position.y = -0.3; g.add(ballast);
  return g;
}

// Catenary: masts every 50 m with a cantilever, a contact wire above the track centre.
export function catenary(length = 400) {
  const g = new THREE.Group();
  const n = Math.floor(length / 50);
  const mast = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 7.5, 0.22), M.dark, n);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 3.2), M.steel, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + i * 50 + 10;
    m.makeTranslation(x, 3.75, 3.6); mast.setMatrixAt(i, m);
    m.makeTranslation(x, 6.6, 2.0); arm.setMatrixAt(i, m);
  }
  g.add(mast, arm);
  const wire = new THREE.Mesh(new THREE.BoxGeometry(length, 0.03, 0.03), M.steel); wire.position.set(0, 6.3, 0); g.add(wire);
  const wire2 = wire.clone(); wire2.position.y = 7.0; g.add(wire2);
  return g;
}

// Platform with pillars, a roof, lamps and a station name board.
export function platform(length = 160, side = 1) {
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(length, 0.9, 7), new THREE.MeshStandardMaterial({ color: 0x3e3c38, roughness: 0.78, envMapIntensity: 0.5 }));
  slab.position.set(0, 0.45, side * (3.5 + 2.2)); g.add(slab);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(length, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: 0xd6c25a, roughness: 0.8 }));
  edge.position.set(0, 0.93, side * (2.2 + 0.3)); g.add(edge);
  const n = Math.floor(length / 12);
  const pillar = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.18, 5, 12), M.dark, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { m.makeTranslation(-length / 2 + i * 12 + 6, 3.4, side * 7.5); pillar.setMatrixAt(i, m); }
  g.add(pillar);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length, 0.15, 6.5), new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.7, metalness: 0.4 }));
  roof.position.set(0, 5.95, side * 7.3); g.add(roof);
  // lamps under the roof
  g.userData.lamps = [];
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + i * 12 + 6;
    const tube = box(1.2, 0.06, 0.12, M.cabinLight, 0.01); tube.position.set(x, 5.85, side * 6.0); g.add(tube);
    g.userData.lamps.push(tube.position.clone());
  }
  return g;
}
