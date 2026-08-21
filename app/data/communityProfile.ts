// 로그인 없이 브라우저에만 저장되는 커뮤니티용 익명 프로필
// 자립(예정)청년 인증은 나중에 추가 예정 — 지금은 입력값을 그대로 신뢰

export type Gender = "male" | "female" | "unspecified";

export const GENDER_LABEL: Record<Gender, string> = {
  male: "남성",
  female: "여성",
  unspecified: "밝히지 않음",
};

export type CommunityProfile = {
  birthYear: number;
  gender: Gender;
  // 보호 종료(예정) 연월, "YYYY-MM" 형식. 이미 종료됐다면 과거 날짜, 예정이라면 미래 날짜.
  protectionEndYearMonth: string;
};

export const COMMUNITY_PROFILE_STORAGE_KEY = "moja/community-profile-v1";

export function calcAge(birthYear: number): number {
  return new Date().getFullYear() - birthYear + 1;
}

export function describeProtectionTiming(protectionEndYearMonth: string): string {
  if (!protectionEndYearMonth) return "";
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (protectionEndYearMonth > currentYearMonth) return "보호 종료 예정";

  const [endY, endM] = protectionEndYearMonth.split("-").map(Number);
  const [curY, curM] = currentYearMonth.split("-").map(Number);
  const monthsPassed = (curY - endY) * 12 + (curM - endM);
  const years = Math.floor(monthsPassed / 12);

  if (years <= 0) return "보호 종료 1년 이내";
  if (years < 5) return `보호 종료 ${years}년차`;
  return "보호 종료 5년 초과";
}
