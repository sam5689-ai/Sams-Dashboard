// WhatsApp Inbox view: displays recent messages sent to the WhatsApp
// Business number, logged by api/whatsapp-webhook.js. Read-only — the
// actual task creation already happens automatically (see whatsapp.js /
// api/pending-tasks.js), this is just for visibility into what came in.
const WhatsAppInbox = {
  messages: [],
  loaded: false,

  init() {
    const refreshBtn = document.getElementById('refreshWhatsAppBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.load());
  },

  ensureLoaded() {
    if (!this.loaded) this.load();
  },

  formatTimestamp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${datePart} · ${timePart}`;
  },

  async load() {
    const list = document.getElementById('whatsappList');
    list.innerHTML = '<div class="empty-state">Loading messages…</div>';
    this.loaded = true;

    try {
      const res = await fetch('/api/whatsapp-messages');
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      this.messages = data.messages || [];
      this.render();
    } catch (err) {
      console.error(err);
      list.innerHTML = `<div class="empty-state">Failed to load WhatsApp messages: ${escapeHtml(err.message || 'Unknown error')}</div>`;
    }
  },

  render() {
    const list = document.getElementById('whatsappList');
    if (!this.messages.length) {
      list.innerHTML = '<div class="empty-state">No WhatsApp messages yet. Message your WhatsApp Business number and it\'ll show up here.</div>';
      return;
    }
    list.innerHTML = this.messages.map((m) => this.rowHtml(m)).join('');
  },

  rowHtml(m) {
    const sender = m.name || m.from || 'Unknown';
    return `
      <div class="card">
        <div class="card-main">
          <div class="card-title">${escapeHtml(sender)}</div>
          <div class="card-meta">
            <span>${Icon.calendar(14)} ${escapeHtml(this.formatTimestamp(m.timestamp))}</span>
            ${m.from ? `<span>${Icon.phone(14)} ${escapeHtml(m.from)}</span>` : ''}
          </div>
          <div class="card-notes">${escapeHtml(m.text || '')}</div>
          ${m.taskTitle ? `<div class="card-notes"><span class="badge badge-google">Task created</span> ${escapeHtml(m.taskTitle)}</div>` : ''}
        </div>
      </div>
    `;
  },
};
