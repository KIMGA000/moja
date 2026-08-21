/* ===========================================================================
 * 카탈로그 안전성 테스트 — "물어보지 않은 것으로 탈락시키지 않는다"
 *
 * 실행: npm run qa:catalog
 *
 * 이 프로젝트에서 가장 나쁜 실패는 **받을 수 있는 지원을 놓치게 만드는 것**이다
 * (false negative). 헛걸음 한 번보다 훨씬 나쁘다. 그런데 판정엔진은
 * "답변이 없음(undefined)"과 "아니오(false)"를 구분하지 못한다:
 *
 *   evalOp(undefined, '==', true)  →  false
 *   direction: 'require'           →  조건 실패  →  '이미놓침'
 *
 * 즉 문항이 없거나 사용자가 답을 안 한 항목이 조용히 탈락으로 이어진다.
 * 에러도 경고도 남지 않는다. 이 파일은 그 부류를 기계적으로 잡는다.
 *
 * 두 단계로 나눈다:
 *   [A] 하드 실패 — blockedBy 기준(온보딩 문항이 없거나 부정확한 것)이
 *       배지 없이 탈락시키면 즉시 실패. 실제로 있었던 버그의 회귀 방지.
 *   [B] 기준선 감시 — 미응답 프로필에서 근거 없이 탈락하는 기준의 개수가
 *       기준선(BASELINE)보다 늘어나면 실패. 줄어들면 기준선을 낮추라고 알려준다.
 *       이건 온보딩 문항 구조 자체의 한계라 한 번에 못 고친다. 다만 나빠지는 건 막는다.
 * =========================================================================== */

import { CATALOG, type CriterionParams } from '../../lib/criteria/catalog';
import { criteriaToConditions, needsHumanCheck } from '../../lib/criteria/toCondition';
import { computeProfile } from '../../lib/engine/profile';
import { evaluateAll } from '../../lib/engine/evaluate';

const TODAY = new Date('2026-08-21T12:00:00+09:00');

/** [B]에서 허용하는 "근거 없는 조용한 탈락" 개수. 절대 늘리지 말 것. */
const BASELINE_SILENT_REJECTS = 10;

/** 파라미터를 타입에 맞게 그럴듯한 값으로 채운다. */
function fillParams(spec: (typeof CATALOG)[number]): CriterionParams {
  const p: CriterionParams = {};
  for (const param of spec.params) {
    p[param.name] =
      param.type === 'number' ? 5
      : param.type === 'string[]' ? ['서울특별시']
      : param.name.toLowerCase().includes('date') ? '2026-09-01'
      : 'x';
  }
  return p;
}

function judgeWithProfile(spec: (typeof CATALOG)[number], raw: Record<string, unknown>) {
  const entries = [{ key: spec.key, params: fillParams(spec), source: 'auto' as const, verified: false }];
  const conditions = criteriaToConditions(entries);
  const result = evaluateAll(
    computeProfile(raw as never, TODAY),
    [{ id: 'p', name: spec.key, category: 'x', conditions }] as never,
    []
  )[0];
  return {
    eligible: result.eligible,
    hasBadge: result.uncertaintyFlags.filter(Boolean).length > 0 || needsHumanCheck(entries),
    flags: result.uncertaintyFlags,
  };
}

let failures = 0;

// ── [A] blockedBy 기준은 배지 없이 탈락시키면 안 된다 (하드 실패) ──────────────
console.log('══ [A] 온보딩 문항이 없거나 부정확한 기준 ══');
const blocked = CATALOG.filter((s) => s.blockedBy != null);
if (blocked.length === 0) {
  console.log('  (blockedBy 표시된 기준이 없음 — 카탈로그를 확인하세요)');
}
for (const spec of blocked) {
  // 온보딩을 성실히 다 채운 프로필. 그래도 blockedBy 필드는 확정할 수 없다.
  const raw = {
    hasInstitutionalCare: true, exitType: '만기', protectionEndDate: '2024-06-01',
    birthDate: '2003-05-10', region: '서울특별시', ownsHouse: false, isMarried: false,
    isBasicLivelihoodRecipient: false, isNearPoorMedicalDiscount: false,
    isCurrentlyProtected: false, isCurrentlyReprotected: false, currentSupports: [],
    // incomeBracket / isEnrolled / isEmployed 는 일부러 비움
  };
  const r = judgeWithProfile(spec, raw);
  const bad = !r.eligible && !r.hasBadge;
  if (bad) failures++;
  const mark = bad ? '❌ 배지 없이 탈락' : r.eligible ? '✅ 탈락 안 함' : '✅ 탈락하되 배지 있음';
  console.log(`  ${spec.key.padEnd(26)} blockedBy=${String(spec.blockedBy).padEnd(17)} ${mark}`);
}

// ── [B] 미응답 프로필에서의 조용한 탈락 개수 감시 (기준선) ─────────────────────
console.log('\n══ [B] 아무 답변도 없는 프로필 (미응답 = "아니오"로 오인되는 문제) ══');
const silent: string[] = [];
for (const spec of CATALOG) {
  const r = judgeWithProfile(spec, {});
  if (!r.eligible && !r.hasBadge) silent.push(spec.key);
}
console.log(`  근거 없이 탈락: ${silent.length}건 (기준선 ${BASELINE_SILENT_REJECTS})`);
silent.forEach((k) => console.log(`    · ${k}`));
if (silent.length > BASELINE_SILENT_REJECTS) {
  failures++;
  console.log(`  ❌ 기준선을 넘었습니다. 새로 추가한 기준이 미응답을 탈락으로 처리하고 있어요.`);
} else if (silent.length < BASELINE_SILENT_REJECTS) {
  console.log(`  ✅ 기준선보다 줄었습니다 — BASELINE_SILENT_REJECTS 를 ${silent.length}(으)로 낮춰주세요.`);
} else {
  console.log(`  ✅ 기준선 유지 (온보딩 문항 구조의 한계 — 별도 과제로 남아 있음)`);
}
console.log(
  '\n  ℹ️ 이 항목들은 온보딩을 정상적으로 마치면 값이 채워지므로 실사용에서는 대부분\n' +
  '     발생하지 않습니다. 다만 OnboardingProfile 이 null 을 허용하기 때문에(게이트\n' +
  '     미응답, protectionEndType=null 등) 구조적 위험은 남아 있습니다.\n' +
  '     근본 해결은 "미응답"을 엔진이 별도 상태로 다루도록 하는 것입니다.'
);

// ── [C] 판정 안 해야 하는 기준은 반드시 배지가 있어야 한다 ────────────────────
console.log('\n══ [C] 판정하지 않는 기준(toCondition=null)이 흔적을 남기는가 ══');
for (const spec of CATALOG) {
  if (spec.toCondition(fillParams(spec)) != null) continue;
  const ok = spec.needsHumanCheck === true;
  if (!ok) failures++;
  console.log(`  ${spec.key.padEnd(26)} needsHumanCheck=${spec.needsHumanCheck === true} ${ok ? '✅' : '❌ 화면에 아무 흔적도 안 남음'}`);
}

console.log(`\n${failures === 0 ? '✅ 통과' : `❌ 실패 ${failures}건`}`);
process.exit(failures === 0 ? 0 : 1);
