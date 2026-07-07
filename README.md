# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional cloud saves and localStorage fallback.

## Current playable loop

- Move on desktop with `WASD` or arrow keys.
- Hold `Shift` to sprint.
- Press `E` or tap **Interact** to collect crates, enter vehicles, or buy lots.
- Press `M` to open the mission board.
- Press `Esc` or tap **Pause** for settings and save/load options.
- Mobile players can use the on-screen joystick and action buttons.

## Gameplay systems

- Streamed block city chunks around the player.
- Collectible crates with cash and XP rewards.
- NPC markers, buyable lots, and simple hover vehicles.
- Mission progress for crates, driving distance, and ownership.
- Autosave plus manual save slots and JSON export/import.
- Optional `window.NeonBlockCloudProvider` bridge for cloud saves without requiring Firebase configuration changes.

## Static hosting notes

This repo is safe for static hosting. It does not require a build step and does not change external Firebase or Netlify settings. The PWA files are included for installability and offline replay of local assets.
