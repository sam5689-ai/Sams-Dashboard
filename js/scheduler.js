// Meeting Scheduler module
const Scheduler = {
  filter: 'upcoming',
  search: '',

  init() {
    document.getElementById('addMeetingBtn').addEventListener('click', () => this.openForm());
    document.getElementById('meetingFilter').addEventListener('change', (e) => {
      this.filter = e.target.value;
      this.render();
    });
    document.getElementById('meetingSearch').addEventListener('input', (e) => {
      this.search = e.target.value.toLowerCase();
      this.render();
    });
    this.render();
  },

  getFiltered() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    let items = Store.getAll('meetings');

    if (this.filter === 'today') {
      items = items.filter((m) => m.date === todayStr);
    } else if (this.filter === 'upcoming') {
      items = items.filter((m) => `${m.date}T${m.time || '00:00'}` >= `${todayStr}T00:00`);
    } else if (this.filter === 'past') {
      items = items.filter((m) => `${m.date}T${m.time || '00:00'}` < `${todayStr}T00:00`);
    }

    if (this.search) {
      items = items.filter((m) =>
        [m.title, m.attendees, m.location, m.notes].join(' ').toLowerCase().includes(this.search)
      );
    }

    return items.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  },

  render() {
    const list = document.getElementById('meetingList');
    const items = this.getFiltered();

    if (items.length === 0) {
      list.innerHTML = '<div class="empty-state">No meetings found. Click "New Meeting" to schedule one.</div>';
      return;
    }

    list.innerHTML = items.map((m) => this.cardHtml(m)).join('');

    list.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => this.openForm(btn.dataset.edit))
    );
    list.querySelectorAll('[data-delete]').forEach((btn) =>
      btn.addEventListener('click', () => this.deleteMeeting(btn.dataset.delete))
    );
  },

  cardHtml(m) {
    const dateLabel = formatDate(m.date);
    const isPast = `${m.date}T${m.time || '00:00'}` < new Date().toISOString();
    return `
      <div class="card">
        <div class="card-main">
          <div class="card-title">${escapeHtml(m.title)}</div>
          <div class="card-meta">
            <span class="${isPast ? 'overdue' : ''}">&#128197; ${dateLabel}${m.time ? ' at ' + m.time : ''}</span>
            ${m.attendees ? `<span>&#128101; ${escapeHtml(m.attendees)}</span>` : ''}
            ${m.location ? `<span>&#128205; ${escapeHtml(m.location)}</span>` : ''}
          </div>
          ${m.notes ? `<div class="card-notes">${escapeHtml(m.notes)}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-edit="${m.id}" title="Edit">&#9998;</button>
          <button class="icon-btn" data-delete="${m.id}" title="Delete">&#128465;</button>
        </div>
      </div>
    `;
  },

  openForm(id) {
    const existing = id ? Store.get('meetings', id) : null;
    const title = existing ? 'Edit Meeting' : 'New Meeting';

    Modal.open(`
      <h2>${title}</h2>
      <form id="meetingForm">
        <div class="form-row">
          <label>Title *</label>
          <input type="text" name="title" required value="${existing ? escapeAttr(existing.title) : ''}" placeholder="e.g. Weekly sync with design team" />
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label>Date *</label>
            <input type="date" name="date" required value="${existing ? existing.date : ''}" />
          </div>
          <div class="form-row">
            <label>Time</label>
            <input type="time" name="time" value="${existing ? existing.time || '' : ''}" />
          </div>
        </div>
        <div class="form-row">
          <label>Attendees</label>
          <input type="text" name="attendees" value="${existing ? escapeAttr(existing.attendees || '') : ''}" placeholder="Comma separated names" />
        </div>
        <div class="form-row">
          <label>Location / Link</label>
          <input type="text" name="location" value="${existing ? escapeAttr(existing.location || '') : ''}" placeholder="Room, Zoom link, etc." />
        </div>
        <div class="form-row">
          <label>Notes</label>
          <textarea name="notes" rows="3">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" id="cancelBtn">Cancel</button>
          <button type="submit" class="primary-btn">${existing ? 'Save Changes' : 'Add Meeting'}</button>
        </div>
      </form>
    `);

    document.getElementById('cancelBtn').addEventListener('click', () => Modal.close());
    document.getElementById('meetingForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      if (existing) {
        Store.update('meetings', existing.id, data);
        Toast.show('Meeting updated');
      } else {
        Store.add('meetings', data);
        Toast.show('Meeting scheduled');
      }
      Modal.close();
      this.render();
      App.refreshOverview();
    });
  },

  deleteMeeting(id) {
    if (!confirm('Delete this meeting?')) return;
    Store.remove('meetings', id);
    this.render();
    App.refreshOverview();
    Toast.show('Meeting deleted');
  },
};
