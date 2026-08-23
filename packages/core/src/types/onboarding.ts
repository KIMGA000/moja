// ---------------------------------------------------------------------------
// 온보딩 프로필 타입 — 원래 apps/web/app/data/eligibility.ts에 있던 것을 core로 옮겼다.
//
// 왜 옮기는가(04_next-step-core-package.md [작업 2]): lib/criteria/adaptProfile.ts가
// 이 타입을 참조하는데, core가 apps/web의 코드를 import하면 core→web 순환 의존이 생겨
// core를 앱(React Native)에서 쓸 수 없게 된다. 타입·상수만 core로 옮기고, 판정 함수
// (Program.evaluate, PROGRAMS, evaluateAll 등)는 그대로 apps/web에 남긴다 — 그건 나중에
// data/seed/policies.json + 카탈로그 체계로 통합할 대상이지 지금 옮길 게 아니다.
//
// apps/web/app/data/eligibility.ts는 이제 여기서 재수출만 한다. EligibilityFlow.tsx의
// import는 한 줄도 고치지 않아도 된다.
// ---------------------------------------------------------------------------

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

export type AgeInfo = {
  todayIso: string;
  age18Date: string | null; // 생년월일 + 18년
  anchorDate: string | null; // 제도별 기산점(대부분 보호종료일, 조기종료 일부는 만18세 도달일)
  yearsSinceAnchor: number | null;
};
