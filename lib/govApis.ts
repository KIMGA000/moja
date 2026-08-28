import { type WelfareItem, type WelfareSource } from "../app/data/apiPreview";

// 공공데이터 Open API 7종 공용 fetch/파싱 로직.
// app/api/welfare/route.ts(실시간 미리보기)와 app/api/sync-announcements/route.ts(DB 저장)가
// 같은 로직을 재사용한다 — 여기 말고 다른 곳에서 이 API들을 다시 호출하는 코드를 만들지 말 것.
//
// - 한국사회보장정보원_중앙부처복지서비스: https://www.data.go.kr/data/15090532/openapi.do
// - 한국사회보장정보원_지자체복지서비스:   https://www.data.go.kr/data/15108347/openapi.do
// - 행정안전부_대한민국 공공서비스(혜택) 정보(보조금24): https://www.data.go.kr/data/15113968/openapi.do
// - 국토교통부_마이홈포털 공공임대주택 모집공고 조회: https://www.data.go.kr/data/15108420/openapi.do
// - 고용24_국민내일배움카드 훈련과정 / 구직자취업역량강화프로그램 / 일학습병행 훈련과정
// serviceKey는 서버에서만 사용하고 클라이언트로는 절대 내려보내지 않는다.

export const CENTRAL_API_BASE =
  "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001";
export const LOCAL_API_BASE =
  "https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist";
export const GOV24_API_BASE = "https://api.odcloud.kr/api/gov24/v3/serviceList";
export const HOUSING_API_BASE = "https://apis.data.go.kr/1613000/HWSPR02/rsdtRcritNtcList";
export const TRAINING_API_BASE =
  "https://www.work24.go.kr/cm/openApi/call/hr/callOpenApiSvcInfo310L01.do";
export const JOBSEEKER_PROGRAM_API_BASE =
  "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo217L01.do";
export const JOBSEEKER_PROGRAM_INTRO_LINK =
  "https://www.work24.go.kr/wk/b/a/1120/empSchdInviteCtrList.do";
export const DUAL_TRAINING_API_BASE =
  "https://www.work24.go.kr/cm/openApi/call/hr/callOpenApiSvcInfo313L01.do";
export const YOUTH_CENTER_POLICY_API_BASE = "https://www.youthcenter.go.kr/go/ythip/getPlcy";

export const PAGE_SIZE = 100;
export const MAX_PAGES = 5;

// "자립" 키워드 검색에는 장애인 자립자금, 학자금대출, 한부모가족 자립지원처럼 무관한 항목이 섞여 있어
// 실제로 자립준비청년(보호종료아동)을 대상으로 하는 것만 이름/요약/대상특성 기준으로 걸러낸다.
export const RELEVANT_KEYWORDS = ["자립준비청년", "보호종료", "가정위탁"];

export function isAboutCareLeavers(item: WelfareItem): boolean {
  const haystack = `${item.servNm} ${item.servDgst} ${item.targetTraits ?? ""}`;
  return RELEVANT_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

// "청년" 관련 — 자립준비청년 전용은 아니지만 청년 일반 지원제도로 분류한다.
export function isAboutYouth(item: WelfareItem): boolean {
  const haystack = `${item.servNm} ${item.servDgst} ${item.targetTraits ?? ""}`;
  return haystack.includes("청년");
}

export function dedupeItems(items: WelfareItem[]): WelfareItem[] {
  const seen = new Set<string>();
  const result: WelfareItem[] = [];
  for (const item of items) {
    const key = `${item.source}-${item.servId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXmlEntities(match[1]) : undefined;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function formatDate(value: string | undefined): string {
  if (!value || value.length !== 8) return value ?? "";
  return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

function mapCentralBlock(block: string): WelfareItem {
  return {
    source: "central",
    servId: extractTag(block, "servId") ?? "",
    servNm: extractTag(block, "servNm") ?? "",
    servDgst: extractTag(block, "servDgst") ?? "",
    org: `${extractTag(block, "jurMnofNm") ?? ""} · ${extractTag(block, "jurOrgNm") ?? ""}`,
    themes: splitList(extractTag(block, "intrsThemaArray")),
    lifeStages: splitList(extractTag(block, "lifeArray")),
    targetTraits: extractTag(block, "trgterIndvdlArray"),
    sprtCycNm: extractTag(block, "sprtCycNm"),
    srvPvsnNm: extractTag(block, "srvPvsnNm"),
    onlineApplicable: extractTag(block, "onapPsbltYn") === "Y",
    contact: extractTag(block, "rprsCtadr"),
    link: extractTag(block, "servDtlLink") ?? "",
  };
}

function mapLocalBlock(block: string): WelfareItem {
  const ctpvNm = extractTag(block, "ctpvNm") ?? "";
  const sggNm = extractTag(block, "sggNm") ?? "";
  return {
    source: "local",
    servId: extractTag(block, "servId") ?? "",
    servNm: extractTag(block, "servNm") ?? "",
    servDgst: extractTag(block, "servDgst") ?? "",
    org: extractTag(block, "bizChrDeptNm") ?? "",
    region: [ctpvNm, sggNm].filter(Boolean).join(" "),
    themes: splitList(extractTag(block, "intrsThemaNmArray")),
    lifeStages: splitList(extractTag(block, "lifeNmArray")),
    targetTraits: extractTag(block, "trgterIndvdlNmArray"),
    sprtCycNm: extractTag(block, "sprtCycNm"),
    srvPvsnNm: extractTag(block, "srvPvsnNm"),
    applyMethod: extractTag(block, "aplyMtdNm"),
    link: extractTag(block, "servDtlLink") ?? "",
  };
}

type Gov24RawItem = {
  서비스ID?: string;
  서비스명?: string;
  서비스목적요약?: string;
  지원대상?: string;
  지원유형?: string;
  소관기관명?: string;
  부서명?: string;
  서비스분야?: string;
  신청방법?: string;
  신청기한?: string;
  전화문의?: string;
  상세조회URL?: string;
};

function mapGov24Item(raw: Gov24RawItem): WelfareItem {
  const org = [raw.소관기관명, raw.부서명].filter(Boolean).join(" · ");
  return {
    source: "gov24",
    servId: raw.서비스ID ?? "",
    servNm: raw.서비스명 ?? "",
    servDgst: raw.서비스목적요약 ?? "",
    org,
    themes: splitList(raw.서비스분야),
    lifeStages: [],
    targetTraits: raw.지원대상,
    srvPvsnNm: raw.지원유형,
    deadline: raw.신청기한,
    applyMethod: raw.신청방법,
    contact: raw.전화문의,
    link: raw.상세조회URL ?? "",
  };
}

export async function fetchAllGov24(
  apiKey: string,
  searchWrd: string
): Promise<{ totalCount: number; items: WelfareItem[] }> {
  let matchCount = 0;
  const items: WelfareItem[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(GOV24_API_BASE);
    url.searchParams.set("page", String(page));
    url.searchParams.set("perPage", String(PAGE_SIZE));
    url.searchParams.set("returnType", "JSON");
    url.searchParams.set("cond[서비스명::LIKE]", searchWrd);
    url.searchParams.set("serviceKey", apiKey);

    const res = await fetch(url, {
      cache: "no-store",
      headers: { Authorization: apiKey, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`정부24 공공서비스 API 호출에 실패했어요. (status ${res.status})`);
    }
    const data = await res.json();

    matchCount = Number(data.matchCount ?? 0);
    const pageItems: Gov24RawItem[] = data.data ?? [];
    items.push(...pageItems.map(mapGov24Item));

    if (pageItems.length === 0 || items.length >= matchCount) break;
  }

  return { totalCount: matchCount, items };
}

type HousingRawItem = {
  pblancId?: string;
  houseSn?: number;
  pblancNm?: string;
  suplyInsttNm?: string;
  houseTyNm?: string;
  suplyTyNm?: string;
  hsmpNm?: string;
  brtcNm?: string;
  signguNm?: string;
  totHshldCo?: number;
  sumSuplyCo?: number;
  enty?: number;
  mtRntchrg?: number;
  beginDe?: string;
  endDe?: string;
  refrnc?: string;
  pcUrl?: string;
  url?: string;
};

function mapHousingItem(raw: HousingRawItem): WelfareItem {
  const summaryParts = [
    raw.houseTyNm,
    raw.suplyTyNm,
    raw.hsmpNm,
    raw.totHshldCo != null && raw.sumSuplyCo != null
      ? `총 ${raw.totHshldCo}세대 중 ${raw.sumSuplyCo}세대 공급`
      : undefined,
  ].filter(Boolean);

  const rentParts = [
    raw.enty != null ? `보증금 ${raw.enty.toLocaleString("ko-KR")}원` : undefined,
    raw.mtRntchrg != null ? `월임대료 ${raw.mtRntchrg.toLocaleString("ko-KR")}원` : undefined,
  ].filter(Boolean);

  return {
    source: "housing",
    servId: `${raw.pblancId ?? ""}-${raw.houseSn ?? ""}`,
    servNm: raw.pblancNm ?? "",
    servDgst: summaryParts.join(" · "),
    org: raw.suplyInsttNm ?? "",
    region: [raw.brtcNm, raw.signguNm].filter(Boolean).join(" "),
    themes: raw.suplyTyNm ? [raw.suplyTyNm] : [],
    lifeStages: [],
    srvPvsnNm: rentParts.length > 0 ? rentParts.join(" · ") : undefined,
    deadline:
      raw.beginDe && raw.endDe
        ? `${formatDate(raw.beginDe)} ~ ${formatDate(raw.endDe)}`
        : undefined,
    contact: raw.refrnc,
    link: raw.pcUrl ?? raw.url ?? "",
  };
}

export async function fetchAllHousing(
  apiKey: string
): Promise<{ totalCount: number; items: WelfareItem[] }> {
  let totalCount = 0;
  const items: WelfareItem[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(HOUSING_API_BASE);
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("numOfRows", String(PAGE_SIZE));

    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`마이홈포털 공공임대주택 API 호출에 실패했어요. (status ${res.status})`);
    }
    const data = await res.json();

    const resultCode = data?.response?.header?.resultCode;
    if (resultCode !== "00") {
      throw new Error(data?.response?.header?.resultMsg ?? "마이홈포털 API 호출에 실패했어요.");
    }

    totalCount = Number(data?.response?.body?.totalCount ?? 0);
    const pageItems: HousingRawItem[] = data?.response?.body?.item ?? [];
    items.push(...pageItems.map(mapHousingItem));

    if (pageItems.length === 0 || items.length >= totalCount) break;
  }

  return { totalCount, items };
}

function mapTrainingBlock(block: string, source: WelfareSource, orgLabel: string): WelfareItem {
  const courseMan = extractTag(block, "COURSE_MAN");
  const realMan = extractTag(block, "REAL_MAN");
  const costParts = [
    courseMan ? `수강비 ${courseMan}원` : undefined,
    realMan ? `실제훈련비 ${realMan}원` : undefined,
  ].filter(Boolean);

  return {
    source,
    servId: `${extractTag(block, "TRPR_ID") ?? ""}-${extractTag(block, "TRPR_DEGR") ?? ""}`,
    servNm: extractTag(block, "TITLE") ?? "",
    servDgst: [extractTag(block, "SUB_TITLE"), extractTag(block, "CONTENTS")]
      .filter(Boolean)
      .join(" · "),
    org: orgLabel,
    region: extractTag(block, "ADDRESS"),
    themes: [],
    lifeStages: [],
    targetTraits: extractTag(block, "TRAIN_TARGET"),
    srvPvsnNm: costParts.length > 0 ? costParts.join(" · ") : undefined,
    deadline:
      extractTag(block, "TRA_START_DATE") && extractTag(block, "TRA_END_DATE")
        ? `${formatDate(extractTag(block, "TRA_START_DATE"))} ~ ${formatDate(extractTag(block, "TRA_END_DATE"))}`
        : undefined,
    contact: extractTag(block, "TEL_NO"),
    link: extractTag(block, "TITLE_LINK") ?? "",
  };
}

function toYyyymmdd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function fetchAllTrainingLike(
  apiBase: string,
  apiKey: string,
  source: WelfareSource,
  orgLabel: string
): Promise<{ totalCount: number; items: WelfareItem[] }> {
  let totalCount = 0;
  const items: WelfareItem[] = [];

  const today = new Date();
  const sixMonthsLater = new Date(today);
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(apiBase);
    url.searchParams.set("authKey", apiKey);
    url.searchParams.set("returnType", "XML");
    url.searchParams.set("outType", "1");
    url.searchParams.set("pageNum", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    url.searchParams.set("srchTraStDt", toYyyymmdd(today));
    url.searchParams.set("srchTraEndDt", toYyyymmdd(sixMonthsLater));
    url.searchParams.set("sort", "ASC");
    url.searchParams.set("sortCol", "2");

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`고용24 훈련과정 API 호출에 실패했어요. (status ${res.status})`);
    }
    const xml = await res.text();

    totalCount = Number(extractTag(xml, "scn_cnt") ?? "0");
    const blocks = xml.match(/<scn_list>[\s\S]*?<\/scn_list>/g) ?? [];
    items.push(...blocks.map((block) => mapTrainingBlock(block, source, orgLabel)));

    if (blocks.length === 0 || items.length >= totalCount) break;
  }

  return { totalCount, items };
}

function mapJobseekerProgramBlock(block: string): WelfareItem {
  const orgNm = extractTag(block, "orgNm") ?? "";
  const pgmNm = extractTag(block, "pgmNm") ?? "";
  const pgmSubNm = extractTag(block, "pgmSubNm");
  const pgmStdt = extractTag(block, "pgmStdt");
  const pgmEndt = extractTag(block, "pgmEndt");

  return {
    source: "jobseekerProgram",
    servId: [orgNm, pgmNm, pgmSubNm, pgmStdt].filter(Boolean).join("-"),
    servNm: pgmSubNm ? `${pgmNm} - ${pgmSubNm}` : pgmNm,
    servDgst: [
      extractTag(block, "openPlcCont") ? `개최장소 ${extractTag(block, "openPlcCont")}` : undefined,
      extractTag(block, "operationTime") ? `운영시간 ${extractTag(block, "operationTime")}` : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
    org: orgNm,
    themes: [],
    lifeStages: [],
    targetTraits: extractTag(block, "pgmTarget"),
    deadline: pgmStdt && pgmEndt ? `${formatDate(pgmStdt)} ~ ${formatDate(pgmEndt)}` : undefined,
    link: JOBSEEKER_PROGRAM_INTRO_LINK,
  };
}

export async function fetchAllJobseekerProgram(
  apiKey: string
): Promise<{ totalCount: number; items: WelfareItem[] }> {
  let totalCount = 0;
  const items: WelfareItem[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(JOBSEEKER_PROGRAM_API_BASE);
    url.searchParams.set("authKey", apiKey);
    url.searchParams.set("returnType", "XML");
    url.searchParams.set("startPage", String(page));
    url.searchParams.set("display", String(PAGE_SIZE));

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`고용24 구직자취업역량강화프로그램 API 호출에 실패했어요. (status ${res.status})`);
    }
    const xml = await res.text();

    totalCount = Number(extractTag(xml, "total") ?? "0");
    const blocks = xml.match(/<empPgmSchdInvite>[\s\S]*?<\/empPgmSchdInvite>/g) ?? [];
    items.push(...blocks.map(mapJobseekerProgramBlock));

    if (blocks.length === 0 || items.length >= totalCount) break;
  }

  return { totalCount, items };
}

type YouthCenterPolicyRawItem = {
  plcyNo?: string;
  plcyNm?: string;
  plcyExplnCn?: string;
  plcySprtCn?: string;
  lclsfNm?: string;
  mclsfNm?: string;
  plcyKywdNm?: string;
  sprvsnInstCdNm?: string;
  operInstCdNm?: string;
  addAplyQlfcCndCn?: string;
  ptcpPrpTrgtCn?: string;
  plcyAplyMthdCn?: string;
  aplyYmd?: string;
  aplyUrlAddr?: string;
  refUrlAddr1?: string;
  refUrlAddr2?: string;
  zipCd?: string; // 시행 지역 법정동코드(쉼표로 여러 개), 앞 2자리가 시·도. "00"/빈 값이면 전국
};

// 법정동코드 앞 2자리 → 시·도. (classify.ts/realMatch.ts의 REGION_SHORT와 같은 전체 지명 표기로 맞춤)
const ZIP_PREFIX_TO_REGION: Record<string, string> = {
  "11": "서울특별시",
  "26": "부산광역시",
  "27": "대구광역시",
  "28": "인천광역시",
  "29": "광주광역시",
  "30": "대전광역시",
  "31": "울산광역시",
  "36": "세종특별자치시",
  "41": "경기도",
  "42": "강원특별자치도",
  "43": "충청북도",
  "44": "충청남도",
  "45": "전북특별자치도",
  "46": "전라남도",
  "47": "경상북도",
  "48": "경상남도",
  "50": "제주특별자치도",
};

// 기관명(sprvsnInstCdNm 등)이 "인구정책과"처럼 지역명 없이 부서명만 오는 경우가 있어서
// 지역 필터가 항상 걸리진 않는다 — zipCd가 있으면 그걸로 지역을 보강한다. 여러 시·도에
// 걸쳐 있으면(코드 앞 2자리가 다름) 사실상 전국급이라 보고 지역 한정을 안 건다.
function regionFromZipCd(zipCd: string | undefined): string | undefined {
  if (!zipCd) return undefined;
  const codes = zipCd
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c && c !== "00");
  if (codes.length === 0) return undefined;
  const prefixes = new Set(codes.map((c) => c.slice(0, 2)));
  if (prefixes.size !== 1) return undefined;
  const [prefix] = prefixes;
  return ZIP_PREFIX_TO_REGION[prefix];
}

function mapYouthCenterPolicyItem(raw: YouthCenterPolicyRawItem): WelfareItem {
  return {
    source: "youthCenter",
    servId: raw.plcyNo ?? "",
    servNm: raw.plcyNm ?? "",
    servDgst: [raw.plcyExplnCn, raw.plcySprtCn].filter(Boolean).join(" · "),
    org: [raw.sprvsnInstCdNm, raw.operInstCdNm].filter(Boolean).join(" · "),
    region: regionFromZipCd(raw.zipCd),
    themes: [raw.lclsfNm, raw.mclsfNm].filter((v): v is string => Boolean(v)),
    lifeStages: ["청년"],
    targetTraits: [raw.addAplyQlfcCndCn, raw.ptcpPrpTrgtCn].filter(Boolean).join(" · ") || undefined,
    deadline: raw.aplyYmd,
    applyMethod: raw.plcyAplyMthdCn,
    link: raw.aplyUrlAddr || raw.refUrlAddr1 || raw.refUrlAddr2 || "https://www.youthcenter.go.kr",
  };
}

// ⚠️ 온통청년 API는 실제 JSON envelope 구조를 문서에서 확정하지 못해서(요청/응답 필드명만 제공됨),
// 알려진 형태(result.youthPolicyList / result.pagging.totCount)를 우선 시도하고 없으면 대체 경로도
// 시도하는 방어적 파싱을 한다. 실제 키로 처음 호출해보고 건수가 이상하면 이 부분을 다시 확인할 것.
export async function fetchAllYouthCenterPolicy(
  apiKey: string,
  searchKeyword: string
): Promise<{ totalCount: number; items: WelfareItem[] }> {
  let totalCount = 0;
  const items: WelfareItem[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(YOUTH_CENTER_POLICY_API_BASE);
    url.searchParams.set("apiKeyNm", apiKey);
    url.searchParams.set("pageNum", String(page));
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    url.searchParams.set("rtnType", "json");
    url.searchParams.set("plcyNm", searchKeyword);

    const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`온통청년 청년정책 API 호출에 실패했어요. (status ${res.status})`);
    }
    const data = await res.json();

    const pageItems: YouthCenterPolicyRawItem[] =
      data?.result?.youthPolicyList ?? data?.youthPolicyList ?? [];
    totalCount = Number(data?.result?.pagging?.totCount ?? data?.pagging?.totCount ?? pageItems.length);
    items.push(...pageItems.map(mapYouthCenterPolicyItem));

    if (pageItems.length === 0 || items.length >= totalCount) break;
  }

  return { totalCount, items };
}

export async function fetchAllFromSource(
  apiBase: string,
  apiKey: string,
  mapBlock: (block: string) => WelfareItem,
  baseParams: Record<string, string>
): Promise<{ totalCount: number; items: WelfareItem[] }> {
  let totalCount = 0;
  const items: WelfareItem[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(apiBase);
    url.searchParams.set("serviceKey", apiKey);
    url.searchParams.set("srchKeyCode", baseParams.srchKeyCode);
    url.searchParams.set("searchWrd", baseParams.searchWrd);
    url.searchParams.set("lifeArray", baseParams.lifeArray);
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("numOfRows", String(PAGE_SIZE));

    const res = await fetch(url, { cache: "no-store" });
    const xml = await res.text();

    const resultCode = extractTag(xml, "resultCode");
    if (resultCode !== "0") {
      const resultMessage = extractTag(xml, "resultMessage");
      throw new Error(resultMessage ?? "공공데이터 API 호출에 실패했어요.");
    }

    totalCount = Number(extractTag(xml, "totalCount") ?? "0");
    const blocks = xml.match(/<servList>[\s\S]*?<\/servList>/g) ?? [];
    items.push(...blocks.map(mapBlock));

    if (blocks.length === 0 || items.length >= totalCount) break;
  }

  return { totalCount, items };
}

export { mapCentralBlock, mapLocalBlock };
