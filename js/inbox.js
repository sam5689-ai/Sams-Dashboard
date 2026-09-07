// Email Inbox view: shows recent Gmail messages and lets you turn any of
// them into a task with one click, reusing the same Google connection and
// the existing email-to-task pipeline (Tasks.performEmailSync).
const Inbox = {
  messages: [],
  loaded: false,

  init() {
    const refreshBtn = document.getElementById('refreshInboxBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.load());
  },

  extractSenderName(from) {
    if (!from) return '';
    const match = from.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
    return (match ? match[1] : from).trim();
  },

  formatEmailDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${datePart} · ${timePart}`;
  },

  // Loads the view for the first time it's visited; a manual "Refresh" click re-runs it.
  ensureLoaded() {
    if (!this.loaded) this.load();
  },

  load() {
    const list = document.getElementById('inboxList');
    if (!GoogleCalendar.getToken()) {
      list.innerHTML = `
        <div class="empty-state">
          Connect your Google account to view your inbox.<br />
          <button type="button" class="secondary-btn" id="inboxConnectBtn" style="margin-top:10px;">${Icon.link(15)} Connect Google</button>
        </div>
      `;
      const btn = document.getElementById('inboxConnectBtn');
      if (btn) btn.addEventListener('click', () => GoogleCalendar.withConnection(() => this.load()));
      return;
    }

    list.innerHTML = '<div class="empty-state">Loading inbox…</div>';
    this.loaded = true;

    GoogleCalendar.withConnection(async () => {
      try {
        await Gmail.ensureLabelId();
        const ids = await Gmail.listInboxMessageIds(20);
        const summaries = [];
        for (const id of ids) {
          summaries.push(await Gmail.getMessageSummary(id));
        }
        this.messages = summaries;
        this.render();
      } catch (err) {
        console.error(err);
        list.innerHTML = `<div class="empty-state">Failed to load inbox: ${escapeHtml(err.message || 'Unknown error')}</div>`;
      }
    });
  },

  render() {
    const list = document.getElementById('inboxList');
    if (!this.messages.length) {
      list.innerHTML = '<div class="empty-state">Your inbox is empty.</div>';
      return;
    }

    list.innerHTML = this.messages.map((m) => this.rowHtml(m)).join('');

    list.querySelectorAll('[data-read]').forEach((el) =>
      el.addEventListener('click', () => this.openReader(el.dataset.read))
    );
    list.querySelectorAll('[data-make-task]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.convertToTask(btn.dataset.makeTask, btn);
      })
    );
    list.querySelectorAll('[data-open-gmail]').forEach((el) =>
      el.addEventListener('click', (e) => e.stopPropagation())
    );
  },

  rowHtml(m) {
    const alreadyLabeled = m.labelIds.includes(Gmail.labelId);
    const senderName = this.extractSenderName(m.from);
    const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(m.threadId)}`;

    return `
      <div class="card" data-read="${m.id}" style="cursor:pointer;">
        <div class="card-main">
          <div class="card-title">
            ${m.unread ? '<span class="badge badge-google">Unread</span>' : ''}
            ${escapeHtml(senderName)}
          </div>
          <div class="card-meta">
            <span>${Icon.calendar(14)} ${escapeHtml(this.formatEmailDate(m.date))}</span>
          </div>
          <div class="card-notes"><strong>${escapeHtml(m.subject)}</strong>${m.snippet ? ' — ' + escapeHtml(m.snippet) : ''}</div>
        </div>
        <div class="card-actions">
          <a class="icon-btn" data-open-gmail href="${escapeAttr(gmailLink)}" target="_blank" rel="noopener" title="Open in Gmail">${Icon.externalLink(15)}</a>
          <button class="icon-btn ${alreadyLabeled ? 'connected' : ''}" data-make-task="${m.id}" title="${alreadyLabeled ? 'Already queued as a task' : 'Turn into a task'}">${Icon.checkSquare(15)}</button>
        </div>
      </div>
    `;
  },

  async openReader(id) {
    Modal.open(`<h2>Loading…</h2><p style="color:var(--text-muted);font-size:13px;">Fetching email content.</p>`);
    try {
      const email = await Gmail.getFullMessageForReading(id);
      const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(email.threadId)}`;

      Modal.open(`
        <h2>${escapeHtml(email.subject)}</h2>
        <div style="font-size:13px;color:var(--text-muted);margin:-8px 0 14px;line-height:1.6;">
          <div><strong>From:</strong> ${escapeHtml(email.from)}</div>
          ${email.to ? `<div><strong>To:</strong> ${escapeHtml(email.to)}</div>` : ''}
          <div>${escapeHtml(this.formatEmailDate(email.date))}</div>
        </div>
        <div style="white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.6;max-height:45vh;overflow-y:auto;border-top:1px solid var(--border);padding-top:14px;">${escapeHtml(email.body) || '<span style="color:var(--text-muted)">(No content)</span>'}</div>
        <div class="modal-actions">
          <a class="secondary-btn" href="${escapeAttr(gmailLink)}" target="_blank" rel="noopener">${Icon.externalLink(15)} Open in Gmail</a>
          <button type="button" class="primary-btn" id="closeReaderBtn">Close</button>
        </div>
      `);
      document.getElementById('closeReaderBtn').addEventListener('click', () => Modal.close());

      if (email.labelIds.includes('UNREAD')) {
        Gmail.removeLabel(id, 'UNREAD').catch((err) => console.warn('Failed to mark email as read', err));
        const local = this.messages.find((m) => m.id === id);
        if (local) {
          local.unread = false;
          local.labelIds = local.labelIds.filter((l) => l !== 'UNREAD');
          this.render();
        }
      }
    } catch (err) {
      console.error(err);
      Modal.open(`
        <h2>Couldn't load email</h2>
        <p style="color:var(--text-muted);font-size:13px;">${escapeHtml(err.message || 'Unknown error')}</p>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" id="closeReaderBtn">Close</button>
        </div>
      `);
      document.getElementById('closeReaderBtn').addEventListener('click', () => Modal.close());
    }
  },

  async convertToTask(messageId, btn) {
    btn.disabled = true;
    try {
      const labelId = await Gmail.ensureLabelId();
      await Gmail.addLabel(messageId, labelId);
      const added = await Tasks.performEmailSync();
      Toast.show(added ? `Created ${added} task${added === 1 ? '' : 's'} from email` : 'No task created — check the Sync from Email button on Tasks for details');
      this.load();
    } catch (err) {
      console.error(err);
      Toast.show(err.message || 'Failed to convert email to task');
      btn.disabled = false;
    }
  },
};
