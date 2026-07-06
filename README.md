# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional cloud-save adapter and localStorage fallback.

## Current gameplay

- Playable third-person block character with WASD, arrow keys, jump, sprint, and mobile joystick controls.
- Drag-look camera on desktop and mobile.
- Streamed neon city chunks around the player so the world can keep expanding without loading everything at once.
- Collectible glow crates with cash, XP, level progression, and a starter crate mission.
- Enterable neon vehicles with acceleration, steering, gas display, and a driving bonus loop.
- Buyable glowing lots with ownership saved locally.
- NPC tip blocks that teach the player about crates, cars, and ownership.
- Minimap markers for crates, lots, cars, NPCs, and player position.
- Pause/save UI with save slots plus JSON import/export.
- Unstuck button for mobile and keyboard fallback.
- F3 debug overlay for FPS, position, chunks, NPC count, save slot, cloud state, and last error.

## Controls

Desktop:

- Move: `WASD` or arrow keys
- Sprint: `Shift`
- Jump: `Space`
- Interact / enter car / buy lot / talk to NPC: `E`
- Mission board: `M`
- Pause: `Esc`
- Debug overlay: `F3`

Mobile:

- Left joystick: move
- Right side drag: look around
- Buttons: Jump, Sprint, Interact, Unstuck, Pause

## Save behavior

The game saves progress to `localStorage` automatically, when the tab backgrounds, when using the save buttons, when collecting crates, when buying lots, and when earning waypoint bonuses.

`firebase-backend.js` is a safe optional adapter only. It does not include credentials and does not modify any external Firebase project. The current adapter exposes `window.NeonCloudSave.save(slot, payload)` and `window.NeonCloudSave.load(slot)` with a local fallback, so the runtime can call a cloud-like API without requiring real Firebase configuration.

## Runtime stability notes

- `app.js` declares the loading-screen element before hiding it so strict mode does not crash the game loop during startup.
- HUD writes are guarded so missing optional UI nodes do not kill the runtime.
- Save files include a versioned payload, player position/yaw/pitch, active slot, owned lots, collected pickups, mission progress, and basic error/cloud status.
- Mobile sprint now resets on pointer up, cancel, or leave.
- Graphics quality can reduce streamed radius/pixel ratio for weaker phones.

## Static hosting

This repository can be hosted as a static site. Required files are included:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `firebase-backend.js`

No build step is required.
