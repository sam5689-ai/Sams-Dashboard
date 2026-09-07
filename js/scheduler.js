// Meeting Scheduler module
const Scheduler = {
  filter: 'upcoming',
  search: '',

  init() {
    document.getElementById('addMeetingBtn').addEventListener('click', () => this.openForm());
    const syncBtn = document.getElementById('syncFromGoogleBtn');
    if (syncBtn) syncBtn.addEventListener('click', () => this.syncFromGoogle());
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

  timeRangeLabel(m) {
    if (!m.time) return '';
    const duration = Number(m.duration) || 30;
    const [h, min] = m.time.split(':').map(Number);
    const end = new Date(2000, 0, 1, h, min + duration);
    const pad = (n) => String(n).padStart(2, '0');
    return `${m.time}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
  },

  cardHtml(m) {
    const dateLabel = formatDate(m.date);
    const isPast = `${m.date}T${m.time || '00:00'}` < new Date().toISOString();
    return `
      <div class="card">
        <div class="card-main">
          <div class="card-title">${escapeHtml(m.title)} ${m.googleEventId ? '<span class="badge badge-google" title="Synced to Google Calendar">Google Calendar</span>' : ''}</div>
          <div class="card-meta">
            <span class="${isPast ? 'overdue' : ''}">${Icon.calendar(14)} ${dateLabel}${m.time ? ' at ' + this.timeRangeLabel(m) : ''}</span>
            ${m.attendees ? `<span>${Icon.users(14)} ${escapeHtml(m.attendees)}</span>` : ''}
            ${m.location ? `<span>${Icon.mapPin(14)} ${escapeHtml(m.location)}</span>` : ''}
          </div>
          ${m.meetLink ? `<div class="card-notes"><a href="${escapeAttr(m.meetLink)}" target="_blank" rel="noopener">${Icon.video(14)} ${escapeHtml(m.meetLink)}</a></div>` : ''}
          ${m.notes ? `<div class="card-notes">${escapeHtml(m.notes)}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-edit="${m.id}" title="Edit">${Icon.edit(15)}</button>
          <button class="icon-btn" data-delete="${m.id}" title="Delete">${Icon.trash(15)}</button>
        </div>
      </div>
    `;
  },

  todayStr() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  },

  DURATION_OPTIONS: [
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
    { value: 45, label: '45 min' },
    { value: 60, label: '1 hour' },
    { value: 90, label: '1.5 hours' },
    { value: 120, label: '2 hours' },
  ],

  openForm(id) {
    const existing = id ? Store.get('meetings', id) : null;
    const title = existing ? 'Edit Meeting' : 'New Meeting';
    const currentDuration = existing ? (existing.duration || 30) : 30;
    const durationOptions = this.DURATION_OPTIONS
      .map((d) => `<option value="${d.value}" ${Number(currentDuration) === d.value ? 'selected' : ''}>${d.label}</option>`)
      .join('');

    Modal.open(`
      <h2>${title}</h2>
      <form id="meetingForm">
        <div class="form-row">
          <label>Title *</label>
          <input type="text" name="title" required value="${existing ? escapeAttr(existing.title) : 'Outwork Interview'}" placeholder="e.g. Weekly sync with design team" />
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label>Date *</label>
            <input type="date" name="date" required value="${existing ? existing.date : this.todayStr()}" />
          </div>
          <div class="form-row">
            <label>Time</label>
            <input type="time" name="time" value="${existing ? existing.time || '' : ''}" />
          </div>
          <div class="form-row">
            <label>Duration</label>
            <select name="duration">${durationOptions}</select>
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
        <div class="form-row" style="flex-direction:row;align-items:center;gap:8px;">
          <input type="checkbox" name="syncToGoogle" id="syncToGoogle" style="width:auto;" ${(existing ? !!existing.googleEventId : GoogleCalendar.isConnected()) ? 'checked' : ''} />
          <label for="syncToGoogle" style="margin:0;">Sync to Google Calendar &amp; add a Meet link</label>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" id="cancelBtn">Cancel</button>
          <button type="submit" class="primary-btn" id="meetingSubmitBtn">${existing ? 'Save Changes' : 'Add Meeting'}</button>
        </div>
      </form>
    `);

    document.getElementById('cancelBtn').addEventListener('click', () => Modal.close());
    document.getElementById('meetingForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const data = Object.fromEntries(new FormData(form).entries());
      const wantSync = !!data.syncToGoogle;
      delete data.syncToGoogle;

      const finish = (googleFields) => {
        const payload = { ...data, ...(googleFields || {}) };
        if (!wantSync) {
          payload.googleEventId = null;
          payload.meetLink = null;
          payload.htmlLink = null;
        }
        const saved = existing
          ? Store.update('meetings', existing.id, payload)
          : Store.add('meetings', payload);

        this.render();
        App.refreshOverview();

        if (wantSync && googleFields && googleFields.meetLink) {
          this.showMeetLinkConfirmation(saved);
        } else {
          Toast.show(existing ? 'Meeting updated' : 'Meeting scheduled');
          Modal.close();
        }
      };

      if (!wantSync) {
        finish(null);
        return;
      }

      const submitBtn = document.getElementById('meetingSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Syncing…';

      GoogleCalendar.withConnection(async () => {
        try {
          const merged = { ...(existing || {}), ...data };
          const result = existing && existing.googleEventId
            ? await GoogleCalendar.updateEventForMeeting({ ...merged, googleEventId: existing.googleEventId })
            : await GoogleCalendar.createEventForMeeting(merged);
          finish(result);
        } catch (err) {
          console.error(err);
          Toast.show(err.message || 'Failed to sync with Google Calendar');
          submitBtn.disabled = false;
          submitBtn.textContent = existing ? 'Save Changes' : 'Add Meeting';
        }
      });
    });
  },

  showMeetLinkConfirmation(meeting) {
    Modal.open(`
      <h2>Meeting scheduled</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-top:-8px;">Here's the Google Meet link — copy it or share it with attendees.</p>
      <div class="form-row">
        <label>Google Meet link</label>
        <input type="text" id="meetLinkDisplay" value="${escapeAttr(meeting.meetLink)}" readonly />
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-btn" id="copyLinkBtn">Copy Link</button>
        <button type="button" class="primary-btn" id="doneBtn">Done</button>
      </div>
    `);

    const input = document.getElementById('meetLinkDisplay');
    input.addEventListener('click', () => input.select());

    document.getElementById('copyLinkBtn').addEventListener('click', () => {
      input.select();
      const copied = () => Toast.show('Link copied to clipboard');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(meeting.meetLink).then(copied).catch(() => {
          document.execCommand('copy');
          copied();
        });
      } else {
        document.execCommand('copy');
        copied();
      }
    });

    document.getElementById('doneBtn').addEventListener('click', () => Modal.close());
  },

  // Core pull-sync, shared by the manual button and the automatic background sync.
  async performSync() {
    const events = await GoogleCalendar.listUpcomingEvents(60);
    const existing = Store.getAll('meetings');
    let added = 0;
    let updated = 0;
    events.forEach((ev) => {
      const meetingData = GoogleCalendar.eventToMeeting(ev);
      const match = existing.find((m) => m.googleEventId === ev.id);
      if (match) {
        Store.update('meetings', match.id, meetingData);
        updated++;
      } else {
        Store.add('meetings', meetingData);
        added++;
      }
    });
    this.render();
    App.refreshOverview();
    return { added, updated };
  },

  // Manual "Sync from Google" button: prompts to (re)connect if needed, always gives feedback.
  syncFromGoogle() {
    const btn = document.getElementById('syncFromGoogleBtn');
    GoogleCalendar.withConnection(async () => {
      if (btn) { btn.disabled = true; btn.innerHTML = `${Icon.download(15)} Syncing…`; }
      try {
        const { added, updated } = await this.performSync();
        Toast.show(`Synced from Google Calendar: ${added} added, ${updated} updated`);
      } catch (err) {
        console.error(err);
        Toast.show(err.message || 'Failed to sync from Google Calendar');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `${Icon.download(15)} Sync from Google`; }
      }
    });
  },

  // Automatic background sync: only runs if already signed in (never pops up a
  // consent prompt on its own), and stays quiet unless something changed.
  autoSyncIfConnected() {
    if (!GoogleCalendar.getToken()) return;
    this.performSync()
      .then(({ added, updated }) => {
        if (added || updated) Toast.show(`Google Calendar synced: ${added} added, ${updated} updated`);
      })
      .catch((err) => console.warn('Background Google Calendar sync failed', err));
  },

  deleteMeeting(id) {
    const meeting = Store.get('meetings', id);
    const msg = meeting && meeting.googleEventId
      ? 'Delete this meeting? This will also remove it from Google Calendar.'
      : 'Delete this meeting?';
    if (!confirm(msg)) return;
    if (meeting && meeting.googleEventId && GoogleCalendar.getToken()) {
      GoogleCalendar.deleteEventForMeeting(meeting);
    }
    Store.remove('meetings', id);
    this.render();
    App.refreshOverview();
    Toast.show('Meeting deleted');
  },
};
