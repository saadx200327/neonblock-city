# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## What works in this build

- Playable third-person block avatar with WASD/arrow movement, sprint, jump, and chase camera.
- Mobile joystick plus action buttons for jump, sprint, interact, unstuck, and pause.
- Chunked/streamed neon city blocks so nearby roads/buildings load and far chunks unload.
- Collectible energy crates, NPC tips, buyable lots, drivable vehicles, XP, levels, cash, and missions.
- Local autosave, two save slots, JSON import/export, and optional Firebase cloud-save bridge.
- PWA manifest, SVG icon, and service worker for static-host readiness.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD / Arrow keys | Left joystick |
| Sprint | Shift | Sprint button |
| Jump | Space | Jump button |
| Interact / enter vehicle / buy lot | E | Interact button |
| Unstuck | R | Unstuck button |
| Pause | Escape | Pause button |

## Local testing

Because service workers require a real origin, test with a local static server instead of opening the file directly:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Optional Firebase saves

The game works offline with `localStorage`. If a future build loads Firebase Auth + Firestore compat SDKs and initializes Firebase before `firebase-backend.js`, `window.NeonBlockCloud` will save/load the same slots to Firestore. No Firebase dashboard or Netlify settings are required for the static local fallback.
