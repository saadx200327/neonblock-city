# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js.

## What is included

- Playable third-person block character with desktop movement, mobile joystick, jump, sprint, interact, pause, and unstuck controls.
- Streamed neon city chunks so the world loads around the player instead of placing everything at once.
- Collectible data crates, NPC tips, vehicles, buyable ownership lots, mission progression, minimap markers, and autosave.
- Local save slots plus JSON import/export.
- Optional Firebase cloud-save adapter that stays inactive unless a future app explicitly provides `window.NEONBLOCK_FIREBASE`.
- Static PWA files for Netlify readiness: `manifest.webmanifest`, `sw.js`, and `assets/icon.svg`.

## Run locally

Open `index.html` with a local static server. Example:

```bash
python3 -m http.server 5173
```

Then visit `http://localhost:5173`.

## Controls

Desktop:

- WASD / arrow keys: move or drive
- Mouse / drag: rotate camera direction
- Space: jump
- Shift: sprint
- E: interact with vehicles, NPCs, and lots
- M: mission board
- Escape: pause
- F3: debug overlay

Mobile:

- Left joystick: move or drive
- Drag screen: look around
- Jump, Sprint, Interact, Unstuck, Pause buttons

## Static hosting notes

No live deploy is performed by this repository change. The site is static and can be previewed by uploading the files to a static host such as Netlify, but dashboard settings are intentionally not required for the core game loop.
