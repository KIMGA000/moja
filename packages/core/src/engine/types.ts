// ---------------------------------------------------------------------------
// 판정엔진 타입 정의
// app.html의 MojaEngine을 그대로 옮긴 것 — 로직은 evaluate.ts/profile.ts에 있고
// 여기서는 그 입출력 모양만 기술한다.
// ---------------------------------------------------------------------------

export type CompareOp =
  | '=='
  | '!='
  | '<='
  | '>='
  | '<'
  | '>'
  | 'includes'
  | 'notIncludes'
  | 'includesAnyOf';

/** conditions[] 내부 노드. anyOf/allOf는 재귀적으로 leaf를 포함한다. */
export type ConditionNode =
  | { field: string; op: CompareOp; value: unknown; riskyField?: boolean }
  | { anyOf: ConditionNode[] }
  | { allOf: ConditionNode[] };

export type ConditionDirection = 'require' | 'exclude';

/** policy.conditions[] 배열의 top-level 원소. */
export type PolicyCondition = ConditionNode & {
  direction: ConditionDirection;
  rejectReason?: string;
  citation?: string;
  uncertaintyLabel?: string;
};

export type Policy = {
  id: string;
  name: string;
  category: string;
  summary?: string;
  conditions: PolicyCondition[];
  citation?: string;
  lastVerified?: string;
  reverifyBy?: string;
  sourceUrl?: string;
};

export type PoliciesFile = { _schemaNote?: string; policies: Policy[] } | Policy[];

/** rules.json의 제도 간 관계 규칙. type별로 실제 쓰는 필드가 다르므로 옵셔널로 둔다. */
export type RelationRule = {
  type: 'mutual_exclusion' | 'partial_exclusion' | 'mutual_exclusion_exception';
  id: string;
  if?: ConditionNode;
  then?: string;
  group?: string[];
  effect?: string;
  reason: string;
  citation?: string;
  note?: string;
  exemptPolicy?: string;
  fromGroup?: string;
  /** 사용자에게 보여줄 '확인 필요' 문장. note(내부 메모)와 구분한다. */
  uncertaintyLabel?: string;
};

export type RulesFile = { _schemaNote?: string; rules: RelationRule[] } | RelationRule[];

export type ExitType = '만기' | '연장' | '조기' | '재보호';

/**
 * 기준중위소득 구간. 기존 '없음또는50%이하'는 "소득 없음"과 "소득 있지만 50% 이하"를
 * 하나로 묶어놔서, income_at_most(N) 같은 임의 %기준 조건을 구간별로 조립할 수 없었다.
 * [2단계] 카탈로그의 income_at_most가 이 구간들을 anyOf로 묶어 "N% 이하"를 표현한다.
 *
 * TODO([4단계] fromCondition): data/seed/policies.json의 21개 제도는 아직 이 필드를 쓰지
 * 않는다(2단계 시점 기준 미사용 확인). 나중에 소득 조건이 있는 제도를 추가/마이그레이션할
 * 때 예전 표기가 남아있다면 새 구간으로 매핑하는 코드가 fromCondition.ts에 필요할 수 있다.
 * 지금은 seed 데이터를 건드리지 않는다.
 */
export type IncomeBracket = '50%이하' | '50~75%' | '75~100%' | '100~150%' | '150%초과';

/** 온보딩에서 그대로 받는 원시 응답. */
export type RawProfileInput = {
  birthDate?: string | null;
  hasInstitutionalCare?: boolean;
  exitType?: ExitType;
  protectionEndDate?: string | null;
  isEnrolled?: boolean;
  isEmployed?: boolean;
  region?: string;
  incomeBracket?: IncomeBracket;
  ownsHouse?: boolean;
  isMarried?: boolean;
  isBasicLivelihoodRecipient?: boolean;
  isNearPoorMedicalDiscount?: boolean;
  currentSupports?: string[];
  [key: string]: unknown;
};

/** computeProfile이 계산한 파생값까지 포함한 완전한 프로필. */
export type Profile = Omit<
  RawProfileInput,
  'birthDate' | 'protectionEndDate' | 'currentSupports'
> & {
  birthDate: Date | null;
  protectionEndDate: Date | null;
  fiveYearBaseDate: Date | null;
  fiveYearDeadlineDate: Date | null;
  ageYears: number | null;
  yearsSinceFiveYearBase: number | null;
  daysUntilFiveYearDeadline: number | null;
  currentSupports: string[];
};

export type PolicyEvalResult = {
  policyId: string;
  name: string;
  category: string;
  eligible: boolean;
  reasons: string[];
  uncertaintyFlags: string[];
  hasDeadlineSignal: boolean;
  daysUntilDeadline: number | null;
  citation?: string;
  lastVerified?: string;
  reverifyBy?: string;
  sourceUrl?: string;
  downgradedBy?: string;
};

/** [1단계]에서는 아직 3분류만 이식한다 — '예정' 상태는 [4단계]에서 추가한다. */
export type ClassificationStatus = '신청가능' | '곧마감' | '이미놓침';

export type ClassifiedResult = PolicyEvalResult & {
  status: ClassificationStatus;
  dDay: number | null;
};

export type Notice = {
  id: string;
  type?: string;
  title: string;
  tags?: string[];
  ageMax?: number | null;
  deadline?: string | null;
  sourceUrl?: string;
  note?: string;
};

export type NoticesFile = { _schemaNote?: string; notices: Notice[] } | Notice[];

export type FilteredNotice = Notice & {
  dDay: number | null;
  visible: boolean;
  note: string;
};
