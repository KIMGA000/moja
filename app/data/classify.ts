// 공고 원문 텍스트에서 온보딩 질문(app/data/eligibility.ts)과 매칭할 조건을 미리 뽑아 DB 컬럼으로
// "굳혀두는" 로직. app/data/realMatch.ts가 화면에서 매번 하던 텍스트 검사를, 저장 시점에 한 번만
// 계산해두면 조회 쿼리가 SQL WHERE절만으로 끝난다 (매 요청마다 정규식 다시 돌릴 필요 없음).
// ⚠️ 그래도 텍스트 키워드 기반 추정이라 100% 확정은 아니다 — 검수 워크플로우(review_status)로 보완한다.

import type { WelfareItem } from "./apiPreview";
import { isAboutCareLeavers, isAboutYouth } from "../../lib/govApis";
import { resolveRegionScope } from "../../lib/regions";
import type { InterestCategory, ProtectionEndType } from "./eligibility";

export type AnnouncementClassification = {
  mentionsCareLeaver: boolean;
  mentionsYouth: boolean;
  protectionYearsLimit: number | null; // "5년 이내" 같은 조건에서 뽑은 숫자
  requiresEnrolled: boolean; // 등록금·학자금·장학금 등 재학 요건 언급
  requiresNoHome: boolean; // 무주택 요건 언급
  requiresBasicLivelihood: boolean; // 기초생활수급 요건 언급
  requiresAlreadyEnded: boolean; // 퇴소·보호종료·종결 등 "이미 보호가 끝난 사람" 전제 언급
  regionScope: string | null; // 특정 시·도가 언급되면 그 이름, 전국 단위면 null
  interestCategories: InterestCategory[];
  protectionEndTypesApplicable: ProtectionEndType[]; // 본문에서 배제 신호가 없으면 5종 전부
};

// 지역 테이블·매칭 로직은 lib/regions.ts 로 옮겼다 (realMatch.ts 와 복붙되어 있던 것을 합침).


const ALL_PROTECTION_END_TYPES: ProtectionEndType[] = [
  "AGE18_END",
  "EXTENDED_END",
  "EARLY_END",
  "REPROTECTED_END",
  "CURRENTLY_PROTECTED",
];

// 서비스분야(themes) 한글 라벨 → 온보딩 관심분야 카테고리 매핑 (대략적인 다대일 매핑)
const THEME_TO_CATEGORY: Record<string, InterestCategory> = {
  생활지원: "INCOME",
  생활안정: "INCOME",
  서민금융: "ASSET",
  주거: "HOUSING",
  "주거·자립": "HOUSING",
  신체건강: "MEDICAL",
  의료: "MEDICAL",
  정신건강: "MENTAL",
  "보육·교육": "EDUCATION",
  교육: "EDUCATION",
  일자리: "JOB",
  "보호·돌봄": "MENTORING",
  "입양·위탁": "MENTORING",
  "문화·여가": "ETC",
  법률: "ETC",
  "안전·위기": "ETC",
};

function extractRegionScope(item: WelfareItem): string | null {
  // lib/regions.ts 로 위임. 개편 전 지명(전라북도·강원도)도 여기서 정식 명칭으로 정규화된다.
  return resolveRegionScope({ region: item.region, org: item.org });
}

function extractProtectionYearsLimit(text: string): number | null {
  const match = text.match(/(\d+)\s*년\s*(이내|간)/);
  return match ? Number(match[1]) : null;
}

function extractInterestCategories(item: WelfareItem): InterestCategory[] {
  const categories = new Set<InterestCategory>();
  for (const theme of item.themes) {
    const mapped = THEME_TO_CATEGORY[theme];
    if (mapped) categories.add(mapped);
  }
  if (categories.size === 0) categories.add("ETC");
  return [...categories];
}

export function classifyItem(item: WelfareItem): AnnouncementClassification {
  const text = `${item.servNm} ${item.servDgst} ${item.targetTraits ?? ""}`;

  return {
    mentionsCareLeaver: isAboutCareLeavers(item),
    mentionsYouth: isAboutYouth(item),
    protectionYearsLimit: extractProtectionYearsLimit(text),
    requiresEnrolled: /등록금|학자금|장학금|대학생/.test(text),
    requiresNoHome: text.includes("무주택"),
    requiresBasicLivelihood: text.includes("기초생활수급"),
    requiresAlreadyEnded: /퇴소|보호종료|종결/.test(text),
    regionScope: extractRegionScope(item),
    interestCategories: extractInterestCategories(item),
    protectionEndTypesApplicable: ALL_PROTECTION_END_TYPES,
  };
}
