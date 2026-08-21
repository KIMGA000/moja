/* ===========================================================================
 * 판정엔진 회귀 차분 테스트
 *
 * docs/qa/_original-engine.cjs (app.html 원본 동결 사본) 와
 * lib/engine/*.ts (현재 이식본) 을 같은 입력에 돌려서 결과를 비교한다.
 *
 * 실행:  npm run qa:engine
 *
 * 원칙: 차이가 나면 무조건 실패시키지 않는다. **의도한 차이는 EXPECTED_DIFFS에
 * 명시적으로 적어두고**, 거기 없는 차이만 실패로 처리한다. 그래야 "왜 달라졌는지
 * 아무도 모르는 변경"이 조용히 섞여 들어가지 않는다.
 * =========================================================================== */

import { createRequire } from 'node:module';
import path from 'node:path';
import { computeProfile } from '../../lib/engine/profile';
import { evaluateAll, filterNotices } from '../../lib/engine/evaluate';
import { validateFields } from '../../lib/engine/fields';
import policiesFile from '../../data/seed/policies.json';
import rulesFile from '../../data/seed/rules.json';
import noticesFile from '../../data/seed/notices.json';

const require_ = createRequire(import.meta.url);
const orig = require_(path.join(process.cwd(), 'docs/qa/_original-engine.cjs'));

/** 원본과 달라도 되는 항목. 여기 없는 차이는 회귀로 간주하고 실패시킨다. */
const EXPECTED_DIFFS: { id: string; why: string }[] = [
  { id: 'uncertaintyFlags:local-tuition-support',
    why: "partial_exclusion 규칙의 note(개발자용 내부 메모)를 사용자 화면에 노출하던 것을 " +
         "사용자용 문장(uncertaintyLabel)으로 교체" },
  { id: 'dday:timezone',
    why: 'YYYY-MM-DD를 UTC 자정으로 파싱해 KST 사용자에게 하루 안에서도 D-day가 ' +
         '1일씩 흔들리던 것을 로컬 자정 정규화로 고정' },
];

type Raw = Record<string, unknown>;
const base: Raw = {
  hasInstitutionalCare: true, region: '강원도', incomeBracket: '50%이하',
  ownsHouse: false, isMarried: false, isBasicLivelihoodRecipient: false,
  isNearPoorMedicalDiscount: false, currentSupports: [], isEnrolled: false, isEmployed: true,
};

const CASES: [string, Raw][] = [
  ['종료1년차·재학',   { birthDate:'2005-03-10', exitType:'만기', protectionEndDate:'2025-06-01', isEnrolled:true, isEmployed:false }],
  ['종료3년차·취업',   { birthDate:'2003-01-20', exitType:'만기', protectionEndDate:'2023-04-01' }],
  ['종료6년차·미취업', { birthDate:'2000-11-05', exitType:'만기', protectionEndDate:'2020-03-01', isEmployed:false }],
  ['연장2년차·재학',   { birthDate:'2004-07-07', exitType:'연장', protectionEndDate:'2024-05-01', isEnrolled:true, isEmployed:false }],
  ['조기퇴소3년차',    { birthDate:'2004-02-01', exitType:'조기', protectionEndDate:'2020-08-01', isEmployed:false }],
  ['현재보호중18세',   { birthDate:'2008-05-01', exitType:'만기', protectionEndDate:null, isEmployed:false }],
  ['유주택',           { birthDate:'2003-09-09', exitType:'만기', protectionEndDate:'2024-06-01', ownsHouse:true }],
  ['혼인중',           { birthDate:'2002-09-09', exitType:'만기', protectionEndDate:'2024-06-01', isMarried:true }],
  ['기초생활수급자',   { birthDate:'2004-04-04', exitType:'만기', protectionEndDate:'2025-09-01', isBasicLivelihoodRecipient:true, isEmployed:false }],
  ['차상위',           { birthDate:'2004-04-04', exitType:'만기', protectionEndDate:'2025-09-01', isNearPoorMedicalDiscount:true, isEmployed:false }],
  ['타법령수당중',     { birthDate:'2004-04-04', exitType:'만기', protectionEndDate:'2025-09-01', currentSupports:['other-law-allowance'], isEmployed:false }],
  ['국가장학금중',     { birthDate:'2004-04-04', exitType:'만기', protectionEndDate:'2025-09-01', isEnrolled:true, currentSupports:['national-scholarship-tuition'], isEmployed:false }],
  ['내일저축중',       { birthDate:'2004-04-04', exitType:'만기', protectionEndDate:'2025-09-01', currentSupports:['youth-tomorrow-savings'], isEmployed:false }],
  ['보호경험없음',     { birthDate:'2003-01-01', exitType:'만기', protectionEndDate:'2024-01-01', hasInstitutionalCare:false, isEmployed:false }],
  ['D-15 경계',        { birthDate:'2003-01-01', exitType:'만기', protectionEndDate:'2021-09-05' }],
  ['D-0 경계',         { birthDate:'2003-01-01', exitType:'만기', protectionEndDate:'2021-08-21' }],
  ['만29세 경계',      { birthDate:'1997-08-22', exitType:'만기', protectionEndDate:'2023-01-01' }],
  ['만30세 경계',      { birthDate:'1996-08-20', exitType:'만기', protectionEndDate:'2023-01-01' }],
];

// 날짜를 고정해서 매번 같은 결과가 나오게 한다 (테스트가 날짜에 따라 깨지면 못 믿는다)
const TODAY = new Date('2026-08-21T12:00:00+09:00');

let fail = 0;
let checks = 0;

console.log('\n══ 0) 조건 필드명 검증 ══');
const fieldIssues = validateFields(policiesFile as never, rulesFile as never);
if (fieldIssues.length === 0) {
  console.log('  ✅ 21개 제도 + 규칙의 모든 condition.field가 정본 목록에 있음');
} else {
  fail += fieldIssues.length;
  fieldIssues.forEach((i) =>
    console.log(`  ❌ ${i.where} → "${i.field}"${i.suggestion ? `  (혹시 "${i.suggestion}"?)` : ''}`)
  );
}

console.log('\n══ 1) 원본 vs 현재 이식본 차분 ══');
const unexpected: string[] = [];

for (const [name, over] of CASES) {
  const raw = { ...base, ...over };
  const pO = orig.computeProfile(structuredClone(raw), TODAY);
  const pN = computeProfile(structuredClone(raw) as never, TODAY);

  const rO = orig.evaluateAll(orig.computeProfile(structuredClone(raw), TODAY), policiesFile, rulesFile);
  const rN = evaluateAll(pN, policiesFile as never, rulesFile as never);

  const mapO = new Map<string, string>(rO.map((x: never) => [(x as never as { policyId: string }).policyId, `${(x as never as { status: string }).status}/${(x as never as { dDay: number | null }).dDay}`]));
  for (const x of rN) {
    checks++;
    const now = `${x.status}/${x.dDay}`;
    const was = mapO.get(x.policyId);
    if (was !== now) {
      // D-day만 다르면 타임존 정규화(의도한 차이)
      const tag = was?.split('/')[0] === now.split('/')[0] ? 'dday:timezone' : `status:${x.policyId}`;
      if (!EXPECTED_DIFFS.some((d) => d.id === tag)) unexpected.push(`${name} / ${x.policyId}: ${was} → ${now}`);
    }
    const fO = (rO.find((y: never) => (y as never as { policyId: string }).policyId === x.policyId) as never as { uncertaintyFlags: string[] } | undefined)?.uncertaintyFlags ?? [];
    if (fO.join('|') !== x.uncertaintyFlags.join('|')) {
      const tag = `uncertaintyFlags:${x.policyId}`;
      if (!EXPECTED_DIFFS.some((d) => d.id === tag)) unexpected.push(`${name} / ${tag}`);
    }
  }

  const nO = orig.filterNotices((noticesFile as { notices: unknown[] }).notices, pO, TODAY);
  const nN = filterNotices((noticesFile as never as { notices: never[] }).notices, pN, TODAY);
  checks++;
  if (JSON.stringify(nO.map((x: never) => (x as never as { id: string }).id)) !== JSON.stringify(nN.map((x) => x.id))) {
    unexpected.push(`${name} / notices 목록 불일치`);
  }
}

if (unexpected.length === 0) {
  console.log(`  ✅ ${checks}건 비교 — 의도하지 않은 차이 없음`);
  console.log('  (의도한 차이:');
  EXPECTED_DIFFS.forEach((d) => console.log(`     · ${d.id} — ${d.why}`));
  console.log('  )');
} else {
  fail += unexpected.length;
  unexpected.forEach((u) => console.log(`  ❌ ${u}`));
}

console.log('\n══ 2) D-day가 하루 안에서 흔들리지 않는가 (KST) ══');
const times = ['2026-08-21T00:10:00+09:00', '2026-08-21T12:00:00+09:00', '2026-08-21T23:50:00+09:00'];
const ds = times.map((t) =>
  computeProfile({ ...base, birthDate: '2003-01-01', exitType: '만기', protectionEndDate: '2021-08-25' } as never,
    new Date(t)).daysUntilFiveYearDeadline
);
checks++;
if (new Set(ds).size === 1) console.log(`  ✅ 하루 내내 D-${ds[0]} 로 고정`);
else { fail++; console.log(`  ❌ 시각에 따라 달라짐: ${ds.join(' / ')} — TZ=Asia/Seoul 로 실행했는지 확인`); }

console.log(`\n${fail === 0 ? '✅ 통과' : `❌ 실패 ${fail}건`}  (비교 ${checks}건)\n`);
process.exit(fail === 0 ? 0 : 1);
