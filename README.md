# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. It is a static, Netlify-ready PWA with local saves and an optional cloud-save bridge.

## Current playable features

- Third-person block character movement with WASD/arrow keys.
- Mobile virtual joystick and touch action buttons.
- Jump, sprint, interact, pause, save/load, unstuck controls.
- Streamed city chunks around the player for better performance.
- Neon buildings, roads, pickups, NPC walkers, hover vehicles, and purchasable properties.
- Mission loop with rewards, XP, level progression, waypoint marker, minimap, and debug HUD.
- Autosave, save slots, JSON export/import, and localStorage fallback saves.
- PWA manifest and service worker for static hosting readiness.

## Controls

Desktop:

- Move: `WASD` or arrow keys
- Jump: `Space`
- Sprint: `Shift`
- Interact / enter vehicle / buy property: `E`
- Pause: `Esc`

Mobile:

- Left joystick: move
- Jump, Sprint, Interact, Unstuck, Pause buttons on the right

## Local preview

Because the project uses a service worker and module script, preview it with a local static server instead of opening `index.html` directly.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deployment notes

This repo is static-host friendly. Upload the repository contents to Netlify or connect the repo. No backend is required for the core game.

## Optional cloud saves

`firebase-backend.js` currently provides a safe local fallback through `window.NeonBlockCloud`. A real Firebase adapter can be added later without changing the game loop. Do not commit secrets or private Firebase keys.
