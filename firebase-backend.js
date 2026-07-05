window.NeonBlockCloud = window.NeonBlockCloud || {
  async save(slot, data) {
    localStorage.setItem('neonblock-cloud-' + slot, JSON.stringify(data));
    return true;
  },
  async load(slot) {
    const raw = localStorage.getItem('neonblock-cloud-' + slot);
    return raw ? JSON.parse(raw) : null;
  }
};
