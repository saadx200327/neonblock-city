# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional cloud-save adapter and localStorage fallback.

## Current gameplay

- Playable third-person block character with WASD, arrow keys, jump, sprint, and mobile joystick controls.
- Drag-look camera on desktop and mobile.
- Streamed neon city chunks around the player so the world can keep expanding without loading everything at once.
- Collectible glow crates with cash, XP, level progression, and a starter crate mission.
- Enterable neon vehicles with acceleration, steering, gas display, and a driving bonus loop.
- Buyable glowing lots with ownership saved locally.
- Minimap markers for crates, lots, cars, and player position.
- Pause/save UI with save slots plus JSON import/export.
- Unstuck button for mobile and keyboard fallback.
- F3 debug overlay for FPS, position, chunks, streamed objects, and vehicle state.

## Controls

Desktop:

- Move: `WASD` or arrow keys
- Sprint: `Shift`
- Jump: `Space`
- Interact / enter car / buy lot: `E`
- Pause: `Esc`
- Debug overlay: `F3`

Mobile:

- Left joystick: move
- Right side drag: look around
- Buttons: Jump, Sprint, Interact, Unstuck, Pause

## Save behavior

The game saves progress to `localStorage` automatically, when the tab backgrounds, and when using the save buttons. `firebase-backend.js` is a safe optional adapter only; it does not include Firebase credentials and does not modify any external Firebase project.

## Static hosting

This repository can be hosted as a static site. Required files are included:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `firebase-backend.js`

No build step is required.
