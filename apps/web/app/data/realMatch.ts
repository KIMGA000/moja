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

export function matchRealItems(
  items: AnnouncementItem[],
  profile: OnboardingProfile,
  todayIso: string
): RealMatchSummary {
  const { profile: rawProfile } = toEngineProfile(profile);
  const engineProfile = computeProfile(rawProfile, new Date(todayIso));

  const shapes = items.map((item) => ({ item, ...toPolicyShape(item) }));
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
