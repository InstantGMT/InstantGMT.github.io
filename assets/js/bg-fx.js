/* Page background (dark theme): a galaxy. A Milky Way band runs across the top of the page (a warm core, bluish
   edges, dark dust lanes, dense faint stars), colored nebulae lie further down, and bright stars twinkle above them.
   The layers move at different speeds when the page scrolls or the pointer moves (parallax), and a shooting star
   crosses now and then. The nebulae and faint stars are drawn once into offscreen canvases; each frame only composes
   them and draws the bright stars. Sits behind everything, takes no input, caps at 30 fps, stops while the tab is
   hidden, and is drawn once, still, for visitors who ask for reduced motion. */
(() => {
  const host = document.querySelector(".bgfx");
  const cv = host && host.querySelector("canvas");
  const ctx = cv && cv.getContext("2d");
  if (!ctx) return;
  const root = document.documentElement;
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const darkMQ = matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => root.dataset.theme === "dark" || (root.dataset.theme !== "light" && darkMQ.matches);

  // seeded random, so a resize redraws the same sky
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += rnd(); return (u - 2) / 0.577; };
  const STAR_COL = [[200, 220, 255], [200, 220, 255], [200, 220, 255], [255, 255, 255], [255, 255, 255],
                    [255, 238, 210], [255, 214, 170], [170, 195, 255]];
  const PAR = { neb: 0.03, dust: 0.05 };  // scroll parallax of the offscreen layers

  let W = 0, H = 0, dpr = 1, docH = 0, neb = null, dust = null, NS = 0.4, stars = [], sprite = null;
  let mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5, lastMove = -1e9, inside = false, lens = 0;
  addEventListener("pointermove", (e) => { tmx = e.clientX / W; tmy = e.clientY / H; lastMove = performance.now(); inside = true; }, { passive: true });
  document.addEventListener("pointerleave", () => { inside = false; });

  const makeSprite = () => {  // a soft round glow, white at the center
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.12, "rgba(255,255,255,.75)");
    gr.addColorStop(0.35, "rgba(200,220,255,.18)"); gr.addColorStop(1, "rgba(200,220,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  };

  const blob = (g, x, y, r, rgb, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.5, `rgba(${rgb},${a * 0.45})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  };

  const build = () => {
    seed = 7;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    docH = Math.max(root.scrollHeight, H);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const s = Math.min(W, H);
    // the band: bottom left to top right across the first screen
    const A = [-0.1 * W, 1.05 * H], B = [1.1 * W, -0.05 * H];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], n = [-u[1], u[0]];
    const sig = 0.17 * s;
    const onBand = (t, off) => [A[0] + (B[0] - A[0]) * t + n[0] * off, A[1] + (B[1] - A[1]) * t + n[1] * off];

    // nebula layer (low resolution: soft by construction)
    const nH = H + (docH - H) * PAR.neb + 80;
    neb = document.createElement("canvas"); neb.width = Math.ceil(W * NS); neb.height = Math.ceil(nH * NS);
    let g = neb.getContext("2d");
    g.scale(NS, NS); g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 260; i++) {  // band glow: warm in the core, blue and violet outside
      const off = gauss() * sig * 0.55, t = rnd() * 1.2 - 0.1, [x, y] = onBand(t, off);
      const core = Math.exp(-(off * off) / (2 * (sig * 0.35) ** 2));
      const col = core > 0.5 ? (rnd() < 0.5 ? "255,214,180" : "255,236,215") : (rnd() < 0.6 ? "110,140,255" : "150,110,255");
      blob(g, x, y, sig * (0.35 + rnd() * 0.9), col, 0.022 + 0.03 * core);
    }
    g.globalCompositeOperation = "destination-out";  // dust lanes along the core
    for (let i = 0; i < 420; i++) {  // many small, faint blobs along wavy lines: wisps, not holes
      const t = rnd() * 1.2 - 0.1, lane = i % 2 ? 0.1 : -0.06;
      const [x, y] = onBand(t, sig * (lane + 0.07 * Math.sin(t * 13 + (i % 2) * 2)) + gauss() * sig * 0.05);
      blob(g, x, y, sig * (0.04 + rnd() * 0.1), "0,0,0", 0.12 + rnd() * 0.16);
    }
    g.globalCompositeOperation = "lighter";
    const clusters = [  // nebulae: [x, y, size, colors]
      [0.84 * W, 0.28 * H, 0.42 * s, ["255,80,150", "190,90,255", "255,120,180"]],
      [0.1 * W, 0.62 * H, 0.38 * s, ["60,200,215", "80,130,255", "60,170,255"]],
      [0.55 * W, H + 0.35 * (nH - H), 0.5 * s, ["150,90,255", "255,90,160", "90,120,255"]],
      [0.15 * W, H + 0.8 * (nH - H), 0.4 * s, ["60,200,215", "120,100,255"]],
      [0.9 * W, H + 0.95 * (nH - H), 0.45 * s, ["255,80,150", "110,140,255"]],
    ];
    for (const [cx, cy, r, cols] of clusters)
      for (let i = 0; i < 70; i++)
        blob(g, cx + gauss() * r * 0.45, cy + gauss() * r * 0.3, r * (0.15 + rnd() * 0.45), cols[i % cols.length], 0.02 + rnd() * 0.035);

    // faint stars (full resolution), dense along the band
    const dH = H + (docH - H) * PAR.dust + 80;
    dust = document.createElement("canvas"); dust.width = Math.ceil(W * dpr); dust.height = Math.ceil(dH * dpr);
    g = dust.getContext("2d"); g.scale(dpr, dpr);
    const dot = (x, y, r, a, c) => { g.fillStyle = `rgba(${c},${a})`; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); };
    const nb = Math.round(W * H / 220), nf = Math.round(W * dH / 1500);
    for (let i = 0; i < nb; i++) {
      const [x, y] = onBand(rnd() * 1.2 - 0.1, gauss() * sig * 0.6);
      dot(x, y, 0.3 + rnd() ** 3 * 0.7, (0.18 + rnd() * 0.5).toFixed(2), STAR_COL[i % STAR_COL.length].join(","));
    }
    for (let i = 0; i < nf; i++)
      dot(rnd() * W, rnd() * dH, 0.3 + rnd() ** 3 * 0.8, (0.2 + rnd() * 0.55).toFixed(2), STAR_COL[i % STAR_COL.length].join(","));

    // bright stars: drawn every frame, in two depths, twinkling
    stars = [];
    const nbright = Math.round(W * H / 3000);
    for (let i = 0; i < nbright; i++) {
      const near = rnd() < 0.3, big = rnd() ** 4;
      stars.push({ x: rnd() * W, y: rnd() * (H + 40), r: 0.5 + big * 1.9, k: near ? 0.12 : 0.07, depth: near ? 1 : 0.5,
                   c: STAR_COL[Math.floor(rnd() * STAR_COL.length)], a: 0.45 + rnd() * 0.55,
                   w: 0.6 + rnd() * 2.2, ph: rnd() * 6.28, spike: big > 0.82 });
    }
    sprite = sprite || makeSprite();
  };

  // shooting stars: a glowing head and a long fading tail, every 1-3.5 s, now and then two at once
  let shoots = [], nextShoot = 1200;
  const newShoot = (now) => {
    const right = Math.random() < 0.5, ang = 0.3 + Math.random() * 0.45;
    shoots.push({ x: W * (right ? Math.random() * 0.6 : 0.4 + Math.random() * 0.6), y: H * Math.random() * 0.5,
                  dx: (right ? 1 : -1) * Math.cos(ang), dy: Math.sin(ang), t0: now,
                  len: 180 + Math.random() * 200, sp: 0.9 + Math.random() * 0.7, life: 700 + Math.random() * 600, w: 1.2 + Math.random() * 1.2 });
  };

  const LENS_R = 230;
  const draw = (now, moving) => {
    mx += (tmx - mx) * 0.12; my += (tmy - my) * 0.12;
    const sy = moving ? scrollY : 0, px = moving ? (mx - 0.5) : 0, py = moving ? (my - 0.5) : 0;
    // the pointer's pull fades in while it moves over the page and out a few seconds after it stops
    lens += ((moving && inside && now - lastMove < 3500 ? 1 : 0) - lens) * 0.08;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // nebulae and faint stars
    const nO = Math.min(sy * PAR.neb, neb.height / NS - H);
    ctx.drawImage(neb, 0, nO * NS, neb.width, H * NS, -px * 8, -py * 8, W, H);
    const dO = Math.min(sy * PAR.dust, dust.height / dpr - H);
    ctx.drawImage(dust, 0, dO * dpr, dust.width, H * dpr, -px * 14, -py * 14, W, H);
    ctx.globalCompositeOperation = "lighter";
    const PX = mx * W, PY = my * H;
    if (lens > 0.01) {  // a faint glow where the pointer is
      const gr = ctx.createRadialGradient(PX, PY, 0, PX, PY, LENS_R);
      gr.addColorStop(0, `rgba(150,180,255,${0.16 * lens})`); gr.addColorStop(0.35, `rgba(130,110,255,${0.07 * lens})`); gr.addColorStop(1, "rgba(120,110,255,0)");
      ctx.fillStyle = gr; ctx.fillRect(PX - LENS_R, PY - LENS_R, 2 * LENS_R, 2 * LENS_R);
    }
    // bright stars
    const t = now / 1000;
    for (const st of stars) {
      let y = (st.y - sy * st.k) % (H + 40); if (y < 0) y += H + 40; y -= 20;
      let x = st.x - px * 26 * st.depth, yy = y - py * 26 * st.depth;
      let boost = 1;
      if (lens > 0.01) {  // swirl around the pointer and bend outward, like light around a mass
        const dx = x - PX, dy = yy - PY, d = Math.hypot(dx, dy);
        if (d < LENS_R) {
          const f = (1 - d / LENS_R) ** 2 * lens, th = 1.1 * f, c = Math.cos(th), s2 = Math.sin(th), sc = 1 + 0.45 * f;
          x = PX + (dx * c - dy * s2) * sc; yy = PY + (dx * s2 + dy * c) * sc;
          boost = 1 + 1.6 * f;
        }
      }
      const tw = moving ? 0.72 + 0.28 * Math.sin(t * st.w + st.ph) : 1;
      const a = Math.min(1, st.a * tw * boost), R = st.r * 5.5 * (0.7 + 0.3 * boost);
      ctx.fillStyle = `rgb(${st.c[0]},${st.c[1]},${st.c[2]})`;
      ctx.globalAlpha = a * 0.9;
      ctx.drawImage(sprite, x - R, yy - R, 2 * R, 2 * R);
      ctx.globalAlpha = a;
      ctx.fillRect(x - st.r * 0.5, yy - st.r * 0.5, st.r, st.r);
      if (st.spike) {  // diffraction spikes on the brightest
        ctx.globalAlpha = a * 0.28; const S = st.r * 6 * boost;
        ctx.fillRect(x - S, yy - 0.35, 2 * S, 0.7); ctx.fillRect(x - 0.35, yy - S, 0.7, 2 * S);
      }
    }
    ctx.globalAlpha = 1;
    if (moving) {
      if (now > nextShoot && shoots.length < 3) {
        newShoot(now); if (Math.random() < 0.25) newShoot(now);
        nextShoot = now + 1000 + Math.random() * 2500;
      }
      for (const sh of shoots) {
        const e = now - sh.t0, d = e * sh.sp, f = Math.sin(Math.PI * Math.min(e / sh.life, 1));
        const hx = sh.x + sh.dx * d, hy = sh.y + sh.dy * d, L = sh.len * (0.4 + 0.6 * Math.min(1, e / 250));
        const gr = ctx.createLinearGradient(hx, hy, hx - sh.dx * L, hy - sh.dy * L);
        gr.addColorStop(0, `rgba(255,255,255,${0.95 * f})`); gr.addColorStop(0.25, `rgba(190,215,255,${0.5 * f})`); gr.addColorStop(1, "rgba(140,170,255,0)");
        ctx.strokeStyle = gr; ctx.lineWidth = sh.w; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - sh.dx * L, hy - sh.dy * L); ctx.stroke();
        ctx.globalAlpha = f; const R = 9 * sh.w;
        ctx.drawImage(sprite, hx - R, hy - R, 2 * R, 2 * R);
        ctx.globalAlpha = 1;
      }
      shoots = shoots.filter((sh) => now - sh.t0 < sh.life);
    }
    ctx.globalCompositeOperation = "source-over";
  };

  let last = 0, raf = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;  // ~30 fps
    last = now;
    draw(now, true);
  };
  const run = () => {
    cancelAnimationFrame(raf);
    if (!isDark() || document.hidden) return;
    if (!neb) build();
    if (still.matches) { draw(0, false); return; }
    raf = requestAnimationFrame(frame);
  };
  let rt = 0;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { neb = null; run(); }, 200); });
  addEventListener("load", () => { if (Math.abs(root.scrollHeight - docH) > 200) { neb = null; run(); } });
  document.addEventListener("visibilitychange", run);
  still.addEventListener("change", run);
  darkMQ.addEventListener("change", run);
  new MutationObserver(run).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  run();
})();
