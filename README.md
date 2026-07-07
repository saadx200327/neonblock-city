# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud-save hooks and localStorage fallback.

## What is playable now

- Desktop movement: `WASD` / arrow keys, `Shift` sprint, `Space` jump, mouse drag camera, `E` interact, `M` missions, `R` unstuck, `Esc` pause.
- Mobile movement: virtual joystick, Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streaming city chunks with roads, neon buildings, crates, NPC tips, a district beacon, and buyable lots.
- Vehicles with entry/exit, gas, health readouts, and drive-distance mission progress.
- Mission loop: crates, driving, ownership, and district travel rewards.
- Saves: local autosave, two manual slots, JSON export/import, and a safe optional cloud bridge in `firebase-backend.js`.
- PWA readiness: manifest, icon, and a minimal service worker file. No deployment or dashboard changes are required.

## Static hosting

Upload the repository folder to Netlify or any static host. The game does not require a build step.

## Optional Firebase cloud saves

The game works offline through `localStorage` by default. `firebase-backend.js` intentionally does not include project secrets or touch Firebase settings. To enable cloud saves later, wire your own Firebase client in that file and define config outside the repo or through your chosen frontend environment process.
