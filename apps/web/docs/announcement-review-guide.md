# 공고 데이터 관리 및 검수 가이드라인

이 문서는 `announcements_*` 테이블(공고 데이터)의 컬럼 구성과, 팀원이 데이터를 검수할 때
알아야 할 지금 시점의 실제 동작을 정리합니다. (기준: 2026-08-21, [supabase/schema.sql](../supabase/schema.sql),
[app/data/classify.ts](../app/data/classify.ts))

## 0. ⚠️ 검수 전에 꼭 알아야 할 것

1. **검수 컬럼을 고쳐도 화면에는 반영되지 않습니다.**
   지금 사용자에게 보이는 실제 자격 매칭 로직(`app/data/realMatch.ts`)은 DB의 분류 컬럼
   (`mentions_care_leaver`, `requires_enrolled` 등)을 전혀 읽지 않습니다. `raw_data`에 들어있는
   원문 텍스트를 매 요청마다 자체적으로 다시 분석해서 판정합니다. 즉 이 컬럼들은 **검수·조회
   편의용**이고, 지금은 앱 동작에 직접 영향을 주지 않습니다. (나중에 화면 로직이 이 컬럼을
   읽도록 바꾸는 게 자연스러운 다음 단계입니다.)
2. **`protection_end_types_applicable`은 아직 placeholder입니다.**
   본문에서 배제 신호(예: "조기퇴소자 제외")를 찾는 로직이 없어서, 지금은 모든 공고가
   5종 보호종료유형 전부를 반환합니다. 검수 시 이 값을 신뢰하지 마세요.
3. **중복 탐지·분류값 검증은 자동화되어 있지 않습니다.**
   아래 2단계·3단계는 SQL 예시만 있을 뿐 실행되는 코드가 없습니다. 지금은 전부 사람이
   SQL Editor에서 직접 돌려야 합니다.
4. **새로 동기화되는 공고는 검수 없이 바로 `approved`로 들어갑니다.**
   아직 검수 UI가 없어서 임시로 이렇게 되어 있습니다 (기존에 저장되어 있던 공고의
   `review_status`를 사람이 바꿔뒀다면 재동기화해도 그 값은 유지됩니다 — 새로 들어오는
   공고에만 적용). 그래서 지금 검수팀이 할 일은 "`pending`을 검토해서 승인"이 아니라,
   **"이미 `approved`로 노출된 것 중 잘못된 걸 찾아서 `rejected`로 내리는"** 쪽에 가깝습니다.

## 1. 8개 소스 테이블 = 실제 어느 기관 API인가

8개 소스 테이블(`announcements_central`/`local`/`gov24`/`housing`/`training`/
`jobseeker_program`/`dual_training`/`youth_center`)은 전부 동일한 컬럼 구조지만, 각각
**서로 다른 기관의 공공 API**에서 받아온 데이터입니다. 검수할 때 "이 공고가 어디서 온
정보인지" 헷갈리지 않도록 정리합니다. (출처: [lib/govApis.ts](../lib/govApis.ts),
[app/data/apiPreview.ts](../app/data/apiPreview.ts) 상단 주석)

| 테이블명 (`announcements_*`) | 소스 키 (`source`) | 실제 제공 기관 · API | 비고 |
| :--- | :--- | :--- | :--- |
| `announcements_central` | `central` | **한국사회보장정보원** — 중앙부처복지서비스 | 복지로(bokjiro.go.kr) 데이터의 중앙정부 사업 |
| `announcements_local` | `local` | **한국사회보장정보원** — 지자체복지서비스 | 위와 같은 기관, 시·군·구 단위 사업 |
| `announcements_gov24` | `gov24` | **행정안전부** — 정부24(보조금24) 공공서비스(혜택) 정보 | |
| `announcements_housing` | `housing` | **국토교통부** — 마이홈포털 공공임대주택 모집공고 | |
| `announcements_training` | `training` | **고용노동부 고용24** — 국민내일배움카드 훈련과정 | 대상자 구분 필드가 없어 필터링 결과가 대부분 0건 |
| `announcements_jobseeker_program` | `jobseekerProgram` | **고용노동부 고용24** — 구직자취업역량강화프로그램 | `pgmTarget`(대상자) 필드가 있어 매칭 가능성 있음 |
| `announcements_dual_training` | `dualTraining` | **고용노동부 고용24** — 일학습병행 훈련과정 | |
| `announcements_youth_center` | `youthCenter` | **온통청년(youthcenter.go.kr)** — 청년정책(`getPlcy`) | `zipCd`(지역코드)를 지역명으로 바꾸는 로직이 없어 이 소스만 거주지 필터가 안 걸림 (알려진 한계) |

⚠️ 온통청년의 다른 API인 청년콘텐츠(`getContent`)·청년센터(`getSpace`)는 공고가 아니라
게시물/오프라인 공간 정보라 데이터 모양이 완전히 달라서 아직 연동하지 않았습니다 (의도적 보류).

## 2. 데이터베이스 컬럼 구성

앞의 8개 테이블은 소스만 다를 뿐 컬럼 구조는 전부 동일합니다.

| 구분 | 컬럼명 | 타입 | 설명 |
| :--- | :--- | :--- | :--- |
| **기본정보** | `id` | `bigint` | 고유 식별 번호 (Primary Key, 테이블별로 독립) |
| | `source_id` | `text` | 원본 API 제공 고유 ID (테이블 내 Unique) |
| | `serv_nm` | `text` | 서비스명 (공고 제목) |
| | `serv_dgst` | `text` | 서비스 요약 설명 |
| | `org` | `text` | 담당 기관 및 부서명 |
| | `region` | `text` | 공고 원문에 적힌 지역 (시·도(+시군구)), 없으면 null |
| | `target_traits` | `text` | 지원대상 개인 특성 원문 |
| | `deadline` | `text` | 신청기한·접수기간 원문 |
| | `link` | `text` | 공식 안내 링크 |
| | `raw_data` | `jsonb` | 원본 `WelfareItem` 전체 — **화면에 실제로 노출되는 데이터** |
| **분류정보**<br>(`classify.ts`가 저장 시점에 계산, 검수·조회 편의용) | `mentions_care_leaver` | `boolean` | 자립준비청년 관련 언급 여부 |
| | `mentions_youth` | `boolean` | 청년 관련 언급 여부 |
| | `protection_years_limit` | `int` | "5년 이내" 같은 조건에서 뽑은 숫자 (없으면 null) |
| | `requires_enrolled` | `boolean` | 등록금·학자금·장학금·대학생 언급 (재학 요건 추정) |
| | `requires_no_home` | `boolean` | "무주택" 언급 |
| | `requires_basic_livelihood` | `boolean` | "기초생활수급" 언급 |
| | `requires_already_ended` | `boolean` | 퇴소·보호종료·종결 등 "이미 보호 끝난 사람" 전제 언급 |
| | `region_scope` | `text` | 특정 시·도명이 언급되면 그 이름, 전국 단위면 null |
| | `interest_categories` | `text[]` | INCOME/HOUSING/MEDICAL/EDUCATION/JOB/ASSET/MENTAL/MENTORING/ETC |
| | `protection_end_types_applicable` | `text[]` | ⚠️ 지금은 항상 5종 전부 (placeholder, 위 0-2 참고) |
| **검수정보** | `review_status` | `text` | `pending`/`approved`/`rejected`. `approved`만 외부(anon)에 조회됨 |
| | `duplicate_of_source` | `text` | 중복이면 대표 공고가 속한 테이블 소스명 (예: `local`) |
| | `duplicate_of_source_id` | `text` | 그 테이블에서의 `source_id` — 대표 공고를 정확히 특정하려면 **소스명과 함께** 필요 |
| | `reviewed_by` | `text` | 검수자 |
| | `reviewed_at` | `timestamptz` | 검수 시각 |
| | `review_note` | `text` | 검수 시 특이사항 메모 |
| **동기화정보** | `fetched_at` | `timestamptz` | 마지막으로 API에서 가져온 시각 |
| | `created_at` | `timestamptz` | DB에 처음 저장된 시각 |

전체 8개 테이블을 한 번에 보는 `announcements_all` 뷰가 있고, 이 뷰는 각 행에 `source`
컬럼(`central`/`local`/... 등)이 추가로 붙습니다.

## 3. 데이터 검수 절차 (지금은 전부 수동, SQL Editor에서 직접 실행)

### 1단계: 중복 탐지 (수동)
서로 다른 API에서 수집된 유사 공고를 대조합니다. `serv_nm`의 트라이그램 유사도가
0.4 이상이면 중복 후보로 봅니다.

```sql
select a.source, a.id, a.serv_nm, b.source, b.id, b.serv_nm,
       similarity(a.serv_nm, b.serv_nm) as score
from announcements_all a
join announcements_all b
  on (a.source, a.id) < (b.source, b.id)
where similarity(a.serv_nm, b.serv_nm) > 0.4
order by score desc;
```

중복으로 확인되면 둘 중 하나를 `rejected` + `duplicate_of_source`/`duplicate_of_source_id`로
대표 공고를 지정합니다.

### 2단계: 분류값 검증 (수동)
`raw_data`(원문)를 직접 읽고 `classify.ts`가 뽑아낸 값이 맞는지 확인합니다. 특히:

- `mentions_care_leaver`가 실제 내용과 일치하는가?
- `requires_enrolled`/`requires_no_home`/`requires_basic_livelihood`/`requires_already_ended` —
  키워드만 보고 판단한 값이라 오탐이 있을 수 있음 (예: "무주택자 우대"처럼 필수 요건이
  아닌데 `requires_no_home = true`로 잡히는 경우)
- 지자체 공고인데 `region_scope`가 전국(null)으로 잘못 분류되지 않았는가?
- `protection_end_types_applicable`은 지금 항상 5종이니 검수 시 본문을 직접 읽고 판단할 것
  (이 컬럼 자체를 고쳐도 화면에는 아직 반영 안 됨 — 0-1 참고)

### 3단계: 최종 검수 상태 업데이트
내용이 정확하고 노출해도 되면 `approved` 유지, 오류·기간만료·중복이면 `rejected`로 변경합니다.

```sql
update announcements_gov24
set review_status = 'rejected', review_note = '신청기한 만료', reviewed_by = '팀원명', reviewed_at = now()
where id = 123;
```

## 4. 조회 쿼리 예시

```sql
-- 승인된 공고만 조회 (사용자 화면에 노출되는 것과 동일한 집합)
select * from announcements_all
where review_status = 'approved';

-- 자립준비청년 관련 승인 공고만
select * from announcements_all
where review_status = 'approved'
  and mentions_care_leaver = true;

-- 특정 프로필(서울 거주, 5년 이내, 미재학)에 맞는 승인 공고 후보
select * from announcements_all
where review_status = 'approved'
  and mentions_care_leaver = true
  and (region_scope is null or region_scope = '서울특별시')
  and (protection_years_limit is null or protection_years_limit >= 5)
  and requires_enrolled = false;
```

⚠️ **SQL Editor에서 실행할 때는 문제 없지만**, 이 `announcements_all` 뷰는 `security_invoker`
옵션이 꺼져 있어서 브라우저에 공개된 anon 키로 직접 REST 조회하면 `review_status` 상관없이
전체 행이 노출됩니다 (개별 테이블은 RLS가 정상 작동해서 `pending`이 안 보이는데, 뷰만 새어나감 —
실제 확인함). 지금은 신규 공고가 바로 `approved`로 들어가서 당장 노출될 데이터는 없지만,
`rejected`로 내린 공고의 원문도 이 경로로는 그대로 읽힙니다. 나중에 여유 있을 때 Supabase
SQL Editor에서 아래 한 줄을 실행해 막아두는 걸 권장합니다 (PostgreSQL 15+ 필요):

```sql
alter view announcements_all set (security_invoker = on);
```

## 5. 앱에서 이 데이터를 쓰는 곳

- [app/api/sync-announcements/route.ts](../app/api/sync-announcements/route.ts) — 8개 공공 API를
  조회해서 이 테이블들에 upsert. 기존 공고의 `review_status`는 절대 건드리지 않고,
  신규 공고만 `approved`로 넣음 (검수 UI가 아직 없어서 임시 조치).
- [app/api/announcements/route.ts](../app/api/announcements/route.ts) — `announcements_all`에서
  `review_status = 'approved'`인 것만 골라 `raw_data`를 그대로 반환. 사용자의 자격 진단
  화면(`/` → "내 자격 정밀 진단하기")이 이 API를 호출함.
- [app/data/realMatch.ts](../app/data/realMatch.ts) — 위에서 받은 `raw_data`(=`WelfareItem`)를
  온보딩 답변과 대조해서 화면에 보여줄 자격 판정을 함. **DB의 분류 컬럼이 아니라 원문 텍스트를
  그때그때 다시 분석**하는 구조라, 0-1에서 말한 대로 검수 컬럼 수정이 이 로직에 아직 영향을
  주지 않음.
