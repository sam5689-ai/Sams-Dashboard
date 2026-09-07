// Gmail integration: finds emails labeled "ToDashboard", reads them, and
// hands them off to be turned into tasks. Uses the same Google connection
// (token + scope) as GoogleCalendar.
const Gmail = {
  LABEL_NAME: 'ToDashboard',
  API_BASE: 'https://gmail.googleapis.com/gmail/v1/users/me',

  labelId: null,

  async ensureLabelId() {
    if (this.labelId) return this.labelId;
    const result = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/labels`);
    const existing = (result.labels || []).find((l) => l.name === this.LABEL_NAME);
    if (existing) {
      this.labelId = existing.id;
      return this.labelId;
    }
    const created = await GoogleCalendar.rawRequest('POST', `${this.API_BASE}/labels`, {
      name: this.LABEL_NAME,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    });
    this.labelId = created.id;
    return this.labelId;
  },

  async listLabeledMessageIds(labelId) {
    const result = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/messages?labelIds=${labelId}&maxResults=20`);
    return (result.messages || []).map((m) => m.id);
  },

  decodeBase64Url(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    try {
      return decodeURIComponent(escape(atob(b64)));
    } catch (e) {
      try {
        return atob(b64);
      } catch (e2) {
        return '';
      }
    }
  },

  extractBody(payload) {
    if (!payload) return '';
    if (payload.body && payload.body.data && !payload.parts) {
      return this.decodeBase64Url(payload.body.data);
    }
    if (payload.parts) {
      const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
      if (plain && plain.body && plain.body.data) return this.decodeBase64Url(plain.body.data);

      const html = payload.parts.find((p) => p.mimeType === 'text/html');
      if (html && html.body && html.body.data) {
        const raw = this.decodeBase64Url(html.body.data);
        return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      for (const part of payload.parts) {
        const nested = this.extractBody(part);
        if (nested) return nested;
      }
    }
    return '';
  },

  async getMessage(id) {
    const msg = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/messages/${id}?format=full`);
    const headers = (msg.payload && msg.payload.headers) || [];
    const getHeader = (name) => (headers.find((h) => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
    return {
      id: msg.id,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      date: getHeader('Date'),
      body: this.extractBody(msg.payload).slice(0, 6000),
    };
  },

  async removeLabel(messageId, labelId) {
    await GoogleCalendar.rawRequest('POST', `${this.API_BASE}/messages/${messageId}/modify`, {
      removeLabelIds: [labelId],
    });
  },
};
