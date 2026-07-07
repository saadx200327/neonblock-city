// Optional cloud-save bridge. The game works fully offline with localStorage.
// To enable cloud saves later, load Firebase on the page and expose a compatible adapter here.
window.NeonBlockCloudSave = window.NeonBlockCloudSave || {
  ready: false,
  async save() {
    return false;
  },
  async load() {
    return null;
  }
};
