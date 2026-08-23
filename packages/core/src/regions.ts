// ---------------------------------------------------------------------------
// 지역명 처리 — 단일 진실 공급원
//
// 왜 이 파일이 생겼나:
//   app/data/classify.ts 와 app/data/realMatch.ts 에 거의 같은 REGION_SHORT 테이블과
//   지역 매칭 로직이 복붙되어 있었다. 한쪽만 고치면 "저장 시점 분류"와 "화면 판정"이
//   서로 다른 답을 내서, 검수자가 고친 값이 화면에 반영되지 않는 것처럼 보인다.
//   그래서 양쪽이 이 파일 하나만 쓰도록 합쳤다.
//
// 고친 버그 (QA-5):
//   공공API는 기관마다 개편 전/후 지명을 섞어 쓴다. 그런데 별칭 목록에 개편 후 이름만
//   있어서 개편 전 이름이 들어오면 매칭에 실패했다.
//
//     "전라북도".includes("전북")            → false   (부분 문자열이 아니다)
//     "전라북도".includes("전북특별자치도")  → false
//     → regionScope = null  →  전북 지자체 공고가 "전국"으로 분류되어
//        다른 지역 사용자에게도 노출된다.
//
//   강원은 축약형 "강원"이 "강원도"에 우연히 걸려서 통과했지만 전북은 깨졌다.
//   그래서 축약형에 의존하지 않고 **개편 전 이름을 별칭 목록에 명시**한다.
// ---------------------------------------------------------------------------

/** 온보딩 선택지와 동일한 17개 시·도 정식 명칭 (이 순서가 화면 순서다). */
export const CANONICAL_REGIONS = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
] as const;

export type CanonicalRegion = (typeof CANONICAL_REGIONS)[number];

/**
 * 정식 명칭 → 공고 원문에 나타날 수 있는 표기 전부.
 * 긴 표기를 먼저 검사해야 짧은 표기가 다른 지역을 잘못 먹지 않는다
 * (예: "경상남도"를 "경남"보다 먼저 봐야 한다). 아래 배열은 그 순서로 정렬해둔다.
 *
 * ⚠️ 개편 전 명칭(강원도 / 전라북도)이 반드시 들어 있어야 한다 — 이게 QA-5의 원인이었다.
 */
export const REGION_ALIASES: Record<CanonicalRegion, string[]> = {
  서울특별시: ["서울특별시", "서울시", "서울"],
  부산광역시: ["부산광역시", "부산시", "부산"],
  대구광역시: ["대구광역시", "대구시", "대구"],
  인천광역시: ["인천광역시", "인천시", "인천"],
  광주광역시: ["광주광역시", "광주시", "광주"],
  대전광역시: ["대전광역시", "대전시", "대전"],
  울산광역시: ["울산광역시", "울산시", "울산"],
  세종특별자치시: ["세종특별자치시", "세종시", "세종"],
  경기도: ["경기도", "경기"],
  강원특별자치도: ["강원특별자치도", "강원도", "강원"], // 강원도 = 개편 전 명칭
  충청북도: ["충청북도", "충북"],
  충청남도: ["충청남도", "충남"],
  전북특별자치도: ["전북특별자치도", "전라북도", "전북"], // 전라북도 = 개편 전 명칭
  전라남도: ["전라남도", "전남"],
  경상북도: ["경상북도", "경북"],
  경상남도: ["경상남도", "경남"],
  제주특별자치도: ["제주특별자치도", "제주도", "제주"],
};

/** 짧은 표기 (배지·요약 표시용). */
export const REGION_SHORT: Record<CanonicalRegion, string> = {
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

/**
 * 담당기관 이름이 이 중 하나이고 지역 정보가 따로 없으면 전국 사업으로 본다.
 * (중앙부처·공공기관은 전국 단위로 집행하는 경우가 대부분)
 */
export const NATIONAL_ORG_KEYWORDS = [
  "보건복지부",
  "고용노동부",
  "성평등가족부",
  "여성가족부",
  "교육부",
  "국토교통부",
  "행정안전부",
  "중소벤처기업부",
  "한국토지주택공사",
  "한국장학재단",
  "아동권리보장원",
  "한국사회보장정보원",
  "근로복지공단",
  "국민건강보험공단",
] as const;

/**
 * 별칭이 긴 것부터 정렬된 (정식명칭, 별칭) 쌍.
 * 긴 표기를 먼저 검사해야 "경남"이 "경상남도"보다 먼저 걸리는 일이 없다.
 */
const ALIAS_PAIRS: { canonical: CanonicalRegion; alias: string }[] = Object.entries(
  REGION_ALIASES
)
  .flatMap(([canonical, aliases]) =>
    aliases.map((alias) => ({ canonical: canonical as CanonicalRegion, alias }))
  )
  .sort((a, b) => b.alias.length - a.alias.length);

/** 문자열에서 언급된 시·도를 전부 찾아 정식 명칭으로 돌려준다 (중복 제거, 등장 순). */
export function findMentionedRegions(text: string): CanonicalRegion[] {
  if (!text) return [];
  const found = new Set<CanonicalRegion>();
  for (const { canonical, alias } of ALIAS_PAIRS) {
    if (found.has(canonical)) continue;
    if (text.includes(alias)) found.add(canonical);
  }
  return [...found];
}

/**
 * 공고의 지역 범위를 정한다. 전국이면 null.
 *
 * 판단 순서:
 *   1. 담당기관이 중앙부처·전국 공공기관이고 region 필드가 비어 있으면 → 전국(null)
 *   2. region 필드 + org 텍스트에서 시·도가 언급되면 → 첫 번째 시·도
 *   3. 아무것도 못 찾으면 → 전국(null)
 */
export function resolveRegionScope(params: {
  region?: string | null;
  org?: string | null;
}): CanonicalRegion | null {
  const region = params.region ?? "";
  const org = params.org ?? "";
  const locationText = `${region} ${org}`;

  if (!region && NATIONAL_ORG_KEYWORDS.some((kw) => org.includes(kw))) {
    return null;
  }
  const mentioned = findMentionedRegions(locationText);
  return mentioned.length > 0 ? mentioned[0] : null;
}

export type RegionMatch =
  | { pass: true; scope: CanonicalRegion | null }
  | { pass: false; scope: CanonicalRegion; mentioned: CanonicalRegion[]; note: string };

/**
 * 사용자의 거주 지역이 이 공고 대상에 포함되는지 판단한다.
 * 지역 정보를 못 찾으면 통과시킨다 — **지역을 모른다고 탈락시키면 받을 수 있는 지원을
 * 놓치게 된다.** 놓치는 오류가 헛걸음 오류보다 나쁘다는 원칙을 따른다.
 */
export function matchesUserRegion(
  params: { region?: string | null; org?: string | null },
  userRegion: string | null | undefined
): RegionMatch {
  const region = params.region ?? "";
  const org = params.org ?? "";

  if (!userRegion) return { pass: true, scope: null };
  if (!region && NATIONAL_ORG_KEYWORDS.some((kw) => org.includes(kw))) {
    return { pass: true, scope: null };
  }

  const mentioned = findMentionedRegions(`${region} ${org}`);
  if (mentioned.length === 0) return { pass: true, scope: null };

  const userCanonical = (findMentionedRegions(userRegion)[0] ?? userRegion) as CanonicalRegion;
  if (mentioned.includes(userCanonical)) return { pass: true, scope: userCanonical };

  return {
    pass: false,
    scope: mentioned[0],
    mentioned,
    note: `거주 지역과 달라요 (공고 지역: ${mentioned
      .map((r) => REGION_SHORT[r] ?? r)
      .join("·")})`,
  };
}
