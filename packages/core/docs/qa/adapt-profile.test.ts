/* ===========================================================================
 * 어댑터 테스트 — lib/criteria/adaptProfile.ts
 *
 * OnboardingProfile → RawProfileInput 변환이 03_next-step-catalog-adapter.md의
 * 변환 규칙대로 되는지 확인한다. 실행: npm run qa:adapter
 * =========================================================================== */

import {
  EMPTY_PROFILE,
  type CurrentStatus,
  type OnboardingProfile,
  type ProtectionEndType,
} from '../../src/types/onboarding';
import { toEngineProfile } from '../../src/criteria/adaptProfile';
import { computeProfile } from '../../src/engine/profile';
import { evaluateAll } from '../../src/engine/evaluate';
import policiesFile from '../../src/data/seed/policies.json';

let fail = 0;
let checks = 0;

function check(label: string, condition: boolean, detail?: string): void {
  checks++;
  if (condition) return;
  fail++;
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
}

function base(overrides: Partial<OnboardingProfile>): OnboardingProfile {
  return {
    ...EMPTY_PROFILE,
    hasInstitutionalExperience: true,
    birthDate: '2003-01-01',
    protectionEndDate: '2022-01-01',
    region: '강원도',
    ownsHome: false,
    maritalStatus: false,
    ...overrides,
  };
}

const PROTECTION_END_TYPES: ProtectionEndType[] = [
  'AGE18_END', 'EXTENDED_END', 'EARLY_END', 'REPROTECTED_END', 'CURRENTLY_PROTECTED',
];
const CURRENT_STATUSES: CurrentStatus[] = ['UNIV', 'GRAD', 'EMPLOYED', 'UNEMPLOYED', 'OTHER'];

console.log('\n══ 1) protectionEndType(5종) × currentStatus(5종) = 25조합 ══');

for (const pet of PROTECTION_END_TYPES) {
  for (const cs of CURRENT_STATUSES) {
    const { profile, lossyFields } = toEngineProfile(base({ protectionEndType: pet, currentStatus: cs }));
    const label = `${pet}/${cs}`;

    // protectionEndType 분해
    switch (pet) {
      case 'AGE18_END':
        check(`${label} exitType`, profile.exitType === '만기');
        check(`${label} isCurrentlyProtected`, profile.isCurrentlyProtected === false);
        check(`${label} isCurrentlyReprotected`, profile.isCurrentlyReprotected === false);
        break;
      case 'EXTENDED_END':
        check(`${label} exitType`, profile.exitType === '연장');
        check(`${label} isCurrentlyProtected`, profile.isCurrentlyProtected === false);
        check(`${label} isCurrentlyReprotected`, profile.isCurrentlyReprotected === false);
        break;
      case 'EARLY_END':
        check(`${label} exitType`, profile.exitType === '조기');
        check(`${label} isCurrentlyProtected`, profile.isCurrentlyProtected === false);
        check(`${label} isCurrentlyReprotected`, profile.isCurrentlyReprotected === false);
        break;
      case 'REPROTECTED_END':
        check(`${label} exitType`, profile.exitType === '만기');
        check(`${label} isCurrentlyProtected`, profile.isCurrentlyProtected === false);
        check(`${label} isCurrentlyReprotected === true`, profile.isCurrentlyReprotected === true);
        break;
      case 'CURRENTLY_PROTECTED':
        check(`${label} isCurrentlyProtected === true`, profile.isCurrentlyProtected === true);
        check(`${label} isCurrentlyReprotected`, profile.isCurrentlyReprotected === false);
        check(`${label} protectionEndDate === null (예정일은 5년 기산에 안 씀)`, profile.protectionEndDate === null);
        break;
    }

    // currentStatus 분해
    switch (cs) {
      case 'UNIV':
      case 'GRAD':
        check(`${label} isEnrolled === true`, profile.isEnrolled === true);
        check(`${label} isEmployed === false(추정)`, profile.isEmployed === false);
        check(`${label} isEmployed가 lossyFields에 있음`, lossyFields.some((f) => f.field === 'isEmployed'));
        break;
      case 'EMPLOYED':
        check(`${label} isEmployed === true`, profile.isEmployed === true);
        check(`${label} isEnrolled === false(추정)`, profile.isEnrolled === false);
        check(`${label} isEnrolled가 lossyFields에 있음`, lossyFields.some((f) => f.field === 'isEnrolled'));
        break;
      case 'UNEMPLOYED':
        check(`${label} isEmployed === false`, profile.isEmployed === false);
        check(`${label} isEnrolled === false(추정)`, profile.isEnrolled === false);
        check(`${label} isEnrolled가 lossyFields에 있음`, lossyFields.some((f) => f.field === 'isEnrolled'));
        break;
      case 'OTHER':
        check(`${label} isEnrolled === false(추정)`, profile.isEnrolled === false);
        check(`${label} isEmployed === false(추정)`, profile.isEmployed === false);
        check(`${label} isEnrolled·isEmployed 둘 다 lossyFields에 있음`,
          lossyFields.some((f) => f.field === 'isEnrolled') && lossyFields.some((f) => f.field === 'isEmployed'));
        break;
    }

    // incomeBracket은 온보딩에 문항이 없어 항상 lossy
    check(`${label} incomeBracket이 lossyFields에 있음`, lossyFields.some((f) => f.field === 'incomeBracket'));
  }
}

console.log(`  ${fail === 0 ? '✅' : '❌'} ${checks}건 확인`);

console.log('\n══ 2) CURRENTLY_PROTECTED — daysUntilFiveYearDeadline null 확인 + \'예정\' 분류 ══');
{
  const before = checks;
  const { profile } = toEngineProfile(base({ protectionEndType: 'CURRENTLY_PROTECTED', currentStatus: 'UNIV' }));
  const computed = computeProfile(profile, new Date('2026-08-21'));
  check('daysUntilFiveYearDeadline === null', computed.daysUntilFiveYearDeadline === null);

  // [4단계]: 아직 보호가 끝나지 않은 사람에게 5년 이내 제도는 '이미놓침'(놓친 것)이 아니라
  // '예정'(아직 시작 전)이어야 한다. self-reliance-allowance(자립수당)는 daysUntilFiveYearDeadline
  // 조건 하나 때문에만 떨어지는 대표 사례라 여기서 회귀를 감시한다.
  const results = evaluateAll(computed, policiesFile as never, []);
  const allowance = results.find((r) => r.policyId === 'self-reliance-allowance');
  check('self-reliance-allowance가 결과에 존재함', allowance != null);
  check(`self-reliance-allowance status === '예정'`, allowance?.status === '예정', `실제: ${allowance?.status}`);
  check('self-reliance-allowance dDay === null', allowance?.dDay === null);

  console.log(`  ${checks - before}건 확인`);
}

console.log('\n══ 3) REPROTECTED_END → isCurrentlyReprotected ══');
{
  const { profile } = toEngineProfile(base({ protectionEndType: 'REPROTECTED_END', currentStatus: 'EMPLOYED' }));
  check('isCurrentlyReprotected === true', profile.isCurrentlyReprotected === true);
}

console.log('\n══ 4) Y/N/UNKNOWN → boolean, UNKNOWN은 절대 true가 되면 안 됨 ══');
for (const v of ['Y', 'N', 'UNKNOWN'] as const) {
  const { profile, lossyFields } = toEngineProfile(
    base({ protectionEndType: 'AGE18_END', currentStatus: 'EMPLOYED', basicLivelihoodRecipient: v, nearPoorMedicalReduction: v })
  );
  if (v === 'Y') {
    check(`basicLivelihoodRecipient=Y → true`, profile.isBasicLivelihoodRecipient === true);
    check(`nearPoorMedicalReduction=Y → true`, profile.isNearPoorMedicalDiscount === true);
  } else if (v === 'N') {
    check(`basicLivelihoodRecipient=N → false`, profile.isBasicLivelihoodRecipient === false);
    check(`nearPoorMedicalReduction=N → false`, profile.isNearPoorMedicalDiscount === false);
  } else {
    check(`basicLivelihoodRecipient=UNKNOWN → false(true면 실패)`, profile.isBasicLivelihoodRecipient === false);
    check(`nearPoorMedicalReduction=UNKNOWN → false(true면 실패)`, profile.isNearPoorMedicalDiscount === false);
    check(`UNKNOWN → isBasicLivelihoodRecipient가 lossyFields에 있음`,
      lossyFields.some((f) => f.field === 'isBasicLivelihoodRecipient'));
    check(`UNKNOWN → isNearPoorMedicalDiscount가 lossyFields에 있음`,
      lossyFields.some((f) => f.field === 'isNearPoorMedicalDiscount'));
  }
}

console.log('\n══ 5) hasInstitutionalExperience: null ≠ false(미응답과 "아니오"는 다르다) ══');
{
  const { profile } = toEngineProfile(base({ hasInstitutionalExperience: null, protectionEndType: 'AGE18_END', currentStatus: 'EMPLOYED' }));
  check('hasInstitutionalCare가 profile에 없음(undefined)', profile.hasInstitutionalCare === undefined);
}

console.log('\n══ 6) currentBenefits의 NONE/UNKNOWN 토큰 필터링 ══');
{
  const { profile } = toEngineProfile(
    base({ protectionEndType: 'AGE18_END', currentStatus: 'EMPLOYED', currentBenefits: ['jaripsudang', 'NONE', 'UNKNOWN'] })
  );
  check('currentSupports에 NONE/UNKNOWN 없이 jaripsudang만 남음', JSON.stringify(profile.currentSupports) === JSON.stringify(['jaripsudang']));
}

console.log('\n══ 7) protectionEndType이 null이면 exitType 관련 lossyFields ══');
{
  const { profile, lossyFields } = toEngineProfile(base({ protectionEndType: null, currentStatus: 'EMPLOYED' }));
  check('exitType === undefined', profile.exitType === undefined);
  check('exitType이 lossyFields에 있음', lossyFields.some((f) => f.field === 'exitType'));
}

console.log(`\n${fail === 0 ? '✅ 통과' : `❌ 실패 ${fail}건`}  (비교 ${checks}건)\n`);
process.exit(fail === 0 ? 0 : 1);
