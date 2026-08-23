// 다섯 가지 공공 Open API 응답을 화면에 쓰기 좋은 공통 형태로 통일한다.
// - 한국사회보장정보원_중앙부처복지서비스: https://www.data.go.kr/data/15090532/openapi.do
// - 한국사회보장정보원_지자체복지서비스:   https://www.data.go.kr/data/15108347/openapi.do
// - 행정안전부_대한민국 공공서비스(혜택) 정보(보조금24): https://www.data.go.kr/data/15113968/openapi.do
// - 국토교통부_마이홈포털 공공임대주택 모집공고 조회: https://www.data.go.kr/data/15108420/openapi.do
// - 고용24_국민내일배움카드 훈련과정: https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do
// - 고용24_구직자취업역량강화프로그램: https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do
// - 온통청년_청년정책(getPlcy): https://www.youthcenter.go.kr
// ⚠️ "자립" 키워드로 검색한 실제 결과라, 자립준비청년과 무관한 항목도 섞여 있어서 서버에서 한 번 걸러낸다.
// ⚠️ 훈련과정 API는 대상자(자립준비청년 등)를 구분하는 필드가 없어서, 필터링 결과는 대부분 0건이 될 수 있다.
// ✅ 구직자취업역량강화프로그램은 "대상자(pgmTarget)" 필드가 있어서 상대적으로 매칭 가능성이 있다.

export type WelfareSource =
  | "central"
  | "local"
  | "gov24"
  | "housing"
  | "training"
  | "jobseekerProgram"
  | "dualTraining"
  | "youthCenter";

export const SOURCE_LABEL: Record<WelfareSource, string> = {
  central: "한국사회보장정보원_중앙부처복지서비스",
  local: "한국사회보장정보원_지자체복지서비스",
  gov24: "행정안전부_대한민국 공공서비스(혜택) 정보",
  housing: "국토교통부_마이홈포털 공공임대주택 모집공고",
  training: "고용24_국민내일배움카드 훈련과정",
  jobseekerProgram: "고용24_구직자취업역량강화프로그램",
  dualTraining: "고용24_일학습병행 훈련과정",
  youthCenter: "온통청년_청년정책",
};

import type { PolicyCondition } from "@moja/core";
import type { ReviewStatus, StoredCriterion } from "../../lib/supabase";

export type WelfareItem = {
  source: WelfareSource;
  servId: string;
  servNm: string; // 서비스명 / 공고명
  servDgst: string; // 서비스 요약 / 주택 정보 요약
  org: string; // 소관 부처·기관 (중앙) 또는 담당 부서 (지자체·정부24·공급기관)
  region?: string; // 시도(+시군구)
  themes: string[]; // 관심주제 / 서비스분야 / 공급유형
  lifeStages: string[]; // 생애주기
  targetTraits?: string; // 지원대상 개인 특성
  sprtCycNm?: string; // 지원 주기
  srvPvsnNm?: string; // 제공 방법 / 지원유형 / 임대조건
  deadline?: string; // 신청기한 · 접수기간
  onlineApplicable?: boolean; // 온라인 신청 가능 여부 (중앙만 제공)
  applyMethod?: string; // 신청 방법 (지자체·정부24 제공, 예: 방문)
  contact?: string; // 대표 문의처
  link: string;
};

/**
 * /api/announcements 가 내려주는 공고 하나. WelfareItem(raw_data)에 DB의 검수·분류
 * 컬럼을 더한 모양이다 — 05_next-step-wire-review.md [작업 2]. 판정엔진(@moja/core)의
 * Policy로 변환하는 건 app/data/realMatch.ts의 toPolicyShape()가 한다.
 */
export type AnnouncementItem = WelfareItem & {
  id: number;
  sourceId: string;
  /** 검수자가 확정한 자연어 기준. 비어 있으면 아직 사람이 검수하지 않은 공고다. */
  criteria: StoredCriterion[];
  /** criteria를 판정엔진 조건으로 변환해둔 캐시. 비어 있으면 폴백 경로를 쓴다. */
  conditions: PolicyCondition[];
  regionScope: string | null;
  mentionsCareLeaver: boolean;
  mentionsYouth: boolean;
  requiresEnrolled: boolean;
  requiresNoHome: boolean;
  requiresBasicLivelihood: boolean;
  requiresAlreadyEnded: boolean;
  protectionYearsLimit: number | null;
  reviewStatus: ReviewStatus;
  reviewedAt: string | null;
};

export const API_SAMPLE_ITEMS: WelfareItem[] = [
  {
    source: "central",
    servId: "WLF00001175",
    servNm: "자립준비청년 자립수당 지급",
    servDgst:
      "자립준비청년(보호종료아동)에게 자립수당을 지급하여 보호종료 후 경제적 부담을 완화하고 복지향상을 통해 안정적 사회정착 및 성공적 자립을 지원합니다.",
    org: "보건복지부 · 청년정책팀",
    themes: ["생활지원"],
    lifeStages: ["청소년", "청년"],
    sprtCycNm: "월",
    srvPvsnNm: "현금지급",
    onlineApplicable: true,
    contact: "129",
    link: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00001175&wlfareInfoReldBztpCd=01",
  },
  {
    source: "central",
    servId: "WLF00000078",
    servNm: "청소년특별지원",
    servDgst:
      "사회·경제적으로 어려움을 겪는 위기청소년에게 생활비·치료비·학업지원비·심리검사 상담비 등 지원으로 건강한 성장 지원합니다.",
    org: "성평등가족부 · 학교밖청소년지원과",
    themes: ["신체건강", "생활지원", "일자리", "문화·여가", "교육", "법률"],
    lifeStages: ["아동", "청소년", "청년"],
    targetTraits: "저소득",
    sprtCycNm: "수시",
    srvPvsnNm: "현금지급,현물지급",
    onlineApplicable: true,
    contact: "02-2100-6000",
    link: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00000078&wlfareInfoReldBztpCd=01",
  },
  {
    source: "local",
    servId: "WLF00000004",
    servNm: "자활 및 생활안정기금사업",
    servDgst: "기초생활수급자, 자활기업 등 신청에 따라 저금리의 융자금을 지원하여 자활사업 안정화에 기여.",
    org: "경상남도 산청군 행정복지국 복지정책과",
    region: "경상남도 산청군",
    themes: ["일자리"],
    lifeStages: ["청년", "중장년"],
    targetTraits: "저소득",
    sprtCycNm: "1회성",
    srvPvsnNm: "현금대여(융자)",
    applyMethod: "방문",
    link: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00000004&wlfareInfoReldBztpCd=02",
  },
  {
    source: "local",
    servId: "WLF00001726",
    servNm: "저소득 한부모가족 자립지원(자립정착금)",
    servDgst: "한부모가족 보장에서 중지되는 세대에 대하여 자립정착금 지원으로 생활안정 및 자립기반 마련",
    org: "제주특별자치도 서귀포시 복지위생국 여성가족과",
    region: "제주특별자치도 서귀포시",
    themes: ["서민금융"],
    lifeStages: ["영유아", "아동", "청소년", "청년", "중장년", "노년"],
    targetTraits: "한부모·조손",
    sprtCycNm: "1회성",
    srvPvsnNm: "현금지급",
    applyMethod: "방문",
    link: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00001726&wlfareInfoReldBztpCd=02",
  },
];

/**
 * /api/announcements 호출이 실패했을 때(또는 Supabase 환경변수 미설정) 보여줄 예시 데이터.
 * 전부 검수 전 취급(criteria/conditions 비움)이라 화면에 '검수 전' 배지가 붙는다.
 */
export const API_SAMPLE_ANNOUNCEMENT_ITEMS: AnnouncementItem[] = API_SAMPLE_ITEMS.map((item, i) => ({
  ...item,
  id: i,
  sourceId: item.servId,
  criteria: [],
  conditions: [],
  regionScope: null,
  mentionsCareLeaver: true,
  mentionsYouth: true,
  requiresEnrolled: false,
  requiresNoHome: false,
  requiresBasicLivelihood: false,
  requiresAlreadyEnded: false,
  protectionYearsLimit: null,
  reviewStatus: "approved",
  reviewedAt: null,
}));
