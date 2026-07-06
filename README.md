# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Static PWA with localStorage saves and an optional Firebase cloud-save bridge.

## Current playable systems

- Desktop movement: `WASD` / arrow keys, `Shift` sprint, `Space` jump, mouse/touch drag camera look.
- Interaction: `E` or mobile **Interact** enters/exits nearby vehicles, buys lots, or talks to NPCs.
- Missions: press `M` to open the mission board and start delivery, driving, or ownership goals.
- Mobile controls: left joystick, Jump, Sprint, Interact, Unstuck, Pause.
- World streaming: city chunks load around the player and unload when far away.
- Vehicles: hover cars with gas, speed, and distance tracking.
- Ownership: glowing yellow lots can be purchased and persist in saves.
- Pickups: green data cubes reward cash/XP and persist after collection.
- Save system: autosave, manual save/load slots, JSON export/import, and save-on-background.
- Debug: press `F3` to toggle FPS, position, chunk, NPC, vehicle, save, and error info.

## Local static preview

This repository is static-only. No external dashboard or cloud settings are required for the localStorage version.

```bash
python3 -m http.server 8888
```

Then open `http://localhost:8888`.

## Optional Firebase cloud saves

`firebase-backend.js` is deliberately safe without credentials. If no config is present, the game uses localStorage only. A later backend pass can wire Firebase SDK imports and `window.NEONBLOCK_FIREBASE_CONFIG` without changing the static gameplay runtime.

## Files

- `index.html` — HUD, menus, mobile controls, Three.js CDN, PWA registration.
- `styles.css` — responsive HUD, menus, mobile controls, safe-area support.
- `app.js` — playable open-world runtime.
- `manifest.webmanifest` — installable PWA metadata.
- `sw.js` — static cache-first service worker for app shell assets.
- `firebase-backend.js` — optional/no-op cloud-save bridge with localStorage fallback.
