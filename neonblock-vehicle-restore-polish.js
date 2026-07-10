(() => {
  'use strict';

  const STORAGE_PREFIX = 'neonblock:';
  const state = {
    wrapped: false,
    attempts: 0,
    restored: 0,
    skipped: 0,
    lastSlot: null,
    lastVehicleId: null,
    lastReason: 'not-run'
  };

  let restoredMesh = null;
  let cleanupFrame = 0;

  function parseSave(slot, supplied) {
    try {
      const raw = supplied ?? localStorage.getItem(`${STORAGE_PREFIX}${slot}`);
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (error) {
      state.lastReason = `save-parse-failed: ${error.message}`;
      return null;
    }
  }

  function validVehicle(vehicle) {
    return Boolean(
      vehicle &&
      typeof vehicle === 'object' &&
      typeof vehicle.id === 'string' &&
      vehicle.id.length > 0 &&
      Array.isArray(vehicle.pos) &&
      vehicle.pos.length >= 3 &&
      vehicle.pos.slice(0, 3).every(Number.isFinite)
    );
  }

  function removeRestoredMesh() {
    cancelAnimationFrame(cleanupFrame);
    cleanupFrame = 0;
    if (!restoredMesh) return;
    restoredMesh.parent?.remove(restoredMesh);
    restoredMesh.geometry?.dispose?.();
    restoredMesh.material?.dispose?.();
    restoredMesh = null;
  }

  function watchForExit(player, mesh) {
    cancelAnimationFrame(cleanupFrame);
    const check = () => {
      if (restoredMesh !== mesh) return;
      if (player.activeVehicle !== mesh) {
        removeRestoredMesh();
        state.lastReason = 'restored-vehicle-exited-cleanly';
        return;
      }
      cleanupFrame = requestAnimationFrame(check);
    };
    cleanupFrame = requestAnimationFrame(check);
  }

  function restoreVehicle(slot, supplied) {
    state.attempts += 1;
    state.lastSlot = slot;

    const save = parseSave(slot, supplied);
    const savedVehicle = save?.activeVehicle;
    if (!validVehicle(savedVehicle)) {
      state.skipped += 1;
      state.lastReason = 'no-valid-active-vehicle';
      return false;
    }

    const game = window.NeonBlockGame;
    const THREE = window.THREE;
    const snapshot = game?.getSnapshot?.();
    const player = snapshot?.player;
    const scene = player?.mesh?.parent;

    if (!THREE || !player || !scene) {
      state.skipped += 1;
      state.lastReason = 'runtime-not-ready';
      return false;
    }

    if (player.activeVehicle) {
      state.skipped += 1;
      state.lastReason = 'core-restored-vehicle';
      return false;
    }

    removeRestoredMesh();

    const isTaxi = String(savedVehicle.name || '').toLowerCase().includes('taxi');
    const material = new THREE.MeshStandardMaterial({
      color: isTaxi ? 0xffd338 : 0xff355f,
      roughness: isTaxi ? 0.45 : 0.4
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 4), material);
    mesh.position.fromArray(savedVehicle.pos.slice(0, 3));
    mesh.position.y = 0.65;
    mesh.rotation.y = player.mesh.rotation.y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      type: 'vehicle',
      id: savedVehicle.id,
      name: savedVehicle.name || (isTaxi ? 'Taxi' : 'Neon Car'),
      hp: Number.isFinite(savedVehicle.hp) ? Math.max(0, Math.min(100, savedVehicle.hp)) : 100,
      gas: Number.isFinite(savedVehicle.gas) ? Math.max(0, Math.min(100, savedVehicle.gas)) : 100,
      restoredFromSave: true
    };

    scene.add(mesh);
    player.activeVehicle = mesh;
    restoredMesh = mesh;
    state.restored += 1;
    state.lastVehicleId = mesh.userData.id;
    state.lastReason = 'restored-distant-active-vehicle';
    watchForExit(player, mesh);
    window.dispatchEvent(new CustomEvent('neonblock:vehicle-restored', {
      detail: { slot, id: mesh.userData.id, name: mesh.userData.name }
    }));
    return true;
  }

  function install() {
    const game = window.NeonBlockGame;
    if (!game?.loadState || state.wrapped) return false;

    const originalLoadState = game.loadState.bind(game);
    game.loadState = function loadStateWithVehicleRecovery(slot = 'slot1', data = null) {
      const result = originalLoadState(slot, data);
      queueMicrotask(() => restoreVehicle(slot, data));
      return result;
    };

    state.wrapped = true;
    const currentSlot = game.getSnapshot?.().player?.slot || 'slot1';
    queueMicrotask(() => restoreVehicle(currentSlot, null));
    return true;
  }

  if (!install()) {
    addEventListener('load', () => install(), { once: true });
  }

  window.NeonBlockVehicleRestore = {
    getStatus: () => ({ ...state, active: Boolean(restoredMesh?.parent) }),
    retry: (slot = window.NeonBlockGame?.getSnapshot?.().player?.slot || 'slot1') => restoreVehicle(slot, null),
    cleanup: removeRestoredMesh
  };
})();
