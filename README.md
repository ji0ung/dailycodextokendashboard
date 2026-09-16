# Codex Daybook

개인용 Codex 작업·생산성 대시보드입니다.

Codex App Server에 연결해 계정 토큰 사용량과 대화 목록을 자동으로 표시하는 개인용 대시보드입니다. 대화별 토큰과 활동 시간은 이 기기의 로컬 Codex 세션 기록에서 보강합니다.

## 실행

Codex CLI가 설치되어 있고 ChatGPT 계정으로 로그인된 상태에서 실행합니다.

```sh
node scripts/serve.mjs
```

브라우저에서 `http://127.0.0.1:4173/`을 여세요. 새로고침 버튼은 App Server의 `account/usage/read`, `thread/list`를 다시 호출하고 로컬 세션 기록도 갱신합니다. 생성된 `data/codex-sessions.json`은 Git에서 제외됩니다.

대화를 선택하면 App Server의 `thread/read`로 저장된 본문을 읽어 마지막 답변 요약과 요청별 여정을 보여줍니다. 진행 메모는 펼쳐서 확인할 수 있습니다.
`대화 보러가기`는 공식 `codex://threads/<thread-id>` 링크로 ChatGPT 데스크톱 앱의 로컬 대화를 엽니다.

작업 대화와 OpenClaw 런타임 대화는 별도 카테고리로 표시합니다. 작업 대화는 첫 요청을 기준으로 `개발`, `리서치·기획`, `콘텐츠`, `취업·커리어`, `학습·실습`, `파일·문서`, `운영·문제해결`, `기타`로 자동 분류하고 목록에서 필터링할 수 있습니다. OpenClaw 대화의 긴 런타임 제목은 `OpenClaw와의 대화`로 줄이고, 오늘 활동 시간과 토큰 상위 대화는 작업 카테고리만 기준으로 집계합니다.

`오늘 TIL 초안`은 오늘의 작업 대화 최대 10개에서 요청 맥락과 마지막 답변의 첫 부분을 모아 편집 가능한 Markdown을 만듭니다. 복사하거나 `.md` 파일로 내려받을 수 있습니다. 공개 전에 내용과 비공개 정보를 확인해야 합니다. [티스토리 Open API가 종료](https://notice.tistory.com/2664)되어 이 앱에서 티스토리로 자동 발행하는 기능은 제공하지 않습니다.

토큰 효율 분석은 최근 작업 대화끼리 비교합니다. `새 토큰 = 입력 토큰 - 캐시 입력 토큰 + 출력 토큰`으로 계산하고, 캐시 재사용률과 요청 1회당 새 토큰을 함께 표시합니다. 캐시율 80% 이상이면서 요청당 새 토큰이 중앙값 이하면 `효율 양호`, 요청당 새 토큰이 중앙값의 1.5배를 넘거나 캐시율이 50% 미만이면 `점검 권장`으로 표시합니다. 작업 난이도와 결과 품질은 자동 판정하지 않습니다. 최적화 안내는 OpenAI의 [모델 가이드](https://developers.openai.com/api/docs/guides/latest-model)와 [프롬프트 캐싱 가이드](https://developers.openai.com/api/docs/guides/prompt-caching)를 기준으로 합니다.

상위 대화에는 로컬 세션에서 확인한 주 사용 모델과 작업별 무료 API 대체 후보를 함께 표시합니다. 복잡한 코딩·에이전트 작업에는 [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/latest-model), 요약·분류·초안 작업에는 [Groq의 GPT-OSS 120B](https://console.groq.com/docs/models), 낮은 빈도의 실험에는 [OpenRouter 무료 라우터](https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground)를 제안합니다. 이는 동급 성능 보장이 아니라 시험 우선순위이며, 무료 한도와 모델 가용성은 각 공급자의 최신 문서를 확인해야 합니다. 현재 추천은 로컬 규칙으로 계산하므로 외부 API로 대화 내용을 전송하지 않습니다.

`오늘 / 이번 주 / 이번 달` 기간을 전환하면 활동 시간, 토큰, 대화 목록, 효율 순위, 대체 모델 추천, AI별 사용 비중이 함께 바뀝니다. AI 사용 비중은 활동 시간 기준으로 Codex 작업과 OpenClaw 런타임 대화를 비교합니다. ChatGPT에는 개인 대화 사용량을 실시간으로 읽는 공식 API가 없으므로 아직 집계하지 않으며, 추후 공식 [ChatGPT 데이터 내보내기](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data)의 `conversations.json` 가져오기를 지원할 수 있습니다.

공식 프로토콜: [Codex App Server](https://developers.openai.com/codex/app-server/). 계정 일별 사용량은 서비스가 제공한 날짜만 표시하며, 대화별 토큰은 계정 API 수치와 별개로 로컬 로그에서 읽습니다.
