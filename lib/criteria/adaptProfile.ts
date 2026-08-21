// ---------------------------------------------------------------------------
// 팀원분 온보딩 프로필(OnboardingProfile) → 판정엔진 입력(RawProfileInput) 어댑터
//
// lib/engine/types.ts의 RawProfileInput은 고치지 않는다. OnboardingProfile
// (app/data/eligibility.ts)이 이미 EligibilityFlow.tsx(1032줄)와 맞물려 있어서
// 필드 이름을 우리가 새로 정할 수 없기 때문에, 여기서 모양만 맞춰준다.
//
// 원칙: 확답 없는 답변("모름"/미응답)은 판정에서 탈락시키는 방향(true)으로 보내지 않는다.
// 놓치는 오류(false negative)가 헛걸음 오류보다 훨씬 나쁘다 — 대신 lossyFields에 남겨서
// 호출부가 '확인 필요' 배지(엔진의 riskyField/uncertaintyFlags 경로)로 이어붙이게 한다.
// ---------------------------------------------------------------------------

import type { OnboardingProfile } from '../../app/data/eligibility';
import type { RawProfileInput } from '../engine/types';

export type LossyField = {
  /** RawProfileInput의 필드명 (엔진 조건이 참조하는 이름). */
  field: string;
  /** 왜 확정할 수 없었는지 — 검수자/개발자가 읽는 설명. */
  reason: string;
};

export type AdaptResult = {
  profile: RawProfileInput;
  /** 온보딩 문항 구조 때문에 확정할 수 없었던 필드들. 결과 카드의 '확인 필요' 배지와
   *  연결된다(이 단계에서는 값만 만들고, 실제 결과 카드 연결은 다음 단계에서 한다). */
  lossyFields: LossyField[];
};

/** 커뮤니티/기타 코드에서 currentBenefits에 넣는, "받는 지원 없음/모름"을 뜻하는 토큰. */
const NON_BENEFIT_TOKENS = new Set(['NONE', 'UNKNOWN']);

export function toEngineProfile(p: OnboardingProfile): AdaptResult {
  const lossyFields: LossyField[] = [];
  const profile: RawProfileInput = {};

  // hasInstitutionalExperience → hasInstitutionalCare
  // null(미응답)을 false("아니오")로 뭉개지 않는다 — 게이트 미응답과 "아니오"는 다르다.
  if (p.hasInstitutionalExperience !== null) {
    profile.hasInstitutionalCare = p.hasInstitutionalExperience;
  }

  profile.birthDate = p.birthDate || null;
  profile.region = p.region;

  if (p.ownsHome !== null) profile.ownsHouse = p.ownsHome;
  if (p.maritalStatus !== null) profile.isMarried = p.maritalStatus;

  profile.currentSupports = p.currentBenefits.filter((b) => !NON_BENEFIT_TOKENS.has(b));

  // ── protectionEndType 분해 ────────────────────────────────────────────
  // 5종 단일 enum → exitType(3종) + isCurrentlyProtected + isCurrentlyReprotected.
  // 팀원분 쪽 enum이 우리 엔진의 원래 boolean 조합보다 우수하다 — REPROTECTED_END와
  // CURRENTLY_PROTECTED가 별도 값이라 "exitType==='재보호'가 절대 참이 될 수 없는" 문제
  // (01_통합_프롬프트.md [4단계] 이슈 ①)와 "현재 보호중 경로가 없는" 문제(이슈 ④)가
  // 구조적으로 생기지 않는다.
  profile.protectionEndDate = p.protectionEndDate || null;
  switch (p.protectionEndType) {
    case 'AGE18_END':
      profile.exitType = '만기';
      profile.isCurrentlyProtected = false;
      profile.isCurrentlyReprotected = false;
      break;
    case 'EXTENDED_END':
      profile.exitType = '연장';
      profile.isCurrentlyProtected = false;
      profile.isCurrentlyReprotected = false;
      break;
    case 'EARLY_END':
      profile.exitType = '조기';
      profile.isCurrentlyProtected = false;
      profile.isCurrentlyReprotected = false;
      break;
    case 'REPROTECTED_END':
      profile.exitType = '만기';
      profile.isCurrentlyProtected = false;
      profile.isCurrentlyReprotected = true;
      break;
    case 'CURRENTLY_PROTECTED':
      profile.isCurrentlyProtected = true;
      profile.isCurrentlyReprotected = false;
      // protectionEndDate는 "예정일"이라 5년 기산에 쓰면 안 된다 — null로 넘겨서
      // daysUntilFiveYearDeadline이 null이 되게 한다. classify()가 이걸 '이미놓침'이
      // 아니라 '예정'으로 분류하는 건 01_통합_프롬프트.md [4단계]에서 아직 안 끝난
      // 작업이다(이 저장소의 lib/engine/types.ts ClassificationStatus는 현재 3분류만
      // 지원 — 아래 docs/qa/adapt-profile.test.ts 참고).
      profile.protectionEndDate = null;
      break;
    case null:
      lossyFields.push({
        field: 'exitType',
        reason: '보호종료 시기를 아직 답하지 않아서 기간과 관련된 조건을 판정할 수 없어요.',
      });
      break;
  }

  // ── currentStatus 분해 (⚠️ 정보 손실 있음) ───────────────────────────
  // 단일선택이라 "재학이면서 미취업" 같은 실제로 흔한 조합을 표현할 수 없다. 고른 값과
  // 일치하는 축은 확정(confirmed)이고, 나머지 축은 추정값(false)이라 lossyFields에
  // 남긴다 — 문항 분리는 이번 단계에서 하지 않는다(EligibilityFlow.tsx는 안 건드림).
  switch (p.currentStatus) {
    case 'UNIV':
    case 'GRAD':
      profile.isEnrolled = true;
      profile.isEmployed = false;
      lossyFields.push({
        field: 'isEmployed',
        reason: '재학 여부만 물어서 취업 여부는 추정값(미취업)이에요. 재학 중에도 일하는 경우가 있어요.',
      });
      break;
    case 'EMPLOYED':
      profile.isEnrolled = false;
      profile.isEmployed = true;
      lossyFields.push({
        field: 'isEnrolled',
        reason: '취업 여부만 물어서 재학 여부는 추정값(미재학)이에요. 재학 중에도 취업하는 경우가 있어요.',
      });
      break;
    case 'UNEMPLOYED':
      profile.isEnrolled = false;
      profile.isEmployed = false;
      lossyFields.push({
        field: 'isEnrolled',
        reason: '미취업이라고만 답해서 재학 여부는 추정값(미재학)이에요.',
      });
      break;
    case 'OTHER':
      profile.isEnrolled = false;
      profile.isEmployed = false;
      lossyFields.push({
        field: 'isEnrolled',
        reason: '"기타"로 답해서 재학·취업 여부를 모두 추정값(미재학·미취업)으로 처리했어요.',
      });
      lossyFields.push({
        field: 'isEmployed',
        reason: '"기타"로 답해서 재학·취업 여부를 모두 추정값(미재학·미취업)으로 처리했어요.',
      });
      break;
    case null:
      lossyFields.push({ field: 'isEnrolled', reason: '재학·취업 상태를 아직 답하지 않았어요.' });
      lossyFields.push({ field: 'isEmployed', reason: '재학·취업 상태를 아직 답하지 않았어요.' });
      break;
  }

  // ── Y/N/UNKNOWN → boolean ─────────────────────────────────────────────
  // UNKNOWN을 true로 보내면 안 된다 — near_poor_excluded는 direction:'exclude'라
  // true면 탈락하고, 모르는 사람이 받을 수 있는 지원을 놓친다. false + lossyFields가 맞다.
  profile.isBasicLivelihoodRecipient = p.basicLivelihoodRecipient === 'Y';
  if (p.basicLivelihoodRecipient === 'UNKNOWN') {
    lossyFields.push({
      field: 'isBasicLivelihoodRecipient',
      reason: '기초생활수급자 여부를 "모름"으로 답해서 확인이 필요해요.',
    });
  }

  profile.isNearPoorMedicalDiscount = p.nearPoorMedicalReduction === 'Y';
  if (p.nearPoorMedicalReduction === 'UNKNOWN') {
    lossyFields.push({
      field: 'isNearPoorMedicalDiscount',
      reason: '차상위 본인부담경감 대상 여부를 "모름"으로 답해서 확인이 필요해요.',
    });
  }

  // ── incomeBracket — 온보딩에 소득 문항이 아예 없다 ───────────────────
  // 채울 수 없으니 undefined로 두고(= profile에 안 넣음) 항상 lossyFields에 남긴다.
  // income_at_most 기준이 붙은 제도는 전부 '확인 필요'로 나가야 한다.
  lossyFields.push({
    field: 'incomeBracket',
    reason: '온보딩에 소득 문항이 없어서 소득 기준이 있는 제도는 확인이 필요해요.',
  });

  return { profile, lossyFields };
}
