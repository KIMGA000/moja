/* ===========================================================================
 * @moja/core 경계 테스트 — "core 는 어느 플랫폼에도 묶이지 않는다"
 *
 * 실행: npm run qa:boundary
 *
 * 왜 필요한가:
 *   웹(Next.js)과 앱(React Native)을 따로 만들기로 했다. 판정 로직이 두 벌이 되면
 *   반드시 갈라진다 — 이 저장소에서 이미 겪었다. app/data/classify.ts 와
 *   app/data/realMatch.ts 에 지역 매칭 로직이 복붙되어 있었고, 한쪽 별칭 목록에
 *   개편 전 지명(전라북도)이 빠져서 전북 공고가 "전국"으로 분류돼 다른 지역
 *   사용자에게 노출됐다.
 *
 *   그래서 판정은 packages/core 한 곳에만 둔다. 그런데 core 에 next/react/fs 같은
 *   것이 한 줄이라도 섞여 들어오면 그날로 앱에서 import 할 수 없게 되고, 결국 앱이
 *   자기 판정 로직을 따로 갖게 된다. 사람이 기억해서 지키는 규칙은 반드시 깨지므로
 *   기계가 지키게 한다.
 *
 * 검사 대상: packages/core/src/**  (단 __tests__ 는 제외 — 테스트는 Node 에서만 돈다)
 * =========================================================================== */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC_ROOT = join(HERE, '..');            // packages/core/src
const PKG_ROOT = join(SRC_ROOT, '..');        // packages/core

/** 검사에서 빼는 경로 (테스트 파일은 Node 전용이어도 된다). */
const EXCLUDED = ['__tests__', 'data/seed'];

/** import 해도 되는 것: 상대 경로뿐. 그 외 전부 금지. */
const FORBIDDEN_IMPORT_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: /^node:/,            why: 'Node 표준 모듈 — React Native 에 없다' },
  { pattern: /^(fs|path|os|crypto|url|util|child_process|http|https)$/,
                                  why: 'Node 표준 모듈 — React Native 에 없다' },
  { pattern: /^react/,            why: 'core 는 UI 프레임워크를 몰라야 한다' },
  { pattern: /^next/,             why: 'core 는 웹 프레임워크를 몰라야 한다' },
  { pattern: /^@supabase/,        why: 'DB 접근은 apps/web 의 서버 코드에서만 한다' },
  { pattern: /^\.\.\/\.\.\/(app|apps)\//, why: 'core 가 web 을 참조하면 순환 의존이 된다' },
];

/** 소스에 나오면 안 되는 전역/환경 접근. */
const FORBIDDEN_GLOBALS: { token: string; why: string }[] = [
  { token: 'window',       why: 'DOM 전역 — RN 에 없다' },
  { token: 'document',     why: 'DOM 전역 — RN 에 없다' },
  { token: 'localStorage', why: 'DOM 전역 — RN 에 없다' },
  { token: 'process.env',  why: '환경변수는 core 함수의 인자로 받아라 (computeProfile(raw, today) 처럼)' },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(SRC_ROOT, full).split('\\').join('/');
    if (EXCLUDED.some((ex) => rel === ex || rel.startsWith(ex + '/'))) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const files = walk(SRC_ROOT);
let failures = 0;

console.log(`══ [1] import 검사 (${files.length}개 파일) ══`);
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]{0,200}?from\s+['"]([^'"]+)['"]/g;
for (const file of files) {
  const rel = relative(PKG_ROOT, file).split('\\').join('/');
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (spec.startsWith('.')) {
      const bad = FORBIDDEN_IMPORT_PATTERNS.find((f) => f.pattern.test(spec));
      if (bad) { failures++; console.log(`  ❌ ${rel} → '${spec}'  (${bad.why})`); }
      continue;
    }
    const bad = FORBIDDEN_IMPORT_PATTERNS.find((f) => f.pattern.test(spec));
    console.log(`  ❌ ${rel} → '${spec}'  (${bad?.why ?? '외부 패키지 금지 — core 는 의존성이 없어야 한다'})`);
    failures++;
  }
}
if (failures === 0) console.log('  ✅ 전부 상대 경로만 사용');

console.log('\n══ [2] 플랫폼 전역 검사 ══');
let globalHits = 0;
for (const file of files) {
  const rel = relative(PKG_ROOT, file).split('\\').join('/');
  const src = readFileSync(file, 'utf8')
    // 주석은 검사에서 뺀다 (설명에 'window' 같은 단어가 나올 수 있다)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const { token, why } of FORBIDDEN_GLOBALS) {
    const re = new RegExp(`\\b${token.replace('.', '\\.')}\\b`);
    if (re.test(src)) { globalHits++; failures++; console.log(`  ❌ ${rel} 에 '${token}' 사용 (${why})`); }
  }
}
if (globalHits === 0) console.log('  ✅ DOM/환경 전역 사용 없음');

console.log('\n══ [3] package.json dependencies 가 비어 있는가 ══');
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const deps = Object.keys(pkg.dependencies ?? {});
if (deps.length > 0) {
  failures++;
  console.log(`  ❌ dependencies 에 ${deps.join(', ')} 가 있습니다 — core 는 런타임 의존성이 없어야 합니다`);
} else {
  console.log('  ✅ dependencies 비어 있음');
}
const ALLOWED_DEV = ['typescript', 'tsx', '@types/node'];
const badDev = Object.keys(pkg.devDependencies ?? {}).filter((d) => !ALLOWED_DEV.includes(d));
if (badDev.length > 0) {
  failures++;
  console.log(`  ❌ devDependencies 에 허용되지 않은 항목: ${badDev.join(', ')}`);
} else {
  console.log(`  ✅ devDependencies 는 허용 목록만 (${ALLOWED_DEV.join(', ')})`);
}

console.log(`\n${failures === 0 ? '✅ 통과 — core 는 웹·앱 어디서든 import 할 수 있습니다' : `❌ 실패 ${failures}건`}`);
process.exit(failures === 0 ? 0 : 1);
