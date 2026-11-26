# InstantGMT project page

Project page of *InstantGMT: General Motion Tracking for Humanoid Teleoperation in Hours on One GPU*, served at <https://instantgmt.github.io/>. The paper and the code will be released later; this repository only holds the page.

## Contents

- `index.html`, `assets/css/site.css`, `assets/js/site.js`: the page.
- `assets/js/motion-tree3d.js`: the 3D figure "Endless choices". Three policies, each after 15 minutes of training (InstantGMT, SuperMimic, PPO), track the same branching stream of 100STYLE motions retargeted to the Unitree G1. The panels replay the policies' MuJoCo rollouts, recorded offline with a push test (`assets/replay/`: the robots' states, the route through the tree and the pushes). Without the recording, the panels replay the reference motions and fall at the rates reported in the paper (`assets/g1tree/`).
- `assets/js/speed-chart.js`: the training-time chart (paper, Table 1).
- `assets/js/videos.js`: plays a video only while it is on screen; visitors who ask for reduced motion get controls instead of autoplay.
- `assets/js/bg-fx.js`: the animated background of the dark theme.
- `media/real/`: real-robot clips under live VR teleoperation, real time, faces blurred.
- `media/sim/`, `media/m2/`, `media/mini/`: Blender renders of InstantGMT policies tracking motions in MuJoCo (the Unitree G1, and two humanoids with parallel ankles).

## Viewing locally

Any static file server works, for example:

```
python3 -m http.server 8000
```

then open <http://localhost:8000/>.

## Licences and credits

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): the Unitree G1 model (BSD 3-Clause), the 100STYLE motions (CC BY 4.0), three.js (MIT) and the fonts (SIL OFL). The page design is adapted from the [SuperMimic project page](https://supermimic.github.io).
