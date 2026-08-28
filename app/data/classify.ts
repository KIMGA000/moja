// 공고 원문 텍스트에서 온보딩 질문(app/data/eligibility.ts)과 매칭할 조건을 미리 뽑아 DB 컬럼으로
// "굳혀두는" 로직. app/data/realMatch.ts가 화면에서 매번 하던 텍스트 검사를, 저장 시점에 한 번만
// 계산해두면 조회 쿼리가 SQL WHERE절만으로 끝난다 (매 요청마다 정규식 다시 돌릴 필요 없음).
// ⚠️ 그래도 텍스트 키워드 기반 추정이라 100% 확정은 아니다 — 검수 워크플로우(review_status)로 보완한다.

import type { WelfareItem } from "./apiPreview";
import { isAboutCareLeavers, isAboutYouth } from "../../lib/govApis";
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
  descriptionTags: string[]; // 원문(설명·지원대상)에서 찾은 핵심 키워드 — 화면에 #태그로 표시
};

const REGION_SHORT: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기",
  강원특별자치도: "강원",
  충청북도: "충북",
  충청남도: "충남",
  전북특별자치도: "전북",
  전라남도: "전남",
  경상북도: "경북",
  경상남도: "경남",
  제주특별자치도: "제주",
};
const FULL_REGION_NAMES = Object.keys(REGION_SHORT);
const ALL_REGION_TOKENS = Object.values(REGION_SHORT);

const NATIONAL_ORG_KEYWORDS = [
  "보건복지부",
  "고용노동부",
  "성평등가족부",
  "교육부",
  "국토교통부",
  "한국토지주택공사",
  "한국장학재단",
  "아동권리보장원",
  "여성가족부",
];

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
  const locationText = `${item.region ?? ""} ${item.org}`;
  if (NATIONAL_ORG_KEYWORDS.some((kw) => item.org.includes(kw)) && !item.region) {
    return null;
  }
  const mentionedFullNames = FULL_REGION_NAMES.filter((name) => locationText.includes(name));
  if (mentionedFullNames.length > 0) return mentionedFullNames[0];

  const mentionedTokens = ALL_REGION_TOKENS.filter((token) => locationText.includes(token));
  if (mentionedTokens.length > 0) {
    const fullName = Object.entries(REGION_SHORT).find(([, short]) => short === mentionedTokens[0])?.[0];
    return fullName ?? mentionedTokens[0];
  }
  return null;
}

function extractProtectionYearsLimit(text: string): number | null {
  const match = text.match(/(\d+)\s*년\s*(이내|간)/);
  return match ? Number(match[1]) : null;
}

// 공고 원문(설명·지원대상)이 법조문투 긴 문단이라 통째로 읽기 어려운 경우가 많아서, 자립준비청년
// 맥락에서 자주 나오는 단어만 미리 정해두고 찾아서 #태그로 뽑아 보여준다. 원문 문장 자체를
// 대체하는 게 아니라, 빠르게 훑어볼 수 있게 돕는 용도라 목록에 없는 단어는 그냥 안 뜬다.
const DESCRIPTION_TAG_KEYWORDS = [
  "가정위탁",
  "시설보호",
  "아동복지시설",
  "공동생활가정",
  "보호종료",
  "조기퇴소",
  "연장보호",
  "자립수당",
  "자립정착금",
  "무주택",
  "기초생활수급",
  "차상위",
  "등록금",
  "학자금",
  "장학금",
  "대학생",
  "재학",
  "취업",
  "미취업",
  "심리상담",
  "멘토링",
  "주거",
  "의료비",
  "운전면허",
];

function extractDescriptionTags(text: string): string[] {
  const found = new Set<string>();
  for (const keyword of DESCRIPTION_TAG_KEYWORDS) {
    if (text.includes(keyword)) found.add(keyword);
  }
  return [...found];
}

// "상시"(정해진 신청 기간 없이 계속 접수) vs "기간"(특정 접수기간·마감일이 있음) 공고 구분.
// deadline 필드 자체가 없는 소스(중앙/지자체 복지서비스는 매월 지급되는 수당류라 마감일 개념이
// 없음)는 상시로 본다. deadline 텍스트에 날짜 대신 "상시/연중/수시" 같은 표현만 있는 경우도 상시.
const ALWAYS_OPEN_KEYWORDS = ["상시", "연중", "수시"];

export function isAlwaysOpenAnnouncement(deadline: string | null | undefined): boolean {
  const trimmed = deadline?.trim();
  if (!trimmed) return true;
  return ALWAYS_OPEN_KEYWORDS.some((kw) => trimmed.includes(kw));
}

// deadline 원문에 섞여 나오는 날짜를 전부 찾아낸다. 소스마다 "20260201"(구분자 없음),
// "2026.02.01", "2026-02-01" 세 가지 형식이 뒤섞여 있어서 셋 다 인식한다. 못 알아본 형식(자유
// 텍스트 등)은 빈 배열을 반환하고, 호출하는 쪽에서 원문을 그대로 보여주거나 숨기지 않는다.
function extractDates(text: string): Date[] {
  const re = /(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})|(\d{4})(\d{2})(\d{2})/g;
  const dates: Date[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const y = Number(m[1] ?? m[4]);
    const mo = Number(m[2] ?? m[5]);
    const d = Number(m[3] ?? m[6]);
    if (y > 1900 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      dates.push(new Date(y, mo - 1, d));
    }
  }
  return dates;
}

// "20260201 ~ 20260227" 같은 원문을 "2026년 2월 1일 ~ 2026년 2월 27일"처럼 사람이 읽기 좋게
// 바꾼다. "상시" 등 텍스트나 못 알아본 형식은 원문을 그대로 돌려준다.
export function formatDeadlineDisplay(deadline: string | null | undefined): string {
  const trimmed = deadline?.trim();
  if (!trimmed) return "";
  if (isAlwaysOpenAnnouncement(trimmed)) return trimmed;
  const dates = extractDates(trimmed);
  if (dates.length === 0) return trimmed;
  const fmt = (d: Date) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  if (dates.length === 1) return `${fmt(dates[0])}까지`;
  return `${fmt(dates[0])} ~ ${fmt(dates[dates.length - 1])}`;
}

// 접수기간의 마감일이 이미 지났는지. 날짜를 못 알아보면(자유 텍스트 등) 확신이 없으니 지나지
// 않은 것으로 본다 — 애매하면 숨기지 않는 쪽이 안전하다.
export function isExpiredDeadline(deadline: string | null | undefined, today: Date = new Date()): boolean {
  const trimmed = deadline?.trim();
  if (!trimmed || isAlwaysOpenAnnouncement(trimmed)) return false;
  const dates = extractDates(trimmed);
  if (dates.length === 0) return false;
  const end = dates[dates.length - 1];
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return end < todayMidnight;
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
    descriptionTags: extractDescriptionTags(text),
  };
}
