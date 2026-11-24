/* Real-robot clips: load and play a clip only while it is on screen (muted, looped); paused otherwise, and never
   autoplayed for visitors who ask for reduced motion (they get the controls instead). */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const vids = [...document.querySelectorAll("video[data-src]")];
const load = (v) => { if (!v.src) { v.src = v.dataset.src; v.load(); } };
if (reduce) vids.forEach((v) => { v.controls = true; v.preload = "none"; v.addEventListener("play", () => load(v), { once: true }); v.src = v.dataset.src; });
else {
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      const v = e.target;
      if (e.isIntersecting) { load(v); v.play().catch(() => { v.controls = true; }); }
      else if (!v.paused) v.pause();
    }
  }, { threshold: 0.35 });
  vids.forEach((v) => io.observe(v));
}
