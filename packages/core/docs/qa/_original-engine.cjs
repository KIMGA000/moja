'use strict';
/* ===========================================================================
 * app.html(MVP 원본)의 판정엔진을 **그대로 떼어낸 동결 사본**.
 *
 * 절대 수정하지 마세요. 이 파일의 존재 목적은 단 하나입니다:
 * lib/engine/*.ts 를 고칠 때마다 "원본과 어디가 달라졌는지"를 기계적으로 확인하는
 * 기준선(baseline) 역할. 의도한 변경만 있고 의도하지 않은 회귀는 없다는 걸 증명한다.
 *
 * 실행:  npm run qa:engine
 * =========================================================================== */
const SOON_DEADLINE_DAYS = 30; // 이 안이면 '곧마감'

// ---------------------------------------------------------------------------
// 1. 프로필 계산 — 온보딩 원시 응답(raw) -> 판정에 필요한 파생값(computed)
// ---------------------------------------------------------------------------

function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function diffInYears(from, to) {
  // from이 to보다 과거일 때 경과년수(내림)
  let years = to.getFullYear() - from.getFullYear();
  const anniversary = new Date(from.getTime());
  anniversary.setFullYear(from.getFullYear() + years);
  if (anniversary > to) years -= 1;
  return years;
}

function diffInDays(from, to) {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / MS);
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
function computeProfile(raw, today = new Date()) {
  const birthDate = raw.birthDate ? new Date(raw.birthDate) : null;
  const protectionEndDate = raw.protectionEndDate ? new Date(raw.protectionEndDate) : null;

  const ageYears = birthDate ? diffInYears(birthDate, today) : null;

  // 조기퇴소자는 "만 18세 도달일"이 5년 기산점, 그 외(만기/연장)는 "보호종료일"이 기산점.
  // 재보호조치 이력이 있으면 자립정착금은 재지급되지 않는 등 별도 처리가 필요하므로
  // exitType === '재보호'는 fiveYearBase 계산에서 별도 플래그로 남겨 정책이 참조할 수 있게 한다.
  let fiveYearBaseDate = protectionEndDate;
  if (raw.exitType === '조기' && birthDate) {
    fiveYearBaseDate = addYears(birthDate, 18);
  }

  const yearsSinceFiveYearBase = fiveYearBaseDate != null ? diffInYears(fiveYearBaseDate, today) : null;
  const fiveYearDeadlineDate = fiveYearBaseDate != null ? addYears(fiveYearBaseDate, 5) : null;
  const daysUntilFiveYearDeadline = fiveYearDeadlineDate != null ? diffInDays(today, fiveYearDeadlineDate) : null;

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

// ---------------------------------------------------------------------------
// 2. 조건(condition) 평가 — anyOf/allOf 재귀 지원
// ---------------------------------------------------------------------------

function getField(profile, field) {
  return profile[field];
}

function evalOp(actual, op, expected) {
  switch (op) {
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    case '<=': return actual != null && actual <= expected;
    case '>=': return actual != null && actual >= expected;
    case '<': return actual != null && actual < expected;
    case '>': return actual != null && actual > expected;
    case 'includes': return Array.isArray(actual) && actual.includes(expected);
    case 'notIncludes': return !(Array.isArray(actual) && actual.includes(expected));
    case 'includesAnyOf': return Array.isArray(actual) && Array.isArray(expected) && expected.some(v => actual.includes(v));
    default: throw new Error(`알 수 없는 연산자: ${op}`);
  }
}

/**
 * 단일 leaf condition 평가. anyOf/allOf 노드도 재귀적으로 처리한다.
 * 반환: { satisfied: boolean, usedRiskyField: boolean }
 */
function evalConditionNode(node, profile) {
  if (node.anyOf) {
    const results = node.anyOf.map(n => evalConditionNode(n, profile));
    return {
      satisfied: results.some(r => r.satisfied),
      usedRiskyField: results.some(r => r.usedRiskyField),
    };
  }
  if (node.allOf) {
    const results = node.allOf.map(n => evalConditionNode(n, profile));
    return {
      satisfied: results.every(r => r.satisfied),
      usedRiskyField: results.some(r => r.usedRiskyField),
    };
  }
  const actual = getField(profile, node.field);
  const satisfied = evalOp(actual, node.op, node.value);
  return { satisfied, usedRiskyField: !!node.riskyField };
}

// ---------------------------------------------------------------------------
// 3. 정책 하나 평가
// ---------------------------------------------------------------------------

/**
 * 반환: {
 *   policyId, eligible, reasons: string[], uncertaintyFlags: string[],
 *   hasDeadlineSignal, daysUntilDeadline
 * }
 */
function evaluatePolicy(policy, profile) {
  const reasons = [];
  const uncertaintyFlags = [];
  let eligible = true;

  for (const cond of policy.conditions) {
    const { satisfied, usedRiskyField } = evalConditionNode(cond, profile);
    const direction = cond.direction; // require | exclude
    const conditionFailed = direction === 'require' ? !satisfied : satisfied;

    if (conditionFailed) {
      eligible = false;
      if (cond.rejectReason) reasons.push(cond.rejectReason);
    }

    // uncertaintyLabel이 있는 조건은, 그 조건이 이번 판정에 "영향을 줬을 가능성이 있으면"
    // (즉 require인데 이 조건 하나로 통과/탈락이 갈리는 경계인 경우) 별도 확인 라벨을 띄운다.
    // 보수적으로: uncertaintyLabel이 붙은 condition은 결과와 무관하게 항상 플래그를 남긴다 —
    // "입력 안 받은 세부사항이 이 판정에 영향을 줄 수 있다"는 원칙(3)을 지키기 위함.
    if (cond.uncertaintyLabel || usedRiskyField) {
      uncertaintyFlags.push(cond.uncertaintyLabel || '이 조건은 별도 확인이 필요해요.');
    }
  }

  // 이 정책이 5년 기산점 기한과 연동되는지(즉 D-day 표시 대상인지) 판단:
  // conditions 중 yearsSinceFiveYearBase 조건이 있으면 fiveYearDeadlineDate를 기준으로 D-day를 보여준다.
  const hasFiveYearDeadline = policy.conditions.some(
    c => c.field === 'daysUntilFiveYearDeadline'
  );

  return {
    policyId: policy.id,
    name: policy.name,
    category: policy.category,
    eligible,
    reasons,
    uncertaintyFlags,
    hasDeadlineSignal: hasFiveYearDeadline,
    daysUntilDeadline: hasFiveYearDeadline ? profile.daysUntilFiveYearDeadline : null,
    citation: policy.citation,
    lastVerified: policy.lastVerified,
    reverifyBy: policy.reverifyBy,
    sourceUrl: policy.sourceUrl,
  };
}

// ---------------------------------------------------------------------------
// 4. 정책 간 관계 규칙(rules.json) 2차 적용 — 중복수급 강등
// ---------------------------------------------------------------------------

function applyRelationRules(evalResults, rules, profile) {
  const byId = new Map(evalResults.map(r => [r.policyId, r]));

  for (const rule of rules) {
    if (rule.type === 'mutual_exclusion' && rule.then) {
      const { satisfied } = evalConditionNode(rule.if, profile);
      const target = byId.get(rule.then);
      if (satisfied && target && target.eligible) {
        target.eligible = false;
        target.reasons.push(rule.reason);
        target.downgradedBy = rule.id;
      }
    }

    if (rule.type === 'partial_exclusion' && rule.then) {
      const { satisfied } = evalConditionNode(rule.if, profile);
      const target = byId.get(rule.then);
      if (satisfied && target && target.eligible) {
        target.eligible = false;
        target.reasons.push(rule.reason);
        target.downgradedBy = rule.id;
        target.uncertaintyFlags.push(rule.note || '');
      }
    }

    if (rule.type === 'mutual_exclusion' && rule.group) {
      const selected = rule.group.filter(id => profile.currentSupports.includes(id));
      if (selected.length >= 1) {
        // 이미 그룹 중 하나를 받고 있으면, 같은 그룹의 "받고 있지 않은" 나머지 항목은
        // exemption이 없는 한 강등한다. (exemption은 별도 mutual_exclusion_exception 규칙으로 처리)
        const exemptIds = rules
          .filter(r => r.type === 'mutual_exclusion_exception' && r.fromGroup === rule.id)
          .map(r => r.exemptPolicy);

        for (const memberId of rule.group) {
          if (selected.includes(memberId)) continue; // 이미 받고 있는 항목 자체는 강등하지 않음
          if (exemptIds.includes(memberId)) continue;
          const target = byId.get(memberId);
          if (target && target.eligible) {
            target.eligible = false;
            target.reasons.push(rule.reason);
            target.downgradedBy = rule.id;
          }
        }
      }
    }
  }

  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// 5. 최종 3분류 상태 부여 — 신청가능 / 곧마감 / 이미놓침
// ---------------------------------------------------------------------------

function classify(result) {
  if (!result.eligible) {
    return { ...result, status: '이미놓침', dDay: result.hasDeadlineSignal ? result.daysUntilDeadline : null };
  }
  if (result.hasDeadlineSignal && result.daysUntilDeadline != null && result.daysUntilDeadline <= SOON_DEADLINE_DAYS && result.daysUntilDeadline >= 0) {
    return { ...result, status: '곧마감', dDay: result.daysUntilDeadline };
  }
  return { ...result, status: '신청가능', dDay: result.hasDeadlineSignal ? result.daysUntilDeadline : null };
}

// ---------------------------------------------------------------------------
// 6. 전체 파이프라인
// ---------------------------------------------------------------------------

function evaluateAll(profile, policiesFile, rulesFile) {
  const policies = policiesFile.policies || policiesFile;
  const rules = (rulesFile && rulesFile.rules) || rulesFile || [];

  let results = policies.map(policy => evaluatePolicy(policy, profile));
  results = applyRelationRules(results, rules, profile);
  results = results.map(classify);

  // 정렬: 곧마감(D-day 임박) > 신청가능 > 이미놓침, 같은 상태 내에서는 D-day 오름차순
  const order = { '곧마감': 0, '신청가능': 1, '이미놓침': 2 };
  results.sort((a, b) => {
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    const ad = a.dDay == null ? Infinity : a.dDay;
    const bd = b.dDay == null ? Infinity : b.dDay;
    return ad - bd;
  });

  return results;
}

// ---------------------------------------------------------------------------
// 7. 공고(notices) 경량 필터링 — 정밀 판정 없음, 마감일·연령 상한만 체크
// ---------------------------------------------------------------------------

/**
 * notices.json은 21개 제도와 다르게 무겁게 검증하지 않는다.
 * 마감 지난 공고는 제외하고, 나이 상한을 넘으면 제외한다. 그 외 자격은 sourceUrl 원문에서
 * 사용자가 직접 확인하도록 안내 문구만 붙인다.
 */
function filterNotices(notices, profile, today = new Date()) {
  return notices
    .map(n => {
      const deadlineDate = n.deadline ? new Date(n.deadline) : null;
      const dDay = deadlineDate ? diffInDays(today, deadlineDate) : null;
      const expired = dDay != null && dDay < 0;
      const tooOld = n.ageMax != null && profile.ageYears != null && profile.ageYears > n.ageMax;
      return { ...n, dDay, visible: !expired && !tooOld, note: n.note || '자세한 자격은 원문에서 확인하세요.' };
    })
    .filter(n => n.visible)
    .sort((a, b) => (a.dDay ?? Infinity) - (b.dDay ?? Infinity));
}



module.exports={computeProfile,evaluatePolicy,evaluateAll,applyRelationRules,classify,filterNotices};
