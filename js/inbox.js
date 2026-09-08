// Email Inbox view: a lightweight Gmail client — search, read, reply/reply
// all/forward, archive, delete, compose, and turn any message into a task —
// all against the same Google connection used for Calendar sync.
const Inbox = {
  messages: [],
  loaded: false,
  nextPageToken: null,
  query: '',
  searchDebounce: null,

  init() {
    const refreshBtn = document.getElementById('refreshInboxBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.load());

    const composeBtn = document.getElementById('composeEmailBtn');
    if (composeBtn) composeBtn.addEventListener('click', () => this.openCompose({ mode: 'new' }));

    const loadMoreBtn = document.getElementById('inboxLoadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => this.load({ append: true }));

    const searchInput = document.getElementById('inboxSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(this.searchDebounce);
        this.searchDebounce = setTimeout(() => {
          this.query = searchInput.value.trim();
          this.load();
        }, 400);
      });
    }
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

  load(opts) {
    const append = !!(opts && opts.append);
    const list = document.getElementById('inboxList');
    if (!GoogleCalendar.getToken()) {
      list.innerHTML = `
        <div class="empty-state">
          Connect your Google account to view your inbox.<br />
          <button type="button" class="secondary-btn" id="inboxConnectBtn" style="margin-top:10px;">${Icon.link(15)} Connect Google</button>
        </div>
      `;
      document.getElementById('inboxLoadMoreWrap').hidden = true;
      const btn = document.getElementById('inboxConnectBtn');
      if (btn) btn.addEventListener('click', () => GoogleCalendar.withConnection(() => this.load()));
      return;
    }

    if (!append) {
      list.innerHTML = '<div class="empty-state">Loading inbox…</div>';
      this.nextPageToken = null;
    }
    this.loaded = true;

    GoogleCalendar.withConnection(async () => {
      try {
        await Gmail.ensureLabelId();
        const { ids, nextPageToken } = await Gmail.searchInbox({
          query: this.query,
          maxResults: 20,
          pageToken: append ? this.nextPageToken : null,
        });
        const summaries = [];
        for (const id of ids) {
          summaries.push(await Gmail.getMessageSummary(id));
        }
        this.messages = append ? this.messages.concat(summaries) : summaries;
        this.nextPageToken = nextPageToken;
        this.render();
      } catch (err) {
        console.error(err);
        list.innerHTML = `<div class="empty-state">Failed to load inbox: ${escapeHtml(err.message || 'Unknown error')}</div>`;
      }
    });
  },

  render() {
    const list = document.getElementById('inboxList');
    const loadMoreWrap = document.getElementById('inboxLoadMoreWrap');

    if (!this.messages.length) {
      list.innerHTML = `<div class="empty-state">${this.query ? 'No emails match your search.' : 'Your inbox is empty.'}</div>`;
      loadMoreWrap.hidden = true;
      return;
    }

    list.innerHTML = this.messages.map((m) => this.rowHtml(m)).join('');
    loadMoreWrap.hidden = !this.nextPageToken;

    list.querySelectorAll('[data-read]').forEach((el) =>
      el.addEventListener('click', () => this.openReader(el.dataset.read))
    );
    list.querySelectorAll('[data-make-task]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.convertToTask(btn.dataset.makeTask, btn);
      })
    );
    list.querySelectorAll('[data-archive]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.archive(btn.dataset.archive, btn);
      })
    );
    list.querySelectorAll('[data-trash]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.trash(btn.dataset.trash, btn);
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
          <button class="icon-btn" data-archive="${m.id}" title="Archive">${Icon.archive(15)}</button>
          <button class="icon-btn" data-trash="${m.id}" title="Delete">${Icon.trash(15)}</button>
          <button class="icon-btn ${alreadyLabeled ? 'connected' : ''}" data-make-task="${m.id}" title="${alreadyLabeled ? 'Already queued as a task' : 'Turn into a task'}">${Icon.checkSquare(15)}</button>
        </div>
      </div>
    `;
  },

  removeFromList(id) {
    this.messages = this.messages.filter((m) => m.id !== id);
    this.render();
  },

  async archive(id, btn) {
    if (btn) btn.disabled = true;
    try {
      await Gmail.archiveMessage(id);
      Toast.show('Email archived');
      this.removeFromList(id);
    } catch (err) {
      console.error(err);
      Toast.show(err.message || 'Failed to archive email');
      if (btn) btn.disabled = false;
    }
  },

  async trash(id, btn) {
    if (btn) btn.disabled = true;
    try {
      await Gmail.trashMessage(id);
      Toast.show('Email moved to trash');
      this.removeFromList(id);
    } catch (err) {
      console.error(err);
      Toast.show(err.message || 'Failed to delete email');
      if (btn) btn.disabled = false;
    }
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
        <div style="white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.6;max-height:40vh;overflow-y:auto;border-top:1px solid var(--border);padding-top:14px;">${escapeHtml(email.body) || '<span style="color:var(--text-muted)">(No content)</span>'}</div>
        <div class="modal-actions" style="flex-wrap:wrap;">
          <a class="secondary-btn" href="${escapeAttr(gmailLink)}" target="_blank" rel="noopener">${Icon.externalLink(15)} Open in Gmail</a>
          <button type="button" class="secondary-btn" id="archiveReaderBtn">${Icon.archive(15)} Archive</button>
          <button type="button" class="secondary-btn" id="trashReaderBtn">${Icon.trash(15)} Delete</button>
          <button type="button" class="secondary-btn" id="forwardReaderBtn">${Icon.forward(15)} Forward</button>
          <button type="button" class="secondary-btn" id="replyAllReaderBtn">${Icon.send(15)} Reply All</button>
          <button type="button" class="primary-btn" id="replyReaderBtn">${Icon.send(15)} Reply</button>
        </div>
      `);

      document.getElementById('replyReaderBtn').addEventListener('click', () => this.openCompose({ mode: 'reply', email }));
      document.getElementById('replyAllReaderBtn').addEventListener('click', () => this.openCompose({ mode: 'replyAll', email }));
      document.getElementById('forwardReaderBtn').addEventListener('click', () => this.openCompose({ mode: 'forward', email }));
      document.getElementById('archiveReaderBtn').addEventListener('click', async () => {
        Modal.close();
        await this.archive(email.id);
      });
      document.getElementById('trashReaderBtn').addEventListener('click', async () => {
        Modal.close();
        await this.trash(email.id);
      });

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

  // Builds the compose/reply/forward modal. `email` is the full message
  // being replied to/forwarded (from getFullMessageForReading), omitted for
  // a brand-new message.
  async openCompose({ mode, email }) {
    let to = '';
    let cc = '';
    let subject = '';
    let quoted = '';
    let threadId = '';
    let inReplyTo = '';
    let references = '';

    if (email) {
      threadId = email.threadId;
      inReplyTo = email.messageIdHeader || '';
      references = email.messageIdHeader || '';
      const quotedLines = (email.body || '').split('\n').map((l) => '> ' + l).join('\n');
      quoted = `\n\n\nOn ${email.date}, ${email.from} wrote:\n${quotedLines}`;
    }

    if (mode === 'reply' || mode === 'replyAll') {
      to = Gmail.extractEmailAddress(email.from);
      subject = /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`;
      if (mode === 'replyAll') {
        try {
          const myEmail = (await Gmail.getMyEmail()).toLowerCase();
          const others = `${email.to || ''}, ${email.cc || ''}`
            .split(',')
            .map((s) => Gmail.extractEmailAddress(s.trim()))
            .filter((addr) => addr && addr.toLowerCase() !== myEmail && addr.toLowerCase() !== to.toLowerCase());
          if (others.length) cc = [...new Set(others)].join(', ');
        } catch (err) {
          console.warn('Could not determine own email for Reply All', err);
        }
      }
    } else if (mode === 'forward') {
      subject = /^fwd:/i.test(email.subject) ? email.subject : `Fwd: ${email.subject}`;
      quoted = `\n\n\n---------- Forwarded message ----------\nFrom: ${email.from}\nDate: ${email.date}\nSubject: ${email.subject}\nTo: ${email.to || ''}\n\n${email.body || ''}`;
      inReplyTo = '';
      references = '';
      threadId = '';
    }

    const heading = { new: 'New message', reply: 'Reply', replyAll: 'Reply all', forward: 'Forward' }[mode];

    Modal.open(`
      <h2>${heading}</h2>
      <form id="composeForm">
        <div class="form-row">
          <label>To</label>
          <input type="text" name="to" value="${escapeAttr(to)}" placeholder="name@example.com" required />
        </div>
        <div class="form-row">
          <label>Cc</label>
          <input type="text" name="cc" value="${escapeAttr(cc)}" placeholder="Optional" />
        </div>
        <div class="form-row">
          <label>Subject</label>
          <input type="text" name="subject" value="${escapeAttr(subject)}" required />
        </div>
        <div class="form-row">
          <label>Message</label>
          <textarea name="body" rows="10" required>${escapeHtml(quoted)}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" id="cancelBtn">Cancel</button>
          <button type="submit" class="primary-btn" id="sendEmailBtn">${Icon.send(15)} Send</button>
        </div>
      </form>
    `);

    // Put the cursor above the quoted text rather than at the end.
    const textarea = document.querySelector('#composeForm textarea[name="body"]');
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(0, 0);
    }

    document.getElementById('cancelBtn').addEventListener('click', () => Modal.close());
    document.getElementById('composeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const sendBtn = document.getElementById('sendEmailBtn');
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';

      try {
        await Gmail.sendMessage({
          to: fd.get('to'),
          cc: fd.get('cc') || '',
          subject: fd.get('subject'),
          body: fd.get('body'),
          inReplyTo,
          references,
          threadId,
        });
        Modal.close();
        Toast.show('Email sent');
      } catch (err) {
        console.error(err);
        Toast.show(err.message || 'Failed to send email');
        sendBtn.disabled = false;
        sendBtn.innerHTML = `${Icon.send(15)} Send`;
      }
    });
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
