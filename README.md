# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and a localStorage fallback.

## Current gameplay

- Desktop movement: `WASD` or arrow keys, `Shift` sprint, `Space` jump, `E` interact, `M` missions, `U` unstuck, `P` or `Esc` pause.
- Mobile movement: on-screen joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Controller support: first connected gamepad maps left stick to movement, trigger/stick press to sprint, face buttons to jump/interact/unstuck, and Start to pause.
- Streamed neon city chunks around the player to keep the static game lighter on mobile.
- Missions: courier waypoint, crate collection, first-property ownership, and vehicle delivery objective.
- Vehicles: enter or exit nearby cars with Interact; vehicles have gas and higher movement speed.
- Ownership: buy purple lots with in-game cash; owned lots turn green and persist in saves.
- Saves: local autosave, manual save slots, hidden-page backup, storage-full warning, JSON export/import, active mission, active vehicle, and collected crate IDs.
- Optional cloud saves: `firebase-backend.js` exposes a safe bridge only when Firebase globals are provided externally.

## Reliability fixes in this pass

- Keyboard movement now resets cleanly on key release instead of inheriting a stale desktop axis.
- Touch joystick state is separated from keyboard state so mobile and desktop inputs do not lock each other.
- Autosave now runs on a true 15-second timer instead of firing repeatedly during the same second.
- Streamed chunks now unregister their vehicles, crates, NPCs, and lots when unloaded so the interact scans and HUD stay fast.
- Owned lots re-apply their green owned material after a save is loaded and nearby chunks stream back in.
- Collected crate IDs now persist, so unloaded/reloaded chunks do not respawn already collected crates.
- The active mission and active vehicle state are saved and restored when possible.
- Vehicle gas warnings are throttled so the popup does not spam every animation frame.
- Controls are cleared on browser blur, and the current slot is saved when the page is hidden.
- Graphics quality now affects stream radius, building density, shadows, and pixel ratio so low mode is safer for phones.
- Mission board now has a visible Pause-menu entry point plus the `M` shortcut.
- Mission board Close now has a defensive handler even if the main runtime misses it.
- PWA install prompt can appear from Settings when the browser allows installation.
- WebGL context loss/restoration is surfaced through the HUD instead of failing silently.
- Online/offline changes update the HUD while local saves continue working.
- Reduced-motion users are nudged toward Low graphics.

## Static hosting

This project is intentionally static. It can be previewed locally with any static server and uploaded to Netlify without changing Netlify dashboard settings.

```bash
python3 -m http.server 8080
```

Then open the local server page in a browser and test desktop, mobile viewport, controller input, missions, save/export, and PWA install behavior.

## Files

- `index.html` - app shell, HUD, Pause menu, Mission Board, and mobile controls.
- `styles.css` - responsive HUD, mobile controls, pause/save panels.
- `app.js` - playable Three.js game runtime, persistence, streaming, missions, vehicles, and graphics quality.
- `neonblock-hardening.js` - touch, blur, backup, FPS, and gas-warning hardening.
- `neonblock-input-polish.js` - controller input, PWA install, storage, network, and WebGL recovery polish.
- `firebase-backend.js` - optional cloud-save adapter; localStorage works without Firebase.
- `manifest.webmanifest`, `sw.js`, `icon.svg` - PWA install/offline readiness.
