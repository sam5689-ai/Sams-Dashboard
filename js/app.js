// Shared helpers
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const Modal = {
  open(html) {
    document.getElementById('modal').innerHTML = html;
    document.getElementById('modalOverlay').classList.add('active');
  },
  close() {
    document.getElementById('modalOverlay').classList.remove('active');
    document.getElementById('modal').innerHTML = '';
  },
};

const Toast = {
  show(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._t);
    this._t = setTimeout(() => el.classList.remove('show'), 2200);
  },
};

const App = {
  init() {
    this.initNav();
    this.initTheme();
    this.initModalOverlay();
    this.initExportImport();
    this.updateDate();

    Scheduler.init();
    Interviews.init();
    Tasks.init();

    this.refreshOverview();
  },

  initNav() {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => this.showView(btn.dataset.view));
    });
    document.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => this.showView(btn.dataset.goto));
    });

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.querySelector('.main').addEventListener('click', () => sidebar.classList.remove('open'));
  },

  showView(view) {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    const titles = {
      overview: 'Overview',
      scheduler: 'Meeting Scheduler',
      interviews: 'Interview Tracker',
      tasks: 'Task Management',
    };
    document.getElementById('viewTitle').textContent = titles[view] || view;
    if (view === 'overview') this.refreshOverview();
  },

  initTheme() {
    const saved = localStorage.getItem(Store.KEYS.theme) || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    document.getElementById('themeToggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(Store.KEYS.theme, next);
    });
  },

  initModalOverlay() {
    const overlay = document.getElementById('modalOverlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) Modal.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') Modal.close();
    });
  },

  initExportImport() {
    document.getElementById('exportBtn').addEventListener('click', () => {
      Store.exportAll();
      Toast.show('Backup downloaded');
    });
    document.getElementById('importInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result);
          Store.importAll(json);
          Scheduler.render();
          Interviews.render();
          Tasks.render();
          this.refreshOverview();
          Toast.show('Data imported successfully');
        } catch (err) {
          Toast.show('Import failed: invalid file');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  },

  updateDate() {
    const el = document.getElementById('topbarDate');
    el.textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  },

  refreshOverview() {
    const meetings = Store.getAll('meetings');
    const candidates = Store.getAll('candidates');
    const tasks = Store.getAll('tasks');
    const todayStr = new Date().toISOString().slice(0, 10);

    const upcomingMeetings = meetings
      .filter((m) => `${m.date}T${m.time || '00:00'}` >= `${todayStr}T00:00`)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

    const activeCandidates = candidates.filter((c) => c.stage !== 'Hired' && c.stage !== 'Rejected');

    const openTasks = tasks.filter((t) => t.status !== 'done');
    const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < todayStr);
    const dueSoonTasks = openTasks
      .slice()
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

    // Stat cards
    document.getElementById('statGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${meetings.filter((m) => m.date === todayStr).length}</div>
        <div class="stat-label">Meetings Today</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${activeCandidates.length}</div>
        <div class="stat-label">Candidates in Pipeline</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${openTasks.length}</div>
        <div class="stat-label">Open Tasks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:${overdueTasks.length ? 'var(--danger)' : 'inherit'}">${overdueTasks.length}</div>
        <div class="stat-label">Overdue Tasks</div>
      </div>
    `;

    // Overview meetings
    const meetingsEl = document.getElementById('overviewMeetings');
    meetingsEl.innerHTML = upcomingMeetings.length
      ? upcomingMeetings.slice(0, 5).map((m) => `
        <div class="mini-item">
          <strong>${escapeHtml(m.title)}</strong>
          <span>${formatDate(m.date)}${m.time ? ' · ' + m.time : ''}${m.location ? ' · ' + escapeHtml(m.location) : ''}</span>
        </div>
      `).join('')
      : '<div class="empty-state">No upcoming meetings</div>';

    // Overview candidates
    const candidatesEl = document.getElementById('overviewCandidates');
    candidatesEl.innerHTML = activeCandidates.length
      ? activeCandidates.slice(0, 5).map((c) => `
        <div class="mini-item">
          <strong>${escapeHtml(c.name)} — ${escapeHtml(c.stage)}</strong>
          <span>${escapeHtml(c.role || '')}${c.interviewDate ? ' · ' + formatDate(c.interviewDate) : ''}</span>
        </div>
      `).join('')
      : '<div class="empty-state">No active candidates</div>';

    // Overview tasks
    const tasksEl = document.getElementById('overviewTasks');
    tasksEl.innerHTML = dueSoonTasks.length
      ? dueSoonTasks.slice(0, 5).map((t) => {
          const isOverdue = t.dueDate && t.dueDate < todayStr;
          return `
            <div class="mini-item">
              <strong>${escapeHtml(t.title)}</strong>
              <span class="${isOverdue ? 'overdue' : ''}">${t.dueDate ? formatDate(t.dueDate) : 'No due date'} · ${t.priority}</span>
            </div>
          `;
        }).join('')
      : '<div class="empty-state">No open tasks</div>';
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
