// Dựng văn phòng my-office (office/) để đóng gói: cài đủ gói, next build, rồi bỏ gói chỉ dùng khi dựng.
import { execSync } from 'node:child_process';
const run = (c) => execSync(c, { cwd: 'office', stdio: 'inherit' });
run('npm ci --no-audit --no-fund');
run('npx next build');
run('npm prune --omit=dev --no-audit --no-fund');
