// PostToolUse 훅: 첫 편집 직후의 index.html 을 .first-edit.html 로 보존 (첫 수정 점수 측정용). 항상 exit 0.
import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
try { const d = process.env.CLAUDE_PROJECT_DIR || process.cwd(); const src = join(d, 'index.html'), dst = join(d, '.first-edit.html'); if (existsSync(src) && !existsSync(dst)) copyFileSync(src, dst); } catch {}
process.exit(0);
