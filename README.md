# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## Current gameplay

- Desktop movement: `WASD` or arrow keys.
- Jump: `Space`.
- Interact: `E` to collect crates, enter/exit vehicles, talk to NPCs, or buy lots.
- Missions: press `M` and choose a mission.
- Pause/menu: `P` or `Esc`.
- Mobile: use the left virtual joystick and right-side action buttons.

## Implemented systems

- Playable third-person movement and chase camera.
- Mobile and desktop controls.
- Procedural chunk streaming around the player.
- Neon buildings, roads, crates, NPC tips, vehicles, buyable lots, minimap, and HUD.
- Mission progress/rewards for collecting, driving, and ownership.
- Autosave every 15 seconds with save slots and JSON export/import.
- Optional `window.NEONBLOCK_FIREBASE_ADAPTER` bridge for future Firebase saves without hard-coded keys.
- Static PWA support through `manifest.webmanifest`, `sw.js`, and SVG icon.

## Local test

Because this uses a service worker and external Three.js script, test with a local static server instead of opening the file directly:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Netlify readiness

No build command is required. Publish the repository root as a static site. This branch does not deploy or change any Firebase/Netlify dashboard setting.
