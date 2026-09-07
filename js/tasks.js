// Task Management module
const Tasks = {
  statusFilter: 'all',
  priorityFilter: 'all',
  search: '',

  init() {
    document.getElementById('addTaskBtn').addEventListener('click', () => this.openForm());
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
            ${t.dueDate ? `<span class="${isOverdue ? 'overdue' : ''}">&#128197; Due ${formatDate(t.dueDate)}</span>` : ''}
            ${t.category ? `<span>&#127991; ${escapeHtml(t.category)}</span>` : ''}
          </div>
          ${t.description ? `<div class="card-notes">${escapeHtml(t.description)}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-edit="${t.id}" title="Edit">&#9998;</button>
          <button class="icon-btn" data-delete="${t.id}" title="Delete">&#128465;</button>
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
};
