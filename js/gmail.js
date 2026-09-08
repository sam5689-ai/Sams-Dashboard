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

  // Shared parsing for a full-format message, used both for reading a
  // single message and for every message inside a thread.
  parseFullMessage(msg) {
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
      attachments: this.extractAttachments(msg.payload),
    };
  },

  // Walks the MIME part tree collecting real attachments (a named part with
  // its own body). Small attachments Gmail inlines directly (body.data);
  // larger ones only carry an attachmentId that has to be fetched separately.
  extractAttachments(payload, acc) {
    acc = acc || [];
    if (!payload) return acc;
    if (payload.filename && payload.body && (payload.body.attachmentId || payload.body.data)) {
      acc.push({
        filename: payload.filename,
        mimeType: payload.mimeType || 'application/octet-stream',
        size: payload.body.size || 0,
        attachmentId: payload.body.attachmentId || null,
        inlineData: payload.body.attachmentId ? null : payload.body.data,
      });
    }
    if (payload.parts) payload.parts.forEach((p) => this.extractAttachments(p, acc));
    return acc;
  },

  async getAttachmentData(messageId, attachmentId) {
    const result = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/messages/${messageId}/attachments/${attachmentId}`);
    return result.data;
  },

  // Decodes base64url into a Blob for download — unlike decodeBase64Url,
  // this must NOT run the bytes through decodeURIComponent/escape (that's
  // only valid for UTF-8 text, and would corrupt arbitrary binary data).
  base64UrlToBlob(str, mimeType) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
  },

  // Full message for reading — unlike getMessage(), this keeps quoted/thread
  // history intact since a reader should show the email as it actually reads.
  async getFullMessageForReading(id) {
    const msg = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/messages/${id}?format=full`);
    return this.parseFullMessage(msg);
  },

  // The whole conversation a message belongs to, oldest message first —
  // powers the Inbox reader's Gmail-style stacked thread view.
  async getThread(threadId) {
    const thread = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/threads/${threadId}?format=full`);
    return {
      id: thread.id,
      messages: (thread.messages || []).map((m) => this.parseFullMessage(m)),
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
  // messages.list conveniently returns each message's threadId for free, so
  // the Inbox view can dedupe to one row per conversation without extra calls.
  async searchInbox({ query, maxResults, pageToken } = {}) {
    const params = new URLSearchParams();
    params.set('q', query ? `in:inbox ${query}` : 'in:inbox');
    params.set('maxResults', String(maxResults || 20));
    if (pageToken) params.set('pageToken', pageToken);
    const result = await GoogleCalendar.rawRequest('GET', `${this.API_BASE}/messages?${params.toString()}`);
    return {
      entries: (result.messages || []).map((m) => ({ id: m.id, threadId: m.threadId })),
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

  // attachments: [{ filename, mimeType, base64 }] — base64 is plain
  // (non-url-safe) base64 of the raw file bytes, e.g. from FileReader's
  // readAsDataURL. Builds a multipart/mixed message when there are any,
  // otherwise a plain text/plain one.
  buildRawMime({ to, cc, subject, body, inReplyTo, references, attachments }) {
    const headers = [`To: ${to}`];
    if (cc) headers.push(`Cc: ${cc}`);
    headers.push(`Subject: ${subject}`);
    headers.push('MIME-Version: 1.0');
    if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
    if (references) headers.push(`References: ${references}`);

    if (!attachments || !attachments.length) {
      headers.push('Content-Type: text/plain; charset="UTF-8"');
      return `${headers.join('\r\n')}\r\n\r\n${body}`;
    }

    const boundary = `dash_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    const wrapBase64 = (b64) => b64.replace(/.{1,76}/g, (line) => `${line}\r\n`);

    const bodyPart = `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}\r\n`;
    const attachmentParts = attachments.map((att) =>
      `--${boundary}\r\nContent-Type: ${att.mimeType}; name="${att.filename}"\r\nContent-Disposition: attachment; filename="${att.filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrapBase64(att.base64)}`
    );

    return `${headers.join('\r\n')}\r\n\r\n${[bodyPart, ...attachmentParts].join('')}--${boundary}--`;
  },

  // Sends an email, optionally with attachments. Pass threadId +
  // inReplyTo/references when replying so Gmail threads it under the
  // original conversation.
  async sendMessage({ to, cc, subject, body, inReplyTo, references, threadId, attachments }) {
    const raw = this.base64UrlEncode(this.buildRawMime({ to, cc, subject, body, inReplyTo, references, attachments }));
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

  // Thread-level archive/delete — removes the INBOX label (or trashes)
  // every message in the conversation at once, matching what Gmail itself
  // does when you archive/delete a conversation from the inbox list.
  async archiveThread(threadId) {
    return GoogleCalendar.rawRequest('POST', `${this.API_BASE}/threads/${threadId}/modify`, {
      removeLabelIds: ['INBOX'],
    });
  },

  async trashThread(threadId) {
    return GoogleCalendar.rawRequest('POST', `${this.API_BASE}/threads/${threadId}/trash`);
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
