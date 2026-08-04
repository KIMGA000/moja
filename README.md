# 🦁 CAMPUS AX-TON 스타터 템플릿

멋쟁이사자처럼 **CAMPUS AX-TON** 실습용 시작 폴더입니다.
1회차 개인 연습과 4회차 팀 프로젝트 모두 이 템플릿을 복사해서 시작합니다.

## 폴더 이름 규칙 (중요)

- **1회차 (개인 연습)**: 압축을 푼 폴더 이름을 `my-first-app` 으로 바꿉니다.
- **4회차 (팀 프로젝트)**: 이 템플릿을 **새로** 내려받아 폴더 이름을 팀 프로젝트명으로 바꿉니다.
  1회차 개인 폴더를 재사용하지 않습니다.
- 폴더 이름은 **영어 소문자와 하이픈(-)만** 사용합니다. 예: `banchan-sns`
  한글·공백·대문자가 들어가면 나중에 경로 오류가 생깁니다.

## 시작하기

터미널(Claude Code를 여는 창)에서 순서대로 입력합니다.

```bash
cd my-first-app
```

```bash
npm install
```

```bash
npm run dev
```

브라우저에서 **http://localhost:3000** 을 열어 사자 화면이 보이면 성공입니다.

## 폴더 구성

```
my-first-app/
├── app/
│   ├── page.tsx      ← 첫 화면 (Claude Code가 여기를 수정합니다)
│   ├── layout.tsx
│   └── globals.css
├── package.json
└── README.md
```

## 자주 막히는 지점

| 증상 | 확인할 것 |
|---|---|
| `npm: command not found` | Node.js 설치가 안 된 상태입니다. 브릿지 가이드의 Node.js 설치 단계를 다시 진행하세요. |
| `npm install` 이 멈춰 있음 | 와이파이 상태를 확인하고, 1~2분은 원래 걸립니다. |
| localhost:3000 이 안 열림 | `npm run dev` 를 실행한 터미널 창을 닫지 않았는지 확인하세요. |
| 화면이 이상하게 깨짐 | 터미널에서 `Ctrl+C` 로 서버를 끄고 `npm run dev` 를 다시 실행하세요. |

## 만든 것

- [Next.js](https://nextjs.org) 최소 구성 (화면 1개)
- 데이터 저장이 필요하면 localStorage부터 시작합니다 (5회차에서 배웁니다)
