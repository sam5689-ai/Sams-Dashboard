// WhatsApp Inbox view: displays recent messages sent to/from the WhatsApp
// Business number, logged by api/whatsapp-webhook.js (inbound) and
// api/send-whatsapp-message.js (outbound replies). Task creation and
// replying are both deliberate, per-message actions here.
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

  // A message already has a task if some task in the store was created from it.
  hasTask(message) {
    if (!message.id) return false;
    return Store.getAll('tasks').some((t) => t.whatsappMessageId === message.id);
  },

  render() {
    const list = document.getElementById('whatsappList');
    if (!this.messages.length) {
      list.innerHTML = '<div class="empty-state">No WhatsApp messages yet. Message your WhatsApp Business number and it\'ll show up here.</div>';
      return;
    }
    list.innerHTML = this.messages.map((m) => this.rowHtml(m)).join('');
    list.querySelectorAll('[data-make-task]').forEach((btn) =>
      btn.addEventListener('click', () => this.createTask(btn.dataset.makeTask, btn))
    );
    list.querySelectorAll('[data-reply-to]').forEach((btn) =>
      btn.addEventListener('click', () => this.openReply(btn.dataset.replyTo, btn.dataset.replyName))
    );
  },

  rowHtml(m) {
    const isOutbound = m.direction === 'out';
    const sender = isOutbound ? 'You' : (m.name || m.from || 'Unknown');
    const alreadyHasTask = this.hasTask(m);

    return `
      <div class="card" ${isOutbound ? 'style="background:var(--accent-soft);"' : ''}>
        <div class="card-main">
          <div class="card-title">
            ${sender === 'You' ? `<span class="badge badge-google">Sent</span>` : ''}
            ${escapeHtml(sender)}
          </div>
          <div class="card-meta">
            <span>${Icon.calendar(14)} ${escapeHtml(this.formatTimestamp(m.timestamp))}</span>
            ${m.from ? `<span>${Icon.phone(14)} ${escapeHtml(m.from)}</span>` : ''}
          </div>
          <div class="card-notes">${escapeHtml(m.text || '')}</div>
        </div>
        ${!isOutbound ? `
          <div class="card-actions">
            <button class="icon-btn" data-reply-to="${escapeAttr(m.from || '')}" data-reply-name="${escapeAttr(m.name || '')}" title="Reply">${Icon.send(15)}</button>
            <button class="icon-btn ${alreadyHasTask ? 'connected' : ''}" data-make-task="${escapeAttr(m.id || '')}" title="${alreadyHasTask ? 'Already turned into a task' : 'Turn into a task'}">${Icon.checkSquare(15)}</button>
          </div>
        ` : ''}
      </div>
    `;
  },

  async createTask(messageId, btn) {
    const message = this.messages.find((m) => m.id === messageId);
    if (!message) return;

    btn.disabled = true;
    try {
      const res = await fetch('/api/parse-whatsapp-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.text, from: message.name || message.from }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Task creation failed (${res.status})${errText ? ': ' + errText : ''}`);
      }
      const parsed = await res.json();

      if (message.from) Contacts.upsert({ name: message.name, phone: message.from });

      Store.add('tasks', {
        title: parsed.title,
        description: parsed.description,
        dueDate: parsed.dueDate,
        priority: parsed.priority,
        status: 'todo',
        category: parsed.category || 'WhatsApp',
        contactPhone: message.from || '',
        contactName: message.name || '',
        whatsappMessageId: message.id || '',
      });

      Tasks.render();
      App.refreshOverview();
      this.render();
      Toast.show(`Created task: ${parsed.title}`);
    } catch (err) {
      console.error(err);
      Toast.show(err.message || 'Failed to create task');
      btn.disabled = false;
    }
  },

  openReply(to, name) {
    Modal.open(`
      <h2>Reply to ${escapeHtml(name || to)}</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-top:-8px;">
        Free-form replies only work within 24 hours of their last message. Outside that window WhatsApp requires a pre-approved template instead.
      </p>
      <form id="whatsappReplyForm">
        <div class="form-row">
          <label>Message</label>
          <textarea name="text" rows="4" required placeholder="Type your reply..."></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" id="cancelBtn">Cancel</button>
          <button type="submit" class="primary-btn" id="sendReplyBtn">${Icon.send(15)} Send</button>
        </div>
      </form>
    `);

    document.getElementById('cancelBtn').addEventListener('click', () => Modal.close());
    document.getElementById('whatsappReplyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = new FormData(e.target).get('text');
      const sendBtn = document.getElementById('sendReplyBtn');
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';

      try {
        const res = await fetch('/api/send-whatsapp-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

        Modal.close();
        Toast.show('Reply sent');
        this.load();
      } catch (err) {
        console.error(err);
        Toast.show(err.message || 'Failed to send reply');
        sendBtn.disabled = false;
        sendBtn.innerHTML = `${Icon.send(15)} Send`;
      }
    });
  },
};
