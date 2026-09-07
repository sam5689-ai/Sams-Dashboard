// Contacts: the CRM backbone tying WhatsApp, email, meetings, and the
// interview pipeline together by person. Other modules call
// Contacts.upsert(...) whenever they see an email/phone/name (a new
// WhatsApp message, a synced email, a candidate being saved) so a single
// Contact record accumulates every channel that person has been seen on.
const Contacts = {
  search: '',

  init() {
    const addBtn = document.getElementById('addContactBtn');
    if (addBtn) addBtn.addEventListener('click', () => this.openForm());
    const searchInput = document.getElementById('contactSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.search = e.target.value.toLowerCase();
        this.render();
      });
    }
  },

  normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
  },

  normalizePhone(phone) {
    return (phone || '').replace(/\D/g, '');
  },

  findByEmail(email) {
    const norm = this.normalizeEmail(email);
    if (!norm) return null;
    return Store.getAll('contacts').find((c) => (c.emails || []).includes(norm)) || null;
  },

  findByPhone(phone) {
    const norm = this.normalizePhone(phone);
    if (!norm) return null;
    return Store.getAll('contacts').find((c) => (c.phones || []).includes(norm)) || null;
  },

  // Creates or updates a contact from any piece of identifying info seen
  // elsewhere in the app. Matches on email or phone if either is already
  // known; otherwise creates a new contact. Returns the resulting contact.
  upsert({ name, email, phone }) {
    const normEmail = this.normalizeEmail(email);
    const normPhone = this.normalizePhone(phone);
    let contact = (normEmail && this.findByEmail(normEmail)) || (normPhone && this.findByPhone(normPhone));

    // No shared email/phone found — fall back to an exact name match so the
    // same person seen on a new channel (e.g. WhatsApp after only ever
    // being known by email) merges into their existing contact instead of
    // creating a visible duplicate.
    if (!contact && name && name.trim()) {
      const normName = name.trim().toLowerCase();
      contact = Store.getAll('contacts').find((c) => (c.name || '').trim().toLowerCase() === normName) || null;
    }

    if (contact) {
      const patch = {};
      if (name && (!contact.name || contact.name === normEmail || contact.name === normPhone)) {
        patch.name = name;
      }
      if (normEmail && !(contact.emails || []).includes(normEmail)) {
        patch.emails = [...(contact.emails || []), normEmail];
      }
      if (normPhone && !(contact.phones || []).includes(normPhone)) {
        patch.phones = [...(contact.phones || []), normPhone];
      }
      if (Object.keys(patch).length) {
        contact = Store.update('contacts', contact.id, patch);
      }
      return contact;
    }

    return Store.add('contacts', {
      name: name || normEmail || normPhone || 'Unknown',
      emails: normEmail ? [normEmail] : [],
      phones: normPhone ? [normPhone] : [],
      notes: '',
    });
  },

  getFiltered() {
    let items = Store.getAll('contacts');
    if (this.search) {
      items = items.filter((c) =>
        [c.name, ...(c.emails || []), ...(c.phones || [])].join(' ').toLowerCase().includes(this.search)
      );
    }
    return items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  findLinkedCandidate(contact) {
    const candidates = Store.getAll('candidates');
    return candidates.find((c) => {
      if (c.name && contact.name && c.name.toLowerCase() === contact.name.toLowerCase()) return true;
      if (!c.contact) return false;
      const contactField = c.contact.toLowerCase();
      if ((contact.emails || []).some((e) => contactField.includes(e))) return true;
      const digitsOnly = this.normalizePhone(c.contact);
      if (digitsOnly && (contact.phones || []).some((p) => digitsOnly.includes(p) || p.includes(digitsOnly))) return true;
      return false;
    }) || null;
  },

  findRelatedTasks(contact) {
    return Store.getAll('tasks').filter((t) => {
      if (t.contactEmail && (contact.emails || []).includes(this.normalizeEmail(t.contactEmail))) return true;
      if (t.contactPhone && (contact.phones || []).includes(this.normalizePhone(t.contactPhone))) return true;
      return false;
    });
  },

  findRelatedMeetings(contact) {
    if (!contact.name) return [];
    const needle = contact.name.toLowerCase();
    return Store.getAll('meetings').filter((m) => (m.attendees || '').toLowerCase().includes(needle));
  },

  async findRelatedMessages(contact) {
    if (!(contact.phones || []).length) return [];
    try {
      const res = await fetch('/api/whatsapp-messages');
      if (!res.ok) return [];
      const data = await res.json();
      return (data.messages || []).filter((m) => contact.phones.includes(this.normalizePhone(m.from)));
    } catch (e) {
      return [];
    }
  },

  render() {
    const list = document.getElementById('contactsList');
    const items = this.getFiltered();

    if (!items.length) {
      list.innerHTML = '<div class="empty-state">No contacts yet. They\'ll appear automatically from WhatsApp, email, and candidates — or click "New Contact" to add one.</div>';
      return;
    }

    list.innerHTML = items.map((c) => this.cardHtml(c)).join('');
    list.querySelectorAll('[data-open-contact]').forEach((el) =>
      el.addEventListener('click', () => this.openDetail(el.dataset.openContact))
    );
  },

  cardHtml(c) {
    const candidate = this.findLinkedCandidate(c);
    const primary = (c.emails && c.emails[0]) || (c.phones && c.phones[0]) || '';
    return `
      <div class="card" data-open-contact="${c.id}" style="cursor:pointer;">
        <div class="card-main">
          <div class="card-title">
            ${escapeHtml(c.name || 'Unknown')}
            ${candidate ? `<span class="badge badge-${candidate.stage.replace(/\s+/g, '-')}">${escapeHtml(candidate.stage)}</span>` : ''}
          </div>
          <div class="card-meta">
            ${c.emails && c.emails.length ? `<span>${Icon.mail(14)} ${escapeHtml(c.emails.join(', '))}</span>` : ''}
            ${c.phones && c.phones.length ? `<span>${Icon.phone(14)} ${escapeHtml(c.phones.join(', '))}</span>` : ''}
          </div>
          ${!c.emails.length && !c.phones.length ? `<div class="card-notes">${escapeHtml(primary)}</div>` : ''}
        </div>
      </div>
    `;
  },

  async openDetail(id) {
    const contact = Store.get('contacts', id);
    if (!contact) return;

    Modal.open(`<h2>${escapeHtml(contact.name)}</h2><p style="color:var(--text-muted);font-size:13px;">Loading related activity…</p>`);

    const candidate = this.findLinkedCandidate(contact);
    const tasks = this.findRelatedTasks(contact);
    const meetings = this.findRelatedMeetings(contact);
    const messages = await this.findRelatedMessages(contact);

    const section = (title, itemsHtml) => `
      <div style="margin-top:16px;">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em;margin-bottom:8px;">${title}</div>
        ${itemsHtml}
      </div>
    `;

    const candidateHtml = candidate
      ? `<div class="mini-item"><strong>${escapeHtml(candidate.role || 'Candidate')} — ${escapeHtml(candidate.stage)}</strong><span>${candidate.interviewDate ? formatDate(candidate.interviewDate) : 'No interview date set'}</span></div>`
      : '<div class="empty-state">Not linked to a candidate</div>';

    const tasksHtml = tasks.length
      ? tasks.map((t) => `<div class="mini-item"><strong>${escapeHtml(t.title)}</strong><span>${t.status} · ${t.priority}${t.dueDate ? ' · due ' + formatDate(t.dueDate) : ''}</span></div>`).join('')
      : '<div class="empty-state">No related tasks</div>';

    const meetingsHtml = meetings.length
      ? meetings.map((m) => `<div class="mini-item"><strong>${escapeHtml(m.title)}</strong><span>${formatDate(m.date)}${m.time ? ' · ' + m.time : ''}</span></div>`).join('')
      : '<div class="empty-state">No related meetings</div>';

    const messagesHtml = messages.length
      ? messages.slice(0, 5).map((m) => `<div class="mini-item"><strong>${escapeHtml(m.text || '').slice(0, 80)}</strong><span>${new Date(m.timestamp).toLocaleString()}</span></div>`).join('')
      : '<div class="empty-state">No WhatsApp messages</div>';

    Modal.open(`
      <h2>${escapeHtml(contact.name)}</h2>
      <div class="card-meta" style="margin-bottom:4px;">
        ${(contact.emails || []).map((e) => `<span>${Icon.mail(14)} ${escapeHtml(e)}</span>`).join('')}
        ${(contact.phones || []).map((p) => `<span>${Icon.phone(14)} ${escapeHtml(p)}</span>`).join('')}
      </div>

      <form id="contactEditForm">
        <div class="form-row">
          <label>Name</label>
          <input type="text" name="name" value="${escapeAttr(contact.name || '')}" />
        </div>
        <div class="form-row">
          <label>Notes</label>
          <textarea name="notes" rows="2">${escapeHtml(contact.notes || '')}</textarea>
        </div>
        <div class="modal-actions" style="margin-top:0;">
          <button type="button" class="danger-btn" id="deleteContactBtn">Delete</button>
          <button type="submit" class="primary-btn">Save</button>
        </div>
      </form>

      ${section('Candidate', candidateHtml)}
      ${section(`Tasks (${tasks.length})`, `<div class="mini-list">${tasksHtml}</div>`)}
      ${section(`Meetings (${meetings.length})`, `<div class="mini-list">${meetingsHtml}</div>`)}
      ${section(`WhatsApp Messages (${messages.length})`, `<div class="mini-list">${messagesHtml}</div>`)}
    `);

    document.getElementById('contactEditForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      Store.update('contacts', contact.id, data);
      Modal.close();
      this.render();
      Toast.show('Contact updated');
    });

    document.getElementById('deleteContactBtn').addEventListener('click', () => {
      if (!confirm('Delete this contact?')) return;
      Store.remove('contacts', contact.id);
      Modal.close();
      this.render();
      Toast.show('Contact deleted');
    });
  },

  openForm() {
    Modal.open(`
      <h2>New Contact</h2>
      <form id="newContactForm">
        <div class="form-row">
          <label>Name *</label>
          <input type="text" name="name" required />
        </div>
        <div class="form-row">
          <label>Email</label>
          <input type="email" name="email" />
        </div>
        <div class="form-row">
          <label>Phone</label>
          <input type="tel" name="phone" />
        </div>
        <div class="form-row">
          <label>Notes</label>
          <textarea name="notes" rows="2"></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" id="cancelBtn">Cancel</button>
          <button type="submit" class="primary-btn">Add Contact</button>
        </div>
      </form>
    `);

    document.getElementById('cancelBtn').addEventListener('click', () => Modal.close());
    document.getElementById('newContactForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      this.upsert({ name: data.name, email: data.email, phone: data.phone });
      if (data.notes) {
        const c = this.findByEmail(data.email) || this.findByPhone(data.phone);
        if (c) Store.update('contacts', c.id, { notes: data.notes });
      }
      Modal.close();
      this.render();
      Toast.show('Contact added');
    });
  },
};
