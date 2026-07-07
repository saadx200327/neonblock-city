# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. It is a static, Netlify-ready PWA with local saves and an optional Firebase cloud-save adapter.

## Included gameplay

- Playable third-person movement with WASD / arrow keys and mobile joystick controls.
- Jump, sprint, interact, pause, unstuck, save, load, export, and import actions.
- Streamed city chunks so the map expands around the player without loading the entire world at once.
- Neon roads, buildings, crates, NPC tips, vehicles, buyable lots, minimap, HUD, debug info, and mission rewards.
- Autosave through localStorage plus save slots and JSON backup/restore.
- Optional Firebase bridge in firebase-backend.js; no Firebase config is required for offline play.
- PWA manifest, SVG icon, and service worker for static-host readiness.

## Controls

Desktop:

- Move: WASD or arrow keys
- Look: drag on the game canvas
- Jump: Space
- Sprint: Shift
- Interact / enter vehicle / collect crate / buy lot: E
- Pause: Esc or P
- Mission board shortcut: M

Mobile:

- Move: left joystick
- Jump, Sprint, Interact, Unstuck, Pause: right-side action buttons

## Optional Firebase cloud saves

By default, the game does not require Firebase and stores saves locally. To enable cloud saves, define window.NEONBLOCK_FIREBASE_CONFIG before firebase-backend.js loads. Do not commit private credentials or change external Firebase dashboard settings from this repo.

## Netlify / static hosting

This project is a plain static site. Upload the repo folder or connect the repository in Netlify. No build command is required, and the publish directory is the repository root.

## Safety notes

- This repo intentionally avoids deployment-side settings.
- Existing files should not be deleted during improvement passes.
- The game remains playable offline through local saves even when Firebase is not configured.
