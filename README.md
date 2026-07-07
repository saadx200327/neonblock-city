# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## What is playable now

- Third-person block character with desktop keyboard and mobile joystick controls.
- Streamed neon city chunks so the world expands around the player without placing every object at once.
- Vehicles that can be entered/exited and driven from the same movement controls.
- Mission loop: courier delivery, crate collection, and first-property ownership.
- Buyable city lots, glowing crates, NPC tips, minimap, waypoint arrow, HUD, pause/settings panel, and unstuck button.
- Local autosave, manual save slots, JSON export/import, and a no-key optional cloud-save bridge.
- Static PWA files for installability and basic offline caching.

## Controls

### Desktop

- `WASD` / arrow keys: move
- `Shift`: sprint / faster driving
- `Space`: jump
- `E`: interact with nearby vehicles, crates, NPCs, or lots
- `P` / `Esc`: pause menu
- `U`: unstuck to the city center

### Mobile

- Left joystick: move / drive
- Jump: jump
- Sprint: hold for faster movement
- Interact: use nearby vehicles, crates, NPCs, or lots
- Unstuck: reset to city center
- Pause: open save/settings menu

## Local testing

Because browsers limit service workers on plain file URLs, test with a tiny local server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Firebase cloud saves

`firebase-backend.js` is intentionally inert by default. It does not include Firebase keys and does not write to any external project unless a future integration defines `window.NEONBLOCK_FIREBASE.save()` and `window.NEONBLOCK_FIREBASE.load()` before `app.js` runs.

## Deployment note

This repository is static-site ready for Netlify, but this improvement branch does not deploy or change any external dashboard settings.
