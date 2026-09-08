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

  // Replies in a thread include all the earlier quoted messages below the
  // new content (e.g. "On Mon, Jan 1, Sam wrote: > ..."). Cut the body at
  // the first such marker so only the newest message gets parsed.
  stripQuotedText(text) {
    if (!text) return '';
    const markers = [
      /\n[ \t]*On .{0,120} wrote:[ \t]*\n/i,
      /\n[ \t]*-{2,}[ \t]*Original Message[ \t]*-{2,}/i,
      /\n[ \t]*From:[ \t]*.+\n[ \t]*Sent:[ \t]*.+\n[ \t]*To:[ \t]*.+\n[ \t]*Subject:[ \t]*.+/i,
      /\n[ \t]*_{5,}[ \t]*\n/,
      /\n>.*(\n>.*)*/,
    ];
    let cutIndex = text.length;
    for (const marker of markers) {
      const match = text.match(marker);
      if (match && typeof match.index === 'number' && match.index < cutIndex) {
        cutIndex = match.index;
      }
    }
    return text.slice(0, cutIndex).trim();
  },

  // Full message for reading — unlike getMessage(), this keeps quoted/thread
  // history intact since a reader should show the email as it actually reads.
  async getFullMessageForReading(id) {
    const msg = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/messages/${id}?format=full`);
    const headers = (msg.payload && msg.payload.headers) || [];
    const getHeader = (name) => (headers.find((h) => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
    return {
      id: msg.id,
      threadId: msg.threadId,
      subject: getHeader('Subject') || '(No subject)',
      from: getHeader('From'),
      to: getHeader('To'),
      cc: getHeader('Cc'),
      date: getHeader('Date'),
      body: this.extractBody(msg.payload),
      labelIds: msg.labelIds || [],
      // RFC822 Message-Id (distinct from Gmail's own `id`), needed so a
      // reply/forward threads correctly in Gmail via In-Reply-To/References.
      messageIdHeader: getHeader('Message-ID') || getHeader('Message-Id'),
    };
  },

  async getMessage(id) {
    const msg = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/messages/${id}?format=full`);
    const headers = (msg.payload && msg.payload.headers) || [];
    const getHeader = (name) => (headers.find((h) => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
    const fullBody = this.extractBody(msg.payload);
    return {
      id: msg.id,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      date: getHeader('Date'),
      body: this.stripQuotedText(fullBody).slice(0, 4000),
    };
  },

  async removeLabel(messageId, labelId) {
    await GoogleCalendar.rawRequest('POST', `${this.API_BASE}/messages/${messageId}/modify`, {
      removeLabelIds: [labelId],
    });
  },

  async addLabel(messageId, labelId) {
    await GoogleCalendar.rawRequest('POST', `${this.API_BASE}/messages/${messageId}/modify`, {
      addLabelIds: [labelId],
    });
  },

  async listInboxMessageIds(maxResults) {
    const result = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/messages?labelIds=INBOX&maxResults=${maxResults || 20}`);
    return (result.messages || []).map((m) => m.id);
  },

  // Gmail search syntax (e.g. "from:sam subject:invoice") scoped to the
  // inbox, with pagination — powers the Inbox view's search box + "Load more".
  async searchInbox({ query, maxResults, pageToken } = {}) {
    const params = new URLSearchParams();
    params.set('q', query ? `in:inbox ${query}` : 'in:inbox');
    params.set('maxResults', String(maxResults || 20));
    if (pageToken) params.set('pageToken', pageToken);
    const result = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/messages?${params.toString()}`);
    return {
      ids: (result.messages || []).map((m) => m.id),
      nextPageToken: result.nextPageToken || null,
    };
  },

  async getMyEmail() {
    if (this._myEmail) return this._myEmail;
    const profile = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/profile`);
    this._myEmail = profile.emailAddress || '';
    return this._myEmail;
  },

  extractEmailAddress(headerVal) {
    if (!headerVal) return '';
    const match = headerVal.match(/<([^>]+)>/);
    return (match ? match[1] : headerVal).trim();
  },

  base64UrlEncode(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },

  buildRawMime({ to, cc, subject, body, inReplyTo, references }) {
    const headers = [`To: ${to}`];
    if (cc) headers.push(`Cc: ${cc}`);
    headers.push(`Subject: ${subject}`);
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push('MIME-Version: 1.0');
    if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
    if (references) headers.push(`References: ${references}`);
    return `${headers.join('\r\n')}\r\n\r\n${body}`;
  },

  // Sends a plain-text email. Pass threadId + inReplyTo/references when
  // replying so Gmail threads it under the original conversation.
  async sendMessage({ to, cc, subject, body, inReplyTo, references, threadId }) {
    const raw = this.base64UrlEncode(this.buildRawMime({ to, cc, subject, body, inReplyTo, references }));
    const payload = { raw };
    if (threadId) payload.threadId = threadId;
    return GoogleCalendar.rawRequest('POST', `${this.API_BASE}/messages/send`, payload);
  },

  async archiveMessage(id) {
    return this.removeLabel(id, 'INBOX');
  },

  async trashMessage(id) {
    return GoogleCalendar.rawRequest('POST', `${this.API_BASE}/messages/${id}/trash`);
  },

  // Lightweight summary for list views — headers + snippet only, no full body.
  async getMessageSummary(id) {
    const query = 'format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date';
    const msg = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/messages/${id}?${query}`);
    const headers = (msg.payload && msg.payload.headers) || [];
    const getHeader = (name) => (headers.find((h) => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
    return {
      id: msg.id,
      threadId: msg.threadId,
      subject: getHeader('Subject') || '(No subject)',
      from: getHeader('From'),
      date: getHeader('Date'),
      snippet: msg.snippet || '',
      labelIds: msg.labelIds || [],
      unread: (msg.labelIds || []).includes('UNREAD'),
    };
  },
};
