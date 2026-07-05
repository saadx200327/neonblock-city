# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional cloud-save fallback and localStorage saves.

## Current playable loop

- Walk, sprint, jump, and interact on desktop.
- Mobile joystick plus touch buttons for jump, sprint, interact, unstuck, and pause.
- Streamed block city chunks around the player for better browser performance.
- Pickups, NPCs, buyable glowing lots, vehicles, and mission rewards.
- Autosave, manual save slots, and JSON export/import.
- Static PWA files are included: `manifest.webmanifest` and `sw.js`.

## Controls

Desktop:

- WASD / Arrow keys: move
- Shift: sprint
- Space: jump
- E: interact / enter vehicle / buy lot
- R: unstuck
- Escape: pause

Mobile:

- Left joystick: move
- Jump / Sprint / Interact / Unstuck / Pause buttons

## Local testing

Use any static server from the repo root:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deployment note

This repo is static-site ready for Netlify drag-and-drop or GitHub-connected deploys, but this change does not deploy anything and does not modify Netlify or Firebase dashboard settings.
