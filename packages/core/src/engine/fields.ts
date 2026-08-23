// ---------------------------------------------------------------------------
// 판정에 쓸 수 있는 프로필 필드의 정본 목록 + 검증기
//
// 왜 필요한가:
//   getField(profile, 'isEnroled')처럼 필드명에 오타가 있으면 undefined가 반환되고,
//   evalOp('==')는 false를 돌려주고, direction:'require' 조건은 조용히 '탈락'이 된다.
//   에러도 경고도 남지 않는다. 즉 오타 하나가 "받을 수 있는 지원을 못 받는" 결과로
//   이어지는데 아무도 모른다. 이 프로젝트에서 가장 나쁜 실패 유형이다.
//   그래서 데이터(policies.json / criteria)를 불러올 때 필드명을 반드시 검증한다.
// ---------------------------------------------------------------------------

import type { ConditionNode, Policy, RelationRule } from './types';

/** 온보딩에서 직접 받는 원시 필드. */
export const RAW_PROFILE_FIELDS = [
  'hasInstitutionalCare',
  'exitType',
  'isCurrentlyProtected',      // [4단계] 신설
  'isCurrentlyReprotected',
  'birthDate',
  'protectionEndDate',
  'isEnrolled',
  'isEmployed',
  'region',
  'incomeBracket',
  'ownsHouse',
  'isMarried',
  'isBasicLivelihoodRecipient',
  'isNearPoorMedicalDiscount',
  'currentSupports',
] as const;

/** computeProfile이 계산하는 파생 필드. */
export const DERIVED_PROFILE_FIELDS = [
  'ageYears',
  'fiveYearBaseDate',
  'fiveYearDeadlineDate',
  'yearsSinceFiveYearBase',
  'daysUntilFiveYearDeadline',
] as const;

export const ALL_PROFILE_FIELDS: readonly string[] = [
  ...RAW_PROFILE_FIELDS,
  ...DERIVED_PROFILE_FIELDS,
];

const FIELD_SET = new Set(ALL_PROFILE_FIELDS);

export type FieldIssue = {
  where: string;      // 'policy:self-reliance-allowance' / 'rule:allowance-vs-other-law'
  field: string;
  suggestion?: string; // 편집거리로 찾은 가장 비슷한 정본 필드명
};

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function suggest(field: string): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const f of ALL_PROFILE_FIELDS) {
    const d = levenshtein(field.toLowerCase(), f.toLowerCase());
    if (d < bestD) { bestD = d; best = f; }
  }
  return bestD <= 3 ? best : undefined;
}

function walk(node: ConditionNode, where: string, out: FieldIssue[]): void {
  if ('anyOf' in node) { node.anyOf.forEach((n) => walk(n, where, out)); return; }
  if ('allOf' in node) { node.allOf.forEach((n) => walk(n, where, out)); return; }
  if (!FIELD_SET.has(node.field)) {
    out.push({ where, field: node.field, suggestion: suggest(node.field) });
  }
}

/**
 * 정책·규칙 데이터 안의 모든 condition.field가 정본 목록에 있는지 검사한다.
 * 반환이 빈 배열이 아니면 **판정을 신뢰할 수 없는 상태**다.
 */
export function validateFields(
  policies: Policy[] | { policies: Policy[] },
  rules: RelationRule[] | { rules: RelationRule[] } = []
): FieldIssue[] {
  // 호출부에서 policies.json / rules.json 파일 객체를 그대로 넘기는 실수가 잦다.
  // 배열이든 { policies } / { rules } 래퍼든 둘 다 받아준다.
  const pList = Array.isArray(policies) ? policies : (policies?.policies ?? []);
  const rList = Array.isArray(rules) ? rules : (rules?.rules ?? []);

  const out: FieldIssue[] = [];
  for (const p of pList) {
    for (const c of p.conditions ?? []) walk(c, `policy:${p.id}`, out);
  }
  for (const r of rList) {
    if (r.if) walk(r.if, `rule:${r.id}`, out);
  }
  return out;
}

/**
 * 앱 시작 시 호출. 문제가 있으면 개발 중에는 즉시 던지고,
 * 운영 중에는 로그만 남기고 계속 돌린다(전체 화면이 죽는 것보다 낫다).
 *
 * mode는 호출부가 명시적으로 정한다 — 이 함수는 실행 환경 변수를 직접 읽지 않는다.
 * core는 플랫폼 독립적이어야 하는데(RN에는 Node식 환경변수 전역객체가 없다), 환경에
 * 따라 mode를 정하고 싶은 호출부(예: 웹의 프로덕션 여부 판단)는 그 판단을 자기 쪽에서
 * 하고 결과값만 인자로 넘겨야 한다 — computeProfile(raw, today)가 new Date()를 안에서
 * 부르지 않고 today를 인자로 받는 것과 같은 이유다.
 */
export function assertFieldsValid(
  policies: Policy[] | { policies: Policy[] },
  rules: RelationRule[] | { rules: RelationRule[] } = [],
  mode: 'throw' | 'warn' = 'throw'
): FieldIssue[] {
  const issues = validateFields(policies, rules);
  if (issues.length === 0) return issues;
  const msg =
    '판정 조건에 알 수 없는 필드명이 있어요 (오타면 사용자가 받을 수 있는 지원을 조용히 놓칩니다):\n' +
    issues
      .map((i) => `  · ${i.where} → "${i.field}"${i.suggestion ? ` (혹시 "${i.suggestion}"?)` : ''}`)
      .join('\n');
  if (mode === 'throw') throw new Error(msg);
  console.error('[moja:fields] ' + msg);
  return issues;
}
