# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## What is playable now

- Desktop movement: WASD / arrow keys, Space jump, Shift sprint, F interact, M mission board, Esc pause, F3 debug overlay.
- Mobile movement: left joystick, right-side action buttons, and right-side drag-look on the canvas.
- Streaming city chunks with roads, buildings, crates, NPCs, vehicles, and buyable lots.
- Missions for crate collection, first lot ownership, and driving distance.
- Local autosave, manual save/load slots, JSON import/export, and save-on-background.
- Optional cloud-save adapter through firebase-backend.js without requiring Firebase to run locally.
- PWA files: manifest.webmanifest, sw.js, and assets/icon.svg.

## Static hosting

This project can be hosted as plain static files. No live deployment or dashboard configuration is required for this code change.

For Netlify, publish the repository root as the static site. No build command is required.

## Optional Firebase bridge

The game works offline/local-only by default. To use Firebase later, initialize your own Firebase client separately and expose a window.NeonBlockFirebase object with async save(slot, payload) and async load(slot) methods.

Do not put private Firebase secrets in this static repo.
