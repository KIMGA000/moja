// ---------------------------------------------------------------------------
// 판정엔진 2부: 조건 평가 + 정책 평가 + 관계 규칙 + 최종 분류 + 공고 필터링
// app.html의 MojaEngine을 그대로 옮긴 것. 로직은 바꾸지 않았다.
//
// 설계 원칙 (팀 브리프 그대로 반영):
//  1) AI는 이 파일을 절대 대체하지 않는다 — 판정은 순수 코드, 결정론적, 테스트 가능해야 한다.
//  2) 복잡한 계산(경과년수, D-day, 조기퇴소자 5년 기산점)은 사용자에게 묻지 않고 여기서 계산한다.
//  3) 판정은 흐리게 보류하지 않는다 — 모든 정책은 정확히 3분류 중 하나로 귀결된다:
//     '신청가능' | '곧마감' | '이미놓침'  ([4단계]에서 '예정'이 추가된다)
//  4) 입력받지 않은 조건이 결과에 영향을 줄 수 있으면(riskyField/uncertaintyLabel이 있는 조건이
//     이 판정에 실제로 관여했으면) uncertaintyFlag를 세운다 → 카드에 "별도 확인 필요" 표시.
// ---------------------------------------------------------------------------

import { diffInDays } from './profile';
import type {
  ClassifiedResult,
  CompareOp,
  ConditionNode,
  FilteredNotice,
  Notice,
  NoticesFile,
  Policy,
  PoliciesFile,
  PolicyEvalResult,
  Profile,
  RelationRule,
  RulesFile,
} from './types';

const SOON_DEADLINE_DAYS = 30; // 이 안이면 '곧마감'

// ---------------------------------------------------------------------------
// 2. 조건(condition) 평가 — anyOf/allOf 재귀 지원
// ---------------------------------------------------------------------------

function getField(profile: Profile, field: string): unknown {
  return (profile as Record<string, unknown>)[field];
}

function evalOp(actual: unknown, op: CompareOp, expected: unknown): boolean {
  switch (op) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '<=':
      return actual != null && (actual as number) <= (expected as number);
    case '>=':
      return actual != null && (actual as number) >= (expected as number);
    case '<':
      return actual != null && (actual as number) < (expected as number);
    case '>':
      return actual != null && (actual as number) > (expected as number);
    case 'includes':
      return Array.isArray(actual) && actual.includes(expected);
    case 'notIncludes':
      return !(Array.isArray(actual) && actual.includes(expected));
    case 'includesAnyOf':
      return (
        Array.isArray(actual) &&
        Array.isArray(expected) &&
        (expected as unknown[]).some((v) => (actual as unknown[]).includes(v))
      );
    default:
      throw new Error(`알 수 없는 연산자: ${op as string}`);
  }
}

type ConditionEvalOutcome = { satisfied: boolean; usedRiskyField: boolean };

/**
 * 단일 leaf condition 평가. anyOf/allOf 노드도 재귀적으로 처리한다.
 */
function evalConditionNode(node: ConditionNode, profile: Profile): ConditionEvalOutcome {
  if ('anyOf' in node) {
    const results = node.anyOf.map((n) => evalConditionNode(n, profile));
    return {
      satisfied: results.some((r) => r.satisfied),
      usedRiskyField: results.some((r) => r.usedRiskyField),
    };
  }
  if ('allOf' in node) {
    const results = node.allOf.map((n) => evalConditionNode(n, profile));
    return {
      satisfied: results.every((r) => r.satisfied),
      usedRiskyField: results.some((r) => r.usedRiskyField),
    };
  }
  const actual = getField(profile, node.field);
  const satisfied = evalOp(actual, node.op, node.value);
  return { satisfied, usedRiskyField: !!node.riskyField };
}

// ---------------------------------------------------------------------------
// 3. 정책 하나 평가
// ---------------------------------------------------------------------------

export function evaluatePolicy(policy: Policy, profile: Profile): PolicyEvalResult {
  const reasons: string[] = [];
  const uncertaintyFlags: string[] = [];
  let eligible = true;

  for (const cond of policy.conditions) {
    const { satisfied, usedRiskyField } = evalConditionNode(cond, profile);
    const direction = cond.direction; // require | exclude
    const conditionFailed = direction === 'require' ? !satisfied : satisfied;

    if (conditionFailed) {
      eligible = false;
      if (cond.rejectReason) reasons.push(cond.rejectReason);
    }

    // uncertaintyLabel이 있는 조건은, 그 조건이 이번 판정에 "영향을 줬을 가능성이 있으면"
    // (즉 require인데 이 조건 하나로 통과/탈락이 갈리는 경계인 경우) 별도 확인 라벨을 띄운다.
    // 보수적으로: uncertaintyLabel이 붙은 condition은 결과와 무관하게 항상 플래그를 남긴다 —
    // "입력 안 받은 세부사항이 이 판정에 영향을 줄 수 있다"는 원칙(3)을 지키기 위함.
    if (cond.uncertaintyLabel || usedRiskyField) {
      uncertaintyFlags.push(cond.uncertaintyLabel || '이 조건은 별도 확인이 필요해요.');
    }
  }

  // 이 정책이 5년 기산점 기한과 연동되는지(즉 D-day 표시 대상인지) 판단:
  // conditions 중 daysUntilFiveYearDeadline 조건이 있으면 fiveYearDeadlineDate를 기준으로 D-day를 보여준다.
  const hasFiveYearDeadline = policy.conditions.some(
    (c) => 'field' in c && c.field === 'daysUntilFiveYearDeadline'
  );

  return {
    policyId: policy.id,
    name: policy.name,
    category: policy.category,
    eligible,
    reasons,
    uncertaintyFlags,
    hasDeadlineSignal: hasFiveYearDeadline,
    daysUntilDeadline: hasFiveYearDeadline ? profile.daysUntilFiveYearDeadline : null,
    citation: policy.citation,
    lastVerified: policy.lastVerified,
    reverifyBy: policy.reverifyBy,
    sourceUrl: policy.sourceUrl,
  };
}

// ---------------------------------------------------------------------------
// 4. 정책 간 관계 규칙(rules.json) 2차 적용 — 중복수급 강등
// ---------------------------------------------------------------------------

export function applyRelationRules(
  evalResults: PolicyEvalResult[],
  rules: RelationRule[],
  profile: Profile
): PolicyEvalResult[] {
  const byId = new Map(evalResults.map((r) => [r.policyId, r]));

  for (const rule of rules) {
    if (rule.type === 'mutual_exclusion' && rule.then) {
      const { satisfied } = evalConditionNode(rule.if as ConditionNode, profile);
      const target = byId.get(rule.then);
      if (satisfied && target && target.eligible) {
        target.eligible = false;
        target.reasons.push(rule.reason);
        target.downgradedBy = rule.id;
      }
    }

    if (rule.type === 'partial_exclusion' && rule.then) {
      const { satisfied } = evalConditionNode(rule.if as ConditionNode, profile);
      const target = byId.get(rule.then);
      if (satisfied && target && target.eligible) {
        target.eligible = false;
        target.reasons.push(rule.reason);
        target.downgradedBy = rule.id;
        // rule.note는 스키마 설명용 **내부 메모**(문어체)라서 사용자 화면에 그대로 내보내면
        // 안 된다. 사용자에게 보여줄 문장은 uncertaintyLabel에만 담고, 없으면 아무것도
        // 추가하지 않는다. (빈 문자열을 밀어넣으면 결과 카드에 빈 배지가 생긴다.)
        if (rule.uncertaintyLabel) target.uncertaintyFlags.push(rule.uncertaintyLabel);
      }
    }

    if (rule.type === 'mutual_exclusion' && rule.group) {
      const selected = rule.group.filter((id) => profile.currentSupports.includes(id));
      if (selected.length >= 1) {
        // 이미 그룹 중 하나를 받고 있으면, 같은 그룹의 "받고 있지 않은" 나머지 항목은
        // exemption이 없는 한 강등한다. (exemption은 별도 mutual_exclusion_exception 규칙으로 처리)
        const exemptIds = rules
          .filter((r) => r.type === 'mutual_exclusion_exception' && r.fromGroup === rule.id)
          .map((r) => r.exemptPolicy);

        for (const memberId of rule.group) {
          if (selected.includes(memberId)) continue; // 이미 받고 있는 항목 자체는 강등하지 않음
          if (exemptIds.includes(memberId)) continue;
          const target = byId.get(memberId);
          if (target && target.eligible) {
            target.eligible = false;
            target.reasons.push(rule.reason);
            target.downgradedBy = rule.id;
          }
        }
      }
    }
  }

  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// 5. 최종 3분류 상태 부여 — 신청가능 / 곧마감 / 이미놓침
// ([4단계]에서 '예정' 상태가 추가되며 이 함수가 4분류로 확장된다)
// ---------------------------------------------------------------------------

export function classify(result: PolicyEvalResult): ClassifiedResult {
  if (!result.eligible) {
    return { ...result, status: '이미놓침', dDay: result.hasDeadlineSignal ? result.daysUntilDeadline : null };
  }
  if (
    result.hasDeadlineSignal &&
    result.daysUntilDeadline != null &&
    result.daysUntilDeadline <= SOON_DEADLINE_DAYS &&
    result.daysUntilDeadline >= 0
  ) {
    return { ...result, status: '곧마감', dDay: result.daysUntilDeadline };
  }
  return { ...result, status: '신청가능', dDay: result.hasDeadlineSignal ? result.daysUntilDeadline : null };
}

// ---------------------------------------------------------------------------
// 6. 전체 파이프라인
// ---------------------------------------------------------------------------

export function evaluateAll(
  profile: Profile,
  policiesFile: PoliciesFile,
  rulesFile?: RulesFile
): ClassifiedResult[] {
  const policies = 'policies' in policiesFile ? policiesFile.policies : policiesFile;
  const rules = rulesFile == null ? [] : 'rules' in rulesFile ? rulesFile.rules : rulesFile;

  let results = policies.map((policy) => evaluatePolicy(policy, profile));
  results = applyRelationRules(results, rules, profile);
  const classified = results.map(classify);

  // 정렬: 곧마감(D-day 임박) > 신청가능 > 이미놓침, 같은 상태 내에서는 D-day 오름차순
  const order: Record<string, number> = { 곧마감: 0, 신청가능: 1, 이미놓침: 2 };
  classified.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    const ad = a.dDay == null ? Infinity : a.dDay;
    const bd = b.dDay == null ? Infinity : b.dDay;
    return ad - bd;
  });

  return classified;
}

// ---------------------------------------------------------------------------
// 7. 공고(notices) 경량 필터링 — 정밀 판정 없음, 마감일·연령 상한만 체크
// ---------------------------------------------------------------------------

/**
 * notices.json은 21개 제도와 다르게 무겁게 검증하지 않는다.
 * 마감 지난 공고는 제외하고, 나이 상한을 넘으면 제외한다. 그 외 자격은 sourceUrl 원문에서
 * 사용자가 직접 확인하도록 안내 문구만 붙인다.
 */
export function filterNotices(
  notices: Notice[] | NoticesFile,
  profile: Profile,
  today: Date = new Date()
): FilteredNotice[] {
  const list = Array.isArray(notices) ? notices : notices.notices;

  return list
    .map((n) => {
      const deadlineDate = n.deadline ? new Date(n.deadline) : null;
      const dDay = deadlineDate ? diffInDays(today, deadlineDate) : null;
      const expired = dDay != null && dDay < 0;
      const tooOld = n.ageMax != null && profile.ageYears != null && profile.ageYears > n.ageMax;
      return {
        ...n,
        dDay,
        visible: !expired && !tooOld,
        note: n.note || '자세한 자격은 원문에서 확인하세요.',
      };
    })
    .filter((n) => n.visible)
    .sort((a, b) => (a.dDay ?? Infinity) - (b.dDay ?? Infinity));
}
