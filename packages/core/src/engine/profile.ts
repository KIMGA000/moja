// ---------------------------------------------------------------------------
// 판정엔진 1부: 프로필 계산 — 온보딩 원시 응답(raw) -> 판정에 필요한 파생값(computed)
// app.html의 MojaEngine.computeProfile을 그대로 옮긴 것. 로직은 바꾸지 않았다.
// ---------------------------------------------------------------------------

import type { Profile, RawProfileInput } from './types';

export function addYears(date: Date, years: number): Date {
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

export function diffInYears(from: Date, to: Date): number {
  // from이 to보다 과거일 때 경과년수(내림)
  let years = to.getFullYear() - from.getFullYear();
  const anniversary = new Date(from.getTime());
  anniversary.setFullYear(from.getFullYear() + years);
  if (anniversary > to) years -= 1;
  return years;
}

export function diffInDays(from: Date, to: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / MS);
}

/**
 * 'YYYY-MM-DD' 문자열을 **로컬 자정**으로 파싱한다.
 *
 * new Date('2025-06-01')은 ISO date-only 규칙에 따라 UTC 자정으로 해석되는데,
 * 비교 대상인 new Date()(현재 시각)는 로컬 시각이다. 한국(UTC+9)에서는 이 9시간 차이
 * 때문에 같은 날 아침과 밤에 D-day가 1일씩 다르게 계산됐다.
 * (예: 2026-08-21 00:30 KST → D-4 / 같은 날 23:30 KST → D-3)
 * 기한 경계에서는 '곧마감'과 '이미놓침'이 뒤집히므로, 날짜만 담긴 값은 전부
 * 로컬 자정으로 정규화한다.
 */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return startOfLocalDay(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return new Date(value);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 어떤 시각이든 그 날의 로컬 자정으로 내린다. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * raw: {
 *   birthDate: 'YYYY-MM-DD',
 *   hasInstitutionalCare: boolean,
 *   exitType: '만기' | '연장' | '조기' | '재보호',
 *   protectionEndDate: 'YYYY-MM-DD',
 *   isEnrolled: boolean,
 *   isEmployed: boolean,
 *   region: string,
 *   incomeBracket: '없음또는50%이하' | '50~100%' | '100~150%' | '150%초과',
 *   ownsHouse: boolean,
 *   isMarried: boolean,
 *   isBasicLivelihoodRecipient: boolean,
 *   isNearPoorMedicalDiscount: boolean,
 *   currentSupports: string[]  // 다중선택, policies.json id 또는 rules.json의 group 토큰
 * }
 */
export function computeProfile(raw: RawProfileInput, today: Date = new Date()): Profile {
  // 시각 성분을 제거해서 타임존에 따른 D-day 흔들림을 없앤다. (parseDateOnly 주석 참고)
  const now = startOfLocalDay(today);
  const birthDate = raw.birthDate ? parseDateOnly(raw.birthDate) : null;
  const protectionEndDate = raw.protectionEndDate ? parseDateOnly(raw.protectionEndDate) : null;

  const ageYears = birthDate ? diffInYears(birthDate, now) : null;

  // 조기퇴소자는 "만 18세 도달일"이 5년 기산점, 그 외(만기/연장)는 "보호종료일"이 기산점.
  // 재보호조치 이력이 있으면 자립정착금은 재지급되지 않는 등 별도 처리가 필요하므로
  // exitType === '재보호'는 fiveYearBase 계산에서 별도 플래그로 남겨 정책이 참조할 수 있게 한다.
  let fiveYearBaseDate: Date | null = protectionEndDate;
  if (raw.exitType === '조기' && birthDate) {
    fiveYearBaseDate = addYears(birthDate, 18);
  }

  const yearsSinceFiveYearBase =
    fiveYearBaseDate != null ? diffInYears(fiveYearBaseDate, now) : null;
  const fiveYearDeadlineDate = fiveYearBaseDate != null ? addYears(fiveYearBaseDate, 5) : null;
  const daysUntilFiveYearDeadline =
    fiveYearDeadlineDate != null ? diffInDays(now, fiveYearDeadlineDate) : null;

  return {
    ...raw,
    birthDate,
    protectionEndDate,
    fiveYearBaseDate,
    fiveYearDeadlineDate,
    ageYears,
    yearsSinceFiveYearBase,
    daysUntilFiveYearDeadline,
    currentSupports: raw.currentSupports || [],
  };
}
