# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## Current gameplay

- Third-person player movement on desktop with WASD/arrow keys, Shift sprint, Space jump, E interact, R unstuck, Esc pause.
- Mobile joystick and action buttons for movement, sprinting, jumping, interacting, pausing, and unstucking.
- Streaming neon city chunks around the player to keep the world playable without loading one giant map.
- Orange neon crates, NPC hints, buyable green lots, and drivable vehicles.
- Mission chain: collect crates, buy a lot, and drive distance for cash/XP rewards.
- Autosave every 30 seconds, manual save/load slots, and JSON export/import.
- Optional cloud-save bridge through `window.NeonBlockFirebaseAdapter`; no Firebase config is required for local play.
- PWA files included: `manifest.webmanifest`, `sw.js`, and SVG app icon.

## Run locally

Open `index.html` directly, or serve the folder with any static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Static hosting notes

This repo is intentionally static. It does not require a build step, a backend, or dashboard changes. Deploying to Netlify/GitHub Pages should use the repository root as the publish directory.
