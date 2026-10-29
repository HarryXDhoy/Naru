# 에이전트 기능 비교

2026-10-29 기준 공식 문서와 Naru 소스를 비교했습니다. 비슷한 기능이 있다는 것과 동일한 구현·동작을 제공한다는 것은 다릅니다. 지원하지 않는 기능은 검증 완료로 표시하지 않습니다.

출처: [Hermes 기능 개요](https://hermes-agent.nousresearch.com/docs/user-guide/features/overview), [Hermes 도구](https://hermes-agent.nousresearch.com/docs/user-guide/features/tools), [Claude Code 작업 방식](https://code.claude.com/docs/en/common-workflows), [Claude 체크포인트](https://code.claude.com/docs/en/checkpointing), [Claude 하위 에이전트](https://code.claude.com/docs/en/sub-agents), [Claude MCP](https://code.claude.com/docs/en/mcp), [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Codex worktree](https://learn.chatgpt.com/docs/environments/git-worktrees), [Codex 지시와 대기열](https://learn.chatgpt.com/docs/prompting).

| 기능 | Naru 상태와 범위 |
| --- | --- |
| 모델 선택·로컬 모델 | 여러 계정·API와 Ollama, LM Studio 연결. 모델별 도구·이미지 지원은 다름. |
| 대화·에이전트·계획 | 대화와 도구 실행, 읽기 전용 계획 모드. 계획 모드는 Naru가 허용한 읽기 도구만 사용. |
| 사용자 질문 | 에이전트가 명확한 답이 필요할 때 질문하고 응답을 받아 작업을 계속할 수 있음. |
| 승인·접근 권한 | 대화별 승인, 자동 승인, 전체 접근. 터미널은 OS 샌드박스가 아님. |
| 스킬 | 로컬 SKILL.md 연결·선택 및 승인 후 참조 파일 읽기. 각 제품의 마켓플레이스·플러그인 전체와 같지는 않음. |
| 프로젝트 지침 | 작업 폴더 루트의 AGENTS.md, CLAUDE.md, .hermes.md, SOUL.md, .cursorrules만 읽음. 하위 폴더별 지침은 미지원. |
| 메모리 | 사용자가 저장한 메모리와 승인 기반 이전 대화 검색. 자동 메모리 관리 및 외부 메모리 서비스는 미지원. |
| 파일·명령·검색 | Naru의 파일·명령·Git 조회·공개 웹 읽기·Ego Lite 검색을 지원. 각 제품의 전체 도구 및 브라우저 상호작용은 미지원. |
| 첨부·이미지 | 텍스트 및 이미지 입력, ChatGPT/OpenRouter의 지원 모델을 통한 이미지 생성. 이미지 편집, 문서·음성의 모든 형식은 미지원. |
| 대기열·중지·재개 | 큐, 취소와 기록 기반 재개 지원. 실행 중 추가 지시는 다음 모델 호출에 반영. 이미 시작된 도구는 계속 실행될 수 있으며, 대화/이미지 작업과 승인·질문 대기는 지원하지 않음. |
| 기록·검색·인용·자동 제목 | 로컬 대화 기록, 검색, 인용 답장, 자동 제목. 메시지 시점 대화 분기 지원. 고급 세션 이식은 미지원. |
| 변경 검토·체크포인트 | 승인 화면과 Git diff 조회 제공. 자동 스냅샷, 전체 변경 검토, 선택 복원은 미지원. |
| 하위 에이전트·병렬 작업 | 미지원. Codex Ultra 강도 설정은 하위 에이전트 위임을 제공하지 않음. |
| MCP·플러그인·훅 | 미지원. CLI의 자체 MCP·도구를 임의로 켜지 않으며 Naru 승인 흐름을 사용. |
| 예약 작업·자동화 | 미지원. |
| 컨텍스트 압축·관리 | 최근 메시지의 제한된 범위를 전달. 자동 압축·세부 컨텍스트 사용량 관리는 미지원. |
| @ 참조 | 작업 폴더의 텍스트 파일을 @ 검색·선택해 스냅샷으로 첨부. 폴더·Git diff·URL 참조는 미지원. |
| 음성·전사·TTS·깨우기 | 미지원. |
| 메신저·원격·클라우드 실행 | 미지원. |
| IDE/ACP·외부 API 서버 | 미지원. |
| 자동 제공자 대체·키 풀·배치 | 미지원. |

여기에서 미지원인 항목들은 현재 구현 및 실제 테스트가 필요합니다. 각 제품의 호스팅 서비스, 별도 계정·API, OS 권한 또는 과금 조건까지 Naru가 자동으로 제공하는 것은 아닙니다.
