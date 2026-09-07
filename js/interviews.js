// Candidate Interview Tracker module
const Interviews = {
  STAGES: ['Screening', 'Phone Interview', 'Technical', 'Onsite', 'Offer', 'Hired'],
  stageFilter: 'all',
  search: '',

  HEADER_ALIASES: {
    name: ['name', 'full name', 'candidate', 'candidate name', 'applicant', 'applicant name'],
    role: ['role', 'position', 'job title', 'applied for', 'vacancy', 'job'],
    stage: ['stage', 'status', 'application status'],
    interviewDate: ['interview date', 'date', 'applied date', 'application date'],
    interviewTime: ['interview time', 'time'],
    interviewer: ['interviewer', 'assigned to'],
    rating: ['rating', 'score'],
    contact: ['contact', 'email', 'phone', 'mobile', 'phone number', 'email address'],
    notes: ['notes', 'note', 'comment', 'comments', 'remarks'],
  },

  STAGE_ALIASES: {
    applied: 'Screening', new: 'Screening', screening: 'Screening', shortlisted: 'Screening', viewed: 'Screening',
    'phone interview': 'Phone Interview', 'phone screen': 'Phone Interview', call: 'Phone Interview',
    technical: 'Technical', 'technical interview': 'Technical', test: 'Technical', assessment: 'Technical',
    onsite: 'Onsite', interview: 'Onsite', 'in-person': 'Onsite', 'face to face': 'Onsite', shortlist: 'Onsite',
    offer: 'Offer', offered: 'Offer', hired: 'Hired', accepted: 'Hired',
    rejected: 'Rejected', declined: 'Rejected', 'not selected': 'Rejected', 'no show': 'Rejected', withdrawn: 'Rejected',
  },

  init() {
    document.getElementById('addCandidateBtn').addEventListener('click', () => this.openForm());
    const importBtn = document.getElementById('importCandidatesBtn');
    if (importBtn) importBtn.addEventListener('click', () => this.openImportModal());
    document.getElementById('candidateStageFilter').addEventListener('change', (e) => {
      this.stageFilter = e.target.value;
      this.render();
    });
    document.getElementById('candidateSearch').addEventListener('input', (e) => {
      this.search = e.target.value.toLowerCase();
      this.render();
    });
    this.render();
  },

  getFiltered() {
    let items = Store.getAll('candidates');
    if (this.search) {
      items = items.filter((c) =>
        [c.name, c.role, c.interviewer, c.notes].join(' ').toLowerCase().includes(this.search)
      );
    }
    return items;
  },

  render() {
    const items = this.getFiltered();

    if (this.stageFilter !== 'all') {
      this.renderList(items.filter((c) => c.stage === this.stageFilter));
      return;
    }
    this.renderBoard(items);
  },

  renderList(items) {
    const board = document.getElementById('pipelineBoard');
    board.className = 'card-list';
    if (items.length === 0) {
      board.innerHTML = '<div class="empty-state">No candidates in this stage.</div>';
      return;
    }
    board.innerHTML = items.map((c) => this.cardHtml(c)).join('');
    board.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', () => this.openForm(btn.dataset.edit))
    );
    board.querySelectorAll('[data-delete]').forEach((btn) =>
      btn.addEventListener('click', () => this.deleteCandidate(btn.dataset.delete))
    );
  },

  cardHtml(c) {
    const badgeClass = 'badge-' + c.stage.replace(/\s+/g, '-');
    return `
      <div class="card">
        <div class="card-main">
          <div class="card-title">${escapeHtml(c.name)} <span class="badge ${badgeClass}">${c.stage}</span></div>
          <div class="card-meta">
            ${c.role ? `<span>${Icon.briefcase(14)} ${escapeHtml(c.role)}</span>` : ''}
            ${c.interviewDate ? `<span>${Icon.calendar(14)} ${formatDate(c.interviewDate)}${c.interviewTime ? ' ' + c.interviewTime : ''}</span>` : ''}
            ${c.interviewer ? `<span>${Icon.user(14)} ${escapeHtml(c.interviewer)}</span>` : ''}
            ${c.rating ? `<span>${Icon.star(14)} ${c.rating}/5</span>` : ''}
          </div>
          ${c.notes ? `<div class="card-notes">${escapeHtml(c.notes)}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-edit="${c.id}" title="Edit">${Icon.edit(15)}</button>
          <button class="icon-btn" data-delete="${c.id}" title="Delete">${Icon.trash(15)}</button>
        </div>
      </div>
    `;
  },

  renderBoard(items) {
    const board = document.getElementById('pipelineBoard');
    board.className = 'pipeline';
    const allStages = [...this.STAGES, 'Rejected'];

    board.innerHTML = allStages.map((stage) => {
      const stageItems = items.filter((c) => c.stage === stage);
      return `
        <div class="pipeline-col">
          <h3>${stage} <span>${stageItems.length}</span></h3>
          ${stageItems.map((c) => `
            <div class="pipeline-card" data-open="${c.id}">
              <strong>${escapeHtml(c.name)}</strong>
              <span>${escapeHtml(c.role || '')}</span>
              ${c.interviewDate ? `<span>${Icon.calendar(13)} ${formatDate(c.interviewDate)}</span>` : ''}
            </div>
          `).join('') || '<div class="empty-state" style="padding:8px 0;">Empty</div>'}
        </div>
      `;
    }).join('');

    board.querySelectorAll('[data-open]').forEach((el) =>
      el.addEventListener('click', () => this.openForm(el.dataset.open))
    );
  },

  openForm(id) {
    const existing = id ? Store.get('candidates', id) : null;
    const title = existing ? 'Edit Candidate' : 'New Candidate';
    const stageOptions = [...this.STAGES, 'Rejected']
      .map((s) => `<option value="${s}" ${existing && existing.stage === s ? 'selected' : ''}>${s}</option>`)
      .join('');

    Modal.open(`
      <h2>${title}</h2>
      <form id="candidateForm">
        <div class="form-row">
          <label>Candidate Name *</label>
          <input type="text" name="name" required value="${existing ? escapeAttr(existing.name) : ''}" />
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label>Role Applied For</label>
            <input type="text" name="role" value="${existing ? escapeAttr(existing.role || '') : ''}" />
          </div>
          <div class="form-row">
            <label>Stage</label>
            <select name="stage">${stageOptions}</select>
          </div>
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label>Interview Date</label>
            <input type="date" name="interviewDate" value="${existing ? existing.interviewDate || '' : ''}" />
          </div>
          <div class="form-row">
            <label>Interview Time</label>
            <input type="time" name="interviewTime" value="${existing ? existing.interviewTime || '' : ''}" />
          </div>
        </div>
        <div class="form-row-inline">
          <div class="form-row">
            <label>Interviewer</label>
            <input type="text" name="interviewer" value="${existing ? escapeAttr(existing.interviewer || '') : ''}" />
          </div>
          <div class="form-row">
            <label>Rating (1-5)</label>
            <input type="number" name="rating" min="1" max="5" value="${existing ? existing.rating || '' : ''}" />
          </div>
        </div>
        <div class="form-row">
          <label>Contact (email / phone)</label>
          <input type="text" name="contact" value="${existing ? escapeAttr(existing.contact || '') : ''}" />
        </div>
        <div class="form-row">
          <label>Notes</label>
          <textarea name="notes" rows="3">${existing ? escapeHtml(existing.notes || '') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" id="cancelBtn">Cancel</button>
          <button type="submit" class="primary-btn">${existing ? 'Save Changes' : 'Add Candidate'}</button>
        </div>
      </form>
    `);

    document.getElementById('cancelBtn').addEventListener('click', () => Modal.close());
    document.getElementById('candidateForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());

      if (data.name) {
        const contactField = (data.contact || '').trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactField);
        Contacts.upsert({
          name: data.name,
          email: isEmail ? contactField : '',
          phone: !isEmail ? contactField : '',
        });
      }

      if (existing) {
        Store.update('candidates', existing.id, data);
        Toast.show('Candidate updated');
      } else {
        Store.add('candidates', data);
        Toast.show('Candidate added');
      }
      Modal.close();
      this.render();
      App.refreshOverview();
    });
  },

  deleteCandidate(id) {
    if (!confirm('Delete this candidate?')) return;
    Store.remove('candidates', id);
    this.render();
    App.refreshOverview();
    Toast.show('Candidate removed');
  },

  // --- Import (no API needed): paste a copied table or upload a CSV file ---

  parseTable(text) {
    const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length);
    if (!lines.length) return [];
    const delimiter = lines[0].includes('\t') ? '\t' : ',';

    const splitLine = (line) => {
      if (delimiter === '\t') return line.split('\t').map((c) => c.trim());
      const result = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      result.push(cur.trim());
      return result;
    };

    return lines.map(splitLine);
  },

  buildColumnMap(headerRow) {
    const map = {};
    headerRow.forEach((h, idx) => {
      const norm = h.toLowerCase().trim();
      for (const [field, aliases] of Object.entries(this.HEADER_ALIASES)) {
        if (aliases.includes(norm)) {
          map[idx] = field;
          break;
        }
      }
    });
    return map;
  },

  normalizeStage(value) {
    if (!value) return 'Screening';
    const norm = value.toLowerCase().trim();
    if (this.STAGE_ALIASES[norm]) return this.STAGE_ALIASES[norm];
    const exact = [...this.STAGES, 'Rejected'].find((s) => s.toLowerCase() === norm);
    return exact || 'Screening';
  },

  normalizeDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  parseImportText(text) {
    const rows = this.parseTable(text);
    if (!rows.length) return [];

    const colMap = this.buildColumnMap(rows[0]);
    const matchedCount = Object.keys(colMap).length;
    let dataRows = rows;
    let useColMap = colMap;

    if (matchedCount === 0) {
      // No recognizable header — assume every row is data, using positional fallback.
      useColMap = { 0: 'name', 1: 'role', 2: 'contact', 3: 'notes' };
    } else {
      dataRows = rows.slice(1);
    }

    const candidates = [];
    for (const row of dataRows) {
      if (row.every((c) => !c)) continue;
      const c = { name: '', role: '', stage: 'Screening', interviewDate: '', interviewTime: '', interviewer: '', rating: '', contact: '', notes: '' };
      row.forEach((cell, idx) => {
        const field = useColMap[idx];
        if (!field || !cell) return;
        if (field === 'stage') c.stage = this.normalizeStage(cell);
        else if (field === 'interviewDate') c.interviewDate = this.normalizeDate(cell);
        else c[field] = cell;
      });
      if (c.name) candidates.push(c);
    }
    return candidates;
  },

  openImportModal() {
    Modal.open(`
      <h2>Import Candidates</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-top:-8px;">
        No API needed. On your Wuzzuf employer dashboard (or any hiring site), select the
        applicant table and copy it, then paste below — or upload a CSV/Excel export if one's
        available. Columns like Name, Role, Status, Email, and Interview Date are auto-detected.
      </p>
      <div class="form-row">
        <label>Paste candidate data</label>
        <textarea id="importText" rows="8" placeholder="Name, Role, Status, Email&#10;Jordan Lee, Backend Engineer, Interview, jordan@email.com"></textarea>
      </div>
      <div class="form-row">
        <label>...or upload a CSV file</label>
        <input type="file" id="importFile" accept=".csv,text/csv,text/plain" />
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-btn" id="cancelBtn">Cancel</button>
        <button type="button" class="primary-btn" id="doImportBtn">Import</button>
      </div>
    `);

    document.getElementById('cancelBtn').addEventListener('click', () => Modal.close());
    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        document.getElementById('importText').value = reader.result;
      };
      reader.readAsText(file);
    });
    document.getElementById('doImportBtn').addEventListener('click', () => {
      const text = document.getElementById('importText').value.trim();
      if (!text) {
        Toast.show('Paste some data or choose a file first');
        return;
      }
      const candidates = this.parseImportText(text);
      if (!candidates.length) {
        Toast.show('Could not find any candidate rows to import');
        return;
      }
      candidates.forEach((c) => {
        if (c.name) {
          const contactField = (c.contact || '').trim();
          const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactField);
          Contacts.upsert({
            name: c.name,
            email: isEmail ? contactField : '',
            phone: !isEmail ? contactField : '',
          });
        }
        Store.add('candidates', c);
      });
      Modal.close();
      this.render();
      App.refreshOverview();
      Toast.show(`Imported ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`);
    });
  },
};
