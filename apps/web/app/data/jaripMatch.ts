// 자립준비청년(보호종료아동) 대상 지원사업·공고 매칭용 데이터/로직
// 실제 공공기관 공고를 바탕으로 정리 (2026년 기준, 세부 조건은 각 기관 공고에서 최종 확인 필요)

export type Region = "seoul" | "other";

export type ProtectionStatus = "before" | "within5" | "over5";

export const PROTECTION_STATUS_LABEL: Record<ProtectionStatus, string> = {
  before: "보호 종료 예정 / 아직 시설·위탁가정에 있어요",
  within5: "보호 종료 후 5년 이내예요",
  over5: "보호 종료 후 5년이 넘었어요",
};

export type Interest =
  | "housing"
  | "allowance"
  | "asset"
  | "job"
  | "psych"
  | "mentoring"
  | "info";

export const INTEREST_LABEL: Record<Interest, { label: string; emoji: string }> = {
  housing: { label: "주거", emoji: "🏠" },
  allowance: { label: "생활비·수당", emoji: "💰" },
  asset: { label: "자산형성", emoji: "🏦" },
  job: { label: "취업", emoji: "💼" },
  psych: { label: "심리·정서", emoji: "🌿" },
  mentoring: { label: "멘토링·교육", emoji: "🤝" },
  info: { label: "종합 상담·정보", emoji: "📋" },
};

export const INTEREST_OPTIONS: Interest[] = [
  "housing",
  "allowance",
  "asset",
  "job",
  "psych",
  "mentoring",
  "info",
];

export type Profile = {
  region: Region;
  status: ProtectionStatus;
  interests: Interest[];
};

export type Announcement = {
  id: string;
  name: string;
  org: string;
  categories: Interest[];
  regions: (Region | "all")[];
  statuses: (ProtectionStatus | "all")[];
  summary: string;
  amount?: string;
  period: string;
  documents: string;
  link: string;
};

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "allowance",
    name: "자립수당",
    org: "보건복지부 · 관할 시·군·구",
    categories: ["allowance"],
    regions: ["all"],
    statuses: ["within5"],
    summary: "보호 종료 후 5년간 매월 자립수당을 지급해 초기 생활 안정을 지원합니다.",
    amount: "월 최대 50만원",
    period: "보호 종료 후 5년간 (상시 신청)",
    documents: "사회복지시설 퇴소(위탁종료) 확인서, 신분증",
    link: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00001175",
  },
  {
    id: "settlement",
    name: "자립정착금",
    org: "시·도 (지역별 금액 상이)",
    categories: ["allowance", "asset"],
    regions: ["all"],
    statuses: ["before", "within5"],
    summary: "시설 퇴소·위탁 종료 시 1회 지급되는 정착 지원금입니다. 지역에 따라 금액 차이가 커서 거주(예정) 지자체 공고 확인이 꼭 필요해요.",
    amount: "지역별 1,000만원~1,500만원+ (2026년 기준)",
    period: "보호 종료 시점에 1회 지급",
    documents: "보호종료 확인서, 통장 사본",
    link: "https://www.mohw.go.kr/menu.es?mid=a10711041000",
  },
  {
    id: "lh-jeonse",
    name: "LH 자립준비청년 전세임대주택",
    org: "한국토지주택공사(LH)",
    categories: ["housing"],
    regions: ["all"],
    statuses: ["before", "within5"],
    summary: "무주택 19~39세 자립준비청년이 원하는 주택을 찾으면 LH가 집주인과 전세계약을 맺고 저렴하게 재임대해주는 제도예요. 수시모집이라 원할 때 신청할 수 있어요.",
    amount: "보증금 100~200만원 내외 + 저리 월 임대료 (지역·평형별 상이)",
    period: "수시모집",
    documents: "무주택 확인, 보호종료(예정) 확인서, 소득 확인서류",
    link: "https://www.lh.or.kr/menu.es?mid=a10401020800",
  },
  {
    id: "future-savings",
    name: "청년내일저축계좌 / 청년미래적금",
    org: "보건복지부",
    categories: ["asset"],
    regions: ["all"],
    statuses: ["within5", "over5"],
    summary: "매달 일정 금액을 저축하면 정부가 지원금을 매칭해줘서 만기 시 목돈을 마련할 수 있어요. 근로·사업소득이 있으면 신청 가능해요.",
    amount: "만기 시 최대 약 2,200만원",
    period: "연 1회 신청 접수 (보건복지부 공고 확인)",
    documents: "소득 확인서류, 통장 사본",
    link: "https://www.bokjiro.go.kr",
  },
  {
    id: "cda",
    name: "디딤씨앗통장(CDA) 만기 지급",
    org: "아동권리보장원",
    categories: ["asset"],
    regions: ["all"],
    statuses: ["before", "within5", "over5"],
    summary: "아동기에 디딤씨앗통장에 가입해 적립해왔다면, 만 18세 이후 만기 시 정부 매칭 지원금을 포함해 찾을 수 있어요. 이미 가입돼 있는 경우에 해당돼요.",
    amount: "적립액 + 정부 매칭 지원금",
    period: "만 18세 이후 신청 시",
    documents: "통장 사본, 신분증",
    link: "https://www.ncrc.or.kr",
  },
  {
    id: "jaripon-counsel",
    name: "자립정보ON 통합 상담",
    org: "아동권리보장원",
    categories: ["info", "psych", "job", "housing"],
    regions: ["all"],
    statuses: ["all"],
    summary: "소득·주거·심리·취업 등 상황에 맞는 자립정보를 분야·지역별로 검색하고, 전화(1855-2455)나 카카오채널로 1:1 상담도 받을 수 있는 통합 플랫폼이에요. 뭐부터 봐야 할지 모르겠다면 여기부터 시작하세요.",
    period: "평일 09:00~18:00 상담",
    documents: "없음",
    link: "https://jaripon.ncrc.or.kr",
  },
  {
    id: "mind-voucher",
    name: "정신건강 심리상담 바우처사업",
    org: "보건복지부 (전국)",
    categories: ["psych"],
    regions: ["all"],
    statuses: ["all"],
    summary: "전문 심리상담을 총 8회 바우처로 지원받을 수 있어요. 예산이 소진되기 전까지 연중 신청 가능해요.",
    amount: "회당 7~8만원 상당 바우처 × 8회",
    period: "예산 소진 시까지 상시 신청",
    documents: "복지로 온라인 신청 또는 주민센터 방문",
    link: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00005567",
  },
  {
    id: "mentoring",
    name: "자립준비청년 멘토링 지원사업",
    org: "지자체·공공기관별 (모집 시기 상이)",
    categories: ["mentoring", "job"],
    regions: ["all"],
    statuses: ["before", "within5", "over5"],
    summary: "경제적 자립·진로 고민을 함께 풀어줄 멘토를 매칭해주는 사업이에요. 기관마다 모집 시기가 다르니 자립정보ON에서 최신 모집 공고를 확인하는 게 가장 빨라요.",
    period: "기관별 상이 (연중 순차 모집)",
    documents: "신청서 (모집 공고별 상이)",
    link: "https://jaripon.ncrc.or.kr/home/kor/support/projectMng/list.do",
  },
  {
    id: "seoul-jarip-center",
    name: "서울자립지원전담기관 사례관리",
    org: "서울시",
    categories: ["info", "housing", "job", "psych"],
    regions: ["seoul"],
    statuses: ["before", "within5", "over5"],
    summary: "서울 거주(예정) 자립준비청년에게 1:1 전담 사례관리자를 배정해 주거·취업·심리 등을 종합적으로 지원해요.",
    period: "상시 접수",
    documents: "상담 신청서",
    link: "https://www.sjarip.or.kr",
  },
  {
    id: "job-link",
    name: "국민취업지원제도 연계 (자립준비청년 특화)",
    org: "고용노동부",
    categories: ["job"],
    regions: ["all"],
    statuses: ["within5", "over5"],
    summary: "구직촉진수당과 취업지원 서비스를 함께 받을 수 있는 제도예요. 자립준비청년은 소득 요건과 무관하게 특례로 참여할 수 있는 경우가 많아요.",
    amount: "월 최대 약 65만원 (최대 6개월)",
    period: "상시 신청",
    documents: "신분증, 보호종료 확인서",
    link: "https://www.work24.go.kr",
  },
];

export function matchAnnouncements(profile: Profile): Announcement[] {
  return ANNOUNCEMENTS.filter((a) => {
    const regionOk = a.regions.includes("all") || a.regions.includes(profile.region);
    const statusOk = a.statuses.includes("all") || a.statuses.includes(profile.status);
    const interestOk =
      profile.interests.length === 0 ||
      a.categories.some((c) => profile.interests.includes(c));
    return regionOk && statusOk && interestOk;
  });
}

export const BOOKMARK_STORAGE_KEY = "jaripmatch/bookmarks-v1";
