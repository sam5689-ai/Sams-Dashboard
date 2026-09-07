// Task Management module
const Tasks = {
  statusFilter: 'all',
  priorityFilter: 'all',
  search: '',

  init() {
    document.getElementById('addTaskBtn').addEventListener('click', () => this.openForm());
    const syncBtn = document.getElementById('syncFromEmailBtn');
    if (syncBtn) syncBtn.addEventListener('click', () => this.syncFromEmail());
    document.getElementById('taskStatusFilter').addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.render();
    });
    document.getElementById('taskPriorityFilter').addEventListener('change', (e) => {
      this.priorityFilter = e.target.value;
      this.render();
    });
    document.getElementById('taskSearch').addEventListener('input', (e) => {
      this.search = e.target.value.toLowerCase();
      this.render();
    });
    this.render();
  },

  getFiltered() {
    let items = Store.getAll('tasks');
    if (this.statusFilter !== 'all') items = items.filter((t) => t.status === this.statusFilter);
    if (this.priorityFilter !== 'all') items = items.filter((t) => t.priority === this.priorityFilter);
    if (this.search) {
      items = items.filter((t) =>
        [t.title, t.description, t.category].join(' ').toLowerCase().includes(this.search)
      );
    }
    const priorityRank = { high: 0, medium: 1, low: 2 };
    return items.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'done' ? 1 : -1;
      const dueA = a.dueDate || '9999';
      const dueB = b.dueDate || '9999';
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3);
    });
  },

  render() {
    const list = document.getElementById('taskList');
    const items = this.getFiltered();

    if (items.length === 0) {
      list.innerHTML = '<div class="empty-state">No tasks found. Click "New Task" to add one.</div>';
      return;
    }

    list.innerHTML = items.map((t) => this.cardHtml(t)).join('');

    list.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => this.openForm(btn.dataset.edit))
    );
    list.querySelectorAll('[data-delete]').forEach((btn) =>
      btn.addEventListener('click', () => this.deleteTask(btn.dataset.delete))
    );
    list.querySelectorAll('[data-toggle]').forEach((btn) =>
      btn.addEventListener('click', () => this.cycleStatus(btn.dataset.toggle))
    );
  },

  cardHtml(t) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const isOverdue = t.dueDate && t.dueDate < todayStr && t.status !== 'done';
    const statusLabel = { todo: 'To Do', 'in-progress': 'In Progress', done: 'Done' }[t.status] || t.status;
    return `
      <div class="card">
        <div class="card-main">
          <div class="card-title">
            <span style="text-decoration:${t.status === 'done' ? 'line-through' : 'none'}">${escapeHtml(t.title)}</span>
            <span class="badge badge-${t.priority}">${t.priority}</span>
            <span class="badge badge-${t.status}" data-toggle="${t.id}" style="cursor:pointer" title="Click to advance status">${statusLabel}</span>
          </div>
          <div class="card-meta">
            ${t.dueDate ? `<span class="${isOverdue ? 'overdue' : ''}">${Icon.calendar(14)} Due ${formatDate(t.dueDate)}</span>` : ''}
            ${t.category ? `<span>${Icon.tag(14)} ${escapeHtml(t.category)}</span>` : ''}
          </div>
          ${t.description ? `<div class="card-notes">${escapeHtml(t.description)}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-edit="${t.id}" title="Edit">${Icon.edit(15)}</button>
          <button class="icon-btn" data-delete="${t.id}" title="Delete">${Icon.trash(15)}</button>
        </div>
      </div>
    `;
  },

  cycleStatus(id) {
    const order = ['todo', 'in-progress', 'done'];
    const t = Store.get('tasks', id);
    if (!t) return;
    const next = order[(order.indexOf(t.status) + 1) % order.length];
    Store.update('tasks', id, { status: next });
    this.render();
    App.refreshOverview();
  },

  openForm(id) {
    const existing = id ? Store.get('tasks', id) : null;
    const title = existing ? 'Edit Task' : 'New Task';

    Modal.open(`
      <h2>${title}</h2>
      <form id="taskForm">
        <div class="form-row">
          <label>Title *</label>
          <input type="text" name="title" required value="${existing ? escapeAttr(existing.title) : ''}" />
        </div>
        <div class="form-row">
          <label>Description</label>
          <textarea name="description" rows="3">${existing ? escapeHtml(existing.description || '') : ''}</textarea>
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label>Due Date</label>
            <input type="date" name="dueDate" value="${existing ? existing.dueDate || '' : ''}" />
          </div>
          <div class="form-row">
            <label>Priority</label>
            <select name="priority">
              <option value="high" ${existing && existing.priority === 'high' ? 'selected' : ''}>High</option>
              <option value="medium" ${!existing || existing.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="low" ${existing && existing.priority === 'low' ? 'selected' : ''}>Low</option>
            </select>
          </div>
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label>Status</label>
            <select name="status">
              <option value="todo" ${!existing || existing.status === 'todo' ? 'selected' : ''}>To Do</option>
              <option value="in-progress" ${existing && existing.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
              <option value="done" ${existing && existing.status === 'done' ? 'selected' : ''}>Done</option>
            </select>
          </div>
          <div class="form-row">
            <label>Category</label>
            <input type="text" name="category" value="${existing ? escapeAttr(existing.category || '') : ''}" placeholder="e.g. Hiring, Admin" />
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" id="cancelBtn">Cancel</button>
          <button type="submit" class="primary-btn">${existing ? 'Save Changes' : 'Add Task'}</button>
        </div>
      </form>
    `);

    document.getElementById('cancelBtn').addEventListener('click', () => Modal.close());
    document.getElementById('taskForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      if (existing) {
        Store.update('tasks', existing.id, data);
        Toast.show('Task updated');
      } else {
        Store.add('tasks', data);
        Toast.show('Task added');
      }
      Modal.close();
      this.render();
      App.refreshOverview();
    });
  },

  deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    Store.remove('tasks', id);
    this.render();
    App.refreshOverview();
    Toast.show('Task deleted');
  },

  // --- Email-to-task (Gmail label "ToDashboard" + AI parsing via /api/parse-email) ---

  async parseEmailToTask(email) {
    const res = await fetch('/api/parse-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: email.subject, body: email.body, from: email.from }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Email parsing failed (${res.status})${errText ? ': ' + errText : ''}`);
    }
    return res.json();
  },

  // Splits a raw email "From" header like `"Jordan Lee" <jordan@x.com>` into
  // its display name and address, for linking the task to a Contact.
  parseFromHeader(from) {
    if (!from) return { name: '', email: '' };
    const match = from.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
    if (match) return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from.trim())) return { name: '', email: from.trim().toLowerCase() };
    return { name: from.trim(), email: '' };
  },

  // Core email sync, shared by the manual button and the automatic background sync.
  async performEmailSync() {
    const labelId = await Gmail.ensureLabelId();
    const ids = await Gmail.listLabeledMessageIds(labelId);
    let added = 0;
    for (const id of ids) {
      const email = await Gmail.getMessage(id);
      const parsed = await this.parseEmailToTask(email);
      const { name, email: senderEmail } = this.parseFromHeader(email.from);
      if (senderEmail) Contacts.upsert({ name, email: senderEmail });
      Store.add('tasks', {
        title: parsed.title,
        description: parsed.description,
        dueDate: parsed.dueDate,
        priority: parsed.priority,
        status: 'todo',
        category: parsed.category || 'Email',
        contactEmail: senderEmail || '',
      });
      await Gmail.removeLabel(id, labelId);
      added++;
    }
    if (added) {
      this.render();
      App.refreshOverview();
    }
    return added;
  },

  // Manual "Sync from Email" button: prompts to (re)connect if needed, always gives feedback.
  syncFromEmail() {
    const btn = document.getElementById('syncFromEmailBtn');
    GoogleCalendar.withConnection(async () => {
      if (btn) { btn.disabled = true; btn.innerHTML = `${Icon.download(15)} Checking email…`; }
      try {
        const added = await this.performEmailSync();
        Toast.show(added ? `Imported ${added} task${added === 1 ? '' : 's'} from email` : 'No new labeled emails found. Apply the "ToDashboard" label in Gmail first.');
      } catch (err) {
        console.error(err);
        Toast.show(err.message || 'Failed to sync from email');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `${Icon.download(15)} Sync from Email`; }
      }
    });
  },

  // Automatic background sync: only runs if already signed in, stays quiet unless something changed.
  autoSyncEmailIfConnected() {
    if (!GoogleCalendar.getToken()) return;
    this.performEmailSync()
      .then((added) => {
        if (added) Toast.show(`Imported ${added} task${added === 1 ? '' : 's'} from email`);
      })
      .catch((err) => console.warn('Background email sync failed', err));
  },
};
