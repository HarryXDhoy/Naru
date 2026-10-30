# Hermes 기능 현황

기준: [Hermes Agent 공식 기능 개요](https://hermes-agent.nousresearch.com/docs/user-guide/features/overview)와 [공식 저장소](https://github.com/NousResearch/hermes-agent). Naru는 Hermes를 내장한 제품이 아니며, 아래 표의 미지원 기능은 테스트를 통과한 기능이 아닙니다.

| 기능 | Naru의 현재 상태 |
| --- | --- |
| 모델 제공자, 로컬 서버 | ChatGPT·Claude·Gemini·GitHub Copilot·OpenRouter 계정, OpenAI·Claude·Gemini API, DeepSeek·xAI·Mistral·Groq·Together·Fireworks·Cerebras·Perplexity·Kimi·Z.ai·MiniMax·Qwen·Hugging Face·Nous Portal 프리셋, Ollama·LM Studio·vLLM·llama.cpp·Jan 로컬 서버. 모델과 서버별 도구 지원은 다를 수 있습니다. |
| 파일, 터미널, 웹 검색 | 파일 읽기·검색·변경, 명령 실행, 공개 페이지 읽기, Ego Lite 검색 제공. Hermes의 모든 도구와 실행 환경은 미지원. 브라우저 페이지 읽기는 내부망 접근 격리 전까지 중지했습니다. |
| 승인 및 접근 권한 | 매번 승인, 파일 변경·명령 자동 승인, 전체 접근 중 선택. 전체 접근에서 파일 도구의 폴더 제한이 해제됩니다. 터미널 명령은 모든 모드에서 OS 샌드박스 없이 사용자 권한으로 실행됩니다. |
| 프로젝트 지침 | 에이전트·계획 실행 시 workspace 루트의 AGENTS.md, CLAUDE.md, .hermes.md, SOUL.md, .cursorrules를 제한적으로 읽어 모델에 전달. 하위 폴더 탐색은 미지원. |
| 대화 검색, 작업 계획 | 대화 발췌 검색, 실행별 작업 목록, 읽기 전용 계획과 작업 중 질문 제공. 검색 승인은 접근 설정에 따라 달라집니다. |
| 메모리, 스킬 | 명시적으로 저장하는 메모리와 사용자 스킬, 로컬 스킬 폴더 연결, 선택·승인된 스킬의 참조 파일 읽기와 기존 도구 사용 지원. MCP 서버·외부 도구는 자동 설치되지 않으며 자동 학습, Skills Hub, 외부 메모리 제공자는 미지원. |
| 실행 이력, 중단 및 재개 | Naru 실행 이벤트와 도구 승인 기록, 재개 지원. Hermes 체크포인트/전체 작업 폴더 롤백은 미지원. |
| 문맥 참조 | @로 작업 폴더의 텍스트 파일을 검색·선택해 첨부. 폴더, Git diff, URL 참조는 미지원. |
| 브라우저 | Ego Lite 검색과 공개 URL 읽기를 제공. Hermes의 브라우저 상호작용 및 모든 브라우저 백엔드는 미지원. |
| 예약, 서브에이전트, MCP, 훅 | 미지원. |
| 음성, 이미지 생성·분석, 메신저 연동 | 이미지 입력과 ChatGPT·OpenRouter 지원 모델의 이미지 생성 제공. 음성과 메신저 연동은 미지원. |
| 공급자 자동 대체, 키 풀, 배치, API 서버, IDE/ACP, 원격 실행 환경 | 미지원. |

이 Mac에 Hermes CLI가 설치되어 있어도 Naru와 자동으로 통합되지 않습니다. 기능별 권한 연결과 실제 동작 검증 전에는 완전한 호환을 주장하지 않습니다.
