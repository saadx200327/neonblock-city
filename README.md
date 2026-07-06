# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA shell with optional Firebase-safe cloud-save bridge and localStorage fallback.

## Current gameplay

- Playable third-person block avatar.
- Desktop controls: `WASD` move, `Shift` sprint, `Space` jump, mouse drag look, `E` interact, `M` mission, `R` unstuck, `Esc` pause, `F3` debug.
- Mobile controls: virtual joystick, Jump, Sprint, Interact, Unstuck, Pause, and drag-look on the right side of the screen.
- Streamed city chunks around the player for better performance.
- Vehicles with enter/exit, gas, HP display, and basic driving.
- Pickups, wandering NPCs, buyable city lots, ownership persistence, minimap markers.
- Missions for collecting, driving, and buying property.
- Autosave, save slots, JSON export/import, save-on-background.

## Static hosting notes

This project is designed to run as plain static files. No server is required. Open `index.html` locally or deploy the folder to a static host such as Netlify when ready.

No external Firebase or Netlify dashboard settings are required by the code in this branch.

## Optional cloud-save bridge

`firebase-backend.js` does not include credentials and does not change Firebase settings. If a future build injects `window.NEONBLOCK_FIREBASE_CONFIG`, the bridge currently uses a safe local shadow save instead of making dashboard/API changes.

## Files

- `index.html` - game shell and HUD.
- `styles.css` - responsive HUD, menus, mobile controls, safe-area support.
- `app.js` - playable game loop, controls, world streaming, missions, vehicles, saves.
- `firebase-backend.js` - optional save bridge / offline fallback.
- `manifest.webmanifest` - PWA metadata.
