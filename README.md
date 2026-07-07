# NeonBlock City

Original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## Controls

- Desktop movement: `WASD` or arrow keys.
- Sprint: `Left Shift`.
- Interact, enter vehicle, or buy lots: `E` or `V`.
- Mission board: `M` or interact when nothing nearby.
- Pause: `Escape`.
- Mobile: left joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.

## Features in this branch

- Playable `app.js` runtime for the existing `index.html` shell.
- Streamed neon city chunks around the player so the world stays lightweight.
- Collectible crates, NPC tips, buyable ownership lots, route pads, and drivable vehicles.
- Mission loop with rewards and XP progression.
- Local autosave, two manual save slots, JSON export/import.
- Optional Firebase bridge that does nothing unless Firebase is intentionally configured by the site owner.
- PWA manifest, service worker, and SVG icon for static hosting readiness.

## Static hosting notes

This app is designed to run as plain static files. No live deploy, Firebase dashboard change, or Netlify setting change is required by this code.
