// ---------------------------------------------------------------------------
// criteria[] (검수자가 카탈로그에서 고른 기준들) → conditions[] (판정엔진이 먹는 조건)
//
// lib/engine/evaluate.ts는 한 줄도 고치지 않는다. 여기서 만드는 PolicyCondition[]은
// policies.json의 conditions 스펙과 완전히 같은 모양이라 evaluatePolicy가 그대로 먹는다.
// ---------------------------------------------------------------------------

import {
  getCriterionSpec,
  type CriterionEntry,
  type CriterionParams,
  type CriterionSpec,
} from './catalog';
import type { PolicyCondition } from '../engine/types';

/**
 * 온보딩에 문항이 없어서 값을 채울 수 없는 기준에 붙이는 안내 문구.
 * 조건을 만들지 않는 대신 이 문장이 결과 카드의 '확인 필요' 배지로 나간다.
 */
function missingQuestionLabel(spec: CriterionSpec, params: CriterionParams): string {
  return `${spec.sentence(params)} — 아직 이 항목을 여쭤보지 못해서 자동으로 확인할 수 없어요. 공고 원문이나 담당기관에서 직접 확인해주세요.`;
}

/**
 * 온보딩 문항이 있지만 답변으로 값을 정확히 알 수 없는(추정으로 채운) 기준에 붙이는 문구.
 */
function lossyQuestionLabel(spec: CriterionSpec, params: CriterionParams): string {
  return `${spec.sentence(params)} — 지금 온보딩 문항으로는 정확히 구분되지 않아서 확인이 필요해요.`;
}

/**
 * criteria[] → conditions[]. rejectReason은 카탈로그의 rejectSentence로 채운다.
 * citation처럼 제도마다 달라지는 값은 여기서 채우지 않는다 — 검수 화면([5단계])에서
 * 검수자가 입력한다.
 *
 * ★ 이 함수가 "물어보지 않은 것으로 탈락시키지 않는다"는 원칙을 지키는 관문이다.
 *
 * 세 가지 경우를 구분해서 처리한다:
 *
 *  1. toCondition이 null (manual_check_only / first_come_first_served / one_time_only /
 *     deadline_by) → 조건을 만들지 않는다. 원래부터 기계가 판단할 수 없는 항목이다.
 *
 *  2. blockedBy === 'missing_question' (예: income_at_most)
 *     → **조건을 만들지 않는다.** 이게 실제로 있었던 버그다. 온보딩에 소득 문항이 없어서
 *       incomeBracket이 undefined인데, 조건을 만들면 evalOp가 false를 돌려주고
 *       direction:'require'가 곧 '탈락'이 된다. 그래서 소득을 물어보지도 않은 사용자에게
 *       "소득이 기준을 넘어서 안 된다"고 통보했다. 배지조차 안 떴다.
 *       대신 uncertaintyLabel만 남겨서 '확인 필요'로 안내한다.
 *
 *  3. blockedBy === 'lossy_question' (예: enrolled_required / employed_required)
 *     → 조건은 유지한다(값이 추정으로라도 채워져 있다). 다만 riskyField와
 *       uncertaintyLabel을 붙여서 반드시 '확인 필요' 배지가 뜨게 한다.
 *       currentStatus가 단일선택이라 "재학이면서 취업"인 사람을 구분하지 못하는데,
 *       그 사람이 아무 경고 없이 탈락하면 안 된다.
 *
 * 원칙: 놓치는 오류(false negative)가 헛걸음 오류(false positive)보다 훨씬 나쁘다.
 */
export function criteriaToConditions(entries: CriterionEntry[]): PolicyCondition[] {
  const conditions: PolicyCondition[] = [];
  for (const entry of entries) {
    const spec = getCriterionSpec(entry.key);
    if (!spec) throw new Error(`카탈로그에 없는 기준 key: ${entry.key}`);

    // 경우 2 — 온보딩에 문항이 아예 없다. 조건을 만들면 조용히 탈락한다.
    if (spec.blockedBy === 'missing_question') {
      conditions.push({
        // 항상 참인 조건. 판정에 영향을 주지 않으면서 uncertaintyLabel만 전달한다.
        //
        // ⚠️ allOf: [] 여야 한다. anyOf: [] 를 쓰면 [].some() 이 false 라서
        //    direction:'require' 가 곧 탈락이 된다 — 고치려던 버그를 그대로 재현한다.
        //    allOf: [] 는 [].every() 가 true 라서 항상 통과한다.
        //    (엔진의 evalConditionNode 는 'anyOf' in node 를 먼저 검사하므로
        //     두 키를 같이 넣어서도 안 된다.)
        allOf: [],
        direction: 'require',
        uncertaintyLabel: missingQuestionLabel(spec, entry.params),
      } as unknown as PolicyCondition);
      continue;
    }

    const condition = spec.toCondition(entry.params);
    if (condition == null) continue;

    // 경우 3 — 값이 추정이다. 조건은 살리되 '확인 필요' 배지를 확보한다.
    const lossyExtras =
      spec.blockedBy === 'lossy_question'
        ? {
            riskyField: true,
            uncertaintyLabel:
              condition.uncertaintyLabel ?? lossyQuestionLabel(spec, entry.params),
          }
        : {};

    conditions.push({
      ...condition,
      ...lossyExtras,
      rejectReason: condition.rejectReason ?? spec.rejectSentence(entry.params),
    });
  }
  return conditions;
}

/** verified:true가 아닌 기준이 남아있는지. 승인 시 경고 모달에 쓴다([5단계]). */
export function hasUnverifiedCriteria(entries: CriterionEntry[]): boolean {
  return entries.some((entry) => entry.verified !== true);
}

/**
 * 판정에는 안 쓰이지만(toCondition이 null인) '확인 필요' 표시가 필요한 기준이 있는지.
 * policies_published.needs_human_check에 넣어 결과 카드에 배지로 띄운다([6단계]).
 */
export function needsHumanCheck(entries: CriterionEntry[]): boolean {
  return entries.some((entry) => {
    const spec = getCriterionSpec(entry.key);
    if (!spec) return false;
    // needsHumanCheck 플래그가 붙은 것뿐 아니라, 온보딩 문항 문제로 자동 판정이
    // 막힌/부정확한 기준도 전부 '확인 필요' 대상이다.
    return spec.needsHumanCheck === true || spec.blockedBy != null;
  });
}
