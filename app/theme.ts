// 공유 디자인 토큰 — 화이트 배경 위에 카드·필 버튼이 올라가는 UI (팀 목업 M0x/S0x의 레이아웃을
// 화이트 배경 버전으로 적용). onDark* / divider 키 이름은 이전 다크 셸 버전에서 남은 이름이지만,
// 지금은 "페이지 배경 위에 직접 놓이는 텍스트/구분선" 색으로 재사용한다.
export const COLORS = {
  // 시안 B(웜크림) 팔레트로 교체 — 배경은 웜 크림, 카드는 흰색 고정, 기존 보라 계열은 딥오렌지
  // 칩으로, 초록 계열은 뉴트럴 브라운/그레이로 재도장(레이아웃은 그대로, 값만 교체).
  pageBg: "#FFF8F2",
  pageBgElevated: "#f7f7f8",
  card: "#ffffff",
  cardBorder: "#E9DFD6",
  ink: "#0a0a0a",
  inkMuted: "#6b7280",
  onDark: "#0a0a0a",
  onDarkMuted: "#6b7280",
  onDarkFaint: "#9ca3af",
  divider: "#E9DFD6",

  // 예전엔 보라(인디고) 계열이었던 칩/배지/링크 색 — 이제 라이트 피치 배경 + 딥 오렌지 글자
  accentViolet: "#BF4F0F",
  accentVioletBg: "#FFE8D8",
  // D-day 등 큰 숫자·핵심 강조 텍스트 전용 (칩 글자보다 한 톤 더 진한 오렌지)
  accentStrong: "#A8430A",
  accentCyan: "#38bdf8",
  accentCyanBg: "#e4f6fe",
  // 예전엔 형광 연두였던 히어로 강조색(홈 배지, 온보딩 진행바, 커뮤니티 배지) — 이제 눈에 띄는
  // 비비드 오렌지로. accentViolet(칩)보다 훨씬 채도 높고, brandOrange(로고)보다도 밝다.
  accentLime: "#FF6A00",
  accentLimeText: "#ffffff",

  // 로고 마크(주황 스월 + 크림 배경 타일)용 브랜드 색상 — 헤더 로고에서만 씀
  brandOrange: "#ef5a22",
  brandOrangeMuted: "#f0916b",
  brandCream: "#fbeee0",
  brandPeach: "#f6bd91",

  // 예전엔 초록(성공) 계열이었던 카운트 배지/헤딩 색 — "확정 판정 아님" 카드에 긍정 신호색을
  // 쓰지 않기 위해 뉴트럴 브라운/그레이로 교체
  success: "#2D2926",
  successBg: "#F5F4F2",
  // "가능성 높은 지원" 헤딩 전용 연두색 — success와 별개 토큰이라 다른 곳(배지 등)엔 영향 없음
  positiveHeading: "#4D7C0F",
  warning: "#b45309",
  warningBg: "#fef3c7",
  neutral: "#78716c",
  neutralBg: "#f4f4f5",
  danger: "#dc2626",
  dangerBg: "#fee2e2",
} as const;

export const CARD_STYLE = {
  background: COLORS.card,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: "22px",
  padding: "26px",
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04), 0 10px 24px rgba(0, 0, 0, 0.05)",
} as const;

export function pillBadge(color: "violet" | "cyan" | "lime" | "success" | "warning" | "neutral" | "danger") {
  const map = {
    violet: { background: COLORS.accentVioletBg, color: COLORS.accentViolet },
    cyan: { background: COLORS.accentCyanBg, color: "#0369a1" },
    lime: { background: COLORS.accentLime, color: COLORS.accentLimeText },
    success: { background: COLORS.successBg, color: COLORS.success },
    warning: { background: COLORS.warningBg, color: COLORS.warning },
    neutral: { background: COLORS.neutralBg, color: COLORS.neutral },
    danger: { background: COLORS.dangerBg, color: COLORS.danger },
  }[color];
  return {
    display: "inline-block",
    fontSize: "11px",
    fontWeight: 800,
    padding: "5px 12px",
    borderRadius: "999px",
    letterSpacing: "0.01em",
    ...map,
  } as const;
}

export const PRIMARY_BUTTON = {
  padding: "17px",
  borderRadius: "999px",
  border: "none",
  background: COLORS.ink,
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 700,
} as const;

export const PRIMARY_BUTTON_DISABLED = {
  ...PRIMARY_BUTTON,
  background: "#e5e5e5",
  color: "#a3a3a3",
} as const;

export const GHOST_BUTTON_ON_DARK = {
  padding: "14px",
  borderRadius: "999px",
  border: `1px solid ${COLORS.divider}`,
  background: "transparent",
  color: COLORS.onDarkMuted,
  fontSize: "14px",
  fontWeight: 600,
} as const;

export const GHOST_BUTTON_ON_CARD = {
  padding: "16px",
  borderRadius: "16px",
  border: `1.5px solid ${COLORS.cardBorder}`,
  background: "#ffffff",
  color: COLORS.ink,
  fontSize: "15px",
  fontWeight: 700,
  textAlign: "left" as const,
} as const;

export function choiceButtonStyle(active: boolean) {
  return {
    flex: 1,
    padding: "16px",
    borderRadius: "16px",
    border: `1.5px solid ${active ? COLORS.ink : COLORS.cardBorder}`,
    background: active ? COLORS.ink : "#ffffff",
    fontSize: "15px",
    fontWeight: 700,
    color: active ? "#ffffff" : COLORS.ink,
    textAlign: "left" as const,
  } as const;
}

export const inputStyle = {
  padding: "16px",
  borderRadius: "14px",
  border: `1.5px solid ${COLORS.cardBorder}`,
  fontSize: "16px",
  color: COLORS.ink,
  background: "#ffffff",
  width: "100%",
} as const;
