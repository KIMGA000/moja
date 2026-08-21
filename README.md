# 모자 (MOJA)

자립준비청년(보호종료아동)을 위한 지원 매칭 서비스. 흩어진 정부 지원 공고를 모아 조건에
맞는 것만 보여주고, 자격 여부를 진단해주고, 또래와 이야기 나눌 수 있는 익명 커뮤니티를
제공합니다. (팀명: 파란만, AX-Ton 해커톤)

- **배포**: https://moja-khaki.vercel.app
- **기술 스택**: Next.js 15(App Router) + React 19 + TypeScript, Supabase(PostgreSQL), Vercel

## 시작하기

```bash
npm install
```

`.env.local.example`을 참고해서 `.env.local`을 직접 만드세요 (공공데이터 API 키, Supabase 키
등 9개 — git에 커밋되지 않으니 팀원마다 각자 준비해야 합니다).

```bash
npm run dev
```

http://localhost:3000 에서 확인합니다.

## 폴더 구성

```
app/
  api/            # 공공데이터 API 조회·동기화, 커뮤니티 CRUD 라우트
  data/           # 온보딩 질문/자격 매칭 로직, 공고 텍스트 분류
  components/     # 온보딩 위저드 + 결과 화면 UI
  community/      # 커뮤니티 화면 (목록/글쓰기/상세)
lib/
  govApis.ts      # 8개 공공 API 공용 fetch/파싱
  supabase.ts     # Supabase 클라이언트
supabase/
  schema.sql      # DB 스키마 (공고 저장·검수용 8테이블 + 커뮤니티 2테이블)
docs/
  handoff-*.md    # 진행 상황 인계 문서 — 새로 합류했다면 가장 최근 파일부터 읽기
  announcement-review-guide.md  # 공고 데이터 검수 가이드
```

## 브랜치

- `main`: 팀 프로젝트 시작 시 받은 스타터 템플릿 원본 (건드리지 않음)
- `dev`: 실제 작업 브랜치. 여기서 계속 개발합니다.

## 더 자세한 내용

지금까지의 진행 상황, 의도적으로 보류한 기능, 다음 할 일은
[docs/handoff-2026-08-21.md](docs/handoff-2026-08-21.md)에 정리되어 있습니다.
