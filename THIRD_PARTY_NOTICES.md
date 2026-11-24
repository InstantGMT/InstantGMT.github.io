# Third-party notices

This site redistributes or uses the following third-party material.

## Unitree G1 robot model

`assets/g1tree/` and `assets/replay/tree/` (files `g1.json` and `g1_mesh.bin`) contain the kinematic tree and simplified meshes of the Unitree G1 humanoid, derived from the G1 model in [unitree_mujoco](https://github.com/unitreerobotics/unitree_mujoco). They are distributed under the following licence:

```
BSD 3-Clause License

Copyright (c) 2016-2024 HangZhou YuShu TECHNOLOGY CO.,LTD. ("Unitree Robotics")
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## 100STYLE motions

The reference motions in `assets/g1tree/g1_motion.bin` and `assets/replay/tree/g1_motion.bin` are adapted from the 100STYLE dataset (I. Mason, S. Starke, T. Komura, "Real-Time Style Modelling of Human Locomotion via Feature-Wise Transformations and Local Motion Phases", 2022), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: retargeted to the Unitree G1, cut into 3 s segments, quantized. The recorded robot states in `assets/replay/rollouts.bin` were simulated while tracking these motions.

## Libraries and fonts loaded by the page

Not redistributed in this repository; loaded from their CDNs:

- [three.js](https://threejs.org/) 0.160.0, MIT License, from jsDelivr.
- Inter, Inter Tight and JetBrains Mono, SIL Open Font License 1.1, from Google Fonts.

## Page design

The page design is adapted from the [SuperMimic project page](https://supermimic.github.io).
