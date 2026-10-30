const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { fold } = require('./customers');

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const CUSTOMER_HEADERS = ['ID', 'Tên khách', 'Số ĐT', 'Địa chỉ', 'Size', 'Hồ sơ', 'Cập nhật lúc', 'Dữ liệu'];
const REVENUE_HEADERS = ['ID', 'Thời gian', 'ID khách', 'Tên khách', 'Số tiền', 'Ghi chú', 'Nguồn', 'Đã hủy'];

function spreadsheetId(sheetUrl) {
  let url;
  try { url = new URL(String(sheetUrl || '').trim()); }
  catch { throw new Error('Địa chỉ Google Sheets không hợp lệ.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') throw new Error('Chỉ chấp nhận liên kết Google Sheets HTTPS.');
  const match = url.pathname.match(/^\/spreadsheets\/d\/([\w-]{10,200})(?:\/|$)/);
  if (!match) throw new Error('Địa chỉ phải trỏ đến một bảng tính Google Sheets.');
  return match[1];
}

function profileFields(profile) {
  const get = (pattern, split = null) => {
    for (const raw of String(profile || '').split(/\r?\n/)) {
      const line = raw.replace(/^\s*(?:[-*+]\s*)/, '').replace(/\*\*/g, '').trim();
      const match = line.match(pattern);
      if (match) {
        const value = match[1].trim().replace(/[`*_]/g, '');
        return split ? value.split(split)[0].trim() : value;
      }
    }
    return '';
  };
  return {
    phone: get(/(?:số\s*điện\s*thoại|số\s*đt|sđt|điện\s*thoại|phone)\s*[:：-]?\s*(.+)$/i, /[,;|]/),
    address: get(/(?:địa\s*chỉ(?:\s*nhận\s*hàng)?|address)\s*[:：-]?\s*(.+)$/i),
    size: get(/(?:size|cỡ|kích\s*cỡ)\s*[:：-]?\s*(.+)$/i, /[,;|]/),
  };
}

function parseCustomerRows(rows) {
  const out = new Map();
  for (const row of rows) {
    const [code, name, phone, address, size, profile, updatedAt, rawData] = row;
    if (!code || code === CUSTOMER_HEADERS[0]) continue;
    let data = {};
    try { data = JSON.parse(rawData || '{}'); } catch { throw new Error(`Dữ liệu khách ${code} trên Google Sheets bị lỗi.`); }
    const customer = { ...data, code: String(code), name: String(name || ''), phone: String(phone || ''), address: String(address || ''), size: String(size || ''), profile: String(profile || ''), updatedAt: Number(updatedAt) || 0 };
    const existing = out.get(customer.code);
    if (existing && fold(existing.name) !== fold(customer.name)) throw new Error(`ID khách ${customer.code} bị trùng trong Google Sheets.`);
    if (!existing || customer.updatedAt >= existing.updatedAt) out.set(customer.code, customer);
  }
  return out;
}

function parseRevenueRows(rows) {
  const out = new Map();
  for (const row of rows) {
    const [id, t, code, name, amount, note, source, voided] = row;
    if (!id || id === REVENUE_HEADERS[0]) continue;
    const item = { id: String(id), t: String(t || ''), code: String(code || ''), name: String(name || ''), amount: Number(amount) || 0, note: String(note || ''), source: String(source || 'manual'), voided: String(voided).toLowerCase() === 'true' };
    const existing = out.get(item.id);
    if (existing && (existing.amount !== item.amount || existing.code !== item.code || existing.t !== item.t)) {
      throw new Error(`Khoản thu ${item.id} có dữ liệu mâu thuẫn trên Google Sheets.`);
    }
    if (!existing || item.voided) out.set(item.id, item);
  }
  return out;
}

function createGooglePrivateSync({ tokenFile, credentialsFile, safeStorage, openExternal, fetchImpl = globalThis.fetch }) {
  const readEncrypted = (file) => {
    try { return safeStorage.decryptString(fs.readFileSync(file)); }
    catch (error) { if (error.code === 'ENOENT') return ''; throw new Error(`Không đọc được thông tin Google đã mã hóa: ${error.message}`); }
  };
  const saveEncrypted = (file, value) => {
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new Error('Kho khóa bảo mật của hệ điều hành chưa sẵn sàng; chưa lưu thông tin Google.');
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, safeStorage.encryptString(value), { mode: 0o600 });
    fs.renameSync(temp, file);
  };
  const credentials = () => {
    const raw = readEncrypted(credentialsFile);
    if (!raw) throw new Error('Hãy nhập OAuth Client ID và Client Secret trong Cài đặt.');
    return JSON.parse(raw);
  };
  const token = () => {
    const raw = readEncrypted(tokenFile);
    return raw ? JSON.parse(raw) : null;
  };
  const saveToken = (value) => saveEncrypted(tokenFile, JSON.stringify(value));

  async function exchange(body) {
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error_description || result.error || `Google OAuth trả lỗi ${response.status}.`);
    return result;
  }

  async function authorize({ clientId, clientSecret }) {
    clientId = String(clientId || '').trim();
    clientSecret = String(clientSecret || '').trim();
    if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId) || !clientSecret) {
      throw new Error('Hãy nhập OAuth Client ID dạng *.apps.googleusercontent.com và Client Secret của ứng dụng Desktop.');
    }
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new Error('Hãy bật kho khóa bảo mật của hệ điều hành trước khi kết nối Google.');
    }
    saveEncrypted(credentialsFile, JSON.stringify({ clientId, clientSecret }));

    const state = crypto.randomBytes(24).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const server = http.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [key, value] of Object.entries({
      client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: `${SHEETS_SCOPE} ${EMAIL_SCOPE}`,
      access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256',
    })) authUrl.searchParams.set(key, value);

    try {
      await openExternal(authUrl.href);
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Hết thời gian chờ đăng nhập Google.')), 5 * 60 * 1000);
        server.on('request', async (req, res) => {
          const callback = new URL(req.url, redirectUri);
          if (callback.pathname !== '/oauth2callback') { res.writeHead(404).end(); return; }
          if (callback.searchParams.get('state') !== state) { res.writeHead(400).end('Yêu cầu đăng nhập không hợp lệ.'); return; }
          const oauthError = callback.searchParams.get('error');
          if (oauthError) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Bạn đã hủy hoặc Google từ chối đăng nhập. Có thể đóng cửa sổ này.');
            clearTimeout(timeout); reject(new Error(`Google từ chối đăng nhập: ${oauthError}`)); return;
          }
          const code = callback.searchParams.get('code');
          if (!code) { res.writeHead(400).end('Google không trả mã xác nhận.'); clearTimeout(timeout); reject(new Error('Google không trả mã xác nhận.')); return; }
          try {
            const result = await exchange({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier });
            const userResponse = await fetchImpl('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { authorization: 'Bearer ' + result.access_token } });
            const user = userResponse.ok ? await userResponse.json() : {};
            saveToken({ ...result, expires_at: Date.now() + (Number(result.expires_in) || 3600) * 1000, email: String(user.email || '') });
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><meta charset="utf-8"><title>Taobao Office</title><p>Đã kết nối Google. Bạn có thể đóng cửa sổ này và quay lại ứng dụng.</p>');
            clearTimeout(timeout); resolve({ email: String(user.email || '') });
          } catch (error) {
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Không thể hoàn tất đăng nhập. Hãy quay lại ứng dụng để xem thông báo.');
            clearTimeout(timeout); reject(error);
          }
        });
      });
    } finally { server.close(); }
  }

  async function accessToken() {
    const current = token();
    if (!current?.refresh_token) throw new Error('Chưa kết nối Google. Hãy bấm “Kết nối Google”.');
    if (current.access_token && current.expires_at > Date.now() + 60_000) return current.access_token;
    const creds = credentials();
    const refreshed = await exchange({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: current.refresh_token, grant_type: 'refresh_token' });
    const next = { ...current, ...refreshed, refresh_token: refreshed.refresh_token || current.refresh_token, expires_at: Date.now() + (Number(refreshed.expires_in) || 3600) * 1000 };
    saveToken(next);
    return next.access_token;
  }

  async function api(url, options = {}) {
    const access = await accessToken();
    const response = await fetchImpl(url, { ...options, headers: { authorization: 'Bearer ' + access, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || `Google Sheets trả lỗi ${response.status}. Kiểm tra quyền truy cập bảng tính.`);
    return body;
  }

  return {
    status() {
      try { const current = token(); return { connected: !!current?.refresh_token, email: current?.email || '' }; }
      catch (error) { return { connected: false, email: '', error: error.message }; }
    },
    authorize,
    disconnect() {
      for (const file of [tokenFile, credentialsFile]) {
        try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    },
    async readInventory({ sheetUrl, tab = 'Kho hàng' }) {
      const id = spreadsheetId(sheetUrl);
      tab = String(tab).trim();
      if (!tab || tab.length > 100) throw new Error('Tên trang tính kho không hợp lệ.');
      const range = "'" + tab.replace(/'/g, "''") + "'!A1:AZ1002";
      const result = await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`);
      const rows = result.values || [];
      if (rows.length > 1001) throw new Error('Kho vượt 1.000 dòng hàng; hãy thu hẹp trang tính trước khi đọc.');
      return rows;
    },
    async sync({ sheetUrl, customers, revenue, profileFor, profileModifiedAt, mergeCustomer }) {
      const id = spreadsheetId(sheetUrl);
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
      const metadata = await api(`${base}?fields=sheets.properties`);
      const titles = new Set((metadata.sheets || []).map((s) => s.properties?.title));
      const requests = [];
      if (!titles.has('Customers')) requests.push({ addSheet: { properties: { title: 'Customers' } } });
      if (!titles.has('Revenue')) requests.push({ addSheet: { properties: { title: 'Revenue' } } });
      if (requests.length) {
        try { await api(`${base}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) }); }
        catch (error) {
          const current = await api(`${base}?fields=sheets.properties`);
          const available = new Set((current.sheets || []).map((s) => s.properties?.title));
          if (!['Customers', 'Revenue'].every((title) => available.has(title))) throw error;
        }
      }

      const values = await api(`${base}/values:batchGet?ranges=${encodeURIComponent('Customers!A1:H')}&ranges=${encodeURIComponent('Revenue!A1:H')}&valueRenderOption=UNFORMATTED_VALUE`);
      const valueRanges = values.valueRanges || [];
      const customerRows = valueRanges[0]?.values || [];
      const revenueRows = valueRanges[1]?.values || [];
      if (!customerRows.some((row) => row[0] === CUSTOMER_HEADERS[0])) {
        await api(`${base}/values/Customers!A:H:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: [CUSTOMER_HEADERS] }) });
      }
      if (!revenueRows.some((row) => row[0] === REVENUE_HEADERS[0])) {
        await api(`${base}/values/Revenue!A:H:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: [REVENUE_HEADERS] }) });
      }
      const remoteCustomers = parseCustomerRows(customerRows);
      const remoteRevenue = parseRevenueRows(revenueRows);
      const localRows = customers.all().map((customer) => {
        const profile = profileFor(customer);
        const fields = profileFields(profile);
        return {
          ...customer, ...fields,
          profile,
          updatedAt: Math.max(Number(customer.updatedAt) || 0, Number(customer.createdAt) || 0, Number(customer.lastInboundAt) || 0, Number(profileModifiedAt(customer)) || 0),
        };
      });
      const mergedCustomers = new Map(remoteCustomers);
      const customerUpdates = [];
      for (const local of localRows) {
        const remote = mergedCustomers.get(local.code);
        if (remote && fold(remote.name) !== fold(local.name)) throw new Error(`Mã khách ${local.code} trùng tên khác nhau trên hai thiết bị; đã dừng để tránh ghi đè.`);
        if (!remote || local.updatedAt > remote.updatedAt) {
          mergedCustomers.set(local.code, local);
          customerUpdates.push(local);
        }
      }
      for (const customer of mergedCustomers.values()) mergeCustomer(customer);

      const mergedRevenue = new Map(remoteRevenue);
      const revenueUpdates = [];
      for (const item of revenue.syncItems()) {
        const remote = mergedRevenue.get(item.id);
        if (!remote || (item.voided && !remote.voided)) {
          revenueUpdates.push(item);
          mergedRevenue.set(item.id, remote ? { ...item, voided: true } : item);
        }
      }
      revenue.mergeSyncItems([...mergedRevenue.values()]);

      const customerValues = customerUpdates.map((c) => [
        c.code, c.name || '', c.phone || '', c.address || '', c.size || '', c.profile || '',
        c.updatedAt || Date.now(),
        JSON.stringify({ code: c.code, createdAt: c.createdAt || 0, lastInboundAt: c.lastInboundAt || 0, lastReplyAt: c.lastReplyAt || 0, followupCount: c.followupCount || 0, paused: !!c.paused }),
      ]);
      const revenueValues = revenueUpdates.map((r) => [
        r.id, r.t || '', r.code || '', r.name || '', Number(r.amount) || 0, r.note || '', r.source || 'manual', !!r.voided,
      ]);
      if (customerValues.length) await api(`${base}/values/Customers!A:H:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: customerValues }) });
      if (revenueValues.length) await api(`${base}/values/Revenue!A:H:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: revenueValues }) });
      return { customers: mergedCustomers.size, revenue: [...mergedRevenue.values()].filter((r) => !r.voided).length };
    },
  };
}

module.exports = { createGooglePrivateSync, spreadsheetId, parseCustomerRows, parseRevenueRows };
