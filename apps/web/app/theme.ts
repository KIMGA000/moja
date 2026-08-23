// 공유 디자인 토큰 — 화이트 배경 위에 카드·필 버튼이 올라가는 UI (팀 목업 M0x/S0x의 레이아웃을
// 화이트 배경 버전으로 적용). onDark* / divider 키 이름은 이전 다크 셸 버전에서 남은 이름이지만,
// 지금은 "페이지 배경 위에 직접 놓이는 텍스트/구분선" 색으로 재사용한다.
export const COLORS = {
  pageBg: "#ffffff",
  pageBgElevated: "#f7f7f8",
  card: "#ffffff",
  cardBorder: "#e4e4e7",
  ink: "#0a0a0a",
  inkMuted: "#6b7280",
  onDark: "#0a0a0a",
  onDarkMuted: "#6b7280",
  onDarkFaint: "#9ca3af",
  divider: "#e4e4e7",

  accentViolet: "#8b7cf6",
  accentVioletBg: "#efe9ff",
  accentCyan: "#38bdf8",
  accentCyanBg: "#e4f6fe",
  accentLime: "#caff33",
  accentLimeText: "#1a2e05",

  success: "#16a34a",
  successBg: "#dcfce7",
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
