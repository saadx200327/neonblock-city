# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with local saves and an optional cloud-save bridge.

## What works now

- Playable third-person block character in a streamed neon city.
- Desktop controls: `WASD` / arrow keys to move, `Shift` to sprint, `Space` to jump, `E` to interact, `M` for missions, `R` to unstuck, `Esc` to pause.
- Mobile controls: left joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- World streaming around the player with roads, buildings, NPC tips, crates, vehicles, and buyable lots.
- Missions for crates, driving, and first ownership purchase.
- Vehicles with HP/gas HUD state.
- Autosave, save slots, and JSON import/export using `localStorage`.
- Optional `window.NeonBlockCloudSave` bridge so Firebase can be connected later without requiring Firebase credentials in the repo.
- Static PWA basics: manifest, app icon, and service-worker placeholder file.

## Local preview

No build step is required. Run a static server from the repo root:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Netlify readiness

This is a static site. The repo root can be used as the publish directory. No dashboard changes or live deployment are required for this branch.

## Safe cloud-save hook

`firebase-backend.js` currently exposes a safe no-op cloud-save object. A real Firebase adapter can later provide compatible async `save(slot, payload)` and `load(slot)` methods without changing the core game loop.
