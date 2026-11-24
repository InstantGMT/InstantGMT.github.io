/* "Same data. Same GPU." chart: falls on the 198 held-out motions and body error against training time, for the
   four methods of the paper's comparison (Table 1; calibrated G1, method-neutral evaluation). Falls: mean over
   seeds (line) and the seed range (whisker). Body error: as in the paper's table. Two panels, one y-axis each. */

const T = [0.25, 1, 3, 12];  // hours
const TLAB = ["15 min", "1 h", "3 h", "12 h"];
const SERIES = [
  { k: "igmt", name: "InstantGMT", cls: "s1",
    falls: { 0.25: [2, 1, 3], 1: [1, 1, 1], 3: [0, 1, 0] }, body: { 0.25: 3.7, 1: 3.3, 3: 3.1 } },
  { k: "smt", name: "SuperMimic", cls: "s2",
    falls: { 0.25: [11, 14, 12], 1: [13, 16, 9], 3: [12, 12, 19] }, body: { 0.25: 4.8, 1: 4.3, 3: 4.4 } },
  { k: "smtdr", name: "SuperMimic + our DR", cls: "s3",
    falls: { 0.25: [1, 1, 17], 1: [3, 4, 0], 3: [4, 5, 1] }, body: { 0.25: 5.1, 1: 3.5, 3: 3.3 } },
  { k: "ppo", name: "PPO", cls: "s4", dash: true,
    falls: { 0.25: [110, 100], 1: [42, 39], 3: [23, 34], 12: [24, 19] }, body: { 0.25: 7.2, 1: 6.3, 3: 5.4, 12: 5.0 } },
];
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

const PANELS = [
  { key: "falls", title: "Falls on 198 held-out motions", unit: "", log: true, ticks: [0, 1, 3, 10, 30, 100], max: 130,
    value: (s, t) => s.falls[t] ? mean(s.falls[t]) : null, range: (s, t) => s.falls[t] ? [Math.min(...s.falls[t]), Math.max(...s.falls[t])] : null,
    fmt: (s, t) => { const f = s.falls[t]; return f.length > 1 ? `${f.join(" / ")}` : String(f[0]); }, note: "per seed" },
  { key: "body", title: "Body tracking error (cm)", unit: " cm", log: false, ticks: [3, 4, 5, 6, 7], min: 2.8, max: 7.6,
    value: (s, t) => s.body[t] ?? null, range: () => null, fmt: (s, t) => s.body[t].toFixed(1) + " cm", note: "" },
];

function draw(host, P, tip) {
  // drawn at the panel's real width, so the text stays at its CSS size on phones too
  const W = Math.round(Math.min(Math.max(host.clientWidth || 520, 300), 640)), H = W < 420 ? 240 : 300;
  const m = { l: 34, r: W < 420 ? 118 : 128, t: 16, b: 34 };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": P.title + " against training time" });
  const lx = (t) => Math.log2(t), x0 = lx(T[0]), x1 = lx(T[T.length - 1]);
  const X = (t) => m.l + (lx(t) - x0) / (x1 - x0) * (W - m.l - m.r);
  const f = (v) => P.log ? Math.log10(1 + v) : v;
  const y0 = f(P.log ? 0 : P.min), y1 = f(P.max);
  const Y = (v) => H - m.b - (f(v) - y0) / (y1 - y0) * (H - m.t - m.b);
  const grid = el("g", { class: "spd-grid" }, svg);
  for (const v of P.ticks) {
    el("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, grid);
    const tx = el("text", { x: m.l - 8, y: Y(v) + 4, "text-anchor": "end", class: "spd-tick" }, grid);
    tx.textContent = String(v);
  }
  T.forEach((t, i) => {
    const tx = el("text", { x: X(t), y: H - m.b + 20, "text-anchor": "middle", class: "spd-tick" }, grid);
    tx.textContent = TLAB[i];
  });
  const cross = el("line", { class: "spd-cross", y1: m.t, y2: H - m.b, visibility: "hidden" }, svg);
  const ends = [];
  for (const s of SERIES) {
    const g = el("g", { class: "spd-s " + s.cls }, svg);
    const pts = T.filter((t) => P.value(s, t) != null).map((t) => [X(t), Y(P.value(s, t)), t]);
    for (const [px, , t] of pts) {
      const r = P.range(s, t);
      if (r && r[1] > r[0]) el("line", { class: "spd-wh", x1: px, x2: px, y1: Y(r[0]), y2: Y(r[1]) }, g);
    }
    el("path", { class: "spd-line" + (s.dash ? " dash" : ""), d: pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") }, g);
    for (const [px, py] of pts) el("circle", { class: "spd-dot", cx: px, cy: py, r: 4.5 }, g);
    const last = pts[pts.length - 1];
    ends.push({ s, x: last[0], y: last[1] });
  }
  // direct labels at the line ends, pushed apart vertically so none overlap
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  for (const e of ends) {
    const tx = el("text", { x: X(T[T.length - 1]) + 12, y: e.y + 4, class: "spd-lab" }, svg);
    tx.textContent = e.s.name;
  }
  // one hit column per time point (crosshair + tooltip with every series), keyboard focusable
  T.forEach((t, i) => {
    const a = i ? (X(T[i - 1]) + X(t)) / 2 : m.l - 10, b = i < T.length - 1 ? (X(t) + X(T[i + 1])) / 2 : W - m.r + 10;
    const hit = el("rect", { class: "spd-hit", x: a, y: m.t, width: b - a, height: H - m.t - m.b, tabindex: 0,
      "aria-label": `${TLAB[i]}: ` + SERIES.filter((s) => P.value(s, t) != null).map((s) => `${s.name} ${P.fmt(s, t)}`).join(", ") }, svg);
    const show = () => {
      cross.setAttribute("x1", X(t)); cross.setAttribute("x2", X(t)); cross.setAttribute("visibility", "visible");
      tip.show(host, svg, X(t) / W, P, t, TLAB[i]);
    };
    hit.addEventListener("pointerenter", show); hit.addEventListener("focus", show);
    const hide = () => { cross.setAttribute("visibility", "hidden"); tip.hide(); };
    hit.addEventListener("pointerleave", hide); hit.addEventListener("blur", hide);
  });
  return svg;
}

function makeTip(root) {
  const d = document.createElement("div");
  d.className = "spd-tip"; d.hidden = true;
  root.appendChild(d);
  return {
    show(host, svg, fx, P, t, lab) {
      d.replaceChildren();
      const h = document.createElement("div"); h.className = "spd-tip-h"; h.textContent = lab + (P.note ? " · " + P.note : "");
      d.appendChild(h);
      for (const s of SERIES) {
        if (P.value(s, t) == null) continue;
        const r = document.createElement("div"); r.className = "spd-tip-r " + s.cls;
        const k = document.createElement("i"); if (s.dash) k.className = "dash";
        const v = document.createElement("b"); v.textContent = P.fmt(s, t);
        const n = document.createElement("span"); n.textContent = s.name;
        r.append(k, v, n); d.appendChild(r);
      }
      d.hidden = false;
      const rb = root.getBoundingClientRect(), sb = svg.getBoundingClientRect();
      const px = sb.left - rb.left + fx * sb.width, w = d.offsetWidth;
      d.style.left = Math.min(Math.max(px - w / 2, 4), rb.width - w - 4) + "px";
      d.style.top = (sb.top - rb.top + 8) + "px";
    },
    hide() { d.hidden = true; },
  };
}

function table(root) {
  const det = root.querySelector(".spd-table");
  if (!det) return;
  const tb = document.createElement("table");
  const hr = tb.createTHead().insertRow();
  for (const h of ["Method", ...TLAB.map((l) => "Falls, " + l), ...TLAB.map((l) => "Body error, " + l)]) {
    const th = document.createElement("th"); th.textContent = h; hr.appendChild(th);
  }
  const body = tb.createTBody();
  for (const s of SERIES) {
    const r = body.insertRow();
    r.insertCell().textContent = s.name;
    for (const t of T) r.insertCell().textContent = s.falls[t] ? s.falls[t].join(" / ") : "—";
    for (const t of T) r.insertCell().textContent = s.body[t] != null ? s.body[t].toFixed(1) : "—";
  }
  det.appendChild(tb);
}

const root = document.getElementById("speedChart");
if (root) {
  const tip = makeTip(root);
  const hosts = PANELS.map((P) => [P, root.querySelector(`.spd-p[data-k="${P.key}"]`)]).filter(([, h]) => h);
  let lastW = -1;
  const render = () => {
    const w = hosts[0][1].clientWidth;
    if (Math.abs(w - lastW) < 2) return;
    lastW = w;
    for (const [P, host] of hosts) {
      const old = host.querySelector("svg");
      const svg = draw(host, P, tip);
      if (old) old.replaceWith(svg); else host.appendChild(svg);
    }
  };
  render();
  new ResizeObserver(render).observe(root);
  table(root);
}
