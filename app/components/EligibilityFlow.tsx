"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EMPLOYMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_LABEL,
  INTEREST_CATEGORY_LABEL,
  PROGRAMS,
  PROTECTION_END_TYPE_LABEL,
  addYears,
  buildAgeInfo,
  ddayLabel,
  type EmploymentStatus,
  type EnrollmentStatus,
  type InterestCategory,
  type OnboardingProfile,
  type ProtectionEndType,
  type YesNoUnknown,
} from "../data/eligibility";
import { matchRealItems, type EvaluatedRealItem } from "../data/realMatch";
import { SOURCE_LABEL, type AnnouncementRecord, type WelfareItem } from "../data/apiPreview";
import { isAlwaysOpenAnnouncement } from "../data/classify";
import { logAnnouncementClick } from "../../lib/bookmarks";
import {
  CARD_STYLE,
  COLORS,
  GHOST_BUTTON_ON_DARK,
  PRIMARY_BUTTON,
  PRIMARY_BUTTON_DISABLED,
  choiceButtonStyle,
  inputStyle,
  pillBadge,
} from "../theme";

const REGIONS = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시",
  "울산광역시", "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도",
  "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
];

type StepId =
  | "gate"
  | "birth"
  | "endType"
  | "returnedFamily"
  | "endDate"
  | "status"
  | "region"
  | "home"
  | "marital"
  | "basicLivelihood"
  | "nearPoor"
  | "currentBenefits"
  | "interests";

const STEP_CATEGORY: Record<StepId, string> = {
  gate: "대상 확인",
  birth: "생년월일",
  endType: "보호종료 유형",
  returnedFamily: "원가정 복귀",
  endDate: "보호종료 연월",
  status: "현재 상태",
  region: "거주 지역",
  home: "주택 소유",
  marital: "혼인 여부",
  basicLivelihood: "기초생활수급",
  nearPoor: "차상위 경감",
  currentBenefits: "현재 지원",
  interests: "관심 분야",
};

function buildStepIds(profile: OnboardingProfile): StepId[] {
  const steps: StepId[] = ["gate", "birth", "endType"];
  if (profile.protectionEndType === "EARLY_END") steps.push("returnedFamily");
  steps.push(
    "endDate",
    "status",
    "region",
    "home",
    "marital",
    "basicLivelihood",
    "nearPoor",
    "currentBenefits",
    "interests"
  );
  return steps;
}

// ── 날짜 계산 유틸 (Q2 자동 계산 패널용) ─────────────────────────────
function parseYearMonth(iso: string): { year: string; month: string } {
  if (!iso) return { year: "", month: "" };
  const [y, m] = iso.split("-");
  return { year: y ?? "", month: m ?? "" };
}

function parseYearMonthDay(iso: string): { year: string; month: string; day: string } {
  if (!iso) return { year: "", month: "", day: "" };
  const [y, m, d] = iso.split("-");
  return { year: y ?? "", month: m ?? "", day: d ?? "" };
}

function toIsoFromYearMonth(year: string, month: string): string {
  if (!year || !month) return "";
  return `${year}-${month.padStart(2, "0")}-01`;
}

function toIsoFromYearMonthDay(year: string, month: string, day: string): string {
  if (!year || !month || !day) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function daysInMonth(year: string, month: string): number {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

function addYearsIso(iso: string, years: number): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function monthsBetween(fromIso: string, toIso: string | null): number | null {
  if (!toIso) return null;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function formatDuration(totalMonths: number | null): string {
  if (totalMonths === null) return "－";
  const abs = Math.abs(totalMonths);
  const y = Math.floor(abs / 12);
  const m = abs % 12;
  const label = y === 0 ? `${m}개월` : m === 0 ? `${y}년` : `${y}년 ${m}개월`;
  return totalMonths < 0 ? `${label} 지남` : label;
}

export function EligibilityOnboarding({
  profile,
  todayIso,
  onChange,
  onSubmit,
  onCancel,
}: {
  profile: OnboardingProfile;
  todayIso: string;
  onChange: (next: OnboardingProfile) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [outOfScope, setOutOfScope] = useState(false);
  const stepIds = useMemo(() => buildStepIds(profile), [profile.protectionEndType]);
  const stepId = stepIds[stepIndex];
  const isLast = stepIndex === stepIds.length - 1;

  const update = (patch: Partial<OnboardingProfile>) => onChange({ ...profile, ...patch });

  const next = () => {
    if (isLast) {
      onSubmit();
    } else {
      setStepIndex((i) => Math.min(i + 1, stepIds.length - 1));
    }
  };
  const back = () => {
    if (outOfScope) {
      setOutOfScope(false);
      return;
    }
    if (stepIndex === 0) {
      onCancel();
    } else {
      setStepIndex((i) => i - 1);
    }
  };

  const answerGate = (yes: boolean) => {
    update({ hasInstitutionalExperience: yes });
    if (yes) {
      setStepIndex(1);
    } else {
      setOutOfScope(true);
    }
  };

  const canProceed = (() => {
    switch (stepId) {
      case "gate":
        return false; // 게이트 질문은 버튼 클릭 즉시 진행 — 별도 "다음" 없음
      case "birth":
        return !!profile.birthDate;
      case "endType":
        return !!profile.protectionEndType;
      case "returnedFamily":
        return profile.returnedToBirthFamily !== null;
      case "endDate":
        return !!profile.protectionEndDate;
      case "status":
        return !!profile.enrollmentStatus && !!profile.employmentStatus;
      case "region":
        return !!profile.region;
      case "home":
        return profile.ownsHome !== null;
      case "marital":
        return profile.maritalStatus !== null;
      case "basicLivelihood":
        return profile.basicLivelihoodRecipient !== "UNKNOWN";
      case "nearPoor":
        return profile.nearPoorMedicalReduction !== "UNKNOWN";
      case "currentBenefits":
      case "interests":
        return true;
      default:
        return false;
    }
  })();

  if (outOfScope) {
    return <OutOfScopeScreen onBack={back} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", animation: "fadeIn 0.25s" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          color: COLORS.onDarkMuted,
          fontSize: "13px",
          fontWeight: 700,
        }}
      >
        <button onClick={back} style={backArrowStyle} aria-label="이전으로">
          ←
        </button>
        <span>내 상황 {stepIndex + 1} / {stepIds.length}</span>
      </div>
      <div style={{ height: "5px", background: COLORS.divider, borderRadius: "999px", overflow: "hidden" }}>
        <div
          style={{
            width: `${((stepIndex + 1) / stepIds.length) * 100}%`,
            height: "100%",
            background: COLORS.accentLime,
            transition: "width 0.25s",
          }}
        />
      </div>

      {stepId === "gate" && (
        <StepShell
          category={STEP_CATEGORY.gate}
          badge="violet"
          title="보육원·그룹홈·위탁가정에서 지낸 적이 있나요?"
        >
          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={() => answerGate(true)} style={choiceButtonStyle(profile.hasInstitutionalExperience === true)}>
              예
              <span style={subLabelStyle}>제도 판별 시작</span>
            </button>
            <button onClick={() => answerGate(false)} style={choiceButtonStyle(profile.hasInstitutionalExperience === false)}>
              아니오
              <span style={subLabelStyle}>안내 화면으로</span>
            </button>
          </div>
        </StepShell>
      )}
      {stepId === "gate" && (
        <p style={footerNoteStyle}>
          이 답변에 따라 보여드릴 제도가 완전히 달라져요. 모자는 시설·가정위탁 보호 경험이 있는
          분들을 위한 서비스라, 남은 질문은 이제 {stepIds.length - 1}개뿐이에요.
        </p>
      )}

      {stepId === "birth" && (
        <BirthDateStep profile={profile} todayIso={todayIso} onChange={update} />
      )}

      {stepId === "endType" && (
        <StepShell category={STEP_CATEGORY.endType} badge="violet" title="보호종료 유형을 골라주세요">
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {(Object.keys(PROTECTION_END_TYPE_LABEL) as ProtectionEndType[]).map((t) => (
              <button
                key={t}
                onClick={() => update({ protectionEndType: t })}
                style={choiceButtonStyle(profile.protectionEndType === t)}
              >
                {PROTECTION_END_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </StepShell>
      )}

      {stepId === "returnedFamily" && (
        <StepShell
          category={STEP_CATEGORY.returnedFamily}
          badge="violet"
          title="보호종료 후 원가정으로 복귀하셨나요?"
          desc="조기 보호종료의 경우 이 여부에 따라 자격이 달라질 수 있어요"
        >
          <YesNoButtons
            value={profile.returnedToBirthFamily}
            onChange={(v) => update({ returnedToBirthFamily: v })}
          />
        </StepShell>
      )}

      {stepId === "endDate" && (
        <EndDateStep profile={profile} todayIso={todayIso} onChange={update} />
      )}

      {stepId === "status" && (
        <StepShell
          category={STEP_CATEGORY.status}
          badge="violet"
          title="현재 상태를 알려주세요"
          desc="재학 중이면서 취업한 경우도 있어서, 재학 여부와 취업 여부를 따로 골라주세요"
        >
          <p style={{ fontSize: "13px", fontWeight: 700, color: COLORS.ink, marginBottom: "10px" }}>재학 여부</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {(Object.keys(ENROLLMENT_STATUS_LABEL) as EnrollmentStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => update({ enrollmentStatus: s })}
                style={choiceButtonStyle(profile.enrollmentStatus === s)}
              >
                {ENROLLMENT_STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          <p style={{ fontSize: "13px", fontWeight: 700, color: COLORS.ink, margin: "22px 0 10px" }}>취업 상태</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {(Object.keys(EMPLOYMENT_STATUS_LABEL) as EmploymentStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => update({ employmentStatus: s })}
                style={choiceButtonStyle(profile.employmentStatus === s)}
              >
                {EMPLOYMENT_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </StepShell>
      )}

      {stepId === "region" && (
        <StepShell category={STEP_CATEGORY.region} badge="violet" title="거주 지역이 어디세요?" desc="지자체별로 다른 지원사업을 확인하기 위해서예요">
          <select
            value={profile.region}
            onChange={(e) => update({ region: e.target.value })}
            style={inputStyle}
          >
            <option value="">선택해주세요</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </StepShell>
      )}

      {stepId === "home" && (
        <StepShell category={STEP_CATEGORY.home} badge="violet" title="주택을 소유하고 있나요?">
          <YesNoButtons value={profile.ownsHome} onChange={(v) => update({ ownsHome: v })} />
        </StepShell>
      )}

      {stepId === "marital" && (
        <StepShell category={STEP_CATEGORY.marital} badge="violet" title="현재 혼인 중인가요?">
          <YesNoButtons value={profile.maritalStatus} onChange={(v) => update({ maritalStatus: v })} />
        </StepShell>
      )}

      {stepId === "basicLivelihood" && (
        <StepShell category={STEP_CATEGORY.basicLivelihood} badge="violet" title="현재 기초생활수급자인가요?">
          <YesNoUnknownButtons
            value={profile.basicLivelihoodRecipient}
            onChange={(v) => update({ basicLivelihoodRecipient: v })}
            showUnknown={false}
          />
        </StepShell>
      )}

      {stepId === "nearPoor" && (
        <StepShell
          category={STEP_CATEGORY.nearPoor}
          badge="violet"
          title="차상위 본인부담 경감을 받고 있나요?"
          desc="기초생활수급 다음으로 소득이 낮은 가구에게 의료비 등을 깎아주는 제도예요"
        >
          <YesNoUnknownButtons
            value={profile.nearPoorMedicalReduction}
            onChange={(v) => update({ nearPoorMedicalReduction: v })}
            showUnknown={false}
          />
        </StepShell>
      )}

      {stepId === "currentBenefits" && (
        <StepShell category={STEP_CATEGORY.currentBenefits} badge="violet" title="현재 받고 있는 지원이 있나요?" desc="복수 선택 가능해요">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {PROGRAMS.map((p) => {
              const active = profile.currentBenefits.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() =>
                    update({
                      currentBenefits: active
                        ? profile.currentBenefits.filter((id) => id !== p.id)
                        : [...profile.currentBenefits.filter((id) => id !== "NONE"), p.id],
                    })
                  }
                  style={{ ...choiceButtonStyle(active), flex: "unset", padding: "10px 16px", fontSize: "13px" }}
                >
                  {p.name}
                </button>
              );
            })}
            <button
              onClick={() => update({ currentBenefits: ["NONE"] })}
              style={{
                ...choiceButtonStyle(profile.currentBenefits.includes("NONE")),
                flex: "unset",
                padding: "10px 16px",
                fontSize: "13px",
              }}
            >
              받고 있는 지원 없음
            </button>
          </div>
        </StepShell>
      )}

      {stepId === "interests" && (
        <StepShell category={STEP_CATEGORY.interests} badge="violet" title="관심 있는 분야를 골라주세요" desc="복수 선택 가능해요">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {(Object.keys(INTEREST_CATEGORY_LABEL) as InterestCategory[]).map((c) => {
              const active = profile.interestCategories.includes(c);
              return (
                <button
                  key={c}
                  onClick={() =>
                    update({
                      interestCategories: active
                        ? profile.interestCategories.filter((id) => id !== c)
                        : [...profile.interestCategories, c],
                    })
                  }
                  style={{ ...choiceButtonStyle(active), flex: "unset", padding: "10px 16px", fontSize: "13px" }}
                >
                  {INTEREST_CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>
        </StepShell>
      )}

      {stepId !== "gate" && (
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={back} style={{ ...GHOST_BUTTON_ON_DARK, flex: 1 }}>
            ← 이전
          </button>
          <button
            onClick={next}
            disabled={!canProceed}
            style={{ ...(canProceed ? PRIMARY_BUTTON : PRIMARY_BUTTON_DISABLED), flex: 2 }}
          >
            {isLast ? "결과 보기" : "다음"}
          </button>
        </div>
      )}
    </div>
  );
}

function BirthDateStep({
  profile,
  todayIso,
  onChange,
}: {
  profile: OnboardingProfile;
  todayIso: string;
  onChange: (patch: Partial<OnboardingProfile>) => void;
}) {
  // ⚠️ 선택 상태를 profile.birthDate에서 매번 다시 파싱하면, 연도만 고른 시점처럼 아직
  // 완전한 날짜가 아닐 때 profile.birthDate가 계속 ""로 남아있어서 방금 고른 값이 화면에서
  // 다시 "연도"(placeholder)로 되돌아가 버린다. 그래서 선택 상태는 로컬 state로 따로 들고,
  // 세 칸이 다 채워졌을 때만 조합해서 부모에 올린다.
  const initial = parseYearMonthDay(profile.birthDate);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  const currentYear = Number(todayIso.slice(0, 4));
  // 자립준비청년 응답자 연령대를 넉넉히 포괄 (만 9세~45세)
  const years = Array.from({ length: 37 }, (_, i) => String(currentYear - 9 - i));
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const dayCount = daysInMonth(year, month);
  const days = Array.from({ length: dayCount }, (_, i) => String(i + 1).padStart(2, "0"));

  const setPart = (part: "year" | "month" | "day", value: string) => {
    const next = { year, month, day, [part]: value };
    // 일(day)이 새 월의 최대 일수를 넘으면 잘라준다 (예: 31일 선택 후 2월로 바꾸는 경우)
    const maxDay = daysInMonth(next.year, next.month);
    const safeDay = next.day && Number(next.day) > maxDay ? String(maxDay).padStart(2, "0") : next.day;
    setYear(next.year);
    setMonth(next.month);
    setDay(safeDay);
    onChange({ birthDate: toIsoFromYearMonthDay(next.year, next.month, safeDay) });
  };

  return (
    <StepShell category={STEP_CATEGORY.birth} badge="violet" title="생년월일이 어떻게 되세요?" desc="나이·기산점 계산에 필요해요">
      <div style={{ display: "flex", gap: "10px" }}>
        <select value={year} onChange={(e) => setPart("year", e.target.value)} style={{ ...inputStyle, flex: 1.2 }}>
          <option value="">연도</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setPart("month", e.target.value)} style={{ ...inputStyle, flex: 1 }}>
          <option value="">월</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {Number(m)}월
            </option>
          ))}
        </select>
        <select value={day} onChange={(e) => setPart("day", e.target.value)} style={{ ...inputStyle, flex: 1 }}>
          <option value="">일</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {Number(d)}일
            </option>
          ))}
        </select>
      </div>
    </StepShell>
  );
}

function EndDateStep({
  profile,
  todayIso,
  onChange,
}: {
  profile: OnboardingProfile;
  todayIso: string;
  onChange: (patch: Partial<OnboardingProfile>) => void;
}) {
  // "만 18세에 종료"는 법적으로 생년월일 + 18년으로 정확히 정해지는 날짜라 물어볼 필요가 없다
  // (아동복지법 제38조) — 직접 계산해서 채워준다.
  const isAge18End = profile.protectionEndType === "AGE18_END";
  const computedAge18Date = isAge18End && profile.birthDate ? addYearsIso(profile.birthDate, 18) : null;

  // BirthDateStep과 같은 이유로 로컬 state로 선택 상태를 따로 든다 (연도만 고른 시점에
  // profile.protectionEndDate가 아직 ""라서 화면이 다시 placeholder로 되돌아가는 것 방지).
  const initial = parseYearMonth(profile.protectionEndDate);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);

  useEffect(() => {
    if (computedAge18Date && profile.protectionEndDate !== computedAge18Date) {
      onChange({ protectionEndDate: computedAge18Date });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedAge18Date]);

  const currentYear = Number(todayIso.slice(0, 4));
  // 과거(이미 종료) ~ 미래(만 18세 도달 예정) 양쪽을 넉넉히 포괄
  const years = Array.from({ length: 31 }, (_, i) => String(currentYear + 10 - i));
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

  const setPart = (part: "year" | "month", value: string) => {
    const next = { year, month, [part]: value };
    setYear(next.year);
    setMonth(next.month);
    onChange({ protectionEndDate: toIsoFromYearMonth(next.year, next.month) });
  };

  const isFuture = !!profile.protectionEndDate && profile.protectionEndDate > todayIso;
  const remainingToEnd = isFuture ? monthsBetween(todayIso, profile.protectionEndDate) : null;
  const elapsed = !isFuture ? monthsBetween(profile.protectionEndDate, todayIso) : null;
  const dday5y = profile.protectionEndDate ? addYearsIso(profile.protectionEndDate, 5) : null;
  // 예정일(CURRENTLY_PROTECTED)도 이미 고른 연/월 기준으로 5년 기한을 미리 계산해서 보여준다 —
  // 실제 종료일이 나중에 바뀌면 이 값도 같이 바뀐다는 걸 문구로 알려준다.
  const remainingTo5y = profile.protectionEndDate && dday5y ? monthsBetween(todayIso, dday5y) : null;

  const title = isAge18End
    ? "만 18세가 되는 시점을 자동 계산했어요"
    : profile.protectionEndType === "CURRENTLY_PROTECTED"
      ? "보호종료 예정일이 언제인가요?"
      : "보호가 끝난 때가 언제인가요?";

  return (
    <>
      <StepShell
        category={STEP_CATEGORY.endDate}
        badge="violet"
        title={title}
        desc={
          isAge18End
            ? "만 18세 도달일은 법으로 정해져 있어서(아동복지법 제38조), 생년월일로 직접 계산했어요."
            : "연도와 월만 고르면 돼요. 정확한 날짜는 몰라도 괜찮아요."
        }
      >
        {isAge18End ? (
          <div
            style={{
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: "16px",
              padding: "16px",
              background: "#fafafa",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "11px", fontWeight: 700, color: COLORS.inkMuted }}>
              ● 자동 계산됨 — 생년월일 기준
            </p>
            <p style={{ fontSize: "22px", fontWeight: 800, color: COLORS.ink, marginTop: "8px" }}>
              {computedAge18Date ? `${computedAge18Date.slice(0, 4)}년 ${Number(computedAge18Date.slice(5, 7))}월` : "－"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "12px" }}>
            <select value={year} onChange={(e) => setPart("year", e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="">연도</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <select value={month} onChange={(e) => setPart("month", e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="">월</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {Number(m)}월
                </option>
              ))}
            </select>
          </div>
        )}

        {profile.protectionEndDate && isFuture && (
          <div
            style={{
              marginTop: "6px",
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: "16px",
              padding: "16px",
              background: "#fafafa",
            }}
          >
            <p style={{ fontSize: "11px", fontWeight: 700, color: COLORS.inkMuted }}>
              ● 자동 계산됨 — 직접 계산 안 하셔도 돼요
            </p>
            <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "12px", color: COLORS.inkMuted }}>보호종료 예정까지</p>
                <p style={{ fontSize: "22px", fontWeight: 800, color: COLORS.ink, marginTop: "2px" }}>
                  {formatDuration(remainingToEnd)}
                </p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "12px", color: COLORS.inkMuted }}>5년 기한까지 (예정 기준)</p>
                <p style={{ fontSize: "22px", fontWeight: 800, color: COLORS.ink, marginTop: "2px" }}>
                  {formatDuration(remainingTo5y)}
                </p>
              </div>
            </div>
            <p style={{ fontSize: "11px", color: COLORS.inkMuted, marginTop: "8px" }}>
              실제 종료일이 확정되면 이 숫자는 바뀔 수 있어요 — 지금은 예정일 기준 계산이에요.
            </p>
          </div>
        )}

        {profile.protectionEndDate && !isFuture && (
          <div
            style={{
              marginTop: "6px",
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: "16px",
              padding: "16px",
              background: "#fafafa",
            }}
          >
            <p style={{ fontSize: "11px", fontWeight: 700, color: COLORS.inkMuted }}>
              ● 자동 계산됨 — 직접 계산 안 하셔도 돼요
            </p>
            <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "12px", color: COLORS.inkMuted }}>보호종료 후 경과</p>
                <p style={{ fontSize: "22px", fontWeight: 800, color: COLORS.ink, marginTop: "2px" }}>
                  {formatDuration(elapsed)}
                </p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "12px", color: COLORS.inkMuted }}>5년 기한까지</p>
                <p style={{ fontSize: "22px", fontWeight: 800, color: COLORS.ink, marginTop: "2px" }}>
                  {formatDuration(remainingTo5y)}
                </p>
              </div>
            </div>
            <p style={{ fontSize: "11px", color: COLORS.inkMuted, marginTop: "8px" }}>
              이 숫자가 여러 제도의 D-day 기한과 이어져요.
            </p>
          </div>
        )}
      </StepShell>
      <p style={footerNoteStyle}>
        많은 자립 지원 제도가 &quot;보호종료 후 5년 이내&quot;를 기준으로 삼아요. 정확한 날짜를
        몰라도 연·월만 알면 충분히 계산할 수 있어요.
      </p>
    </>
  );
}

function OutOfScopeScreen({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", animation: "fadeIn 0.25s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", color: COLORS.onDarkMuted, fontSize: "13px", fontWeight: 700 }}>
        <button onClick={onBack} style={backArrowStyle} aria-label="이전으로">
          ←
        </button>
        <span>안내</span>
      </div>

      <div style={CARD_STYLE}>
        <span style={pillBadge("cyan")}>대상 안내</span>
        <h2 style={{ fontSize: "19px", fontWeight: 800, color: COLORS.ink, marginTop: "14px", lineHeight: 1.4 }}>
          이곳은 시설·위탁가정에서 지낸 분들을 위한 서비스예요
        </h2>
        <p style={{ fontSize: "13px", color: COLORS.inkMuted, marginTop: "10px", lineHeight: 1.6 }}>
          여기서 다루는 제도는 대부분 보호종료를 조건으로 해서, 지금 도움이 되기 어려워요. 대신
          아래 서비스를 확인해보세요.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
          <a
            href="https://www.youthcenter.go.kr"
            target="_blank"
            rel="noreferrer"
            style={outOfScopeLinkStyle}
          >
            <span>온통청년<span style={{ color: COLORS.inkMuted, fontWeight: 500 }}> · 청년정책 통합</span></span>
            <span>→</span>
          </a>
          <a
            href="https://www.bokjiro.go.kr"
            target="_blank"
            rel="noreferrer"
            style={outOfScopeLinkStyle}
          >
            <span>복지로<span style={{ color: COLORS.inkMuted, fontWeight: 500 }}> · 복지제도 모의계산</span></span>
            <span>→</span>
          </a>
        </div>
      </div>

      <button onClick={onBack} style={PRIMARY_BUTTON}>
        이전으로 돌아가기
      </button>
    </div>
  );
}

function StepShell({
  category,
  badge,
  title,
  desc,
  children,
}: {
  category: string;
  badge: "violet" | "cyan" | "lime";
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={CARD_STYLE}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <span style={pillBadge(badge)}>{category}</span>
          <h2 style={{ fontSize: "19px", fontWeight: 800, color: COLORS.ink, marginTop: "12px", lineHeight: 1.4 }}>
            {title}
          </h2>
          {desc && <p style={{ fontSize: "13px", color: COLORS.inkMuted, marginTop: "6px" }}>{desc}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function YesNoButtons({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", gap: "12px" }}>
      <button onClick={() => onChange(true)} style={choiceButtonStyle(value === true)}>
        예
      </button>
      <button onClick={() => onChange(false)} style={choiceButtonStyle(value === false)}>
        아니오
      </button>
    </div>
  );
}

function YesNoUnknownButtons({
  value,
  onChange,
  showUnknown = true,
}: {
  value: YesNoUnknown;
  onChange: (v: YesNoUnknown) => void;
  showUnknown?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "10px" }}>
      <button onClick={() => onChange("Y")} style={choiceButtonStyle(value === "Y")}>
        예
      </button>
      <button onClick={() => onChange("N")} style={choiceButtonStyle(value === "N")}>
        아니오
      </button>
      {showUnknown && (
        <button onClick={() => onChange("UNKNOWN")} style={choiceButtonStyle(value === "UNKNOWN")}>
          잘 모르겠어요
        </button>
      )}
    </div>
  );
}

const backArrowStyle = {
  background: "none",
  border: "none",
  fontSize: "16px",
  color: COLORS.onDark,
  padding: "4px",
  lineHeight: 1,
} as const;

const subLabelStyle = {
  display: "block",
  fontSize: "11px",
  fontWeight: 500,
  marginTop: "4px",
  opacity: 0.7,
} as const;

const footerNoteStyle = {
  fontSize: "12px",
  color: COLORS.onDarkMuted,
  lineHeight: 1.6,
  padding: "0 4px",
} as const;

const outOfScopeLinkStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  borderRadius: "14px",
  border: `1px solid ${COLORS.cardBorder}`,
  fontSize: "14px",
  fontWeight: 700,
  color: COLORS.ink,
  textDecoration: "none",
} as const;

// 이유 문구에 지역명 등 가변 정보가 섞여 있어서, 접두어로 같은 종류의 사유를 하나로 묶는다.
function reasonGroupLabel(reason: string | undefined): string {
  if (!reason) return "기타 사유";
  if (reason.startsWith("거주 지역과 달라요")) return "거주 지역이 달라요";
  if (reason.startsWith("보호종료 후 5년이 지났어요")) return "보호종료 후 5년이 지났어요";
  if (reason.includes("재학 중이어야")) return "재학 중이어야 신청 가능해요";
  if (reason.includes("무주택 조건이 있어요")) return "무주택 조건이 있어요 (주택 소유 중)";
  return reason;
}

function groupIneligibleByReason(items: EvaluatedRealItem[]): { label: string; items: EvaluatedRealItem[] }[] {
  const groups = new Map<string, EvaluatedRealItem[]>();
  for (const item of items) {
    const label = reasonGroupLabel(item.reasons[0]);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return [...groups.entries()]
    .map(([label, groupItems]) => ({ label, items: groupItems }))
    .sort((a, b) => b.items.length - a.items.length);
}

type PersonalStatus = { title: string; dday: string; detail: string };

// 로그인 여부와 무관하게 온보딩 답변만 있으면 계산 가능 — 로그인하면 이 답변이 계정에
// 저장돼서 재방문 시에도 계속 같은 요약이 바로 뜨는 것뿐이다.
function buildPersonalStatus(profile: OnboardingProfile, todayIso: string): PersonalStatus | null {
  if (!profile.birthDate && !profile.protectionEndDate) return null;
  const ageInfo = buildAgeInfo(profile, todayIso);

  if (profile.protectionEndType === "CURRENTLY_PROTECTED") {
    if (!profile.protectionEndDate) return null;
    return {
      title: "보호종료 예정까지",
      dday: ddayLabel(profile.protectionEndDate, todayIso),
      detail: `보호종료(예정)일: ${profile.protectionEndDate}`,
    };
  }

  if (!ageInfo.anchorDate) return null;
  const fiveYearDate = addYears(ageInfo.anchorDate, 5) ?? undefined;
  const yearsPassed = ageInfo.yearsSinceAnchor;
  return {
    title: "자립준비청년 지원 자격 기준(5년)까지",
    dday: ddayLabel(fiveYearDate, todayIso),
    detail:
      yearsPassed !== null
        ? `보호종료(또는 만 18세) 후 약 ${yearsPassed.toFixed(1)}년 경과`
        : "",
  };
}

function PersonalStatusCard({ profile, todayIso }: { profile: OnboardingProfile; todayIso: string }) {
  const status = buildPersonalStatus(profile, todayIso);
  if (!status) return null;
  return (
    <section style={CARD_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: "12px", color: COLORS.inkMuted, fontWeight: 700 }}>{status.title}</p>
        <span style={pillBadge("violet")}>D-DAY</span>
      </div>
      <p style={{ fontSize: "36px", fontWeight: 800, color: COLORS.accentViolet, marginTop: "10px" }}>
        {status.dday}
      </p>
      {status.detail && (
        <p
          style={{
            fontSize: "12px",
            color: COLORS.inkMuted,
            marginTop: "12px",
            paddingTop: "12px",
            borderTop: `1px solid ${COLORS.divider}`,
          }}
        >
          {status.detail}
        </p>
      )}
    </section>
  );
}

function PersonalProfileCard({
  nickname,
  profile,
  onEditProfile,
}: {
  nickname: string;
  profile: OnboardingProfile;
  onEditProfile: () => void;
}) {
  const rows: { icon: string; label: string; value: string }[] = [];
  if (profile.region) rows.push({ icon: "📍", label: "지역", value: profile.region });
  if (profile.enrollmentStatus) {
    rows.push({ icon: "🎓", label: "재학 여부", value: ENROLLMENT_STATUS_LABEL[profile.enrollmentStatus] });
  }
  if (profile.employmentStatus) {
    rows.push({ icon: "💼", label: "취업 상태", value: EMPLOYMENT_STATUS_LABEL[profile.employmentStatus] });
  }
  if (profile.interestCategories.length > 0) {
    rows.push({
      icon: "❤️",
      label: "관심분야",
      value: profile.interestCategories.map((c) => INTEREST_CATEGORY_LABEL[c]).join(", "),
    });
  }
  const receivedBenefits = profile.currentBenefits
    .filter((id) => id !== "NONE" && id !== "UNKNOWN")
    .map((id) => PROGRAMS.find((p) => p.id === id)?.name)
    .filter((name): name is string => !!name);
  if (receivedBenefits.length > 0) {
    rows.push({ icon: "🎁", label: "받는 지원", value: receivedBenefits.join(", ") });
  }

  return (
    <section style={CARD_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: "16px", fontWeight: 800, color: COLORS.ink }}>{nickname}님의 자립 현황</p>
        <button
          onClick={onEditProfile}
          style={{ ...pillBadge("neutral"), border: "none", cursor: "pointer" }}
        >
          정보 수정
        </button>
      </div>
      {rows.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          {rows.map((row, i) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "12px 0",
                borderTop: i === 0 ? "none" : `1px solid ${COLORS.divider}`,
              }}
            >
              <span style={{ fontSize: "16px" }}>{row.icon}</span>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: COLORS.inkMuted,
                  width: "64px",
                  flexShrink: 0,
                }}
              >
                {row.label}
              </span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: COLORS.ink }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function tabButtonStyle(active: boolean) {
  return {
    padding: "10px 16px",
    borderRadius: "999px",
    border: `1.5px solid ${active ? COLORS.ink : COLORS.cardBorder}`,
    background: active ? COLORS.ink : "#ffffff",
    color: active ? "#ffffff" : COLORS.inkMuted,
    fontSize: "13px",
    fontWeight: 700,
  } as const;
}

// 메인 탭(매칭 결과/전체 공고 보기/지역별 보기 ...) 안에서 다시 고르는 서브 필터(지역명/상태/관심분야
// 하나) 버튼. tabButtonStyle과 똑같이 생기면 "탭 안에 탭이 또 있다"는 게 눈에 안 들어와서, 더 작고
// 옅은 톤(보라색 계열)으로 한 단계 낮춰서 메인 탭과 위계가 구분되게 한다.
function subTabButtonStyle(active: boolean) {
  return {
    padding: "7px 12px",
    borderRadius: "999px",
    border: `1px solid ${active ? COLORS.accentViolet : COLORS.cardBorder}`,
    background: active ? COLORS.accentVioletBg : "#ffffff",
    color: active ? COLORS.accentViolet : COLORS.inkMuted,
    fontSize: "12px",
    fontWeight: 700,
  } as const;
}

// 공고 설명 원문이 법조문투 긴 문단이라 한눈에 읽기 어려워서, classify.ts가 미리 찾아둔
// 핵심 키워드를 #태그로 붙여 빠르게 훑어볼 수 있게 한다 (원문 문단은 그대로 두고 보조용으로만).
function DescriptionTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            fontSize: "11px",
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: "999px",
            background: COLORS.neutralBg,
            color: COLORS.neutral,
          }}
        >
          #{tag}
        </span>
      ))}
    </div>
  );
}

// "매칭 결과"(자격 판정) 말고, DB에 동기화된 공고를 조건 판정 없이 훑어보는 탭들이 공통으로 쓰는
// 카드 목록. 지역/현재상태/관심분야는 명시적 필터라서 자격 판정(realMatch.ts)과 달리
// "안 맞으면 숨김"이지 "그래서 못 받는다"는 판정이 아니다 — 그냥 찾아보기 편하라고 거르는 것뿐.
function AnnouncementListView({
  items,
  bookmarkedKeys,
  onToggleBookmark,
}: {
  items: AnnouncementRecord[];
  bookmarkedKeys?: Set<string>;
  onToggleBookmark?: (source: string, sourceId: string) => void;
}) {
  const isBookmarked = (source: string, sourceId: string) => bookmarkedKeys?.has(`${source}:${sourceId}`) ?? false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <p style={{ fontSize: "12px", color: COLORS.inkMuted }}>{items.length}건</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {items.length === 0 && (
          <p style={{ fontSize: "13px", color: COLORS.onDarkMuted }}>조건에 맞는 공고가 없어요.</p>
        )}
        {items.map((item, i) => (
          <section key={`${item.source}-${item.servId}-${i}`} style={{ ...CARD_STYLE, padding: "22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <span style={pillBadge("violet")}>{SOURCE_LABEL[item.source]}</span>
                <span style={pillBadge(isAlwaysOpenAnnouncement(item.deadline) ? "lime" : "neutral")}>
                  {isAlwaysOpenAnnouncement(item.deadline) ? "상시" : "기간"}
                </span>
              </div>
              {onToggleBookmark && (
                <button
                  onClick={() => onToggleBookmark(item.source, item.servId)}
                  aria-label="관심공고 등록"
                  style={{ background: "none", border: "none", fontSize: "20px", lineHeight: 1, color: COLORS.ink, padding: 0 }}
                >
                  {isBookmarked(item.source, item.servId) ? "⭐" : "☆"}
                </button>
              )}
            </div>
            <div style={{ marginTop: "10px" }}>
              <p style={{ fontSize: "16px", fontWeight: 800, color: COLORS.ink }}>{item.servNm}</p>
              <p style={{ fontSize: "12px", color: COLORS.inkMuted, marginTop: "2px" }}>
                {item.org}
                {item.region && ` · ${item.region}`}
              </p>
            </div>
            <DescriptionTags tags={item.descriptionTags} />
            {item.deadline && <p style={{ fontSize: "12px", color: COLORS.inkMuted, marginTop: "8px" }}>⏰ {item.deadline}</p>}
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              onClick={() => logAnnouncementClick(item.source, item.servId)}
              style={{ display: "inline-block", marginTop: "12px", fontSize: "13px", fontWeight: 700, color: COLORS.accentViolet, textDecoration: "none" }}
            >
              공식 안내 페이지 바로가기 →
            </a>
          </section>
        ))}
      </div>
    </div>
  );
}

type BrowseMode = "all" | "region" | "status" | "interest" | "period";

function AnnouncementBrowser({
  mode,
  items,
  profile,
  bookmarkedKeys,
  onToggleBookmark,
}: {
  mode: BrowseMode;
  items: AnnouncementRecord[];
  profile: OnboardingProfile;
  bookmarkedKeys?: Set<string>;
  onToggleBookmark?: (source: string, sourceId: string) => void;
}) {
  const [region, setRegion] = useState<string>(profile.region || REGIONS[0]);
  const [status, setStatus] = useState<EnrollmentStatus>(profile.enrollmentStatus ?? "UNIV");
  const [interestFilter, setInterestFilter] = useState<Set<InterestCategory>>(
    () => new Set(profile.interestCategories)
  );
  const [periodFilter, setPeriodFilter] = useState<"always" | "fixed">("always");

  const toggleInterest = (category: InterestCategory) => {
    setInterestFilter((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const filtered = items.filter((item) => {
    if (mode === "region" && item.regionScope && item.regionScope !== region) return false;
    if (mode === "status") {
      const needsEnrolled = status === "UNIV" || status === "GRAD";
      if (item.requiresEnrolled !== needsEnrolled) return false;
    }
    if (mode === "interest" && interestFilter.size > 0) {
      if (!item.interestCategories.some((c) => interestFilter.has(c as InterestCategory))) return false;
    }
    if (mode === "period") {
      const alwaysOpen = isAlwaysOpenAnnouncement(item.deadline);
      if (periodFilter === "always" && !alwaysOpen) return false;
      if (periodFilter === "fixed" && alwaysOpen) return false;
    }
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {mode === "region" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {REGIONS.map((r) => (
            <button key={r} onClick={() => setRegion(r)} style={subTabButtonStyle(region === r)}>
              {r}
            </button>
          ))}
        </div>
      )}

      {mode === "status" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(Object.keys(ENROLLMENT_STATUS_LABEL) as EnrollmentStatus[]).map((s) => (
              <button key={s} onClick={() => setStatus(s)} style={subTabButtonStyle(status === s)}>
                {ENROLLMENT_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <p style={{ fontSize: "11px", color: COLORS.inkMuted }}>
            ⚠️ 공고 원문에 "재학·등록금·학자금" 언급이 있는지만 구분할 수 있어서, 재학 요건이 없는
            공고를 찾을 때보다는 재학 관련 공고를 찾을 때 특히 유용해요.
          </p>
        </>
      )}

      {mode === "interest" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {(Object.keys(INTEREST_CATEGORY_LABEL) as InterestCategory[]).map((category) => (
            <button
              key={category}
              onClick={() => toggleInterest(category)}
              style={subTabButtonStyle(interestFilter.has(category))}
            >
              {INTEREST_CATEGORY_LABEL[category]}
            </button>
          ))}
        </div>
      )}

      {mode === "period" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            <button onClick={() => setPeriodFilter("always")} style={subTabButtonStyle(periodFilter === "always")}>
              상시 공고
            </button>
            <button onClick={() => setPeriodFilter("fixed")} style={subTabButtonStyle(periodFilter === "fixed")}>
              기간 공고
            </button>
          </div>
          <p style={{ fontSize: "11px", color: COLORS.inkMuted }}>
            {periodFilter === "always"
              ? "정해진 접수기간 없이 언제든 신청할 수 있는 공고예요."
              : "접수기간·마감일이 정해져 있는 공고예요. 마감일을 놓치지 않게 확인해주세요."}
          </p>
        </>
      )}

      <AnnouncementListView items={filtered} bookmarkedKeys={bookmarkedKeys} onToggleBookmark={onToggleBookmark} />
    </div>
  );
}

export function EligibilityResultScreen({
  profile,
  todayIso,
  items,
  loading,
  error,
  nickname,
  onEditProfile,
  onBack,
  hideFooterActions,
  bookmarkedKeys,
  onToggleBookmark,
}: {
  profile: OnboardingProfile;
  todayIso: string;
  items: AnnouncementRecord[] | null;
  loading: boolean;
  error: string | null;
  nickname?: string | null;
  onEditProfile: () => void;
  onBack: () => void;
  hideFooterActions?: boolean;
  bookmarkedKeys?: Set<string>;
  onToggleBookmark?: (source: string, sourceId: string) => void;
}) {
  const summary = useMemo(
    () => (items ? matchRealItems(items, profile, todayIso) : null),
    [items, profile, todayIso]
  );
  const [viewTab, setViewTab] = useState<"matched" | "bookmarked" | BrowseMode>("matched");
  const isBookmarked = (source: string, sourceId: string) => bookmarkedKeys?.has(`${source}:${sourceId}`) ?? false;
  const bookmarkedItems = useMemo(
    () => (items ?? []).filter((item) => isBookmarked(item.source, item.servId)),
    [items, bookmarkedKeys]
  );

  if (loading || !summary) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "20px", animation: "fadeIn 0.3s" }}>
        <section style={CARD_STYLE}>
          <p style={{ fontSize: "14px", color: COLORS.inkMuted }}>
            {error ? `불러오는 데 실패했어요. (${error})` : "공공데이터에서 매칭 중이에요..."}
          </p>
        </section>
        <button onClick={onBack} style={GHOST_BUTTON_ON_DARK}>
          ← 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px", animation: "fadeIn 0.3s" }}>
      {nickname ? (
        <>
          <PersonalProfileCard nickname={nickname} profile={profile} onEditProfile={onEditProfile} />
          <PersonalStatusCard profile={profile} todayIso={todayIso} />
        </>
      ) : (
        <p style={{ fontSize: "12px", color: COLORS.inkMuted, textAlign: "center" }}>
          💡 로그인하면 이 진단 결과가 저장되고, 보호종료까지 남은 기간 같은 정보도 더 개인화해서 보여드려요.
        </p>
      )}

      <section style={CARD_STYLE}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: "13px", color: COLORS.inkMuted, fontWeight: 700 }}>
            자격 매칭 결과 (공공데이터 기준 · 주기적으로 갱신)
          </p>
          <span style={pillBadge("success")}>{summary.eligible.length}개</span>
        </div>
        <h2 style={{ fontSize: "26px", fontWeight: 800, color: COLORS.ink, marginTop: "10px" }}>
          가능성 높은 지원
        </h2>
        <p
          style={{
            fontSize: "12px",
            color: COLORS.inkMuted,
            marginTop: "12px",
            paddingTop: "12px",
            borderTop: `1px solid ${COLORS.divider}`,
          }}
        >
          공고 원문 텍스트에서 조건을 추정한 결과라 확정 판정이 아니에요. 최종 자격은 담당
          자립지원전담기관에서 꼭 다시 확인해주세요.
        </p>
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        <button onClick={() => setViewTab("matched")} style={tabButtonStyle(viewTab === "matched")}>
          매칭 결과
        </button>
        {onToggleBookmark && (
          <button onClick={() => setViewTab("bookmarked")} style={tabButtonStyle(viewTab === "bookmarked")}>
            ⭐ 관심공고
          </button>
        )}
        <button onClick={() => setViewTab("all")} style={tabButtonStyle(viewTab === "all")}>
          전체 공고 보기
        </button>
        <button onClick={() => setViewTab("region")} style={tabButtonStyle(viewTab === "region")}>
          지역별 보기
        </button>
        <button onClick={() => setViewTab("status")} style={tabButtonStyle(viewTab === "status")}>
          현재상태별 보기
        </button>
        <button onClick={() => setViewTab("interest")} style={tabButtonStyle(viewTab === "interest")}>
          관심분야로 보기
        </button>
        <button onClick={() => setViewTab("period")} style={tabButtonStyle(viewTab === "period")}>
          상시/기간별 보기
        </button>
      </div>

      {viewTab === "bookmarked" && (
        <AnnouncementListView items={bookmarkedItems} bookmarkedKeys={bookmarkedKeys} onToggleBookmark={onToggleBookmark} />
      )}

      {viewTab !== "matched" && viewTab !== "bookmarked" && (
        <AnnouncementBrowser
          mode={viewTab}
          items={items ?? []}
          profile={profile}
          bookmarkedKeys={bookmarkedKeys}
          onToggleBookmark={onToggleBookmark}
        />
      )}

      {viewTab === "matched" && (
        <>
      <section>
        <h3 style={{ fontSize: "14px", fontWeight: 800, color: COLORS.success, marginBottom: "12px" }}>
          가능성 높은 지원 ({summary.eligible.length})
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {summary.eligible.length === 0 && (
            <p style={{ fontSize: "13px", color: COLORS.onDarkMuted }}>조건에 맞는 지원을 찾지 못했어요.</p>
          )}
          {summary.eligible
            .map((item, i) => (
              <RealItemCard
                key={`${item.source}-${item.servId}-${i}`}
                item={item}
                tone="eligible"
                bookmarked={onToggleBookmark ? isBookmarked(item.source, item.servId) : undefined}
                onToggleBookmark={onToggleBookmark ? () => onToggleBookmark(item.source, item.servId) : undefined}
              />
            ))}
        </div>
      </section>

      {summary.uncertain.length > 0 && (
        <section>
          <h3 style={{ fontSize: "14px", fontWeight: 800, color: COLORS.warning, marginBottom: "12px" }}>
            확인이 필요한 지원 ({summary.uncertain.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {summary.uncertain
              .map((item, i) => (
                <RealItemCard
                  key={`${item.source}-${item.servId}-${i}`}
                  item={item}
                  tone="uncertain"
                  bookmarked={onToggleBookmark ? isBookmarked(item.source, item.servId) : undefined}
                  onToggleBookmark={onToggleBookmark ? () => onToggleBookmark(item.source, item.servId) : undefined}
                />
              ))}
          </div>
        </section>
      )}

      {summary.ineligible.length > 0 && (
        <section>
          <h3 style={{ fontSize: "14px", fontWeight: 800, color: COLORS.danger, marginBottom: "12px" }}>
            지금은 해당하지 않아 보이는 지원 ({summary.ineligible.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {groupIneligibleByReason(summary.ineligible).map((group) => (
              <details key={group.label} style={{ ...CARD_STYLE, padding: "16px" }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: COLORS.ink,
                    listStyle: "none",
                  }}
                >
                  {group.label}{" "}
                  <span style={{ ...pillBadge("danger"), marginLeft: "6px" }}>{group.items.length}건</span>
                </summary>
                <div style={{ display: "flex", flexDirection: "column", marginTop: "10px" }}>
                  {group.items.map((item, i) => (
                    <IneligibleItemRow key={`${item.source}-${item.servId}-${i}`} item={item} />
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
        </>
      )}

      {!hideFooterActions && (
        <>
          <button onClick={onEditProfile} style={GHOST_BUTTON_ON_DARK}>
            조건 다시 입력하기
          </button>
          <button onClick={onBack} style={{ ...GHOST_BUTTON_ON_DARK, border: "none" }}>
            처음으로
          </button>
        </>
      )}
    </div>
  );
}

function IneligibleItemRow({ item }: { item: EvaluatedRealItem }) {
  return (
    <div style={{ padding: "10px 0", borderTop: `1px solid ${COLORS.cardBorder}` }}>
      <p style={{ fontSize: "14px", fontWeight: 700, color: COLORS.ink }}>{item.servNm}</p>
      <p style={{ fontSize: "12px", color: COLORS.inkMuted, marginTop: "2px" }}>
        {item.org}
        {item.region && ` · ${item.region}`}
      </p>
      {item.reasons.map((reason, i) => (
        <p key={i} style={{ ...pillBadge("danger"), marginTop: "6px", display: "block", width: "fit-content" }}>
          {reason}
        </p>
      ))}
    </div>
  );
}

function RealItemCard({
  item,
  tone,
  bookmarked,
  onToggleBookmark,
}: {
  item: EvaluatedRealItem<AnnouncementRecord>;
  tone: "eligible" | "uncertain";
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
}) {
  const toneStyle = {
    eligible: { border: "#bbf7d0", badge: pillBadge("success" as const) },
    uncertain: { border: "#fde68a", badge: pillBadge("warning" as const) },
  }[tone];

  return (
    <section style={{ ...CARD_STYLE, padding: "22px", border: `1px solid ${toneStyle.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={pillBadge("violet")}>{SOURCE_LABEL[item.source]}</span>
        {onToggleBookmark && (
          <button
            onClick={onToggleBookmark}
            aria-label="관심공고 등록"
            style={{ background: "none", border: "none", fontSize: "20px", lineHeight: 1, color: COLORS.ink, padding: 0 }}
          >
            {bookmarked ? "⭐" : "☆"}
          </button>
        )}
      </div>

      <div style={{ marginTop: "10px" }}>
        <p style={{ fontSize: "16px", fontWeight: 800, color: COLORS.ink }}>{item.servNm}</p>
        <p style={{ fontSize: "12px", color: COLORS.inkMuted, marginTop: "2px" }}>
          {item.org}
          {item.region && ` · ${item.region}`}
        </p>
      </div>

      <DescriptionTags tags={item.descriptionTags} />

      {item.deadline && <p style={{ fontSize: "12px", color: COLORS.inkMuted, marginTop: "8px" }}>⏰ {item.deadline}</p>}

      {item.reasons.map((reason, i) => (
        <p
          key={i}
          style={{
            marginTop: "8px",
            ...toneStyle.badge,
            fontSize: "13px",
            display: "block",
            borderRadius: "10px",
            padding: "8px 12px",
          }}
        >
          {tone === "uncertain" ? "❓" : "→"} {reason}
        </p>
      ))}

      <a
        href={item.link}
        target="_blank"
        rel="noreferrer"
        onClick={() => logAnnouncementClick(item.source, item.servId)}
        style={{
          display: "inline-block",
          marginTop: "12px",
          fontSize: "13px",
          fontWeight: 700,
          color: COLORS.accentViolet,
          textDecoration: "none",
        }}
      >
        공식 안내 페이지 바로가기 →
      </a>
    </section>
  );
}
