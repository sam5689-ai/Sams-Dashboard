// Google Calendar / Meet integration.
// Uses Google Identity Services (browser OAuth) so this static site can
// talk to the Calendar API directly with the signed-in user's own token.
// Requires the user to supply their own OAuth Client ID (see README).
const GoogleCalendar = {
  CLIENT_ID_KEY: 'dashboard.google.clientId',
  TOKEN_KEY: 'dashboard.google.token',
  SCOPE: 'https://www.googleapis.com/auth/calendar.events',

  tokenClient: null,
  gisLoading: null,
  _afterConnect: null,

  init() {
    const btn = document.getElementById('googleConnectBtn');
    if (btn) btn.addEventListener('click', () => this.toggleConnection());
    this.renderConnectButton();
  },

  getClientId() {
    return localStorage.getItem(this.CLIENT_ID_KEY) || '';
  },

  setClientId(id) {
    localStorage.setItem(this.CLIENT_ID_KEY, id.trim());
  },

  getToken() {
    try {
      const raw = sessionStorage.getItem(this.TOKEN_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.access_token || data.expires_at < Date.now()) return null;
      return data.access_token;
    } catch (e) {
      return null;
    }
  },

  setToken(accessToken, expiresInSeconds) {
    sessionStorage.setItem(this.TOKEN_KEY, JSON.stringify({
      access_token: accessToken,
      expires_at: Date.now() + expiresInSeconds * 1000 - 60000,
    }));
  },

  clearToken() {
    sessionStorage.removeItem(this.TOKEN_KEY);
  },

  isConnected() {
    return !!this.getClientId() && !!this.getToken();
  },

  loadGis(cb) {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      cb();
      return;
    }
    if (!this.gisLoading) {
      this.gisLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    this.gisLoading.then(cb).catch(() => Toast.show('Could not load Google sign-in. Check your connection.'));
  },

  ensureTokenClient() {
    if (this.tokenClient) return true;
    const clientId = this.getClientId();
    if (!clientId) return false;
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: this.SCOPE,
      callback: (resp) => {
        if (resp.error) {
          Toast.show('Google connection failed: ' + resp.error);
          return;
        }
        this.setToken(resp.access_token, resp.expires_in);
        this.renderConnectButton();
        Toast.show('Connected to Google Calendar');
        if (this._afterConnect) {
          const cb = this._afterConnect;
          this._afterConnect = null;
          cb();
        }
      },
      error_callback: (err) => {
        if (err && err.type === 'popup_closed') return;
        Toast.show('Google connection failed. Please try again.');
      },
    });
    return true;
  },

  // Ensures we have a live token, prompting the user (popup) if needed.
  // Calls `onReady()` once connected, or does nothing if the user cancels
  // or hasn't configured a Client ID yet (a settings prompt is shown instead).
  withConnection(onReady) {
    if (this.getToken()) {
      onReady();
      return;
    }
    if (!this.getClientId()) {
      this.openSettings();
      return;
    }
    this.loadGis(() => {
      if (!this.ensureTokenClient()) return;
      this._afterConnect = onReady;
      this.tokenClient.requestAccessToken({ prompt: '' });
    });
  },

  connect() {
    this.withConnection(() => {});
  },

  disconnect() {
    const token = this.getToken();
    this.clearToken();
    this.tokenClient = null;
    if (token && window.google && google.accounts) {
      google.accounts.oauth2.revoke(token, () => {});
    }
    this.renderConnectButton();
    Toast.show('Disconnected from Google Calendar');
  },

  toggleConnection() {
    if (this.isConnected()) {
      if (confirm('Disconnect from Google Calendar?')) this.disconnect();
    } else {
      this.connect();
    }
  },

  openSettings() {
    const clientId = this.getClientId();
    Modal.open(`
      <h2>Connect Google Calendar</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-top:-8px;">
        Paste your Google OAuth Client ID to let this dashboard create real
        Google Calendar events (with Meet links) when you schedule meetings.
        It's free to create — see the README for step-by-step instructions.
      </p>
      <div class="form-row">
        <label>OAuth Client ID</label>
        <input type="text" id="googleClientIdInput" value="${clientId ? escapeAttr(clientId) : ''}" placeholder="xxxxxxxxxx.apps.googleusercontent.com" />
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-btn" id="cancelBtn">Cancel</button>
        <button type="button" class="primary-btn" id="saveClientIdBtn">Save &amp; Connect</button>
      </div>
    `);
    document.getElementById('cancelBtn').addEventListener('click', () => Modal.close());
    document.getElementById('saveClientIdBtn').addEventListener('click', () => {
      const val = document.getElementById('googleClientIdInput').value.trim();
      if (!val) {
        Toast.show('Please enter a Client ID');
        return;
      }
      this.setClientId(val);
      this.tokenClient = null;
      Modal.close();
      this.connect();
    });
  },

  renderConnectButton() {
    const btn = document.getElementById('googleConnectBtn');
    if (!btn) return;
    if (this.isConnected()) {
      btn.innerHTML = `${Icon.check(15)} Google Connected`;
      btn.classList.add('connected');
    } else {
      btn.innerHTML = `${Icon.link(15)} Connect Google`;
      btn.classList.remove('connected');
    }
  },

  async apiRequest(method, path, body) {
    const token = this.getToken();
    if (!token) throw new Error('Not connected to Google Calendar');
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).error?.message || '';
      } catch (e) { /* ignore */ }
      throw new Error(`Google Calendar error (${res.status})${detail ? ': ' + detail : ''}`);
    }
    if (res.status === 204) return null;
    return res.json();
  },

  buildEventBody(m) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const pad = (n) => String(n).padStart(2, '0');
    const body = {
      summary: m.title,
      description: m.notes || '',
      location: m.location || '',
    };

    if (m.time) {
      const startDate = new Date(`${m.date}T${m.time}:00`);
      const endDate = new Date(startDate.getTime() + 30 * 60000);
      const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
      body.start = { dateTime: fmt(startDate), timeZone: tz };
      body.end = { dateTime: fmt(endDate), timeZone: tz };
    } else {
      const startDate = new Date(`${m.date}T00:00:00`);
      const endDate = new Date(startDate.getTime() + 24 * 3600000);
      const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      body.start = { date: fmtDate(startDate) };
      body.end = { date: fmtDate(endDate) };
    }

    if (m.attendees) {
      const emails = m.attendees
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
      if (emails.length) body.attendees = emails.map((email) => ({ email }));
    }

    return body;
  },

  extractMeetInfo(event) {
    const entryPoints = (event.conferenceData && event.conferenceData.entryPoints) || [];
    const video = entryPoints.find((e) => e.entryPointType === 'video');
    return {
      googleEventId: event.id,
      meetLink: video ? video.uri : '',
      htmlLink: event.htmlLink || '',
    };
  },

  async createEventForMeeting(m) {
    const body = this.buildEventBody(m);
    body.conferenceData = {
      createRequest: {
        requestId: Store.uid(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
    const result = await this.apiRequest('POST', '/calendars/primary/events?conferenceDataVersion=1', body);
    return this.extractMeetInfo(result);
  },

  async updateEventForMeeting(m) {
    const body = this.buildEventBody(m);
    const result = await this.apiRequest('PATCH', `/calendars/primary/events/${m.googleEventId}?conferenceDataVersion=1`, body);
    return this.extractMeetInfo(result);
  },

  async deleteEventForMeeting(m) {
    if (!m.googleEventId) return;
    try {
      await this.apiRequest('DELETE', `/calendars/primary/events/${m.googleEventId}`);
    } catch (e) {
      console.warn('Failed to delete Google Calendar event', e);
    }
  },

  async listUpcomingEvents(daysAhead) {
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + (daysAhead || 60) * 24 * 3600000).toISOString();
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100',
    });
    const result = await this.apiRequest('GET', `/calendars/primary/events?${params.toString()}`);
    return (result.items || []).filter((e) => e.status !== 'cancelled');
  },

  eventToMeeting(event) {
    const pad = (n) => String(n).padStart(2, '0');
    let date = '';
    let time = '';
    if (event.start && event.start.dateTime) {
      const d = new Date(event.start.dateTime);
      date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else if (event.start && event.start.date) {
      date = event.start.date;
    }

    const attendees = (event.attendees || [])
      .filter((a) => !a.self)
      .map((a) => a.displayName || a.email)
      .join(', ');

    return {
      title: event.summary || '(No title)',
      date,
      time,
      attendees,
      location: event.location || '',
      notes: event.description || '',
      ...this.extractMeetInfo(event),
    };
  },
};
