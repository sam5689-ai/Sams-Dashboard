// Simple localStorage-backed data store shared by all dashboard modules.
const Store = {
  KEYS: {
    meetings: 'dashboard.meetings',
    candidates: 'dashboard.candidates',
    tasks: 'dashboard.tasks',
    theme: 'dashboard.theme',
  },

  _read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to read store', key, e);
      return [];
    }
  },

  _write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  getAll(collection) {
    return this._read(this.KEYS[collection]);
  },

  save(collection, items) {
    this._write(this.KEYS[collection], items);
  },

  add(collection, item) {
    const items = this.getAll(collection);
    item.id = this.uid();
    item.createdAt = new Date().toISOString();
    items.push(item);
    this.save(collection, items);
    return item;
  },

  update(collection, id, patch) {
    const items = this.getAll(collection);
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch };
    this.save(collection, items);
    return items[idx];
  },

  remove(collection, id) {
    const items = this.getAll(collection).filter((i) => i.id !== id);
    this.save(collection, items);
  },

  get(collection, id) {
    return this.getAll(collection).find((i) => i.id === id) || null;
  },

  exportAll() {
    const data = {
      meetings: this.getAll('meetings'),
      candidates: this.getAll('candidates'),
      tasks: this.getAll('tasks'),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sams-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  importAll(json) {
    if (json.meetings) this.save('meetings', json.meetings);
    if (json.candidates) this.save('candidates', json.candidates);
    if (json.tasks) this.save('tasks', json.tasks);
  },
};
