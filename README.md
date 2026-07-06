# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional cloud-save adapter and localStorage fallback.

## What is playable now

- Third-person block character movement with WASD / arrow keys and mobile joystick.
- Jump, sprint, interact, pause, and unstuck actions.
- Streamed neon city chunks with roads, buildings, NPCs, pickups, vehicles, and purchasable lots.
- Mission board with courier, driving, and ownership missions.
- Local save slots, autosave, and JSON export/import.
- PWA manifest and service worker for static hosting readiness.
- Optional `window.NeonBlockFirebaseAdapter` hook for future Firebase saves without requiring Firebase for offline play.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD / Arrow keys | Left joystick |
| Jump | Space | Jump button |
| Sprint | Shift | Hold Sprint |
| Interact / enter vehicle / buy lot | E | Interact button |
| Pause | Escape | Pause button |
| Unstuck | U | Unstuck button |

## Static hosting

This project is designed to run as static files. Upload the repository files to Netlify or another static host. No deploy is performed by this repository change.

## Optional cloud saves

`firebase-backend.js` intentionally ships with a local fallback only. To connect real Firebase later, define this object before the game saves:

```js
window.NeonBlockFirebaseAdapter = {
  enabled: true,
  async save(slot, data) {},
  async load(slot) {}
};
```

Do not place private Firebase secrets in public static files.
