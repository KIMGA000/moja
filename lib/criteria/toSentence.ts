// ---------------------------------------------------------------------------
// criteria[] → 사람이 읽는 한국어 문장. + 카탈로그 문장이 스타일 가이드를 지키는지
// 검사하는 개발용 린터 checkSentenceStyle().
//
// 스타일 가이드 (01_통합_프롬프트.md [2단계]):
//   - 해요체 종결 ("~합니다" ✗)
//   - 행정용어를 풀어쓰기
//   - 부정의 부정 금지
//   - 숫자·기한은 **굵게**
//   - rejectSentence는 사람을 탓하지 않게
//   - 한 문장에 한 조건만
// ---------------------------------------------------------------------------

import { CATALOG, getCriterionSpec, type CriterionEntry, type CriterionParams, type CriterionSpec } from './catalog';

export function renderSentence(entry: CriterionEntry): string {
  const spec = getCriterionSpec(entry.key);
  if (!spec) throw new Error(`카탈로그에 없는 기준 key: ${entry.key}`);
  return spec.sentence(entry.params);
}

export function renderRejectSentence(entry: CriterionEntry): string {
  const spec = getCriterionSpec(entry.key);
  if (!spec) throw new Error(`카탈로그에 없는 기준 key: ${entry.key}`);
  return spec.rejectSentence(entry.params);
}

export function renderSentences(entries: CriterionEntry[]): string[] {
  return entries.map(renderSentence);
}

// ---------------------------------------------------------------------------
// checkSentenceStyle()
// ---------------------------------------------------------------------------

export type StyleIssue = {
  key: string;
  field: 'sentence' | 'rejectSentence';
  text: string;
  rule: string;
  detail: string;
};

// 문어체 종결 — 이 어미로 끝나면 해요체가 아니다.
const FORMAL_ENDINGS = ['습니다.', '합니다.', '됩니다.', '입니다.'];

// 풀어써야 할 행정용어. 카탈로그를 늘릴 때 필요하면 추가한다.
const FORBIDDEN_TERMS = ['보호종료자', '무주택 세대구성원'];

/** "~가 아니면 ~되지/하지/지 않아요" 형태의 부정의 부정을 대략 잡는 휴리스틱. */
const DOUBLE_NEGATIVE = /아니.*(되지 않|하지 않|지 않아요)/;

function checkOneSentence(key: string, field: 'sentence' | 'rejectSentence', text: string): StyleIssue[] {
  const issues: StyleIssue[] = [];

  if (FORMAL_ENDINGS.some((ending) => text.endsWith(ending))) {
    issues.push({
      key, field, text, rule: '해요체',
      detail: '문어체(합니다/습니다)로 끝났어요. "~해요"로 바꿔주세요.',
    });
  }

  for (const term of FORBIDDEN_TERMS) {
    if (text.includes(term)) {
      issues.push({ key, field, text, rule: '행정용어', detail: `"${term}"는 풀어써야 해요.` });
    }
  }

  if (DOUBLE_NEGATIVE.test(text)) {
    issues.push({
      key, field, text, rule: '부정의 부정',
      detail: '부정을 두 번 겹쳐 쓴 것처럼 보여요. 긍정형으로 다시 써주세요.',
    });
  }

  if (/\d/.test(text) && !text.includes('**')) {
    issues.push({
      key, field, text, rule: '숫자 강조',
      detail: '숫자·기한이 있는데 **굵게** 표시가 없어요.',
    });
  }

  const conditionMentions = (text.match(/해야 해요|이어야 해요|여야 해요|아니에요|대상이에요/g) || []).length;
  if (conditionMentions > 1) {
    issues.push({
      key, field, text, rule: '한 문장 한 조건',
      detail: '조건이 두 개 이상 들어 있는 것처럼 보여요. 문장을 나눠주세요.',
    });
  }

  return issues;
}

/** number 파라미터에 넣을 대표값. 실제 값이 아니라 문장이 규칙을 지키는지 보는 용도라
 *  숫자 자체는 의미 없다 — 다만 나이 계열은 그럴듯한 값을 써서 사람이 읽기 편하게 한다. */
function sampleValueFor(paramName: string): number {
  if (paramName === 'minAge') return 15;
  if (paramName === 'maxAge') return 29;
  if (paramName === 'years') return 5;
  if (paramName === 'percent') return 50;
  return 1;
}

function sampleParams(spec: CriterionSpec): CriterionParams {
  const params: CriterionParams = {};
  for (const param of spec.params) {
    switch (param.type) {
      case 'number':
        params[param.name] = sampleValueFor(param.name);
        break;
      case 'string':
        params[param.name] = param.placeholder;
        break;
      case 'enum':
        params[param.name] = param.enumValues?.[0] ?? param.placeholder;
        break;
      case 'string[]':
        params[param.name] = param.enumValues?.slice(0, 2) ?? [param.placeholder];
        break;
    }
  }
  return params;
}

/**
 * 카탈로그 전체(또는 주어진 목록)의 sentence/rejectSentence가 스타일 가이드를 지키는지
 * 검사한다. 각 항목의 params 예시는 spec.params 정의를 보고 자동으로 만든다.
 * 반환이 빈 배열이면 통과.
 */
export function checkSentenceStyle(catalog: readonly CriterionSpec[] = CATALOG): StyleIssue[] {
  const issues: StyleIssue[] = [];
  for (const spec of catalog) {
    const params = sampleParams(spec);
    issues.push(...checkOneSentence(spec.key, 'sentence', spec.sentence(params)));
    issues.push(...checkOneSentence(spec.key, 'rejectSentence', spec.rejectSentence(params)));
  }
  return issues;
}
