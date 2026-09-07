// Candidate Interview Tracker module
const Interviews = {
  STAGES: ['Screening', 'Phone Interview', 'Technical', 'Onsite', 'Offer', 'Hired'],
  stageFilter: 'all',
  search: '',

  init() {
    document.getElementById('addCandidateBtn').addEventListener('click', () => this.openForm());
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
            ${c.role ? `<span>&#128188; ${escapeHtml(c.role)}</span>` : ''}
            ${c.interviewDate ? `<span>&#128197; ${formatDate(c.interviewDate)}${c.interviewTime ? ' ' + c.interviewTime : ''}</span>` : ''}
            ${c.interviewer ? `<span>&#128100; ${escapeHtml(c.interviewer)}</span>` : ''}
            ${c.rating ? `<span>&#11088; ${c.rating}/5</span>` : ''}
          </div>
          ${c.notes ? `<div class="card-notes">${escapeHtml(c.notes)}</div>` : ''}
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-edit="${c.id}" title="Edit">&#9998;</button>
          <button class="icon-btn" data-delete="${c.id}" title="Delete">&#128465;</button>
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
              ${c.interviewDate ? `<span>&#128197; ${formatDate(c.interviewDate)}</span>` : ''}
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
};
