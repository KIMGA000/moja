// ---------------------------------------------------------------------------
// 자연어 기준 카탈로그 — 이 시스템의 단일 진실 공급원(single source of truth)
//
// 검수자는 이 카탈로그에서 문장을 골라 빈칸(params)만 채운다. 문장 하나 = 기계 조건
// 하나로 1:1 대응된다. 카탈로그에 없는 조건이 필요하면 여기에 항목을 추가하는 게
// 원칙이다 — 검수 화면에서 임의 조건식을 손으로 짜 넣게 하면 비개발자가 검수를 못
// 하게 되고 원래 문제로 되돌아간다.
//
// onboardingField는 팀원분 OnboardingProfile(app/data/eligibility.ts)의 필드 이름을
// 쓴다 — 엔진 RawProfileInput 필드 이름과는 lib/criteria/adaptProfile.ts가 이어준다.
// toCondition()이 만드는 조건은 항상 엔진 필드 이름(hasInstitutionalCare 등)을 쓴다.
//
// 설계 원칙 (지키지 않으면 판정이 반대로 나오거나 검수자가 헷갈린다):
//
// 1) "~면 제외"류는 direction: 'exclude'다. 사람이 읽는 문장은 긍정형("~없어야 해요")
//    이어도 기계 조건은 exclude다. 각 항목에 그 사실을 주석으로 남겨뒀다.
//
// 2) protectionEndType·region처럼 온보딩 답변이 "단일 선택값"인 필드는 evalOp의
//    includesAnyOf를 쓸 수 없다. includesAnyOf는 프로필 필드 자체가 배열(예:
//    currentSupports)일 때만 성립한다(evalOp: `Array.isArray(actual) && ...`). 단일
//    값이 "여러 후보 중 하나"와 같은지 표현하려면
//    `{ anyOf: [{field,op:'==',value:a}, {field,op:'==',value:b}, ...] }`로 OR을
//    구성해야 한다. exit_type_in / region_in이 이 패턴을 쓴다.
//
// 3) manual_check_only / first_come_first_served / one_time_only는 toCondition이
//    null을 반환한다. 판정에서 절대 탈락시키지 않는다 — 놓치는 오류(false negative)가
//    헛걸음 오류(false positive)보다 훨씬 나쁘다는 이 프로젝트의 판단 기준을 따른다.
//
// 4) 온보딩 답변은 예/아니오 또는 명확한 선택지만 받는다. "모르겠어요" 선택지는
//    만들지 않는다. 사용자가 답을 확신하기 어려운 필드(예: 차상위 여부)는 조건에
//    riskyField: true를 붙여서, 판정 결과와 무관하게 결과 카드에 '확인 필요'가
//    뜨게 한다(evaluatePolicy가 riskyField를 uncertaintyFlags로 옮긴다).
//
// 5) blockedBy: 온보딩 문항 구조 때문에 지금은 이 기준을 자동으로 확정 판정할 수 없으면
//    표시한다. 'missing_question'은 온보딩에 관련 문항이 아예 없는 경우(incomeBracket),
//    'lossy_question'은 문항이 있지만 단일선택이라 정보가 손실되는 경우(currentStatus →
//    isEnrolled/isEmployed)다. 검수 화면은 이 기준을 붙일 때 "지금은 확인 필요로만
//    나갑니다"라고 안내해야 한다.
// ---------------------------------------------------------------------------

import type { PolicyCondition } from '../engine/types';

export type ParamType = 'number' | 'string' | 'enum' | 'string[]';

export type CriterionParam = {
  name: string;
  type: ParamType;
  enumValues?: string[];
  placeholder: string;
};

export type CriterionCategory =
  | '기본대상'
  | '기간'
  | '나이'
  | '학업·취업'
  | '주거'
  | '소득·수급'
  | '가구·혼인'
  | '지역'
  | '중복수급'
  | '기타';

/** 카탈로그 함수(sentence/rejectSentence/toCondition)에 넘기는 빈칸 값.
 *  검수 화면에서 채우는 값은 params 정의(CriterionParam[])에 따라 문자열·숫자·배열이
 *  섞여 들어오므로 여기서는 unknown보다 any가 실용적이다(각 항목에서 바로 캐스팅 없이
 *  씀) — 이 파일 안에서만 예외적으로 허용한다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CriterionParams = Record<string, any>;

export type CriterionSpec = {
  key: string;
  label: string;
  category: CriterionCategory;
  params: CriterionParam[];
  /** ① 사람이 읽는 문장 — 검수 화면과 사용자 결과 카드에 그대로 노출된다. */
  sentence: (p: CriterionParams) => string;
  /** ② 조건을 못 맞췄을 때 사용자에게 보여줄 문장. */
  rejectSentence: (p: CriterionParams) => string;
  /** ③ 판정엔진이 먹는 기계 조건. policies.json의 conditions 스펙과 100% 호환된다.
   *  null이면 판정에 쓰지 않는다(manual_check_only / first_come_first_served / one_time_only). */
  toCondition: (p: CriterionParams) => PolicyCondition | null;
  /** true면 검수 화면에서 '확인 필요' 라벨을 강제한다. */
  needsHumanCheck?: boolean;
  /** 어느 온보딩 답변(OnboardingProfile 필드명)과 연결되는지. null이면 온보딩만으로는
   *  판정 불가(공고 필터 등). */
  onboardingField: string | null;
  /** 온보딩 문항 구조 때문에 지금은 자동 판정이 막혀 있는 이유. 파일 상단 설계 원칙 5 참고. */
  blockedBy?: 'missing_question' | 'lossy_question';
  /** 검수자용 설명: 이 기준을 언제 붙이는지. */
  helpText: string;
};

/** criteria jsonb 배열의 원소 — 검수 화면·DB·엔진 변환기가 공통으로 쓰는 모양. */
export type CriterionEntry = {
  key: string;
  params: CriterionParams;
  source?: 'auto' | 'human';
  verified?: boolean;
};

const REGIONS_17 = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시',
  '울산광역시', '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
] as const;

const EXIT_TYPES = ['만기', '연장', '조기'] as const;
// '재보호'는 exitType 선택지에 없다. 팀원분 OnboardingProfile에서는 REPROTECTED_END로
// 별도 구분되고, adaptProfile.ts가 isCurrentlyReprotected=true로 옮긴다.

function formatKoreanDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

/** income_at_most(N)이 참조하는 구간별 상한. '150%초과'는 어떤 N에도 포함되지 않는다. */
const INCOME_BRACKET_UPPER_BOUND: Record<string, number> = {
  '50%이하': 50,
  '50~75%': 75,
  '75~100%': 100,
  '100~150%': 150,
  '150%초과': Infinity,
};

function incomeBracketsAtMost(percent: number): string[] {
  return Object.keys(INCOME_BRACKET_UPPER_BOUND).filter(
    (bracket) => INCOME_BRACKET_UPPER_BOUND[bracket] <= percent
  );
}

export const CATALOG: readonly CriterionSpec[] = [
  // ── 기본대상 ─────────────────────────────────────────────────────────
  {
    key: 'has_institutional_care',
    label: '시설·위탁가정 보호 경험',
    category: '기본대상',
    params: [],
    sentence: () => '시설·위탁가정에서 지낸 경험이 있어야 해요',
    rejectSentence: () => '시설·위탁가정에서 지낸 경험이 없어서 이 지원은 신청하기 어려워요',
    toCondition: () => ({
      field: 'hasInstitutionalCare', op: '==', value: true, direction: 'require',
    }),
    onboardingField: 'hasInstitutionalExperience',
    helpText: '자립준비청년 대상 제도 거의 전부에 공통으로 붙는 기본 조건이에요.',
  },
  {
    key: 'after_exit_only',
    label: '보호종료자만 (현재 보호중 제외)',
    category: '기본대상',
    params: [],
    sentence: () => '이미 보호가 끝난 분만 신청할 수 있어요',
    rejectSentence: () => '아직 보호가 끝나지 않아서 이 지원은 신청하기 어려워요',
    // 문장은 "끝난 분만"이라는 요건처럼 보이지만, 실제로는 "아직 보호중이면 제외"이므로
    // direction은 require가 아니라 exclude다.
    toCondition: () => ({
      field: 'isCurrentlyProtected', op: '==', value: true, direction: 'exclude',
    }),
    onboardingField: 'protectionEndType',
    helpText: '보호가 끝난 사람만 대상인 제도(자립수당 등)에 쓰세요.',
  },
  {
    key: 'currently_protected_only',
    label: '현재 보호중인 사람만',
    category: '기본대상',
    params: [],
    sentence: () => '아직 보호받고 있는 분만 신청할 수 있어요',
    rejectSentence: () => '이미 보호가 끝나서 이 지원은 신청하기 어려워요',
    toCondition: () => ({
      field: 'isCurrentlyProtected', op: '==', value: true, direction: 'require',
    }),
    onboardingField: 'protectionEndType',
    helpText: '보호연장 중(퇴소 전)인 사람만 대상인 제도에 쓰세요.',
  },
  {
    key: 'currently_reprotected',
    label: '재보호조치 대상자만',
    category: '기본대상',
    params: [],
    sentence: () => '재보호조치를 받고 있는 분이 대상이에요',
    rejectSentence: () => '재보호조치를 받고 있지 않아서 이 지원은 신청하기 어려워요',
    toCondition: () => ({
      field: 'isCurrentlyReprotected', op: '==', value: true, direction: 'require',
    }),
    onboardingField: 'protectionEndType',
    helpText: '팀원분 온보딩의 REPROTECTED_END 선택지와 연결되는 기준이에요.',
  },

  // ── 기간 ─────────────────────────────────────────────────────────────
  {
    key: 'within_years_after_exit',
    label: '보호종료 후 N년 이내',
    category: '기간',
    params: [{ name: 'years', type: 'number', placeholder: '5' }],
    sentence: (p) => `보호가 끝난 뒤 **${p.years}년** 안에 신청해야 해요`,
    rejectSentence: (p) => `보호가 끝난 뒤 **${p.years}년**이 지나서 이 지원은 신청하기 어려워요`,
    toCondition: (p) => {
      const years = Number(p.years);
      // computeProfile은 daysUntilFiveYearDeadline 하나만 계산한다(5년 고정). years가 5가
      // 아니면 문장에 적힌 숫자와 실제 판정 기준(5년)이 어긋난다. 다른 연수가 필요해지면
      // profile.ts에 파생 필드를 추가해야 한다 — 지금은 엔진 로직을 바꾸지 않는다.
      if (years !== 5) {
        console.warn(
          `[criteria] within_years_after_exit(${years}) — 엔진은 5년 기산만 계산해요. ` +
            '문장과 실제 판정이 어긋날 수 있어요.'
        );
      }
      return { field: 'daysUntilFiveYearDeadline', op: '>=', value: 0, direction: 'require' };
    },
    onboardingField: 'protectionEndDate',
    helpText: '자립수당·자립정착금·의료비지원처럼 "5년 이내" 기한이 있는 제도에 쓰세요.',
  },
  {
    key: 'exit_type_in',
    label: '퇴소 유형이 특정 유형 중 하나',
    category: '기간',
    params: [
      { name: 'types', type: 'string[]', enumValues: [...EXIT_TYPES], placeholder: '만기,연장' },
    ],
    sentence: (p) => `퇴소 유형이 **${(p.types as string[]).join('·')}** 중 하나여야 해요`,
    rejectSentence: (p) =>
      `퇴소 유형이 **${(p.types as string[]).join('·')}**에 해당하지 않아서 이 지원은 신청하기 어려워요`,
    // exitType은 단일 선택값이라 includesAnyOf(배열 vs 배열)를 쓸 수 없다 — 파일 상단 설계
    // 원칙 2 참고. anyOf(OR)로 "여러 값 중 하나와 일치"를 표현한다.
    toCondition: (p) => ({
      anyOf: (p.types as string[]).map((t) => ({ field: 'exitType', op: '==' as const, value: t })),
      direction: 'require',
    }),
    onboardingField: 'protectionEndType',
    helpText: '퇴소 유형이 특정 범위로 제한되는 제도(예: 조기퇴소 제외)에 쓰세요.',
  },
  {
    key: 'deadline_by',
    label: '신청 마감일',
    category: '기간',
    params: [{ name: 'date', type: 'string', placeholder: '2026-09-15' }],
    sentence: (p) => `**${formatKoreanDate(String(p.date))}**까지 신청해야 해요`,
    rejectSentence: (p) => `**${formatKoreanDate(String(p.date))}** 마감이 지나서 이 지원은 신청하기 어려워요`,
    // 마감일은 policies_published.deadline / notice.deadline로 별도 관리된다. 여기서는
    // 조건을 만들지 않고 문장만 쓴다.
    toCondition: () => null,
    // 마감일 원문은 형식이 자유로워 기계가 확정할 수 없다 — 반드시 원문 확인 안내가 필요하다
    needsHumanCheck: true,
    onboardingField: null,
    helpText: '마감일은 deadline 필드로 따로 저장돼요. 이 기준은 검수 화면에 마감일을 문장으로 보여주는 용도예요.',
  },

  // ── 나이 ─────────────────────────────────────────────────────────────
  {
    key: 'age_at_most',
    label: '만 N세 이하',
    category: '나이',
    params: [{ name: 'maxAge', type: 'number', placeholder: '29' }],
    sentence: (p) => `만 **${p.maxAge}세** 이하여야 해요`,
    rejectSentence: (p) => `만 **${p.maxAge}세**를 넘어서 이 지원은 신청하기 어려워요`,
    toCondition: (p) => ({
      field: 'ageYears', op: '<=', value: Number(p.maxAge), direction: 'require',
    }),
    onboardingField: 'birthDate',
    helpText: '연령 상한이 있는 제도에 쓰세요. 생년월일로 계산된 만 나이(ageYears)로 판정해요.',
  },
  {
    key: 'age_at_least',
    label: '만 N세 이상',
    category: '나이',
    params: [{ name: 'minAge', type: 'number', placeholder: '15' }],
    sentence: (p) => `만 **${p.minAge}세** 이상이어야 해요`,
    rejectSentence: (p) => `아직 만 **${p.minAge}세**가 되지 않아서 이 지원은 신청하기 어려워요`,
    toCondition: (p) => ({
      field: 'ageYears', op: '>=', value: Number(p.minAge), direction: 'require',
    }),
    onboardingField: 'birthDate',
    helpText: '연령 하한이 있는 제도에 쓰세요.',
  },
  {
    key: 'age_between',
    label: '만 N~M세 사이',
    category: '나이',
    params: [
      { name: 'minAge', type: 'number', placeholder: '15' },
      { name: 'maxAge', type: 'number', placeholder: '29' },
    ],
    sentence: (p) => `만 **${p.minAge}~${p.maxAge}세** 사이여야 해요`,
    rejectSentence: (p) => `만 **${p.minAge}~${p.maxAge}세** 사이가 아니어서 이 지원은 신청하기 어려워요`,
    toCondition: (p) => ({
      allOf: [
        { field: 'ageYears', op: '>=' as const, value: Number(p.minAge) },
        { field: 'ageYears', op: '<=' as const, value: Number(p.maxAge) },
      ],
      direction: 'require',
    }),
    onboardingField: 'birthDate',
    helpText: '연령 상한과 하한이 함께 있는 제도에 쓰세요.',
  },

  // ── 학업·취업 ────────────────────────────────────────────────────────
  {
    key: 'enrolled_required',
    label: '재학 중이어야 함 (휴학 포함)',
    category: '학업·취업',
    params: [],
    sentence: () => '대학(원)에 재학 중이어야 해요 (휴학도 포함)',
    rejectSentence: () => '대학(원)에 재학 중이 아니어서 이 지원은 신청하기 어려워요',
    toCondition: () => ({ field: 'isEnrolled', op: '==', value: true, direction: 'require' }),
    onboardingField: 'currentStatus',
    blockedBy: 'lossy_question',
    helpText:
      '재학생만 대상인 교육 관련 제도에 쓰세요. currentStatus가 단일선택이라 "재학+취업" 동시 상태는 못 잡아요 — 지금은 확인 필요로만 나가요.',
  },
  {
    key: 'enrolled_excluded',
    label: '재학 중이면 제외',
    category: '학업·취업',
    params: [],
    sentence: () => '재학 중이면 대상이 아니에요',
    rejectSentence: () => '대학(원)에 재학 중이어서 이 지원은 신청하기 어려워요',
    // "재학 중이면 대상이 아니에요"는 제외 서술이므로 direction은 exclude다. require로 넣으면
    // 재학생만 통과하는 정반대 판정이 나온다.
    toCondition: () => ({ field: 'isEnrolled', op: '==', value: true, direction: 'exclude' }),
    onboardingField: 'currentStatus',
    blockedBy: 'lossy_question',
    helpText: '미취업자·비재학생 전용 제도에서 재학생을 걸러낼 때 쓰세요. 지금은 확인 필요로만 나가요.',
  },
  {
    key: 'employed_required',
    label: '취업 상태여야 함',
    category: '학업·취업',
    params: [],
    sentence: () => '취업한 상태여야 해요',
    rejectSentence: () => '취업하지 않은 상태라서 이 지원은 신청하기 어려워요',
    toCondition: () => ({ field: 'isEmployed', op: '==', value: true, direction: 'require' }),
    onboardingField: 'currentStatus',
    blockedBy: 'lossy_question',
    helpText: '취업자 전용 제도에 쓰세요. 지금은 확인 필요로만 나가요.',
  },
  {
    key: 'unemployed_required',
    label: '미취업 상태여야 함',
    category: '학업·취업',
    params: [],
    sentence: () => '아직 취업하지 않은 상태여야 해요',
    rejectSentence: () => '이미 취업한 상태라서 이 지원은 신청하기 어려워요',
    toCondition: () => ({ field: 'isEmployed', op: '==', value: false, direction: 'require' }),
    onboardingField: 'currentStatus',
    blockedBy: 'lossy_question',
    helpText: '미취업자 전용 제도에 쓰세요. 지금은 확인 필요로만 나가요.',
  },

  // ── 주거 ─────────────────────────────────────────────────────────────
  {
    key: 'no_house_required',
    label: '무주택자만 대상',
    category: '주거',
    params: [],
    sentence: () => '본인 명의 주택이 없어야 해요',
    rejectSentence: () => '본인 명의 주택이 있어서 이 지원은 신청하기 어려워요',
    // 문장은 긍정형("없어야 해요")이지만 실제로는 "주택을 소유하면 제외"이므로 direction은
    // exclude다.
    toCondition: () => ({ field: 'ownsHouse', op: '==', value: true, direction: 'exclude' }),
    onboardingField: 'ownsHome',
    helpText: '무주택 요건이 있는 주거 지원 제도(청년임대주택 등)에 쓰세요.',
  },

  // ── 가구·혼인 ────────────────────────────────────────────────────────
  {
    key: 'unmarried_required',
    label: '혼인 중이면 제외',
    category: '가구·혼인',
    params: [],
    sentence: () => '혼인 중이면 대상이 아니에요',
    rejectSentence: () => '혼인 중이라서 이 지원은 신청하기 어려워요',
    toCondition: () => ({ field: 'isMarried', op: '==', value: true, direction: 'exclude' }),
    onboardingField: 'maritalStatus',
    helpText: 'LH 자립준비청년(청년 유형) 전세임대처럼 혼인중인 사람을 제외하는 제도에 쓰세요.',
  },

  // ── 소득·수급 ────────────────────────────────────────────────────────
  {
    key: 'basic_livelihood_required',
    label: '기초생활수급자여야 함',
    category: '소득·수급',
    params: [],
    sentence: () => '기초생활수급자여야 해요',
    rejectSentence: () => '기초생활수급자가 아니어서 이 지원은 신청하기 어려워요',
    toCondition: () => ({
      field: 'isBasicLivelihoodRecipient', op: '==', value: true, direction: 'require',
    }),
    onboardingField: 'basicLivelihoodRecipient',
    helpText: '기초생활수급자만 별도 입소·지원 경로가 있는 제도(자립생활관 등)에 쓰세요. "모름" 응답은 확인 필요로 처리돼요.',
  },
  {
    key: 'basic_livelihood_excluded',
    label: '기초생활수급자면 제외',
    category: '소득·수급',
    params: [],
    sentence: () => '기초생활(의료급여) 수급자는 대상이 아니에요',
    rejectSentence: () => '기초생활(의료급여) 수급자라서 이 지원은 신청하기 어려워요',
    // "수급자는 대상이 아니에요"는 제외 서술이므로 direction은 exclude다.
    toCondition: () => ({
      field: 'isBasicLivelihoodRecipient', op: '==', value: true, direction: 'exclude',
    }),
    onboardingField: 'basicLivelihoodRecipient',
    helpText: '의료급여 수급자는 이미 낮은 본인부담률이 적용돼 제외되는 의료비 지원 제도 등에 쓰세요.',
  },
  {
    key: 'near_poor_excluded',
    label: '차상위 본인부담경감 대상이면 제외',
    category: '소득·수급',
    params: [],
    sentence: () => '본인부담 경감 대상(차상위)은 대상이 아니에요',
    rejectSentence: () => '본인부담 경감 대상(차상위)이라서 이 지원은 신청하기 어려워요',
    // "경감 대상은 대상이 아니에요"는 제외 서술이므로 direction은 exclude다. 또한 본인도
    // 이 자격을 헷갈리기 쉬운 항목이라(검증보고서 Q9) "모름" 선택지를 만드는 대신 예/아니오로만
    // 받고(팀원분 쪽은 Y/N/UNKNOWN이지만 UNKNOWN은 adaptProfile이 false로 보낸다), riskyField +
    // uncertaintyLabel로 판정과 무관하게 항상 '확인 필요'가 뜨게 한다.
    toCondition: () => ({
      field: 'isNearPoorMedicalDiscount',
      op: '==',
      value: true,
      direction: 'exclude',
      riskyField: true,
      uncertaintyLabel:
        '차상위 본인부담경감 대상 여부는 헷갈리기 쉬워요 — 의료급여증에 "차상위" 표시가 있는지 확인해보세요.',
    }),
    needsHumanCheck: true,
    onboardingField: 'nearPoorMedicalReduction',
    helpText:
      '차상위 본인부담경감대상자를 제외하는 의료비 지원 제도에 쓰세요. "모름" 응답은 결과 카드에 확인 필요 배지로 나가요.',
  },
  {
    key: 'income_at_most',
    label: '소득이 기준중위소득 N% 이하',
    category: '소득·수급',
    params: [{ name: 'percent', type: 'number', placeholder: '50' }],
    sentence: (p) => `본인 소득이 기준중위소득 **${p.percent}%** 이하여야 해요`,
    rejectSentence: (p) => `본인 소득이 기준중위소득 **${p.percent}%**를 넘어서 이 지원은 신청하기 어려워요`,
    // incomeBracket도 단일 선택값이라 anyOf(OR)로 "N% 이하에 해당하는 구간들 중 하나"를
    // 표현한다 — 파일 상단 설계 원칙 2 참고.
    toCondition: (p) => ({
      anyOf: incomeBracketsAtMost(Number(p.percent)).map((bracket) => ({
        field: 'incomeBracket', op: '==' as const, value: bracket,
      })),
      direction: 'require',
    }),
    onboardingField: 'incomeBracket',
    blockedBy: 'missing_question',
    helpText:
      '제도가 "기준중위소득 OO% 이하"처럼 소득 상한을 두면 쓰세요. 온보딩에 소득 문항이 아직 없어서 지금은 항상 확인 필요로만 나가요.',
  },

  // ── 지역 ─────────────────────────────────────────────────────────────
  {
    key: 'region_in',
    label: '거주 지역이 특정 지역 중 하나',
    category: '지역',
    params: [
      { name: 'regions', type: 'string[]', enumValues: [...REGIONS_17], placeholder: '강원도' },
    ],
    sentence: (p) => `**${(p.regions as string[]).join('·')}**에 사는 분만 신청할 수 있어요`,
    rejectSentence: (p) =>
      `**${(p.regions as string[]).join('·')}** 거주자가 아니어서 이 지원은 신청하기 어려워요`,
    // region도 단일 선택값이라 anyOf(OR)로 표현한다 — exit_type_in의 주석과 같은 이유.
    toCondition: (p) => ({
      anyOf: (p.regions as string[]).map((r) => ({ field: 'region', op: '==' as const, value: r })),
      direction: 'require',
    }),
    onboardingField: 'region',
    helpText: '특정 지역 거주자만 대상인 지자체 제도에 쓰세요.',
  },

  // ── 중복수급 ─────────────────────────────────────────────────────────
  {
    key: 'not_receiving',
    label: '다른 특정 지원을 받고 있으면 제외',
    category: '중복수급',
    params: [
      { name: 'supportId', type: 'string', placeholder: 'youth-tomorrow-savings' },
      { name: 'label', type: 'string', placeholder: '청년내일저축계좌' },
    ],
    sentence: (p) => `**${p.label}**을 이미 받고 있으면 함께 받을 수 없어요`,
    rejectSentence: (p) => `**${p.label}**을 이미 받고 있어서 함께 받을 수 없어요`,
    toCondition: (p) => ({
      field: 'currentSupports', op: 'notIncludes', value: p.supportId, direction: 'require',
    }),
    onboardingField: 'currentBenefits',
    helpText:
      '중복수급이 금지된 다른 지원을 이미 받고 있으면 제외할 때 쓰세요. supportId는 다른 제도의 policyId와 같아야 해요.',
  },

  // ── 기타 ─────────────────────────────────────────────────────────────
  {
    key: 'first_come_first_served',
    label: '예산 소진 시 조기 마감 가능',
    category: '기타',
    params: [],
    sentence: () => '예산이 소진되면 마감일보다 일찍 닫힐 수 있어요',
    rejectSentence: () => '예산이 소진되면 마감일보다 일찍 닫힐 수 있어요',
    // 판정에 쓰지 않는다 — 언제 예산이 소진될지는 기계로 알 수 없다.
    toCondition: () => null,
    needsHumanCheck: true,
    onboardingField: null,
    helpText:
      "공고에 '선착순', '예산 소진 시 조기 마감' 같은 문구가 있을 때 붙이세요. 판정에는 쓰이지 않고 확인 필요 안내로만 나가요.",
  },
  {
    key: 'one_time_only',
    label: '1회성 지급 안내',
    category: '기타',
    params: [],
    sentence: () => '이 지원은 한 번만 받을 수 있어요',
    rejectSentence: () => '이 지원은 한 번만 받을 수 있어요',
    // 판정에 쓰지 않는다 — 이미 받았는지는 온보딩으로 확인할 방법이 없다(자립정착금 등).
    toCondition: () => null,
    // 이미 받았는지를 우리가 알 수 없다 — 판정하지 않고 안내만 한다
    needsHumanCheck: true,
    onboardingField: null,
    helpText: '자립정착금처럼 1회성으로 지급되는 제도에 참고용으로 붙이세요. 판정에는 영향을 주지 않아요.',
  },
  {
    key: 'manual_check_only',
    label: '공고 원문 직접 확인 필요',
    category: '기타',
    params: [{ name: 'memo', type: 'string', placeholder: '지자체별 예산 소진 시 조기 마감' }],
    sentence: (p) => `이 조건은 공고 원문을 직접 확인해야 해요: **${p.memo}**`,
    rejectSentence: (p) => `이 조건은 공고 원문을 직접 확인해야 해요: **${p.memo}**`,
    toCondition: () => null,
    needsHumanCheck: true,
    onboardingField: null,
    helpText:
      '기계 조건으로 옮기기 애매한 조건은 억지로 만들지 말고 이걸 쓰세요. 판정에서 절대 탈락시키지 않아요 — 놓치는 오류가 헛걸음보다 나쁘기 때문이에요.',
  },
];

const CATALOG_BY_KEY: ReadonlyMap<string, CriterionSpec> = new Map(
  CATALOG.map((spec) => [spec.key, spec])
);

export function getCriterionSpec(key: string): CriterionSpec | undefined {
  return CATALOG_BY_KEY.get(key);
}
