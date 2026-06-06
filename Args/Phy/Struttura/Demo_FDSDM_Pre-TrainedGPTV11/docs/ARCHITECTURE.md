# Architecture V4

- Static HTML/CSS/JS project.
- Three.js CDN for first-person rooms.
- Data-driven lessons in `js/data.js`.
- Overworld maps are PNG backgrounds plus interactive node overlay.
- FPS levels are generated from the selected lesson.
- Timer, tasks, completion and unlocks are independent from final production content.
- Save is localStorage key `fdsdm_pretrained_v4_save`.

Future refactor targets:

1. Move lesson data from `js/data.js` to `data/lessons.json`.
2. Vendor Three.js locally in `vendor/`.
3. Split map backgrounds into animated layers.
4. Replace placeholder terminal text for L02-L36 with real summaries.
5. Add per-world music and per-level ambience.
