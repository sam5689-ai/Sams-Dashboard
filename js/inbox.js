// Email Inbox view: a lightweight Gmail client — search, read full threaded
// conversations, reply/reply all/forward with attachments, archive, delete,
// compose, and turn any message into a task — all against the same Google
// connection used for Calendar sync.
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

  formatBytes(n) {
    if (!n) return '0 KB';
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
        const { entries, nextPageToken } = await Gmail.searchInbox({
          query: this.query,
          maxResults: 20,
          pageToken: append ? this.nextPageToken : null,
        });

        // One row per conversation: skip any entry whose thread we've
        // already got a (more recent) row for, same as Gmail's own inbox list.
        const seenThreads = new Set(this.messages.map((m) => m.threadId));
        const deduped = [];
        for (const entry of entries) {
          if (seenThreads.has(entry.threadId)) continue;
          seenThreads.add(entry.threadId);
          deduped.push(entry);
        }

        const summaries = [];
        for (const entry of deduped) {
          summaries.push(await Gmail.getMessageSummary(entry.id));
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
      <div class="card" data-read="${escapeAttr(m.threadId)}" style="cursor:pointer;">
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
          <button class="icon-btn" data-archive="${escapeAttr(m.threadId)}" title="Archive">${Icon.archive(15)}</button>
          <button class="icon-btn" data-trash="${escapeAttr(m.threadId)}" title="Delete">${Icon.trash(15)}</button>
          <button class="icon-btn ${alreadyLabeled ? 'connected' : ''}" data-make-task="${m.id}" title="${alreadyLabeled ? 'Already queued as a task' : 'Turn into a task'}">${Icon.checkSquare(15)}</button>
        </div>
      </div>
    `;
  },

  removeFromList(threadId) {
    this.messages = this.messages.filter((m) => m.threadId !== threadId);
    this.render();
  },

  async archive(threadId, btn) {
    if (btn) btn.disabled = true;
    try {
      await Gmail.archiveThread(threadId);
      Toast.show('Conversation archived');
      this.removeFromList(threadId);
    } catch (err) {
      console.error(err);
      Toast.show(err.message || 'Failed to archive conversation');
      if (btn) btn.disabled = false;
    }
  },

  async trash(threadId, btn) {
    if (btn) btn.disabled = true;
    try {
      await Gmail.trashThread(threadId);
      Toast.show('Conversation moved to trash');
      this.removeFromList(threadId);
    } catch (err) {
      console.error(err);
      Toast.show(err.message || 'Failed to delete conversation');
      if (btn) btn.disabled = false;
    }
  },

  // Switches from the inbox list to the full-page reader view for one
  // conversation, matching Gmail's own click-through-to-read behaviour
  // rather than a small popup.
  showReaderView() {
    document.getElementById('view-inbox').classList.remove('active');
    document.getElementById('view-inbox-reader').classList.add('active');
  },

  closeReaderView() {
    document.getElementById('view-inbox-reader').classList.remove('active');
    document.getElementById('view-inbox').classList.add('active');
    document.getElementById('viewTitle').textContent = 'Inbox';
  },

  attachmentChipHtml(message, att, index) {
    return `
      <button type="button" class="attachment-chip" data-download-attachment
        data-message-id="${escapeAttr(message.id)}"
        data-attachment-id="${escapeAttr(att.attachmentId || '')}"
        data-inline="${att.inlineData ? escapeAttr(att.inlineData) : ''}"
        data-filename="${escapeAttr(att.filename)}"
        data-mime="${escapeAttr(att.mimeType)}">
        ${Icon.download(14)} ${escapeHtml(att.filename)} <span class="attachment-size">${this.formatBytes(att.size)}</span>
      </button>
    `;
  },

  async downloadAttachment(btn) {
    const { messageId, attachmentId, inline, filename, mime } = btn.dataset;
    btn.disabled = true;
    try {
      const base64url = attachmentId ? await Gmail.getAttachmentData(messageId, attachmentId) : inline;
      const blob = Gmail.base64UrlToBlob(base64url, mime);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      console.error(err);
      Toast.show(err.message || 'Failed to download attachment');
    } finally {
      btn.disabled = false;
    }
  },

  // Renders one message inside the conversation. Collapsed messages show
  // just the header + snippet line; the most recent message starts expanded.
  threadMessageHtml(message, expanded) {
    const senderName = this.extractSenderName(message.from);
    const snippetLine = (message.body || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    const attachmentsHtml = message.attachments.length
      ? `<div class="attachment-list">${message.attachments.map((a, i) => this.attachmentChipHtml(message, a, i)).join('')}</div>`
      : '';

    return `
      <div class="thread-message ${expanded ? 'expanded' : ''}" data-message-id="${escapeAttr(message.id)}">
        <div class="thread-message-header" data-toggle-message="${escapeAttr(message.id)}">
          <div class="thread-message-header-main">
            <strong>${escapeHtml(senderName)}</strong>
            ${!expanded ? `<span class="thread-message-snippet">${escapeHtml(snippetLine)}</span>` : ''}
          </div>
          <span class="thread-message-date">${escapeHtml(this.formatEmailDate(message.date))}</span>
        </div>
        <div class="thread-message-body" ${expanded ? '' : 'hidden'}>
          <div class="email-reader-meta">
            <div><strong>From:</strong> ${escapeHtml(message.from)}</div>
            ${message.to ? `<div><strong>To:</strong> ${escapeHtml(message.to)}</div>` : ''}
            ${message.cc ? `<div><strong>Cc:</strong> ${escapeHtml(message.cc)}</div>` : ''}
          </div>
          <div class="email-reader-body">${escapeHtml(message.body) || '<span style="color:var(--text-muted)">(No content)</span>'}</div>
          ${attachmentsHtml}
        </div>
      </div>
    `;
  },

  async openReader(threadId) {
    const content = document.getElementById('emailReaderContent');
    content.innerHTML = `
      <button type="button" class="email-reader-back" id="readerBackBtn">${Icon.arrowLeft(16)} Back to Inbox</button>
      <p style="color:var(--text-muted);font-size:13px;">Loading conversation…</p>
    `;
    this.showReaderView();
    document.getElementById('readerBackBtn').addEventListener('click', () => this.closeReaderView());

    try {
      const thread = await Gmail.getThread(threadId);
      const messages = thread.messages;
      const lastMessage = messages[messages.length - 1];
      const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}`;
      document.getElementById('viewTitle').textContent = lastMessage.subject;

      content.innerHTML = `
        <button type="button" class="email-reader-back" id="readerBackBtn">${Icon.arrowLeft(16)} Back to Inbox</button>
        <div class="email-reader-subject">${escapeHtml(lastMessage.subject)}</div>
        <div class="thread-message-list">
          ${messages.map((m, i) => this.threadMessageHtml(m, i === messages.length - 1)).join('')}
        </div>
        <div class="email-reader-actions">
          <button type="button" class="primary-btn" id="replyReaderBtn">${Icon.send(15)} Reply</button>
          <button type="button" class="secondary-btn" id="replyAllReaderBtn">${Icon.send(15)} Reply All</button>
          <button type="button" class="secondary-btn" id="forwardReaderBtn">${Icon.forward(15)} Forward</button>
          <button type="button" class="secondary-btn" id="archiveReaderBtn">${Icon.archive(15)} Archive</button>
          <button type="button" class="secondary-btn" id="trashReaderBtn">${Icon.trash(15)} Delete</button>
          <a class="secondary-btn" href="${escapeAttr(gmailLink)}" target="_blank" rel="noopener">${Icon.externalLink(15)} Open in Gmail</a>
        </div>
      `;

      document.getElementById('readerBackBtn').addEventListener('click', () => this.closeReaderView());
      document.getElementById('replyReaderBtn').addEventListener('click', () => this.openCompose({ mode: 'reply', thread }));
      document.getElementById('replyAllReaderBtn').addEventListener('click', () => this.openCompose({ mode: 'replyAll', thread }));
      document.getElementById('forwardReaderBtn').addEventListener('click', () => this.openCompose({ mode: 'forward', thread }));
      document.getElementById('archiveReaderBtn').addEventListener('click', async () => {
        this.closeReaderView();
        await this.archive(threadId);
      });
      document.getElementById('trashReaderBtn').addEventListener('click', async () => {
        this.closeReaderView();
        await this.trash(threadId);
      });

      content.querySelectorAll('[data-toggle-message]').forEach((header) => {
        header.addEventListener('click', () => {
          const wrap = header.closest('.thread-message');
          const body = wrap.querySelector('.thread-message-body');
          const nowExpanded = wrap.classList.toggle('expanded');
          body.hidden = !nowExpanded;
          const snippet = header.querySelector('.thread-message-snippet');
          if (snippet) snippet.style.display = nowExpanded ? 'none' : '';
        });
      });
      content.querySelectorAll('[data-download-attachment]').forEach((btn) =>
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.downloadAttachment(btn);
        })
      );

      // Mark every unread message in the conversation read, same as Gmail
      // does when you open a conversation from the inbox list.
      const unreadIds = messages.filter((m) => m.labelIds.includes('UNREAD')).map((m) => m.id);
      if (unreadIds.length) {
        Promise.all(unreadIds.map((id) => Gmail.removeLabel(id, 'UNREAD'))).catch((err) =>
          console.warn('Failed to mark conversation as read', err)
        );
        const local = this.messages.find((m) => m.threadId === threadId);
        if (local) {
          local.unread = false;
          this.render();
        }
      }
    } catch (err) {
      console.error(err);
      content.innerHTML = `
        <button type="button" class="email-reader-back" id="readerBackBtn">${Icon.arrowLeft(16)} Back to Inbox</button>
        <p style="color:var(--danger);font-size:14px;">Couldn't load conversation: ${escapeHtml(err.message || 'Unknown error')}</p>
      `;
      document.getElementById('readerBackBtn').addEventListener('click', () => this.closeReaderView());
    }
  },

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error(`Could not read file "${file.name}"`));
      reader.readAsDataURL(file);
    });
  },

  // Builds the compose/reply/forward modal. `thread` is the conversation
  // being replied to/forwarded (from Gmail.getThread), omitted for a
  // brand-new message.
  async openCompose({ mode, thread }) {
    let to = '';
    let cc = '';
    let subject = '';
    let quoted = '';
    let threadId = '';
    let inReplyTo = '';
    let references = '';
    const email = thread ? thread.messages[thread.messages.length - 1] : null;

    if (email) {
      threadId = email.threadId;
      inReplyTo = email.messageIdHeader || '';
      references = thread.messages.map((m) => m.messageIdHeader).filter(Boolean).join(' ');
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
        <div class="form-row">
          <label>Attach files</label>
          <input type="file" id="composeAttachmentsInput" multiple />
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

      try {
        const files = Array.from(document.getElementById('composeAttachmentsInput').files || []);
        const attachments = [];
        if (files.length) {
          sendBtn.textContent = 'Attaching files…';
          for (const file of files) {
            attachments.push({ filename: file.name, mimeType: file.type || 'application/octet-stream', base64: await this.fileToBase64(file) });
          }
        }

        sendBtn.textContent = 'Sending…';
        await Gmail.sendMessage({
          to: fd.get('to'),
          cc: fd.get('cc') || '',
          subject: fd.get('subject'),
          body: fd.get('body'),
          inReplyTo,
          references,
          threadId,
          attachments,
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
