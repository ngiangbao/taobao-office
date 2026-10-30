// Tăng số phiên bản beta trong package.json (0.4.0-beta.1 → 0.4.0-beta.2), chỉ sửa đúng dòng "version".
// Dùng:  node scripts/bump-beta.mjs            (tăng beta.N)
//        node scripts/bump-beta.mjs 0.5.0-beta.1   (đặt số cụ thể)
// Không dùng `electron-builder -c.extraMetadata`: nó ghi đè package.json gốc bằng bản rút gọn.
import { readFileSync, writeFileSync } from 'node:fs';
const text = readFileSync('package.json', 'utf8');
const cur = /"version":\s*"([^"]+)"/.exec(text)?.[1];
const arg = process.argv[2];
let next = arg;
if (!next) {
  const m = /^(\d+\.\d+\.\d+)-beta\.(\d+)$/.exec(cur || '');
  if (!m) { console.error(`Phiên bản hiện tại "${cur}" không phải beta. Hãy chỉ rõ, ví dụ: node scripts/bump-beta.mjs 0.5.0-beta.1`); process.exit(1); }
  next = `${m[1]}-beta.${Number(m[2]) + 1}`;
}
if (!/^\d+\.\d+\.\d+-beta\.\d+$/.test(next)) { console.error(`"${next}" không phải dạng X.Y.Z-beta.N`); process.exit(1); }
writeFileSync('package.json', text.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`));
console.log(`${cur} → ${next}`);
