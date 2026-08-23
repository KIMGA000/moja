// 검수 결과(criteria/conditions)와 DB 분류 컬럼을 판정엔진(@moja/core)에 그대로 태워 채점한다.
// 05_next-step-wire-review.md [작업 3] — 예전에는 여기서 공고 원문 텍스트를 매 요청마다
// 정규식으로 다시 분석했다. 그러면 DB의 criteria·conditions는 물론 mentions_*/requires_*
// 분류 컬럼도 아무도 읽지 않는 상태가 된다 — 검수 시스템을 만드는 이유 자체가 무력화된다.
//
// ⚠️ 폴백(검수 전 공고)에서도 원문 정규식을 다시 돌리지 않는다. DB 컬럼만 쓴다. 정규식을
// 남겨두면 판정 경로가 두 개가 되고, 그게 이 프로젝트에서 이미 두 번 사고를 낸 패턴이다
// (지역 로직 복붙 → 전북 공고가 전국으로 분류). 지역도 예외 없이 엔진 조건(region ==)으로 옮겼다.

import {
  toEngineProfile,
  computeProfile,
  evaluateAll,
  type ClassificationStatus,
  type ClassifiedResult,
  type Policy,
  type PolicyCondition,
} from "@moja/core";
import type { AnnouncementItem } from "./apiPreview";
import type { OnboardingProfile } from "./eligibility";

export type EvaluatedRealItem = AnnouncementItem & {
  status: ClassificationStatus;
  dDay: number | null;
  /** 탈락(이미놓침) 또는 예정 사유. 사용자에게 그대로 보여준다. */
  reasons: string[];
  /** eligible이어도 붙을 수 있는 '확인 필요' 문장. 탈락이 아니므로 버킷은 옮기지 않는다. */
  uncertaintyFlags: string[];
  needsCheck: boolean;
  /** conditions가 비어 있어 사람이 아직 검수하지 않은 공고. */
  notReviewed: boolean;
};

export type RealMatchSummary = {
  eligible: EvaluatedRealItem[];
  uncertain: EvaluatedRealItem[];
  ineligible: EvaluatedRealItem[];
};

function policyIdOf(item: AnnouncementItem): string {
  return `${item.source}:${item.id}`;
}

/**
 * 검수된 공고(conditions 있음) → 그대로 쓴다. 검수 전 공고(conditions 빈 배열) →
 * mentions_ / requires_ / region_scope / protection_years_limit 컬럼으로 조건을 조립한다.
 */
function toPolicyShape(item: AnnouncementItem): { policy: Policy; notReviewed: boolean } {
  if (item.conditions.length > 0) {
    return {
      policy: { id: policyIdOf(item), name: item.servNm, category: "공고", conditions: item.conditions },
      notReviewed: false,
    };
  }

  const conditions: PolicyCondition[] = [];

  if (item.requiresEnrolled) {
    conditions.push({
      field: "isEnrolled",
      op: "==",
      value: true,
      direction: "require",
      rejectReason: "재학 중이어야 신청 가능해 보여요 (현재 미재학)",
    });
  }
  if (item.requiresNoHome) {
    conditions.push({
      field: "ownsHouse",
      op: "==",
      value: true,
      direction: "exclude",
      rejectReason: "무주택 조건이 있어요 (현재 주택 소유)",
    });
  }
  if (item.requiresBasicLivelihood) {
    conditions.push({
      field: "isBasicLivelihoodRecipient",
      op: "==",
      value: true,
      direction: "require",
      rejectReason: "기초생활수급자여야 신청 가능해 보여요",
      riskyField: true,
      uncertaintyLabel: "기초생활수급 우대 조건이 있어 보여요 — 확인해보세요.",
    });
  }
  if (item.requiresAlreadyEnded) {
    conditions.push({
      field: "isCurrentlyProtected",
      op: "==",
      value: true,
      direction: "exclude",
      rejectReason: "보호종료(퇴소) 이후 신청 가능해 보여요",
    });
  }
  if (item.protectionYearsLimit != null) {
    // computeProfile은 daysUntilFiveYearDeadline 하나만(5년 고정) 계산한다. N이 5가 아니면
    // 문장과 실제 판정 기준이 어긋날 수 있어 확인 필요로 처리한다 — catalog.ts의
    // within_years_after_exit와 같은 이유.
    const isFiveYears = item.protectionYearsLimit === 5;
    conditions.push({
      field: "daysUntilFiveYearDeadline",
      op: ">=",
      value: 0,
      direction: "require",
      rejectReason: isFiveYears
        ? "보호종료 후 5년이 지났어요 (이 공고는 5년 이내 대상)"
        : `보호종료 후 ${item.protectionYearsLimit}년이 지나 신청하기 어려워 보여요`,
      ...(isFiveYears
        ? {}
        : {
            riskyField: true,
            uncertaintyLabel: `보호종료 후 ${item.protectionYearsLimit}년 이내 조건이 있어요 — 정확한 기한은 원문에서 확인해보세요.`,
          }),
    });
  }
  if (item.regionScope) {
    conditions.push({
      field: "region",
      op: "==",
      value: item.regionScope,
      direction: "require",
      rejectReason: `거주 지역과 달라요 (이 공고는 ${item.regionScope} 대상)`,
    });
  }

  return {
    policy: { id: policyIdOf(item), name: item.servNm, category: "공고", conditions },
    notReviewed: true,
  };
}

/** 조건 노드가 참조하는 필드명을 전부 모은다 (anyOf/allOf 재귀). */
function fieldsOf(node: PolicyCondition): string[] {
  const n = node as unknown as {
    anyOf?: PolicyCondition[]; allOf?: PolicyCondition[]; field?: string;
  };
  if (n.anyOf) return n.anyOf.flatMap(fieldsOf);
  if (n.allOf) return n.allOf.flatMap(fieldsOf);
  return n.field ? [n.field] : [];
}

/**
 * 온보딩 문항 구조 때문에 "추정으로 채운" 필드를 참조하는 조건에 riskyField와 안내 문장을 붙인다.
 *
 * 왜 필요한가: currentStatus가 UNIV/GRAD/EMPLOYED/UNEMPLOYED 단일선택이라 "재학이면서 취업"인
 * 사람을 표현할 수 없다. 어댑터는 EMPLOYED를 고른 사람의 isEnrolled를 false로 "추정"하는데,
 * 그 상태로 재학 요건 공고에서 탈락하면 실제로는 받을 수 있는 사람이 아무 경고도 없이 잘린다.
 * 놓치는 오류(false negative)가 헛걸음보다 나쁘다는 원칙에 따라, 추정으로 탈락할 수 있는
 * 조건은 반드시 '확인 필요'를 남긴다.
 *
 * 검수된 공고(DB conditions)와 검수 전 공고(폴백 조건) 양쪽에 적용된다 — 이건 공고의 성질이
 * 아니라 사용자 답변의 성질이기 때문이다.
 */
function markLossyConditions(
  conditions: PolicyCondition[],
  lossyFields: { field: string; reason: string }[]
): PolicyCondition[] {
  if (lossyFields.length === 0) return conditions;
  const lossyByField = new Map(lossyFields.map((f) => [f.field, f.reason]));

  return conditions.map((cond) => {
    const hit = fieldsOf(cond).find((f) => lossyByField.has(f));
    if (!hit) return cond;
    return {
      ...cond,
      riskyField: true,
      uncertaintyLabel:
        cond.uncertaintyLabel ??
        `${lossyByField.get(hit)} 이 답변에 따라 결과가 달라질 수 있어요 — 담당기관에 확인해보세요.`,
    };
  });
}

export function matchRealItems(
  items: AnnouncementItem[],
  profile: OnboardingProfile,
  todayIso: string
): RealMatchSummary {
  const { profile: rawProfile, lossyFields } = toEngineProfile(profile);
  const engineProfile = computeProfile(rawProfile, new Date(todayIso));

  const shapes = items.map((item) => {
    const shaped = toPolicyShape(item);
    return {
      item,
      ...shaped,
      // 추정으로 채운 답변이 관여하는 조건에 '확인 필요'를 붙인다 (markLossyConditions 주석 참고)
      policy: {
        ...shaped.policy,
        conditions: markLossyConditions(shaped.policy.conditions, lossyFields),
      },
    };
  });
  const itemByPolicyId = new Map(shapes.map((s) => [s.policy.id, s]));

  // evaluateAll이 곧마감 > 신청가능 > 예정 > 이미놓침 순으로 이미 정렬해준다 — 그 순서를
  // 그대로 따라가려고 shapes가 아니라 results 순서로 결과를 만든다.
  const results = evaluateAll(engineProfile, shapes.map((s) => s.policy), []);

  const evaluated: EvaluatedRealItem[] = results.map((result: ClassifiedResult) => {
    const shape = itemByPolicyId.get(result.policyId);
    if (!shape) throw new Error(`알 수 없는 policyId: ${result.policyId}`);

    const reasons =
      result.status === "예정" ? ["아직 신청 시기가 아니에요 (보호종료 후 신청 가능)"] : result.reasons;

    return {
      ...shape.item,
      status: result.status,
      dDay: result.dDay,
      reasons,
      uncertaintyFlags: result.uncertaintyFlags,
      needsCheck: result.uncertaintyFlags.length > 0,
      notReviewed: shape.notReviewed,
    };
  });

  return {
    eligible: evaluated.filter((i) => i.status === "곧마감" || i.status === "신청가능"),
    uncertain: evaluated.filter((i) => i.status === "예정"),
    ineligible: evaluated.filter((i) => i.status === "이미놓침"),
  };
}
