/* InstantGMT project page: "endless choices, in 15 minutes".
   One branching stream of motions (100STYLE references retargeted to the G1) is tracked by three policies side
   by side, each the seed-0 checkpoint written after 15 minutes of training: InstantGMT, SuperMimic (official
   code, teleop goal) and mjlab PPO. The panels replay the policies' own MuJoCo rollouts, recorded offline on one
   route through the tree with the push test on (assets/replay: the robots' states every 0.02 s, the route, the
   pushes; no policy is shipped). The tree follows the recorded route. Until the recording has loaded (or without
   it), the panels replay the references and fall at the measured rates (paper, Table 1). */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/* falls on 198 held-out clips, per seed (paper Table 1, calibrated model) */
const N_CLIPS = 198;
const FALLS = {
  igmt: { 0.25: [2, 1, 3], 1: [1, 1, 1], 3: [0, 1, 0] },
  smt: { 0.25: [11, 14, 12], 1: [13, 16, 9], 3: [12, 12, 19] },
  ppo: { 0.25: [110, 100], 1: [42, 39], 3: [23, 34], 12: [24, 19] },
};
const MODES = { "0.25": { igmt: 0.25, smt: 0.25, ppo: 0.25 } };  // every policy after 15 min of training
const REPLAY = { base: "assets/replay/" };
const fmtH = (h) => (h < 1 ? Math.round(h * 60) + " min" : h + " h");

const host = document.getElementById("mtree3");
if (host) init(host).catch((e) => {
  console.error(e);
  const m = host.querySelector(".mt3-msg");
  if (m) { m.hidden = false; m.dataset.err = String(e && e.stack || e); m.textContent = "The 3D figure could not be loaded in this browser."; }
});

async function init(host) {
  const stage = host.querySelector(".mt3-stage");
  const canvas = stage.querySelector("canvas");
  const chipsEl = host.querySelector(".mt3-chips");
  const pauseBtn = host.querySelector(".mt3-pause");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // With the recorded rollouts the stream is made of held-out clips, the clips the panels' fall counts are measured
  // on; without them, of clips from the training library.
  let base = "assets/g1tree/", liveTree = null, REC = null;
  try {
    const [r, j] = await Promise.all([fetch(REPLAY.base + "tree/g1.json"), fetch(REPLAY.base + "rollouts.json")]);
    if (r.ok && j.ok) { liveTree = await r.json(); REC = await j.json(); base = REPLAY.base + "tree/"; }
  } catch (e) { REC = null; }
  const ROUTE = REC ? REC.route : null;
  const [meta, meshBuf, motBuf] = await Promise.all([
    liveTree || fetch(base + "g1.json").then((r) => r.json()),
    fetch(base + "g1_mesh.bin").then((r) => r.arrayBuffer()),
    fetch(base + "g1_motion.bin").then((r) => r.arrayBuffer()),
  ]);
  const R = meta.robot, MO = meta.motion, SEGS = MO.segments;
  const selEl = host.querySelector(".mt3-sel");
  if (selEl && MO.selection === "baseline_falls") selEl.hidden = false;
  const D = new Int16Array(motBuf), F = MO.frames, CH = MO.channels, FPS = MO.fps, SEG_T = (F - 1) / FPS;
  const NJ = 29;

  /* ---------- robot model ---------- */
  const q4 = (a) => new THREE.Quaternion(a[1], a[2], a[3], a[0]);  // MuJoCo wxyz -> three xyzw
  const ONE = new THREE.Vector3(1, 1, 1);
  const bodies = R.bodies.map((b) => ({
    parent: b.parent, joint: b.joint, p: new THREE.Vector3(...b.pos), q: q4(b.quat),
    axis: b.axis ? new THREE.Vector3(...b.axis) : null,
  }));
  const geoms = R.geoms.map((g) => ({
    body: g.body, mesh: g.mesh, dark: g.dark,
    local: new THREE.Matrix4().compose(new THREE.Vector3(...g.pos), q4(g.quat), ONE),
  }));
  function meshGeo(lod) {
    return R.lods[lod].map((e) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(meshBuf, e.v[0], e.v[1] * 3), 3));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(meshBuf, e.i[0], e.i[1]), 1));
      g.computeVertexNormals();
      return g;
    });
  }
  const HI = meshGeo("hi"), LO = meshGeo("lo");
  const NB = bodies.length, NG = geoms.length;
  const bodyM = bodies.map(() => new THREE.Matrix4());
  const tq = new THREE.Quaternion(), jq = new THREE.Quaternion(), tm = new THREE.Matrix4();
  function fk(pose, out) {
    for (let b = 0; b < NB; b++) {
      const B = bodies[b];
      if (b === 0) { bodyM[0].compose(pose.p, pose.q, ONE); continue; }
      tq.copy(B.q);
      if (B.joint >= 0) { jq.setFromAxisAngle(B.axis, pose.j[B.joint]); tq.multiply(jq); }
      tm.compose(B.p, tq, ONE);
      bodyM[b].multiplyMatrices(bodyM[B.parent], tm);
    }
    for (let g = 0; g < NG; g++) out[g].multiplyMatrices(bodyM[geoms[g].body], geoms[g].local);
    return out;
  }

  /* ---------- motion sampling ---------- */
  const newPose = () => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), j: new Float32Array(NJ) });
  const copyPose = (a, b) => { b.p.copy(a.p); b.q.copy(a.q); b.j.set(a.j); return b; };
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qy = new THREE.Quaternion(), ZAX = new THREE.Vector3(0, 0, 1);
  function sample(node, t, out) {
    const seg = node.seg, f = Math.min(Math.max(t * FPS, 0), F - 1);
    const i0 = Math.min(Math.floor(f), F - 2), a = f - i0;
    const o0 = (seg * F + i0) * CH, o1 = o0 + CH, L = (k) => D[o0 + k] + (D[o1 + k] - D[o0 + k]) * a;
    const lx = L(0) * 1e-3, ly = L(1) * 1e-3, lz = L(2) * 1e-3;
    qa.set(D[o0 + 4], D[o0 + 5], D[o0 + 6], D[o0 + 3]);
    qb.set(D[o1 + 4], D[o1 + 5], D[o1 + 6], D[o1 + 3]);
    qa.normalize(); qb.normalize(); qa.slerp(qb, a);
    const c = Math.cos(node.yaw), s = Math.sin(node.yaw);
    out.p.set(node.ox + c * lx - s * ly, node.oy + s * lx + c * ly, lz);
    qy.setFromAxisAngle(ZAX, node.yaw);
    out.q.multiplyQuaternions(qy, qa);
    for (let k = 0; k < NJ; k++) out.j[k] = L(7 + k) * 1e-4;
    return out;
  }
  function blendPose(a, b, w, out) {
    out.p.lerpVectors(a.p, b.p, w);
    out.q.copy(a.q).slerp(b.q, w);
    for (let k = 0; k < NJ; k++) out.j[k] = a.j[k] + (b.j[k] - a.j[k]) * w;
    return out;
  }
  // a fall: the frozen pose topples forward about the ground point under the pelvis
  const fallQ = new THREE.Quaternion(), fallAx = new THREE.Vector3(), fwd = new THREE.Vector3(), piv = new THREE.Vector3();
  function topple(pose, k, out) {
    copyPose(pose, out);
    fwd.set(1, 0, 0).applyQuaternion(pose.q); fwd.z = 0; fwd.normalize();
    fallAx.set(-fwd.y, fwd.x, 0);
    const e = k * k;  // accelerating, like a fall
    fallQ.setFromAxisAngle(fallAx, 1.42 * e);
    piv.set(pose.p.x + 0.08 * fwd.x, pose.p.y + 0.08 * fwd.y, 0);
    out.p.sub(piv).applyQuaternion(fallQ).add(piv);
    out.q.premultiply(fallQ);
    for (let j = 0; j < NJ; j++) out.j[j] = pose.j[j] * (1 - 0.35 * e);
    return out;
  }

  /* ---------- renderer, scene ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;  // blurred, soft-edged shadows
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setScissorTest(true);
  const BG = 0x18222f;
  renderer.setClearColor(BG, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 6.5, 18);
  const world = new THREE.Group();
  world.rotation.x = -Math.PI / 2;  // MuJoCo z-up inside, three y-up outside
  scene.add(world);
  // the reference (tree ghosts, paths, target) lives in its own group: with live policies it is shifted per panel
  // onto that panel's simulated robot, so the robot itself is drawn exactly where MuJoCo puts it
  const refGroup = new THREE.Group();
  world.add(refGroup);
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x223042, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 12 });
  sun.shadow.bias = -0.0003;
  sun.shadow.radius = 9; sun.shadow.blurSamples = 20;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x7fc8ff, 1.5);
  scene.add(rim, rim.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.9);  // from the camera, so the side facing the viewer is lit
  scene.add(fill, fill.target);
  const grid = new THREE.GridHelper(60, 120, 0x4a5f7a, 0x33445a);
  grid.material.transparent = true; grid.material.opacity = 0.6;
  scene.add(grid);
  // a lit floor that takes the shadows and fades into the fog, so the robots stand on something
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x243246, roughness: 0.92, metalness: 0 }));
  shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.y = -0.002; shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  // the live robot (shared meshes, posed per panel before each render)
  const LIGHT = new THREE.Color(0xe6eaf0), DARK = new THREE.Color(0x1d2128), RED = new THREE.Color(0xff5a5f), RED_D = new THREE.Color(0x5a1b1e);
  const matLight = new THREE.MeshStandardMaterial({ color: 0xe6eaf0, roughness: 0.45, metalness: 0.15 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x1d2128, roughness: 0.5, metalness: 0.35 });
  const live = geoms.map((g) => {
    const m = new THREE.Mesh(HI[g.mesh], g.dark ? matDark : matLight);
    m.matrixAutoUpdate = false; m.castShadow = true;
    world.add(m);
    return m;
  });
  const liveM = geoms.map(() => new THREE.Matrix4());

  /* ---------- ghosts (x-ray) ---------- */
  const ROBOT = new THREE.Vector3();  // live pelvis in scene coordinates, shared by all ghost materials
  const U_RN = { value: new THREE.Vector2() }, U_RD = { value: 6 }, U_ASP = { value: 1.5 };  // robot on screen (per panel)
  const ghostVS = `
    varying vec3 vN; varying vec3 vV; varying float vD; varying vec3 vW; varying vec4 vC;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vW = (modelMatrix * vec4(position, 1.0)).xyz;
      vN = normalize(normalMatrix * normal); vV = -mv.xyz; vD = length(mv.xyz);
      gl_Position = projectionMatrix * mv; vC = gl_Position;
    }`;
  const ghostFS = `
    uniform vec3 uColor; uniform float uOpacity; uniform float uNear; uniform float uFar; uniform vec3 uRobot;
    uniform vec2 uRN; uniform float uRD; uniform float uAsp; uniform float uKeep;
    varying vec3 vN; varying vec3 vV; varying float vD; varying vec3 vW; varying vec4 vC;
    void main(){
      float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      float glow = 0.16 + 1.25 * smoothstep(0.05, 1.0, f) * smoothstep(0.05, 1.0, f);  // soft rim, faint body
      float fog = (1.0 - smoothstep(uNear, uFar, vD)) * smoothstep(2.4, 4.6, vD);  // fade far away and close to the lens
      float clear = uKeep > 0.5 ? 1.0 : smoothstep(0.3, 0.75, length(vW.xz - uRobot.xz));  // keep the live robot readable
      // ghosts between the camera and the robot fade where they cover it on screen
      vec2 nd = vC.xy / vC.w - uRN;
      float e = length(vec2(nd.x * uAsp * uRD / 0.9, nd.y * uRD / 2.4));
      float front = uKeep > 0.5 || vD >= uRD - 0.3 ? 1.0 : 0.12 + 0.88 * smoothstep(0.8, 1.35, e);
      gl_FragColor = vec4(uColor * glow * uOpacity * fog * clear * front, 1.0);
    }`;
  function ghostMaterial(keep = 0) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uOpacity: { value: 0 }, uNear: { value: 6 }, uFar: { value: 17 }, uRobot: { value: ROBOT }, uRN: U_RN, uRD: U_RD, uAsp: U_ASP, uKeep: { value: keep } },
      vertexShader: ghostVS, fragmentShader: ghostFS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }
  const loCounts = LO.map((g) => [g.attributes.position.count, g.index.count]);
  const totV = geoms.reduce((s, g) => s + loCounts[g.mesh][0], 0), totI = geoms.reduce((s, g) => s + loCounts[g.mesh][1], 0);
  const gm = geoms.map(() => new THREE.Matrix4()), nm = new THREE.Matrix3(), v3 = new THREE.Vector3();
  const tmpPose = newPose();
  const bakeGhost = (node, t) => bakePose(sample(node, t, tmpPose));
  function bakePose(pose, parent = refGroup) {
    fk(pose, gm);
    const P = new Float32Array(totV * 3), N = new Float32Array(totV * 3), I = new Uint32Array(totI);
    let vo = 0, io = 0;
    for (let g = 0; g < NG; g++) {
      const geo = LO[geoms[g].mesh], pa = geo.attributes.position.array, na = geo.attributes.normal.array, ia = geo.index.array;
      const M = gm[g]; nm.setFromMatrix4(M);
      const n = pa.length / 3;
      for (let k = 0; k < n; k++) {
        v3.set(pa[3 * k], pa[3 * k + 1], pa[3 * k + 2]).applyMatrix4(M);
        P[3 * (vo + k)] = v3.x; P[3 * (vo + k) + 1] = v3.y; P[3 * (vo + k) + 2] = v3.z;
        v3.set(na[3 * k], na[3 * k + 1], na[3 * k + 2]).applyMatrix3(nm);
        N[3 * (vo + k)] = v3.x; N[3 * (vo + k) + 1] = v3.y; N[3 * (vo + k) + 2] = v3.z;
      }
      for (let k = 0; k < ia.length; k++) I[io + k] = ia[k] + vo;
      vo += n; io += ia.length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(N, 3));
    geo.setIndex(new THREE.BufferAttribute(I, 1));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, ghostMaterial());
    m.renderOrder = 2;
    parent.add(m);
    return m;
  }

  /* ---------- the tree (shared by all panels) ---------- */
  // ghost times: spaced by distance travelled (at least 0.5 s and 0.45 m apart), so slow gaits do not pile up
  const GHOST_T = SEGS.map((_, k) => {
    const out = []; let lx = 0, ly = 0, lt = 0;
    for (let i = 1; i < F; i++) {
      const o = (k * F + i) * CH, x = D[o] * 1e-3, y = D[o + 1] * 1e-3, tt = i / FPS;
      const far = Math.hypot(x - lx, y - ly);
      if ((far >= 0.45 && tt - lt >= 0.5) || (i === F - 1 && far >= 0.2 && tt - lt >= 0.4)) { out.push(tt); lx = x; ly = y; lt = tt; }
    }
    if (!out.length || out[out.length - 1] < SEG_T - 0.6) out.push(SEG_T);
    return out.slice(-5);
  });
  const COL_PAST = new THREE.Color(0xdbe7f6), COL_AHEAD = new THREE.Color(0x58c8ff), COL_HOT = new THREE.Color(0x9fe2ff), COL_FALL = new THREE.Color(0xff5a5f);
  const nodes = new Set();
  function makeNode(seg, parent, ti = -1) {
    let ox = 0, oy = 0, yaw = 0;
    if (parent) {
      const e = SEGS[parent.seg].end, c = Math.cos(parent.yaw), s = Math.sin(parent.yaw);
      ox = parent.ox + c * e[0] - s * e[1]; oy = parent.oy + s * e[0] + c * e[1]; yaw = parent.yaw + e[2];
    }
    // u: difficulty draw (a branch falls for a policy whose fall rate exceeds u); tf: when the fall starts
    const n = { seg, ox, oy, yaw, ti, par: parent, commit: -1, kids: null, alts: null, ghosts: null, line: null, role: "line", alpha: 0, dead: false, age: 0,
                u: Math.random(), tf: 0.6 + 1.5 * Math.random() };
    nodes.add(n);
    return n;
  }
  function pathLine(n) {
    const pts = [], c = Math.cos(n.yaw), s = Math.sin(n.yaw);
    for (let i = 0; i < F; i += 2) {
      const o = (n.seg * F + i) * CH, lx = D[o] * 1e-3, ly = D[o + 1] * 1e-3;
      pts.push(n.ox + c * lx - s * ly, n.oy + s * lx + c * ly, 0.006);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    l.renderOrder = 1;
    refGroup.add(l);
    return l;
  }
  function pickKids(n) {
    const cand = SEGS[n.seg].next.slice(), out = [], styles = new Set();
    const rk = ROUTE && n.ti >= 0 && n.ti + 1 < ROUTE.length ? ROUTE[n.ti + 1] : -1;  // the recorded route's next branch
    if (rk >= 0) { cand.splice(cand.indexOf(rk), 1); out.push(rk); styles.add(SEGS[rk].style); }
    while (out.length < 3 && cand.length) {
      const k = cand.splice(Math.floor(Math.random() * Math.min(cand.length, 5)), 1)[0];
      if (styles.has(SEGS[k].style) && cand.length > 3 - out.length) continue;
      styles.add(SEGS[k].style); out.push(k);
    }
    if (rk >= 0) { const j = Math.floor(Math.random() * out.length); [out[0], out[j]] = [out[j], out[0]]; }
    return out;
  }
  function ensureKids(n) {
    if (n.kids) return;
    const rk = ROUTE && n.ti >= 0 && n.ti + 1 < ROUTE.length ? ROUTE[n.ti + 1] : -1;
    let used = false;
    n.kids = pickKids(n).map((k) => { const on = k === rk && !used; used = used || on; return makeNode(k, n, on ? n.ti + 1 : -1); });
  }
  function ensureAlts(n) {  // the other possible continuations: drawn faintly, not selectable
    if (n.alts) return;
    const used = new Set(n.kids.map((k) => k.seg));
    n.alts = SEGS[n.seg].next.filter((k) => !used.has(k)).slice(0, 5).map((k) => makeNode(k, n));
  }
  function setRole(n, role) {
    n.role = role;
    if (!n.line) n.line = pathLine(n);
    if (role !== "line" && !n.ghosts) {
      const ts = GHOST_T[n.seg], keep = role === "alt" ? ts.slice(-1) : role === "preview" ? ts.slice(-2) : ts;
      n.ghosts = keep.map((t) => ({ t, i: ts.indexOf(t), mesh: bakeGhost(n, t) }));
    } else if (n.ghosts && role === "option" && n.ghosts.length < GHOST_T[n.seg].length) {
      const have = new Set(n.ghosts.map((g) => g.t));
      GHOST_T[n.seg].forEach((t, i) => { if (!have.has(t)) n.ghosts.push({ t, i, mesh: bakeGhost(n, t) }); });
    }
  }
  function roles(cur) {
    setRole(cur, "current"); ensureKids(cur); ensureAlts(cur);
    for (const a of cur.alts) setRole(a, "alt");
    for (const o of cur.kids) {
      setRole(o, "option"); ensureKids(o);
      for (const p of o.kids) {
        setRole(p, "preview"); ensureKids(p);
        for (const l of p.kids) setRole(l, "line");
      }
    }
  }
  function retire(n) { n.dead = true; if (n.kids) n.kids.forEach(retire); }
  function dispose(n) {
    if (n.ghosts) n.ghosts.forEach((g) => { g.mesh.removeFromParent(); g.mesh.geometry.dispose(); g.mesh.material.dispose(); });
    if (n.line) { n.line.removeFromParent(); n.line.geometry.dispose(); n.line.material.dispose(); }
    n.ghosts = null; n.line = null;
    nodes.delete(n);
  }

  /* ---------- panels: one per policy ---------- */
  const PANELS = ["igmt", "smt", "ppo"].map((key) => {
    const el = stage.querySelector(`.mt3-p[data-k="${key}"]`);
    const cam = new THREE.PerspectiveCamera(30, 1.5, 0.1, 80);
    return {
      key, el, cam, hours: 0, rate: 0, main: key === "igmt",
      pose: newPose(), prevEnd: null, fallen: false, snap: false,
      tgt: new THREE.Vector3(), off: null,
      ui: {
        time: el.querySelector(".tm"), falls: el.querySelector(".falls b"),
        seeds: el.querySelector(".falls em"), fall: el.querySelector(".mt3-fall"),
      },
    };
  });
  const MAIN = PANELS[0];
  let mode = "head";
  function setMode(m) {
    mode = m;
    for (const P of PANELS) {
      const h = MODES[m][P.key], f = FALLS[P.key][h];
      P.hours = h;
      P.rate = f.reduce((a, b) => a + b, 0) / f.length / N_CLIPS;
      P.ui.time.textContent = fmtH(h) + " of training";
      const lo = Math.min(...f), hi = Math.max(...f);
      P.ui.falls.textContent = lo === hi ? String(lo) : lo + "–" + hi;
      P.ui.seeds.textContent = f.length > 1 ? f.length + " seeds: " + f.join(" · ") : "1 seed";
    }
    if (!running) render(0);
  }

  /* ---------- state ---------- */
  let cur = ROUTE ? makeNode(ROUTE[0], null, 0) : makeNode(Math.floor(Math.random() * SEGS.length), null);
  const past = [];
  let t = 0, hot = -1, pick = -1;
  const BLEND = 0.3;
  roles(cur);
  const fails = (n, P) => !liveOn && n.u < P.rate;

  function label(seg) { const s = SEGS[seg]; return s.style + " · " + s.gait; }
  function routeKid(n) { return n.kids ? n.kids.findIndex((k) => k.ti >= 0 && k.ti === n.ti + 1) : -1; }
  function choice() {  // the branch taken at the end of the current one (fixed once the stream needs it)
    if (cur.commit >= 0) return cur.commit;
    const r = routeKid(cur);
    if (r >= 0) return r;
    return pick >= 0 ? pick : hot >= 0 ? hot : Math.floor(Math.random() * cur.kids.length);
  }
  function advance(i) {
    const next = cur.kids[i];
    if (liveOn) liveStats.motions++;
    for (const P of PANELS) {
      P.snap = P.fallen;  // a fallen robot is reset at the next branch, as an evaluation episode would be
      P.prevEnd = P.fallen ? null : copyPose(P.pose, P.prevEnd || newPose());
      P.fallen = false;
    }
    cur.kids.forEach((k, j) => { if (j !== i) retire(k); });
    cur.alts.forEach(retire);
    cur.role = "past"; past.push(cur);
    while (past.length > 5) past.shift().dead = true;  // only the node itself: its descendants are the live path
    past.forEach((p, k) => { p.age = past.length - k; });
    cur = next;
    hot = -1; pick = -1;
    roles(cur);
    syncUI();
  }

  /* ---------- recorded rollouts: every panel replays its own robot ---------- */
  const LDT = REC ? REC.ldt : 0.02;
  let liveOn = false, liveTried = false, liveAcc = 0, simTime = 0, tView = 0, tick = 0;
  const liveStats = { motions: 0, pushes: 0 };
  // the target: the reference pose being tracked, drawn as a green x-ray figure over each robot
  const tgtMat = ghostMaterial(1);
  tgtMat.uniforms.uColor.value.set(0x4ade80);
  const tgtMeshes = geoms.map((g) => {
    const m = new THREE.Mesh(LO[g.mesh], tgtMat);
    m.matrixAutoUpdate = false; m.renderOrder = 3; m.visible = false;
    refGroup.add(m);
    return m;
  });
  const tgtM = geoms.map(() => new THREE.Matrix4()), tgtPose = newPose();
  // pushes (recorded): the paper's push test, 240 N for 0.2 s every 3 s, direction turning by the golden angle
  let arrowT = 0;
  const pushDir = new THREE.Vector2();
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.75, 0x4ade80, 0.2, 0.12);
  arrow.visible = false; arrow.renderOrder = 4;
  world.add(arrow);
  const pushBtn = host.querySelector(".mt3-push");
  if (pushBtn) pushBtn.hidden = true;
  const pushAt = new Map(REC ? REC.pushes.map(([k, a]) => [k, a]) : []);
  const refP = newPose();
  const TRAIL_N = 400;  // pelvis path of the last 8 s, fading out
  for (const P of PANELS) {
    P.simA = newPose(); P.simB = newPose(); P.corr = new THREE.Vector2();
    // the robot is drawn where MuJoCo put it (feet stay planted); the reference is shifted onto it by a slow
    // low-pass of the offset (corr), which leaves the tracking error and the effect of a push visible
    P.liveFallen = false; P.falls = 0; P.rec = null;
    P.liveEl = P.el.querySelector(".mt3-live");
    P.trail = []; P.trailCount = 0; P.lastBake = { x: 1e9, y: 1e9, at: -1e9 };
    P.trailPos = new Float32Array(TRAIL_N * 3); P.trailCol = new Float32Array(TRAIL_N * 3);
    P.trailLine = new THREE.Line(new THREE.BufferGeometry()
        .setAttribute("position", new THREE.BufferAttribute(P.trailPos, 3)).setAttribute("color", new THREE.BufferAttribute(P.trailCol, 3)),
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    P.trailLine.frustumCulled = false; P.trailLine.renderOrder = 1; P.trailLine.visible = false;
    world.add(P.trailLine);
  }
  function streamPose(node, tt, out) {  // the reference stream, with a short blend into each new branch
    tt = Math.max(tt, 0);
    sample(node, tt, out);
    if (node.par && tt < BLEND) { const w = tt / BLEND; blendPose(sample(node.par, SEG_T, tmpPose2), out, w * w * (3 - 2 * w), out); }
    return out;
  }
  const tmpPose2 = newPose();
  function refAt(tt, out) {  // stream time tt from the start of the current branch (can run into the next)
    if (tt <= SEG_T) return streamPose(cur, tt, out);
    if (cur.commit < 0) cur.commit = choice();
    return streamPose(cur.kids[cur.commit], tt - SEG_T, out);
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : w === "push" ? "es" : "s"}`;
  function paintLive(msg) {
    for (const P of PANELS) {
      const el = P.liveEl;
      if (!el) continue;
      el.hidden = false;
      if (msg) { el.textContent = P.main ? msg : "Loading…"; el.classList.remove("on"); continue; }
      el.classList.add("on");
      el.textContent = P.main
        ? `Recorded MuJoCo rollouts · push test on · ${plural(liveStats.motions, "motion")}, ${plural(liveStats.pushes, "push")}, ${plural(P.falls, "fall")}`
        : `Recorded · ${plural(P.falls, "fall")}`;
    }
  }
  function hideLive() {
    liveOn = false; host.classList.remove("live"); document.documentElement.classList.remove("mt3-live-on");
    for (const P of PANELS) if (P.liveEl) P.liveEl.hidden = true;
  }
  function stateAt(P, k, out) {  // the recorded state after step k
    const r = P.rec, o3 = 3 * k, o4 = 4 * k, oj = 29 * k;
    out.p.set(r.pos[o3], r.pos[o3 + 1], r.pos[o3 + 2]);
    out.q.set(r.quat[o4 + 1], r.quat[o4 + 2], r.quat[o4 + 3], r.quat[o4]).normalize();
    for (let j = 0; j < NJ; j++) out.j[j] = r.jnt[oj + j] * 1e-4;
    return out;
  }
  function restartRoute() {  // from the start of the recording: the first branch of the route, every robot at rest
    for (const n of nodes) n.dead = true;
    past.length = 0;
    cur = makeNode(ROUTE[0], null, 0);
    hot = -1; pick = -1; t = 0; simTime = 0; tick = 0;
    roles(cur); syncUI();
    liveStats.motions = 0; liveStats.pushes = 0;
    for (const P of PANELS) {
      P.falls = 0; P.liveFallen = false; P.corr.set(0, 0); P.trailCount = 0; P.prevEnd = null;
      stateAt(P, 0, P.simB); copyPose(P.simB, P.simA);
    }
  }
  async function startLive() {
    liveTried = true;
    if (!REC) return;
    try {
      paintLive("Loading the recorded rollouts (three policies)…");
      const buf = await fetch(REPLAY.base + "rollouts.bin").then((r) => { if (!r.ok) throw new Error("rollouts.bin " + r.status); return r.arrayBuffer(); });
      const T = REC.ticks, block = T * (12 + 8 + 58);
      if (buf.byteLength !== block * REC.keys.length) throw new Error("rollouts.bin size");
      for (const P of PANELS) {
        const o = block * REC.keys.indexOf(P.key), pol = REC.policies[P.key];
        P.rec = { pos: new Float32Array(buf, o, T * 3), quat: new Int16Array(buf, o + 12 * T, T * 4), jnt: new Int16Array(buf, o + 20 * T, T * 29),
                  fallen: new Uint8Array(T), reset: new Set(pol.resets) };
        for (const [a, b] of pol.falls) P.rec.fallen.fill(1, a, b);
      }
      restartRoute();
      liveOn = true; liveAcc = 0;
      host.classList.add("live"); document.documentElement.classList.add("mt3-live-on");
      paintLive();
      if (!running) render(0);
    } catch (e) {
      console.warn("recorded rollouts unavailable, showing the references", e);
      hideLive();
    }
  }
  function pump() {
    while (liveAcc >= LDT && liveOn) { liveTick(); liveAcc -= LDT; }
  }
  function liveTick() {
    if (tick >= REC.ticks) { restartRoute(); return; }
    const k = tick++;
    if (pushAt.has(k)) {
      const a = pushAt.get(k);
      pushDir.set(Math.cos(a), Math.sin(a)); arrowT = 0.7; liveStats.pushes++; paintLive();
    }
    t += LDT; simTime += LDT;
    if (t >= SEG_T) { t -= SEG_T; advance(choice()); paintLive(); }
    if (pick < 0 && SEG_T - t < 0.8) { const r = routeKid(cur); if (r >= 0) { pick = r; paintChips(); } }  // the branch about to be taken
    refAt(t, refP);
    const kc = ease(LDT, 2.0);
    for (const P of PANELS) {
      copyPose(P.simB, P.simA);
      stateAt(P, k, P.simB);
      if (P.rec.reset.has(k)) {  // a new episode at the stream: no blend across the jump
        copyPose(P.simB, P.simA); P.corr.set(0, 0); P.trailCount = 0; P.liveFallen = false; continue;
      }
      const S = P.simB;
      P.corr.x += (refP.p.x - S.p.x - P.corr.x) * kc; P.corr.y += (refP.p.y - S.p.y - P.corr.y) * kc;
      const fell = !!P.rec.fallen[k];
      if (fell && !P.liveFallen) { P.falls++; paintLive(); }
      P.liveFallen = fell;
      trailStep(P);
    }
  }
  function trailStep(P) {  // pelvis path and x-ray ghosts of the simulated robot, spaced like the reference ghosts
    const x = P.simB.p.x, y = P.simB.p.y, pos = P.trailPos, col = P.trailCol;
    if (P.trailCount === TRAIL_N) pos.copyWithin(0, 3);
    const o = 3 * Math.min(P.trailCount, TRAIL_N - 1);
    pos[o] = x; pos[o + 1] = y; pos[o + 2] = 0.006;
    P.trailCount = Math.min(P.trailCount + 1, TRAIL_N);
    for (let i = 0; i < P.trailCount; i++) {
      const b = 0.9 * (i / P.trailCount) ** 1.5;
      col[3 * i] = 0.86 * b; col[3 * i + 1] = 0.9 * b; col[3 * i + 2] = 0.96 * b;
    }
    const g = P.trailLine.geometry;
    g.setDrawRange(0, P.trailCount);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    const far = Math.hypot(x - P.lastBake.x, y - P.lastBake.y), dtB = simTime - P.lastBake.at;
    if ((far >= 0.45 && dtB >= 0.5) || dtB >= 1.6) {
      P.trail.push({ at: simTime, mesh: bakePose(P.simB, world), fell: P.liveFallen });
      P.lastBake = { x, y, at: simTime };
      while (P.trail.length && (P.trail.length > 12 || simTime - P.trail[0].at > 12)) {
        const m = P.trail.shift().mesh; m.removeFromParent(); m.geometry.dispose(); m.material.dispose();
      }
    }
  }

  /* ---------- UI ---------- */
  const labelsEl = MAIN.el.querySelector(".mt3-labels");
  const nowEl = MAIN.el.querySelector(".now b");
  const mainHead = MAIN.el.querySelector(".mt3-ph");
  const labelDivs = [0, 1, 2].map((i) => {
    const d = document.createElement("button");
    d.type = "button"; d.className = "mt3-tag"; d.tabIndex = -1;
    d.addEventListener("mouseenter", () => setHot(i));
    d.addEventListener("mouseleave", () => setHot(-1));
    d.addEventListener("click", () => choose(i));
    labelsEl.appendChild(d);
    return d;
  });
  function syncUI() {
    nowEl.textContent = label(cur.seg);
    chipsEl.innerHTML = "";
    cur.kids.forEach((k, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "mt-chip"; b.textContent = label(k.seg);
      b.addEventListener("mouseenter", () => setHot(i));
      b.addEventListener("mouseleave", () => setHot(-1));
      b.addEventListener("focus", () => setHot(i));
      b.addEventListener("blur", () => setHot(-1));
      b.addEventListener("click", () => choose(i));
      chipsEl.appendChild(b);
      labelDivs[i].textContent = label(k.seg);
    });
    paintChips();
    canvas.setAttribute("aria-label", "Three policies track the same stream of motions. Now: " + label(cur.seg) +
      ". Next options: " + cur.kids.map((k) => label(k.seg)).join(", ") + ".");
  }
  function paintChips() {
    [...chipsEl.children].forEach((c, j) => { c.classList.toggle("hot", j === hot); c.classList.toggle("on", j === pick); c.setAttribute("aria-pressed", String(j === pick)); });
    labelDivs.forEach((d, j) => { d.classList.toggle("hot", j === hot); d.classList.toggle("on", j === pick); d.classList.toggle("off", pick >= 0 && j !== pick); });
  }
  function setHot(i) { hot = i; paintChips(); if (!running) render(0); }
  function choose(i) {  // with the recording the route decides; a click only highlights
    if (liveOn) { setHot(i); return; }
    pick = pick === i ? -1 : i; paintChips(); if (!running) render(0);
  }

  /* ---------- cameras ---------- */
  const controls = new OrbitControls(MAIN.cam, MAIN.el.querySelector(".mt3-drag"));
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.minDistance = 4; controls.maxDistance = 16;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.35;
  let userAt = -1e9;
  controls.addEventListener("start", () => { userAt = performance.now(); });
  const toScene = (x, y, z, out) => out.set(x, z, -y);  // world group rotation (z-up -> y-up)
  function travelTheta() {
    const s0 = sample(cur, 0, newPose()).p, s1 = sample(cur, SEG_T, newPose()).p;
    let dx = s1.x - s0.x, dy = s1.y - s0.y;
    for (const o of cur.kids) { const e = sample(o, SEG_T, newPose()).p; dx += 0.35 * (e.x - s1.x); dy += 0.35 * (e.y - s1.y); }
    if (Math.hypot(dx, dy) < 0.2) return null;
    return Math.atan2(dy, dx);  // puts the direction of travel along screen-right
  }
  let camTheta = travelTheta() ?? 0.4;
  // low three-quarter view: the stream runs to the right and away from the camera, so the branches recede in depth
  const YAW_OFF = -0.6;
  const view = (P) => P.main ? { r: P.cam.aspect < 1.1 ? 7.4 : 6.0, phi: 1.16, z: 0.85 } : { r: 6.0, phi: 1.1, z: 1.0 };
  const sph = new THREE.Spherical(), pv = new THREE.Vector3(), pw = new THREE.Vector3();
  {
    const p0 = sample(cur, 0, newPose()).p;
    for (const P of PANELS) {
      toScene(p0.x, p0.y, 0.8, P.tgt);
      const V = view(P);
      P.off = new THREE.Vector3().setFromSphericalCoords(V.r, V.phi, camTheta + YAW_OFF);
      P.cam.position.copy(P.tgt).add(P.off);
      P.cam.lookAt(P.tgt);
    }
    controls.target.copy(MAIN.tgt);
  }

  /* ---------- per-frame ---------- */
  const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
  const frozen = newPose();
  let rect = { width: 1, height: 1 };

  function panelPose(P) {
    if (liveOn) {
      blendPose(P.simA, P.simB, Math.min(liveAcc / LDT, 1), P.pose);
      P.fallen = P.liveFallen;
      return;
    }
    const t = tView;
    const f = fails(cur, P);
    if (f && t >= cur.tf) {
      sample(cur, cur.tf, frozen);
      topple(frozen, Math.min(1, (t - cur.tf) / 0.75), P.pose);
      P.fallen = true;
      return;
    }
    P.fallen = false;  // also when a mode change lowers the fall rate mid-branch
    sample(cur, t, P.pose);
    if (P.prevEnd && !P.snap && t < BLEND) { const w = t / BLEND; blendPose(P.prevEnd, P.pose, w * w * (3 - 2 * w), P.pose); }
  }

  function updateNodes(dt) {
    for (const n of nodes) {
      let a = 0;
      if (!n.dead) {
        if (n.role === "current") a = 1;
        else if (n.role === "option") {
          const i = cur.kids.indexOf(n);
          a = pick >= 0 ? (i === pick ? 1.15 : 0.28) : (i === hot ? 1.15 : 0.8);
        } else if (n.role === "preview") a = 0.22;
        else if (n.role === "alt") a = 0.3;
        else if (n.role === "line") a = 0.22;
        else if (n.role === "past") a = Math.max(0, 0.95 - 0.17 * n.age);
      }
      n.alpha += (a - n.alpha) * (reduce ? 1 : ease(dt, 0.35));
      if (n.dead && n.alpha < 0.01) dispose(n);
    }
  }
  function paintNodes(P) {  // ghost and line colors as seen by policy P
    const lv = liveOn, t = tView;
    for (const Q of PANELS) {
      for (const g of Q.trail) {
        const age = simTime - g.at;
        g.mesh.material.uniforms.uColor.value.copy(g.fell ? COL_FALL : COL_PAST);
        g.mesh.material.uniforms.uOpacity.value = 0.5 * Math.max(0, 1 - age / 12);
        g.mesh.visible = lv && Q === P && age < 12;
      }
      Q.trailLine.visible = lv && Q === P;
    }
    for (const n of nodes) {
      const ahead = n.role !== "past" && n.role !== "current", bad = fails(n, P);
      if (n.line) {
        n.line.material.color.copy(bad ? COL_FALL : ahead ? COL_AHEAD : COL_PAST);
        n.line.material.opacity = Math.min(1, n.alpha) * (n.role === "current" || n.role === "past" ? 0.8 : 0.6) * (lv && n.role === "past" ? 0 : lv && n.role === "current" ? 0.5 : 1);
        n.line.visible = n.line.material.opacity > 0.004;
      }
      if (!n.ghosts) continue;
      for (const g of n.ghosts) {
        const u = g.mesh.material.uniforms;
        if (n.role === "current") {
          const after = bad && g.t > n.tf, passed = g.t <= t + 0.05, near = Math.abs(g.t - t) < 0.45;
          u.uColor.value.copy(after ? COL_FALL : passed ? COL_PAST : COL_AHEAD);
          u.uOpacity.value = near && !after ? 0 : passed ? (lv ? 0 : 0.45) : 0.6 * (1 - 0.1 * (g.t - t));
        } else {
          const isHot = n.role === "option" && cur.kids.indexOf(n) === (pick >= 0 ? pick : hot);
          u.uColor.value.copy(bad ? COL_FALL : ahead ? (isHot ? COL_HOT : COL_AHEAD) : COL_PAST);
          u.uOpacity.value = lv && n.role === "past" ? 0 : n.alpha * (n.role === "past" ? 0.55 : 0.5) * (ahead ? 1 - 0.1 * g.i : 1);
        }
        g.mesh.visible = u.uOpacity.value > 0.004;
      }
    }
  }
  function followCam(P, dt) {
    // aim above the pelvis so the robot sits below the panel header
    const V = view(P);
    toScene(P.pose.p.x, P.pose.p.y, P.fallen ? V.z - 0.3 : V.z, pw);
    P.tgt.lerp(pw, reduce ? 1 : ease(dt, 0.6));
    if (P.main) P.off.copy(P.cam.position).sub(controls.target);
    const auto = !P.main || performance.now() - userAt > 6000;
    if (auto) {
      sph.setFromVector3(P.off);
      sph.theta += angDiff(sph.theta, camTheta + YAW_OFF) * (reduce ? 1 : ease(dt, 3.5));
      sph.radius += (V.r - sph.radius) * (reduce ? 1 : ease(dt, 1));
      sph.phi += (V.phi - sph.phi) * (reduce ? 1 : ease(dt, 1));
      P.off.setFromSpherical(sph);
    }
    P.cam.position.copy(P.tgt).add(P.off);
    if (P.main) { controls.target.copy(P.tgt); controls.update(); } else P.cam.lookAt(P.tgt);
  }
  function place(el, x, y) { el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`; }

  let rendering = false;
  function render(dt) {
    if (rendering) return;  // controls.update() inside emits "change"
    rendering = true;
    try { renderPanels(dt); } finally { rendering = false; }
  }
  function renderPanels(dt) {
    tView = liveOn ? Math.max(0, t - LDT * (1 - Math.min(liveAcc / LDT, 1))) : t;
    arrowT = Math.max(0, arrowT - dt);
    if (liveOn) {  // the target pose, shared by the panels
      fk(refAt(tView, tgtPose), tgtM);
      for (let g = 0; g < NG; g++) tgtMeshes[g].matrix.copy(tgtM[g]);
    }
    updateNodes(dt);
    if (performance.now() - userAt > 6000) { const th = travelTheta(); if (th != null) camTheta = th; }
    const cr = canvas.getBoundingClientRect();
    for (const P of PANELS) {
      const r = P.el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const x = r.left - cr.left, y = r.top - cr.top;
      if (Math.abs(P.cam.aspect - r.width / r.height) > 1e-3) { P.cam.aspect = r.width / r.height; P.cam.updateProjectionMatrix(); }
      panelPose(P);
      refGroup.position.set(liveOn ? -P.corr.x : 0, liveOn ? -P.corr.y : 0, 0);
      fk(P.pose, liveM);
      for (let g = 0; g < NG; g++) live[g].matrix.copy(liveM[g]);
      matLight.color.copy(P.fallen ? RED : LIGHT);
      matDark.color.copy(P.fallen ? RED_D : DARK);
      paintNodes(P);
      tgtMat.uniforms.uOpacity.value = P.fallen ? 0.3 : 0.75;
      for (let g = 0; g < NG; g++) tgtMeshes[g].visible = liveOn;
      arrow.visible = liveOn && arrowT > 0;
      if (arrow.visible) {
        const p = P.pose.p;
        arrow.position.set(p.x - 0.95 * pushDir.x, p.y - 0.95 * pushDir.y, p.z + 0.05);
        arrow.setDirection(v3.set(pushDir.x, pushDir.y, 0));
      }
      followCam(P, dt);
      toScene(P.pose.p.x, P.pose.p.y, 0.8, ROBOT);
      P.cam.updateMatrixWorld();
      toScene(P.pose.p.x, P.pose.p.y, P.fallen ? 0.25 : 0.6, pv);
      U_RD.value = P.cam.position.distanceTo(pv); U_ASP.value = P.cam.aspect;
      pv.project(P.cam); U_RN.value.set(pv.x, pv.y);
      sun.position.copy(P.tgt).add(pv.set(2.5, 6, 2)); sun.target.position.copy(P.tgt);
      rim.position.copy(P.tgt).add(pv.set(-3, 2.5, -3)); rim.target.position.copy(P.tgt);
      grid.position.set(Math.round(P.tgt.x * 2) / 2, 0, Math.round(P.tgt.z * 2) / 2);
      fill.position.copy(P.cam.position); fill.target.position.copy(P.tgt);
      shadowPlane.position.set(P.tgt.x, -0.002, P.tgt.z);
      renderer.setViewport(x, cr.height - y - r.height, r.width, r.height);
      renderer.setScissor(x, cr.height - y - r.height, r.width, r.height);
      renderer.render(scene, P.cam);
      // "fall" tag
      const ft = P.ui.fall;
      if (P.fallen) {
        toScene(P.pose.p.x, P.pose.p.y, 0.6, pv).project(P.cam);
        ft.hidden = false;
        place(ft, (pv.x + 1) / 2 * r.width, (1 - pv.y) / 2 * r.height);
      } else ft.hidden = true;
      if (P.main) rect = r;
    }
    // option tags and "now" in the main panel
    const r = rect, cam = MAIN.cam;
    toScene(MAIN.pose.p.x, MAIN.pose.p.y, MAIN.pose.p.z + 0.72, pv).project(cam);
    const nx = (pv.x + 1) / 2 * r.width, ny = (1 - pv.y) / 2 * r.height;
    const headH = mainHead.offsetTop + mainHead.offsetHeight + 40;  // keep tags below the panel header
    const ox = liveOn ? -MAIN.corr.x : 0, oy = liveOn ? -MAIN.corr.y : 0;
    const tags = cur.kids.map((k, i) => {
      const p = sample(k, SEG_T, tmpPose).p;
      toScene(p.x + ox, p.y + oy, 1.5, pv).project(cam);
      const d = labelDivs[i], hw = d.offsetWidth / 2 + 8;
      return { i, x: Math.min(Math.max((pv.x + 1) / 2 * r.width, hw), r.width - hw),
               y: Math.min(Math.max((1 - pv.y) / 2 * r.height, headH), r.height - 40), vis: pv.z < 1 };
    });
    // stack tags top to bottom so none overlaps another or the "now" position
    const placed = [{ x: nx, y: ny }];
    for (const g of tags.slice().sort((p, q) => p.y - q.y)) {
      let moved = true;
      while (moved) {
        moved = false;
        for (const o of placed) if (Math.abs(o.x - g.x) < 190 && Math.abs(o.y - g.y) < 31) { g.y = o.y + 32; moved = true; }  // 31 < 32: always terminates
      }
      placed.push(g);
    }
    for (const g of tags) {
      const d = labelDivs[g.i];
      d.style.opacity = g.vis ? "" : "0";
      place(d, g.x, g.y);
    }
    host.style.setProperty("--mt3-prog", (t / SEG_T).toFixed(3));
  }

  /* ---------- loop, sizing, visibility ---------- */
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    if (!running) render(0);
  }
  let running = false, visible = false, paused = reduce, last = 0, raf = 0;
  function loop(ts) {
    if (!running) return;
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
    last = ts;
    if (liveOn) {
      liveAcc = Math.min(liveAcc + dt, 0.1);  // a slow device runs the simulation in slow motion
      pump();
    } else {
      t += dt;
      if (t >= SEG_T) { t -= SEG_T; advance(choice()); }
    }
    render(dt);
    raf = requestAnimationFrame(loop);
  }
  function update() {
    const want = visible && !paused && !document.hidden;
    if (visible && !liveTried) startLive();
    if (want && !running) { running = true; last = 0; raf = requestAnimationFrame(loop); }
    else if (!want && running) { running = false; cancelAnimationFrame(raf); }
  }
  controls.addEventListener("change", () => { if (!running) render(0); });
  if (pauseBtn) {
    const paint = () => { pauseBtn.textContent = paused ? "Play" : "Pause"; pauseBtn.setAttribute("aria-pressed", String(paused)); };
    paint();
    pauseBtn.addEventListener("click", () => { paused = !paused; paint(); update(); });
  }
  if (reduce) t = 1.4;
  syncUI();
  setMode("0.25");
  new ResizeObserver(resize).observe(stage);
  resize();
  host.classList.add("ready");
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; update(); }, { threshold: 0.05 }).observe(host);
  document.addEventListener("visibilitychange", update);

  // test hooks (used for screenshots)
  window.__mt3 = {
    step(n) { for (let i = 0; i < n; i++) { t = SEG_T; advance(Math.floor(Math.random() * 3)); } t = 2.6; for (let k = 0; k < 60; k++) render(0.05); },
    snap() { render(0); return canvas.toDataURL("image/png"); },
    mode: setMode,
    live: () => ({ on: liveOn, tree: base, sel: MO.selection, selHidden: selEl && selEl.hidden, tick, ...liveStats, panels: PANELS.map((P) => ({ k: P.key, falls: P.falls, fallen: P.liveFallen })) }),
  };
}
