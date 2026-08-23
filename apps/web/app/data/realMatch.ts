// 실시간 공공데이터 API로 걸러낸 "자립준비청년 관련" 54건(다음 화면에서 실제 개수는 변동될 수 있음)을
// 온보딩 프로필과 매칭해서 분류한다.
// ⚠️ 이 54건에는 나이·소득 조건이 구조화된 필드로 없다. 공고 원문(지원대상·요약) 텍스트에서
//    키워드를 찾아 판단하는 "추정"이며, 법적으로 확정된 판정이 아니다.

import { buildAgeInfo, type AgeInfo, type OnboardingProfile } from "./eligibility";
import type { WelfareItem } from "./apiPreview";
import { matchesUserRegion } from "@moja/core";

export type RealVerdict = "ELIGIBLE" | "INELIGIBLE" | "UNCERTAIN";

export type EvaluatedRealItem = WelfareItem & {
  verdict: RealVerdict;
  reasons: string[];
};

export type RealMatchSummary = {
  eligible: EvaluatedRealItem[];
  uncertain: EvaluatedRealItem[];
  ineligible: EvaluatedRealItem[];
};

// 지역 테이블·매칭 로직은 lib/regions.ts 로 옮겼다 (classify.ts 와 복붙되어 있던 것을 합침).

function regionCheck(item: WelfareItem, profile: OnboardingProfile): { pass: boolean; note?: string } {
  // lib/regions.ts 로 위임 — classify.ts 와 반드시 같은 답을 내야 한다.
  // (두 곳이 갈라지면 "검수한 값이 화면에 반영되지 않는다"처럼 보인다)
  const result = matchesUserRegion({ region: item.region, org: item.org }, profile.region);
  return result.pass ? { pass: true } : { pass: false, note: result.note };
}

function protectionYearsCheck(
  text: string,
  ageInfo: AgeInfo
): { verdict: RealVerdict; note?: string } | null {
  if (!/5년/.test(text)) return null;
  if (ageInfo.yearsSinceAnchor === null) {
    return { verdict: "UNCERTAIN", note: "보호종료 5년 이내 조건이 있어요 — 날짜 확인 필요" };
  }
  if (ageInfo.yearsSinceAnchor > 5) {
    return { verdict: "INELIGIBLE", note: "보호종료 후 5년이 지났어요 (이 공고는 5년 이내 대상)" };
  }
  return null;
}

function educationCheck(
  text: string,
  profile: OnboardingProfile
): { verdict: RealVerdict; note?: string } | null {
  const eduKeywords = ["등록금", "학자금", "장학금", "대학생"];
  if (!eduKeywords.some((kw) => text.includes(kw))) return null;
  if (profile.currentStatus === "UNIV" || profile.currentStatus === "GRAD") return null;
  if (profile.currentStatus === null) {
    return { verdict: "UNCERTAIN", note: "재학 여부에 따라 대상이 갈려요" };
  }
  return { verdict: "INELIGIBLE", note: "재학 중이어야 신청 가능해 보여요 (현재 미재학)" };
}

function homeCheck(text: string, profile: OnboardingProfile): { verdict: RealVerdict; note?: string } | null {
  if (!text.includes("무주택")) return null;
  if (profile.ownsHome === true) {
    return { verdict: "INELIGIBLE", note: "무주택 조건이 있어요 (현재 주택 소유)" };
  }
  if (profile.ownsHome === null) {
    return { verdict: "UNCERTAIN", note: "무주택 조건이 있어요 — 확인 필요" };
  }
  return null;
}

function basicLivelihoodCheck(
  text: string,
  profile: OnboardingProfile
): { verdict: RealVerdict; note?: string } | null {
  if (!text.includes("기초생활수급")) return null;
  if (profile.basicLivelihoodRecipient === "Y") return null;
  if (profile.basicLivelihoodRecipient === "UNKNOWN") {
    return { verdict: "UNCERTAIN", note: "기초생활수급 대상 여부 확인이 필요해요" };
  }
  return { verdict: "UNCERTAIN", note: "기초생활수급자 우대 조건이 있을 수 있어요" };
}

function currentlyProtectedCheck(
  text: string,
  profile: OnboardingProfile
): { verdict: RealVerdict; note?: string } | null {
  const endedOnlyKeywords = ["퇴소", "보호종료", "종결"];
  if (profile.protectionEndType !== "CURRENTLY_PROTECTED") return null;
  if (!endedOnlyKeywords.some((kw) => text.includes(kw))) return null;
  return { verdict: "UNCERTAIN", note: "보호종료(퇴소) 이후 신청 가능한 것으로 보여요 — 예정자 신청 가능 여부 확인 필요" };
}

const DUPLICATE_KEYWORDS = ["자립수당", "자립정착금", "국민내일배움카드", "국민취업지원제도", "디딤씨앗통장"];

function duplicateNote(item: WelfareItem, profile: OnboardingProfile): string | null {
  const name = item.servNm;
  for (const keyword of DUPLICATE_KEYWORDS) {
    if (name.includes(keyword) && profile.currentBenefits.some((b) => b.toLowerCase().includes(keyword) || keyword.includes(b))) {
      return `이미 비슷한 "${keyword}" 지원을 받고 계신 것 같아요 — 중복수급 여부 확인 필요`;
    }
  }
  return null;
}

export function matchRealItems(
  items: WelfareItem[],
  profile: OnboardingProfile,
  todayIso: string
): RealMatchSummary {
  const ageInfo = buildAgeInfo(profile, todayIso);

  const evaluated: EvaluatedRealItem[] = items.map((item) => {
    const text = `${item.servNm} ${item.servDgst} ${item.targetTraits ?? ""}`;
    const reasons: string[] = [];
    let verdict: RealVerdict = "ELIGIBLE";

    const region = regionCheck(item, profile);
    if (!region.pass) {
      verdict = "INELIGIBLE";
      if (region.note) reasons.push(region.note);
    }

    const checks = [
      protectionYearsCheck(text, ageInfo),
      educationCheck(text, profile),
      homeCheck(text, profile),
      basicLivelihoodCheck(text, profile),
      currentlyProtectedCheck(text, profile),
    ];

    for (const check of checks) {
      if (!check) continue;
      if (check.note) reasons.push(check.note);
      if (check.verdict === "INELIGIBLE") verdict = "INELIGIBLE";
      else if (check.verdict === "UNCERTAIN" && verdict !== "INELIGIBLE") verdict = "UNCERTAIN";
    }

    const dup = duplicateNote(item, profile);
    if (dup) {
      reasons.push(dup);
      if (verdict === "ELIGIBLE") verdict = "UNCERTAIN";
    }

    return { ...item, verdict, reasons };
  });

  return {
    eligible: evaluated.filter((i) => i.verdict === "ELIGIBLE"),
    uncertain: evaluated.filter((i) => i.verdict === "UNCERTAIN"),
    ineligible: evaluated.filter((i) => i.verdict === "INELIGIBLE"),
  };
}
