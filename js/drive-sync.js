// Google Drive sync using Google Identity Services (client-side OAuth) +
// the Drive REST API, scoped to `drive.file` so this app can only see
// files it creates itself — never the rest of your Drive.
//
// Requires window.BODHI_CONFIG.GOOGLE_CLIENT_ID to be set in js/config.js.

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILENAME = 'bodhi-state.json';
const TOKEN_STORAGE_KEY = 'bodhi_drive_token';
const FILE_ID_STORAGE_KEY = 'bodhi_drive_file_id';

const driveSync = {
  tokenClient: null,
  accessToken: null,
  tokenExpiresAt: 0,
  onStatusChange: null, // set by app.js to re-render when connect/disconnect happens

  isConfigured() {
    return !!(window.BODHI_CONFIG && window.BODHI_CONFIG.GOOGLE_CLIENT_ID &&
      !window.BODHI_CONFIG.GOOGLE_CLIENT_ID.startsWith('YOUR_CLIENT_ID'));
  },

  isConnected() {
    this._restoreToken();
    return !!this.accessToken && Date.now() < this.tokenExpiresAt;
  },

  _restoreToken() {
    if (this.accessToken) return;
    try {
      const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (raw) {
        const { token, expiresAt } = JSON.parse(raw);
        if (Date.now() < expiresAt) { this.accessToken = token; this.tokenExpiresAt = expiresAt; }
      }
    } catch (e) { /* ignore */ }
  },

  _storeToken(token, expiresInSeconds) {
    this.accessToken = token;
    this.tokenExpiresAt = Date.now() + (expiresInSeconds * 1000) - 30000;
    try {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, expiresAt: this.tokenExpiresAt }));
    } catch (e) { /* ignore */ }
  },

  connect() {
    return new Promise((resolve, reject) => {
      if (!this.isConfigured()) { reject(new Error('not_configured')); return; }
      if (typeof google === 'undefined' || !google.accounts) { reject(new Error('gis_not_loaded')); return; }

      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: window.BODHI_CONFIG.GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (resp) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          this._storeToken(resp.access_token, resp.expires_in);
          if (this.onStatusChange) this.onStatusChange();
          resolve();
        },
      });
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  },

  disconnect() {
    if (this.accessToken && typeof google !== 'undefined' && google.accounts) {
      google.accounts.oauth2.revoke(this.accessToken, () => {});
    }
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(FILE_ID_STORAGE_KEY);
    } catch (e) { /* ignore */ }
    if (this.onStatusChange) this.onStatusChange();
  },

  async _findFileId() {
    const cached = localStorage.getItem(FILE_ID_STORAGE_KEY);
    if (cached) return cached;
    const q = encodeURIComponent(`name='${DRIVE_FILENAME}' and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error('drive_list_failed');
    const data = await res.json();
    const file = data.files && data.files[0];
    if (file) { localStorage.setItem(FILE_ID_STORAGE_KEY, file.id); return file.id; }
    return null;
  },

  async saveState(state) {
    if (!this.isConnected()) throw new Error('not_connected');
    const fileId = await this._findFileId();
    const payload = JSON.stringify(state);
    const metadata = { name: DRIVE_FILENAME, mimeType: 'application/json' };
    const boundary = 'bodhi-boundary';
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--`;

    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const res = await fetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!res.ok) throw new Error('drive_save_failed');
    const data = await res.json();
    if (data.id) localStorage.setItem(FILE_ID_STORAGE_KEY, data.id);
    return data;
  },

  async loadState() {
    if (!this.isConnected()) throw new Error('not_connected');
    const fileId = await this._findFileId();
    if (!fileId) return null;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error('drive_load_failed');
    return res.json();
  },
};
