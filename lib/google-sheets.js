const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_GROUPS = 500;

function csvUrl(sheetUrl) {
  let url;
  try { url = new URL(String(sheetUrl || '').trim()); }
  catch { throw new Error('Địa chỉ Google Sheets không hợp lệ.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') {
    throw new Error('Chỉ chấp nhận liên kết Google Sheets công khai.');
  }
  const match = url.pathname.match(/^\/spreadsheets\/d\/(e\/)?([^/]+)(?:\/|$)/);
  if (!match || !/^[\w-]{10,200}$/.test(match[2])) {
    throw new Error('Liên kết phải mở một bảng tính Google Sheets.');
  }
  const gid = /^\d+$/.test(url.searchParams.get('gid') || '') ? url.searchParams.get('gid') : '0';
  const path = match[1] ? `/spreadsheets/d/e/${match[2]}/pub` : `/spreadsheets/d/${match[2]}/export`;
  const result = new URL(`https://docs.google.com${path}`);
  result.searchParams.set(match[1] ? 'output' : 'format', 'csv');
  result.searchParams.set('gid', gid);
  return result;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === ',') { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('Bảng tính có dòng CSV chưa đóng dấu ngoặc kép.');
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r) => r.some((v) => v));
}

function normalizedHeader(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').toLowerCase().trim();
}

function facebookGroupUrl(value, rowNumber) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Dòng ${rowNumber}: link nhóm không hợp lệ.`); }
  if (url.protocol !== 'https:' || !/(^|\.)facebook\.com$/i.test(url.hostname) || !/^\/groups\/[^/]+/i.test(url.pathname) || url.username || url.password) {
    throw new Error(`Dòng ${rowNumber}: link phải là địa chỉ nhóm Facebook dạng https://www.facebook.com/groups/...`);
  }
  return url.href;
}

function parseGroupsCsv(text) {
  const rows = parseCsv(String(text).replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('Bảng tính chưa có dữ liệu nhóm.');

  const header = rows[0].map(normalizedHeader);
  let nameColumn = header.findIndex((v) => /(^|\s)(ten|name|nhom|group)(\s|$)/.test(v));
  let urlColumn = header.findIndex((v) => /(link|url|dia chi|address)/.test(v));
  const hasHeader = nameColumn >= 0 && urlColumn >= 0 && nameColumn !== urlColumn;
  if (!hasHeader) { nameColumn = 0; urlColumn = 1; }

  const groups = [];
  for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
    const row = rows[i], name = String(row[nameColumn] || '').trim(), rawUrl = String(row[urlColumn] || '').trim();
    if (!name && !rawUrl) continue;
    if (!name || !rawUrl) throw new Error(`Dòng ${i + 1}: cần có cả tên nhóm và link nhóm.`);
    groups.push({ name: name.replace(/\s+/g, ' ').slice(0, 200), url: facebookGroupUrl(rawUrl, i + 1) });
    if (groups.length > MAX_GROUPS) throw new Error(`Bảng tính vượt quá giới hạn ${MAX_GROUPS} nhóm.`);
  }
  if (!groups.length) throw new Error('Không tìm thấy nhóm hợp lệ trong bảng tính.');
  return groups;
}

async function importGroups(sheetUrl, fetchImpl = globalThis.fetch) {
  const url = csvUrl(sheetUrl);
  let response;
  try { response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), redirect: 'error' }); }
  catch (error) { throw new Error(`Không tải được Google Sheets. Hãy kiểm tra kết nối và quyền xem công khai. (${error.message})`); }
  if (!response.ok) throw new Error(`Google Sheets trả lỗi ${response.status}. Hãy bật quyền “Bất kỳ ai có liên kết đều có thể xem”.`);

  const reader = response.body?.getReader();
  let csv;
  if (reader) {
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CSV_BYTES) { await reader.cancel(); throw new Error('Bảng tính quá lớn (tối đa 2 MB).'); }
      chunks.push(Buffer.from(value));
    }
    csv = Buffer.concat(chunks).toString('utf8');
  } else {
    csv = await response.text();
    if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) throw new Error('Bảng tính quá lớn (tối đa 2 MB).');
  }
  if (/^\s*</.test(csv)) throw new Error('Không đọc được bảng tính. Hãy bật quyền “Bất kỳ ai có liên kết đều có thể xem”.');
  return parseGroupsCsv(csv);
}

module.exports = { importGroups, parseGroupsCsv };
