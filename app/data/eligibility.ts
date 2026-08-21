// MOJA 자격 판별 엔진 — PLANNING_v3_모자.md F1/F2, MOJA_온보딩_질문설계_최종수정.md 기준
// ⚠️ 여기 담긴 21개 제도의 자격 조건은 MVP 근사치다. 법령·공고문이 자주 바뀌는 항목은
//    확정 판정 대신 uncertain 처리해서 "담당기관 확인 필요"로 안내한다 (기획서 6장 원칙).

export type ProtectionEndType =
  | "AGE18_END" // 만 18세에 종료
  | "EXTENDED_END" // 만 18세 이후 연장했다가 종료
  | "EARLY_END" // 만 15~17세 조기 보호종료
  | "REPROTECTED_END" // 재보호 후 다시 종료
  | "CURRENTLY_PROTECTED"; // 현재 보호 중 (퇴소 예정)

export const PROTECTION_END_TYPE_LABEL: Record<ProtectionEndType, string> = {
  AGE18_END: "만 18세에 종료",
  EXTENDED_END: "연장 보호종료",
  EARLY_END: "조기 보호종료",
  REPROTECTED_END: "재보호 후 다시 종료",
  CURRENTLY_PROTECTED: "현재 보호 중 (퇴소 예정)",
};

export type CurrentStatus = "UNIV" | "GRAD" | "EMPLOYED" | "UNEMPLOYED" | "OTHER";

export const CURRENT_STATUS_LABEL: Record<CurrentStatus, string> = {
  UNIV: "대학 재학",
  GRAD: "대학원 재학",
  EMPLOYED: "취업",
  UNEMPLOYED: "미취업",
  OTHER: "기타",
};

export type YesNoUnknown = "Y" | "N" | "UNKNOWN";

export type InterestCategory =
  | "INCOME"
  | "HOUSING"
  | "MEDICAL"
  | "EDUCATION"
  | "JOB"
  | "ASSET"
  | "MENTAL"
  | "MENTORING"
  | "ETC";

export const INTEREST_CATEGORY_LABEL: Record<InterestCategory, string> = {
  INCOME: "생활비·소득",
  HOUSING: "주거",
  MEDICAL: "의료",
  EDUCATION: "교육·학비",
  JOB: "취업·진로",
  ASSET: "자산형성",
  MENTAL: "심리·정서",
  MENTORING: "멘토링·커뮤니티",
  ETC: "기타",
};

export type OnboardingProfile = {
  hasInstitutionalExperience: boolean | null; // Q1 대상 확인 게이트 (시설·위탁가정 경험 여부)
  birthDate: string; // YYYY-MM-DD
  protectionEndType: ProtectionEndType | null;
  returnedToBirthFamily: boolean | null; // EARLY_END일 때만 의미 있음
  protectionEndDate: string; // YYYY-MM-DD (실제 또는 예정)
  currentStatus: CurrentStatus | null;
  region: string; // 시·도
  ownsHome: boolean | null;
  maritalStatus: boolean | null;
  basicLivelihoodRecipient: YesNoUnknown;
  nearPoorMedicalReduction: YesNoUnknown;
  currentBenefits: string[]; // 제도 id 또는 "NONE" / "UNKNOWN"
  interestCategories: InterestCategory[];
};

export const EMPTY_PROFILE: OnboardingProfile = {
  hasInstitutionalExperience: null,
  birthDate: "",
  protectionEndType: null,
  returnedToBirthFamily: null,
  protectionEndDate: "",
  currentStatus: null,
  region: "",
  ownsHome: null,
  maritalStatus: null,
  basicLivelihoodRecipient: "UNKNOWN",
  nearPoorMedicalReduction: "UNKNOWN",
  currentBenefits: [],
  interestCategories: [],
};

export type Verdict = "ELIGIBLE" | "INELIGIBLE" | "UNCERTAIN";

export type EligibilityResult = {
  verdict: Verdict;
  reason?: string; // INELIGIBLE·UNCERTAIN일 때 표시
  ddayDate?: string; // ELIGIBLE이고 기한이 있을 때 (YYYY-MM-DD)
};

export type Program = {
  id: string;
  name: string;
  org: string;
  category: InterestCategory[];
  summary: string;
  amount?: string;
  documents?: string;
  link: string;
  conflictsWith?: string[]; // 동시수급 불가 제도 id
  evaluate: (profile: OnboardingProfile, ageInfo: AgeInfo) => EligibilityResult;
};

export type AgeInfo = {
  todayIso: string;
  age18Date: string | null; // 생년월일 + 18년
  anchorDate: string | null; // 제도별 기산점(대부분 보호종료일, 조기종료 일부는 만18세 도달일)
  yearsSinceAnchor: number | null;
};

function addYears(iso: string, years: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffYears(fromIso: string, toIso: string): number | null {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

export function buildAgeInfo(profile: OnboardingProfile, todayIso: string): AgeInfo {
  const age18Date = profile.birthDate ? addYears(profile.birthDate, 18) : null;
  // 조기 보호종료는 일부 제도에서 "만 18세 도달일"을 기산점으로 쓴다 (온보딩 문서 판별 로직 §3).
  const anchorDate =
    profile.protectionEndType === "EARLY_END" && age18Date ? age18Date : profile.protectionEndDate || null;
  const yearsSinceAnchor = anchorDate ? diffYears(anchorDate, todayIso) : null;
  return { todayIso, age18Date, anchorDate, yearsSinceAnchor };
}

function withinYears(ageInfo: AgeInfo, years: number): boolean {
  return ageInfo.yearsSinceAnchor !== null && ageInfo.yearsSinceAnchor <= years;
}

function ddayFromAnchor(ageInfo: AgeInfo, years: number): string | undefined {
  return ageInfo.anchorDate ? addYears(ageInfo.anchorDate, years) ?? undefined : undefined;
}

const NOT_YET_ENDED = (profile: OnboardingProfile): boolean => profile.protectionEndType === "CURRENTLY_PROTECTED";

export const PROGRAMS: Program[] = [
  {
    id: "jaripsudang",
    name: "자립수당",
    org: "보건복지부",
    category: ["INCOME"],
    summary: "보호종료 후 5년간 매월 자립수당을 지급합니다.",
    amount: "월 50만원",
    documents: "보호종료 확인서, 신분증",
    link: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00001175",
    conflictsWith: [],
    evaluate: (profile, ageInfo) => {
      if (NOT_YET_ENDED(profile)) {
        return { verdict: "INELIGIBLE", reason: "보호종료 후부터 신청할 수 있어요 (현재 보호 중)" };
      }
      if (profile.protectionEndType === "EARLY_END" && profile.returnedToBirthFamily) {
        return {
          verdict: "UNCERTAIN",
          reason: "조기 보호종료 후 원가정 복귀 시 자격이 달라질 수 있어 담당기관 확인이 필요해요",
        };
      }
      if (withinYears(ageInfo, 5)) {
        return { verdict: "ELIGIBLE", ddayDate: ddayFromAnchor(ageInfo, 5) };
      }
      return { verdict: "INELIGIBLE", reason: "보호종료(또는 만 18세) 후 5년이 지났어요" };
    },
  },
  {
    id: "jaripjeongchakgeum",
    name: "자립정착금",
    org: "시·도 (지역별 금액 상이)",
    category: ["INCOME", "HOUSING"],
    summary: "보호종료 시 1회 지급되는 정착 지원금이에요. 지역마다 금액이 달라요.",
    amount: "지역별 1,000만원~1,500만원+",
    documents: "보호종료 확인서, 통장 사본",
    link: "https://www.mohw.go.kr/menu.es?mid=a10711041000",
    evaluate: (profile) => {
      if (profile.protectionEndType === "EARLY_END" && profile.returnedToBirthFamily) {
        return {
          verdict: "UNCERTAIN",
          reason: "조기 보호종료 후 원가정 복귀 시 지급 여부는 담당기관 확인이 필요해요",
        };
      }
      // 퇴소 예정자도 사전 신청 가능한 경우가 많아 CURRENTLY_PROTECTED도 대상에 포함.
      return { verdict: "ELIGIBLE" };
    },
  },
  {
    id: "lh_jeonse",
    name: "LH 자립준비청년 전세임대주택",
    org: "한국토지주택공사(LH)",
    category: ["HOUSING"],
    summary: "무주택 19~39세 자립준비청년이 원하는 주택을 찾으면 LH가 전세계약을 맺고 재임대해줘요.",
    documents: "무주택 확인, 보호종료(예정) 확인서, 소득 확인서류",
    link: "https://www.lh.or.kr/menu.es?mid=a10401020800",
    evaluate: (profile, ageInfo) => {
      if (profile.ownsHome === true) {
        return { verdict: "INELIGIBLE", reason: "무주택 요건이 있어요 (현재 주택 소유)" };
      }
      if (profile.ownsHome === null) {
        return { verdict: "UNCERTAIN", reason: "무주택 여부를 확인해주세요" };
      }
      if (!withinYears(ageInfo, 5) && !NOT_YET_ENDED(profile)) {
        return { verdict: "INELIGIBLE", reason: "보호종료 후 5년이 지났어요" };
      }
      return { verdict: "ELIGIBLE", ddayDate: ddayFromAnchor(ageInfo, 5) };
    },
  },
  {
    id: "lh_maeip",
    name: "LH·SH 청년 매입임대주택",
    org: "한국토지주택공사(LH)·서울주택도시공사(SH)",
    category: ["HOUSING"],
    summary: "이미 매입해둔 주택에 바로 입주하는 방식이라 전세임대보다 집을 구하는 부담이 적어요.",
    documents: "무주택 확인, 소득 확인서류",
    link: "https://apply.lh.or.kr/",
    evaluate: (profile) => {
      if (profile.ownsHome === true) {
        return { verdict: "INELIGIBLE", reason: "무주택 요건이 있어요 (현재 주택 소유)" };
      }
      if (profile.ownsHome === null) {
        return { verdict: "UNCERTAIN", reason: "무주택 여부를 확인해주세요" };
      }
      return { verdict: "ELIGIBLE" };
    },
  },
  {
    id: "hope_didimdol",
    name: "희망디딤돌센터 자립준비청년 주거서비스",
    org: "지자체 희망디딤돌센터",
    category: ["HOUSING", "MENTORING"],
    summary: "일정 기간 주거를 지원하며 자립 상담을 함께 제공해요.",
    link: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/643000000755",
    evaluate: () => ({ verdict: "ELIGIBLE" }),
  },
  {
    id: "cda_matgi",
    name: "디딤씨앗통장(CDA) 만기 지급",
    org: "아동권리보장원",
    category: ["ASSET"],
    summary: "아동기에 가입해 적립해온 경우, 만 18세 이후 정부 매칭 지원금을 포함해 찾을 수 있어요.",
    documents: "통장 사본, 신분증",
    link: "https://www.ncrc.or.kr",
    evaluate: (profile) => {
      if (NOT_YET_ENDED(profile)) {
        return { verdict: "INELIGIBLE", reason: "퇴소 후 신규 가입 불가 · 기존 가입자만 만기 수령 가능" };
      }
      return { verdict: "UNCERTAIN", reason: "아동기에 디딤씨앗통장에 가입되어 있어야 해요 (가입 이력 확인 필요)" };
    },
  },
  {
    id: "youth_savings",
    name: "청년내일저축계좌",
    org: "보건복지부",
    category: ["ASSET"],
    summary: "매달 저축하면 정부가 지원금을 매칭해줘서 만기 시 목돈을 마련할 수 있어요.",
    amount: "만기 시 최대 약 2,200만원",
    documents: "소득 확인서류, 통장 사본",
    link: "https://www.bokjiro.go.kr",
    evaluate: (profile) => {
      if (profile.currentStatus === "UNEMPLOYED") {
        return { verdict: "INELIGIBLE", reason: "근로·사업소득이 있어야 신청할 수 있어요 (현재 미취업)" };
      }
      if (profile.currentStatus === null) {
        return { verdict: "UNCERTAIN", reason: "현재 상태를 확인해주세요" };
      }
      return { verdict: "ELIGIBLE" };
    },
  },
  {
    id: "mind_voucher",
    name: "정신건강 심리상담 바우처사업",
    org: "보건복지부",
    category: ["MENTAL"],
    summary: "전문 심리상담을 총 8회 바우처로 지원받을 수 있어요. 대상 제한이 거의 없어요.",
    amount: "8회",
    documents: "복지로 온라인 신청",
    link: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00005567",
    evaluate: () => ({ verdict: "ELIGIBLE" }),
  },
  {
    id: "jarip_center",
    name: "자립지원 전담기관 사례관리",
    org: "시·도 자립지원전담기관",
    category: ["MENTORING", "INCOME", "JOB"],
    summary: "1:1 전담 사례관리자가 배정돼 주거·취업·심리 등을 종합적으로 지원해요.",
    link: "https://jaripon.ncrc.or.kr",
    evaluate: () => ({ verdict: "ELIGIBLE" }),
  },
  {
    id: "jaripon_counsel",
    name: "자립정보ON 통합 상담",
    org: "아동권리보장원",
    category: ["MENTORING"],
    summary: "분야·지역별 자립정보를 검색하고 전화·카카오채널로 상담받을 수 있어요.",
    link: "https://jaripon.ncrc.or.kr",
    evaluate: () => ({ verdict: "ELIGIBLE" }),
  },
  {
    id: "job_link",
    name: "국민취업지원제도",
    org: "고용노동부",
    category: ["JOB", "INCOME"],
    summary: "구직촉진수당과 취업지원 서비스를 함께 받을 수 있어요. 자립준비청년은 특례로 참여 가능한 경우가 많아요.",
    amount: "월 최대 약 65만원 (최대 6개월)",
    link: "https://www.work24.go.kr",
    evaluate: (profile) => {
      if (profile.currentStatus === "EMPLOYED") {
        return { verdict: "INELIGIBLE", reason: "이미 취업 중이라 구직지원 대상이 아니에요" };
      }
      return { verdict: "ELIGIBLE" };
    },
  },
  {
    id: "naeil_card",
    name: "국민내일배움카드",
    org: "고용노동부",
    category: ["EDUCATION", "JOB"],
    summary: "취업·직무에 필요한 교육훈련 비용을 5년간 지원받을 수 있어요.",
    amount: "5년간 300~500만원",
    link: "https://www.hrd.go.kr",
    evaluate: (profile) => {
      if (profile.currentStatus === "EMPLOYED") {
        return { verdict: "UNCERTAIN", reason: "재직자는 지원 한도·조건이 달라질 수 있어요" };
      }
      return { verdict: "ELIGIBLE" };
    },
  },
  {
    id: "mentoring",
    name: "자립준비청년 멘토링 지원사업",
    org: "지자체·공공기관 (모집 시기 상이)",
    category: ["MENTORING"],
    summary: "경제적 자립·진로 고민을 나눌 멘토를 매칭해줘요. 기관마다 모집 시기가 달라요.",
    link: "https://jaripon.ncrc.or.kr",
    evaluate: () => ({ verdict: "UNCERTAIN", reason: "모집 시기가 정해져 있어요 · 최신 공고 확인이 필요해요" }),
  },
  {
    id: "seoul_mind_health",
    name: "지자체 청년 마음건강 지원사업",
    org: "시·도",
    category: ["MENTAL"],
    summary: "1:1 맞춤 심리상담을 지원해요. 서울 등 일부 지자체 사업이에요.",
    amount: "6회기",
    link: "https://youth.seoul.go.kr",
    evaluate: (profile) => {
      if (!profile.region) {
        return { verdict: "UNCERTAIN", reason: "거주 지역을 확인해주세요" };
      }
      if (!profile.region.includes("서울")) {
        return { verdict: "UNCERTAIN", reason: "서울 외 지역은 지자체별로 별도 확인이 필요해요" };
      }
      return { verdict: "ELIGIBLE" };
    },
  },
  {
    id: "gukga_janghakgeum",
    name: "국가장학금",
    org: "한국장학재단",
    category: ["EDUCATION"],
    summary: "대학 등록금 부담을 줄여주는 국가 장학금이에요. 소득분위에 따라 지원 금액이 달라져요.",
    link: "https://www.kosaf.go.kr",
    conflictsWith: ["daehak_deungrok"],
    evaluate: (profile) => {
      if (profile.currentStatus !== "UNIV" && profile.currentStatus !== "GRAD") {
        return { verdict: "INELIGIBLE", reason: "현재 미재학 상태예요" };
      }
      return { verdict: "UNCERTAIN", reason: "소득분위 산정 결과에 따라 금액이 달라져요 · 신청 후 확인 필요" };
    },
  },
  {
    id: "geunro_janghakgeum",
    name: "대학생 근로장학금",
    org: "한국장학재단",
    category: ["EDUCATION"],
    summary: "근로 기회를 제공하고 그 대가로 장학금을 지급해요.",
    link: "https://www.kosaf.go.kr",
    evaluate: (profile) => {
      if (profile.currentStatus !== "UNIV" && profile.currentStatus !== "GRAD") {
        return { verdict: "INELIGIBLE", reason: "현재 미재학 상태예요" };
      }
      return { verdict: "ELIGIBLE" };
    },
  },
  {
    id: "wolse_jiwon",
    name: "청년월세지원",
    org: "국토교통부·지자체",
    category: ["HOUSING"],
    summary: "무주택 청년에게 월세 일부를 지원해요. 지자체별로 소득·조건이 달라요.",
    link: "https://www.myhome.go.kr",
    evaluate: (profile) => {
      if (profile.ownsHome === true) {
        return { verdict: "INELIGIBLE", reason: "무주택 요건이 있어요" };
      }
      return { verdict: "UNCERTAIN", reason: "지자체별 소득 기준이 달라 확인이 필요해요" };
    },
  },
  {
    id: "medical_support",
    name: "의료비 지원(차상위 본인부담 경감 등)",
    org: "보건복지부",
    category: ["MEDICAL"],
    summary: "차상위 본인부담 경감 대상이면 의료비 부담이 낮아져요. 다만 일부 별도 의료비 지원과는 중복이 안 될 수 있어요.",
    link: "https://www.bokjiro.go.kr",
    evaluate: (profile) => {
      if (profile.nearPoorMedicalReduction === "Y") {
        return { verdict: "ELIGIBLE" };
      }
      if (profile.nearPoorMedicalReduction === "UNKNOWN") {
        return { verdict: "UNCERTAIN", reason: "차상위 본인부담 경감 대상 여부 확인이 필요해요" };
      }
      return { verdict: "UNCERTAIN", reason: "기초생활수급·차상위 여부에 따라 별도 의료비 지원이 있을 수 있어요" };
    },
  },
  {
    id: "daehak_deungrok",
    name: "지자체 등록금 지원 (자립준비청년 특화)",
    org: "시·도",
    category: ["EDUCATION"],
    summary: "일부 지자체가 자립준비청년 대학등록금·학원비를 별도로 지원해요 (예: 서초구, 인천).",
    link: "https://www.gov.kr",
    conflictsWith: ["gukga_janghakgeum"],
    evaluate: (profile) => {
      if (profile.currentStatus !== "UNIV" && profile.currentStatus !== "GRAD") {
        return { verdict: "INELIGIBLE", reason: "현재 미재학 상태예요" };
      }
      return { verdict: "UNCERTAIN", reason: "거주 지자체에 자립준비청년 등록금 지원 사업이 있는지 확인이 필요해요" };
    },
  },
  {
    id: "emergency_welfare",
    name: "긴급복지지원",
    org: "보건복지부",
    category: ["INCOME"],
    summary: "실직·질병 등 위기상황에 처한 경우 생계비 등을 긴급 지원해요.",
    link: "https://www.bokjiro.go.kr",
    evaluate: () => ({ verdict: "INELIGIBLE", reason: "위기상황 요건 미충족 (해당 시 담당기관에 별도 문의해주세요)" }),
  },
  {
    id: "basic_livelihood",
    name: "생계급여 (기초생활보장)",
    org: "보건복지부",
    category: ["INCOME"],
    summary: "소득이 기준 이하인 경우 생계비를 지원해요.",
    link: "https://www.bokjiro.go.kr",
    evaluate: (profile) => {
      if (profile.basicLivelihoodRecipient === "Y") {
        return { verdict: "ELIGIBLE" };
      }
      if (profile.basicLivelihoodRecipient === "UNKNOWN") {
        return { verdict: "UNCERTAIN", reason: "기초생활수급 여부 확인이 필요해요" };
      }
      return { verdict: "INELIGIBLE", reason: "현재 기초생활수급자가 아니에요" };
    },
  },
];

export type EvaluatedProgram = Program & { result: EligibilityResult };

export type EvaluationSummary = {
  eligible: EvaluatedProgram[];
  ineligible: EvaluatedProgram[];
  uncertain: EvaluatedProgram[];
  conflicts: { a: EvaluatedProgram; b: EvaluatedProgram }[];
};

export function evaluateAll(profile: OnboardingProfile, todayIso: string): EvaluationSummary {
  const ageInfo = buildAgeInfo(profile, todayIso);
  const evaluated: EvaluatedProgram[] = PROGRAMS.map((program) => ({
    ...program,
    result: program.evaluate(profile, ageInfo),
  }));

  const eligible = evaluated
    .filter((p) => p.result.verdict === "ELIGIBLE")
    .sort((a, b) => {
      if (!a.result.ddayDate && !b.result.ddayDate) return 0;
      if (!a.result.ddayDate) return 1;
      if (!b.result.ddayDate) return -1;
      return a.result.ddayDate.localeCompare(b.result.ddayDate);
    });
  const ineligible = evaluated.filter((p) => p.result.verdict === "INELIGIBLE");
  const uncertain = evaluated.filter((p) => p.result.verdict === "UNCERTAIN");

  const eligibleIds = new Set(eligible.map((p) => p.id));
  const conflicts: { a: EvaluatedProgram; b: EvaluatedProgram }[] = [];
  for (const program of eligible) {
    for (const otherId of program.conflictsWith ?? []) {
      if (eligibleIds.has(otherId) && program.id < otherId) {
        const other = eligible.find((p) => p.id === otherId);
        if (other) conflicts.push({ a: program, b: other });
      }
    }
    // 현재 이미 받고 있다고 응답한 지원과 충돌하는지도 확인
    for (const receivedId of profile.currentBenefits) {
      if (program.conflictsWith?.includes(receivedId) && program.id !== receivedId) {
        const other = PROGRAMS.find((p) => p.id === receivedId);
        if (other) conflicts.push({ a: program, b: { ...other, result: { verdict: "ELIGIBLE" } } });
      }
    }
  }

  return { eligible, ineligible, uncertain, conflicts };
}

export function ddayLabel(ddayDate: string | undefined, todayIso: string): string {
  if (!ddayDate) return "상시";
  const diffMs = new Date(ddayDate).getTime() - new Date(todayIso).getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return "기한 지남";
  if (days === 0) return "오늘 마감";
  return `D-${days}`;
}
