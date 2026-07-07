# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## Current gameplay

- Playable block-style character with keyboard movement, sprint, jump, interact, and unstuck.
- Mobile joystick and action buttons for phone-first play.
- Streamed city chunks around the player to avoid loading the whole world at once.
- Vehicles with gas, health HUD, entry/exit interaction, and a driving mission.
- Crates, NPCs, buyable lots, cash, XP, levels, autosave, two save slots, and JSON export/import.
- Minimap, FPS/debug HUD, pause menu, graphics selector, and responsive mobile layout.
- Optional cloud-save bridge that uses localStorage by default and can be wired to Firebase without requiring Firebase for local play.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD / Arrow keys | Left joystick |
| Sprint | Shift | Sprint button |
| Jump | Space | Jump button |
| Interact | E | Interact button |
| Pause | Escape | Pause button |
| Unstuck | U | Unstuck button |

## Static hosting

This project is intentionally static. It can be previewed locally by opening `index.html` or by serving the folder with any static server. Deploying is optional and should be done manually by the repo owner.

## Optional Firebase saves

`firebase-backend.js` does not require Firebase credentials. If no Firebase adapter is provided, saves stay local. To enable Firebase later, expose `window.NEONBLOCK_FIREBASE` before `firebase-backend.js` runs with these Firebase v9+ helpers:

```js
window.NEONBLOCK_FIREBASE = { db, auth, doc, getDoc, setDoc };
```

Cloud path used by the bridge:

```text
neonblockSaves/{uid}/slots/{slot}
```

## Files

- `index.html` — static game shell and HUD.
- `styles.css` — mobile-safe HUD, menus, joystick, and PWA-friendly layout.
- `app.js` — Three.js game runtime, streaming, missions, vehicles, ownership, saves.
- `firebase-backend.js` — optional Firebase/local fallback save bridge.
- `manifest.webmanifest` — PWA metadata.
- `sw.js` — static cache service worker.
- `icon.svg` — installable app icon.
