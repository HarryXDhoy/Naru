# Naru

개인의 모델, 대화, 작업, 스킬을 한곳에서 다루는 macOS 데스크톱 AI 하네스입니다. ChatGPT·Claude·OpenRouter 계정과 로컬·클라우드 모델 서버를 연결합니다. Gemini·GitHub Copilot CLI 계정 실행은 현재 일시 중지 중입니다. 화면은 Defined 스타일의 헤어라인 카드와 컬러 하프톤을 사용하고, ego(lite) 움직임과 [도트 패턴 규칙](docs/DOT-PATTERN.md)을 적용합니다.

## 다운로드

[GitHub Releases](https://github.com/HarryXDhoy/Naru/releases)에서 `Naru-macOS-Apple-Silicon.zip`을 받아 압축을 풀고 Naru.app을 실행하세요. Apple Silicon Mac 전용 빌드입니다. Python 3.10 이상은 따로 설치해야 하며 ChatGPT 계정을 사용하려면 공식 Codex CLI 설치와 로그인이 필요합니다. 로컬 모델은 Ollama 또는 LM Studio를 별도로 실행해야 합니다. 각자의 계정과 키로 연결하며 인증 정보는 배포 파일에 포함되지 않습니다.

설치한 앱은 새 GitHub 릴리스를 자동으로 확인하고 내려받습니다. 업데이트가 준비되면 설정에서 다시 시작해 적용할 수 있으며, 실행 중인 작업이 있을 때는 적용을 기다립니다. GitHub 릴리스의 SHA-256 무결성을 확인하지만 Apple 서명 검증은 제공하지 않습니다.

이 빌드는 Apple 개발자 서명과 공증을 받지 않아 macOS에서 실행을 차단하거나 경고할 수 있습니다. 다른 Mac에서의 동작은 아직 검증하지 않았습니다. Intel Mac과 Windows용 빌드는 제공하지 않습니다.

## 실행

데스크탑 `Naru` 폴더에서 **`Launch Naru.command`**를 더블클릭하거나 **`dist/Naru-darwin-arm64/Naru.app`**을 여세요. GitHub 소스 코드를 받은 경우 빌드된 앱과 의존성은 포함되지 않으므로 먼저 아래 개발 실행 명령을 따르세요.

Python 3.10 이상과 표준 라이브러리 `sqlite3`를 사용합니다. Homebrew Python을 먼저 찾고, `/usr/local/bin/python3`, `/usr/bin/python3`, PATH 순서로 확인합니다. Python은 앱에 포함하지 않았습니다.

개발 실행:

```sh
npm ci
npm start          # Electron 앱
npm run web        # 브라우저용: http://127.0.0.1:4317
```

## 계정으로 연결

**모델** 화면의 *계정으로 연결*에서 로그인합니다. Naru는 토큰이나 인증 파일을 읽지 않고, 각 회사의 공식 CLI 또는 공식 OAuth에 로그인을 맡깁니다.

| 계정 | 방식 | 필요한 것 |
| --- | --- | --- |
| ChatGPT | 공식 Codex CLI 로그인 | `npm install -g @openai/codex` |
| Claude | 공식 Claude Code CLI 로그인 (Pro·Max 구독) | `npm install -g @anthropic-ai/claude-code` |
| Gemini | CLI 계정 실행 일시 중지; Gemini API 연결 사용 | API 키 |
| GitHub Copilot | CLI 계정 실행 일시 중지 | 격리 검증 필요 |
| OpenRouter | OAuth PKCE. 발급된 키는 macOS 키체인에 저장 | 없음 |

- CLI가 없으면 *설치 명령 복사* 버튼이 나옵니다. 로그인 버튼은 터미널이나 브라우저에서 공식 로그인을 시작하고, 끝나면 Naru가 자동으로 확인합니다.
- 계정 연결의 대화 모드는 CLI의 도구·MCP·세션 저장을 끄고 답만 받습니다. 에이전트 모드에서 CLI는 도구 *계획*만 내고, 파일 쓰기·수정·명령은 Naru의 승인 흐름을 거쳐 Naru가 실행합니다.
- Claude Code가 `ANTHROPIC_API_KEY`를 보고 있으면 구독 대신 API 과금이 될 수 있어, Naru는 이 변수를 CLI에 넘기지 않습니다.
- Gemini·Copilot CLI 계정 실행은 CLI 자체의 도구와 MCP가 Naru 승인 흐름 밖에서 실행되는 것을 확실히 차단할 수 없어 일시 중지했습니다. Gemini는 API 연결을 사용할 수 있습니다. Claude CLI는 안전 모드를 사용하며 관리자 정책으로 강제된 훅은 예외일 수 있습니다.
- 사용할 수 있는 모델과 사용량 한도는 각 계정의 요금제를 따릅니다.
- Kimi Code는 비대화형 실행이 도구를 승인 없이 실행하는 구조라 계정 연결에 넣지 않았습니다. API 키로는 OpenAI 호환 연결에서 쓸 수 있습니다.

## API와 로컬 서버

| 형식 | 연결할 수 있는 서버 |
| --- | --- |
| OpenAI Responses | Responses API를 제공하는 서버 |
| OpenAI 호환 Chat Completions | OpenAI 호환 API, LM Studio, vLLM, OpenRouter 키 등 |
| Ollama | Ollama `/api/chat` |
| Anthropic | Claude Messages API |
| Gemini | Gemini GenerateContent API |

로컬 기본 주소는 Ollama `http://127.0.0.1:11434`, LM Studio `http://127.0.0.1:1234/v1`입니다. 로컬 서버와 모델은 사용자가 따로 실행해야 합니다. 도구 호출을 지원하지 않는 모델은 연결 편집에서 *에이전트 도구 쓰기*를 끄세요.

## 작업 방식

- **대화**: 파일이나 명령을 건드리지 않습니다.
- **이미지 만들기**: 입력창에서 이미지 만들기를 선택한 후 ChatGPT 계정 또는 OpenRouter 이미지 모델과 설명을 고르면 새 이미지를 생성합니다. ChatGPT 사용량이나 OpenRouter 요금이 발생할 수 있고, 중지 후에도 제공자의 요청이 처리될 수 있습니다. 이미지는 대화에서 확인하거나 내려받을 수 있습니다. 첨부 이미지를 편집하는 기능은 아직 지원하지 않습니다.
- **작업 흐름**: 자주 쓰는 지침을 이름과 작업 방식으로 저장해 두고 실행하세요. 선택된 모델로 새 대화가 시작되며, 기존 도구 승인 설정과 모델 사용량이 적용됩니다.
- **메시지 대기열**: 작업 중에도 메시지를 보내면 대기열에 저장되고, 현재 작업이 완료되면 입력한 순서대로 실행됩니다. 대기 메시지는 수정하거나 삭제할 수 있습니다. 작업이 실패·중지되거나 앱이 다시 시작되면 대기열이 일시정지되며, 확인 후 **계속**을 눌러 재개합니다. 메시지에 선택한 모델과 스킬이 유지되고, 도구 권한은 대기 중 더 제한적으로 바뀌었다면 그 설정을 따릅니다.
- 모델 선택 메뉴는 지원되는 API 서버와 Codex에서 모델 목록을 자동으로 불러오며, 제공자 이름이나 모델 ID로 검색할 수 있습니다. Claude CLI는 자동 계정별 목록 대신 기본 모델 목록 또는 직접 입력을 사용합니다. 새로고침으로 다시 탐색할 수 있고, 연결되지 않은 로컬 서버는 상태를 표시합니다. ChatGPT 목록은 Codex 카탈로그이며 계정의 실제 모델 사용 권한은 요청 결과로 확인됩니다.
- 에이전트 실행 시 작업 폴더 루트의 `AGENTS.md`, `CLAUDE.md`, `.hermes.md`, `.cursorrules`가 있으면 각 8KB 이하 내용을 프로젝트 지침으로 연결된 모델 제공자에 전달합니다. 일반 대화에서는 읽지 않으며 활동에 사용된 파일 이름이 표시됩니다.
- 에이전트는 작업 목록을 기록하고 이전 대화의 제한된 발췌를 검색할 수 있습니다. 검색 결과는 현재 모델 제공자에게 전달됩니다.
- **스킬**: 설치된 스킬을 검색하거나 `SKILL.md`가 있는 폴더를 직접 연결하세요. 입력창에서 선택하면 지침이 전송되며, 에이전트가 등록된 활성 스킬을 작업 중 불러올 수도 있습니다. 선택하거나 승인한 스킬 폴더의 텍스트 참조 파일을 읽고, 설치된 도구는 기존 명령 승인 설정에 따라 실행할 수 있습니다. 지침은 연결할 때 복사되며 원본을 갱신한 뒤에는 삭제하고 다시 연결하세요. 참조 내용과 경로는 모델 제공자에게 전달될 수 있습니다. 스킬을 연결해도 MCP 서버나 외부 도구가 자동 설치·연결되지는 않습니다.
- **대화별 권한**: 입력창의 도구 승인 메뉴에서 대화마다 기본 설정 따르기, 매번 승인, 자동 승인, 전체 접근을 고를 수 있습니다. 변경은 새 작업부터 적용됩니다. 대기열은 등록 시점과 실행 시점 중 더 제한적인 권한을 사용하고, 재개하는 작업은 기존 권한을 유지합니다.
- **에이전트**: `list_files`, `read_file`, `search_files`, `git_status`, `git_diff`, `write_file`, `edit_file`, `run_command`, 웹 읽기·검색을 씁니다. 설정의 **도구 승인**에서 매번 승인, 자동 승인, 전체 접근을 선택합니다. 기본값은 매번 승인이고 새 작업부터 변경된 설정이 적용됩니다. 자동 승인은 파일 변경과 터미널 명령을 자동 승인하며 스킬 불러오기, 이전 대화 검색과 Git 변경 조회는 따로 승인합니다. 전체 접근은 모든 도구를 자동 승인하고 파일 도구의 작업 폴더 제한을 해제합니다. 터미널 명령은 선택한 폴더 밖에서도 현재 사용자 권한으로 실행될 수 있습니다.
- 공개 웹 페이지는 검증된 공개 IP에 직접 연결해 읽으며, 프록시가 반드시 필요한 네트워크에서는 실패할 수 있습니다. 브라우저 페이지 읽기는 내부망 리다이렉트·하위 요청을 격리하기 전까지 중지했습니다. Ego Lite 검색은 유지합니다.
- 답 다시 받기, 실행 중지(⌘.), 끊긴 작업 이어서 실행, 대화 이름 바꾸기·삭제·마크다운 내보내기를 지원합니다. 대화 목록에서 휴지통을 눌러 삭제할 수 있으며 생성된 파일은 남습니다.
- 만든 파일은 오른쪽 패널(⌘J)에 모이고 미리보기, Finder에서 보기, 기본 앱으로 열기를 할 수 있습니다. 실행 파일 형식은 기본 앱으로 열지 않습니다.
- ⌘K로 대화 제목과 본문까지 검색합니다. 텍스트 파일과 이미지(PNG, JPEG, WebP, GIF)를 선택하거나 끌어다 놓을 수 있고, 이미지는 붙여넣을 수도 있습니다. 이미지는 한 번에 4개, 총 4 MiB까지 첨부할 수 있습니다. 이미지 이해는 선택한 모델의 지원 여부에 따라 달라집니다. 이미지는 로컬 대화 기록에 저장되고 후속 요청에 포함될 수 있습니다.
- 앱이 뒤에 있을 때 승인 요청과 작업 완료를 macOS 알림으로 알려 줍니다.

## 데이터

```text
~/Desktop/Naru/                              프로젝트 전체
~/Desktop/Naru/workspace/                    기본 에이전트 작업 폴더
~/Desktop/Naru/data/                         대화·실행 기록 (SQLite)
~/OneDrive/Business/Reading & Reports/       보고서 기본 위치
```

- API 키와 OpenRouter 키는 macOS 키체인에만 저장하며 데이터베이스나 화면 응답에 넣지 않습니다.
- 작업 폴더와 보고서 경로는 설정에서 바꿀 수 있습니다. `NARU_PYTHON`, `NARU_DATA_DIR`, `NARU_WORKSPACE` 환경 변수가 데스크톱 기본값을 덮어씁니다.
- 승인된 터미널 명령은 작업 폴더에서 현재 macOS 사용자 권한으로 실행됩니다. Naru의 명령 도구는 OS 샌드박스가 아닙니다.
- 백업은 앱을 끈 뒤 `data/`와 작업 폴더를 함께 복사하세요.

## 개발·검증

```sh
npm test                  # Python 테스트 + 데스크톱 보안 테스트 + UI 렌더링 검사
npm run check:desktop     # Electron 구문과 IPC·URL·파일 열기 경계 검사
npm run package           # dist/Naru-darwin-arm64/Naru.app 빌드
python3 scripts/make-icon.py   # AppKit과 iconutil로 앱 아이콘 다시 만들기 (macOS)
```

Electron 45.1.0, Python 표준 라이브러리, 번들한 Mona Sans 글꼴(SIL OFL, `public/fonts/OFL.txt`)을 씁니다. 렌더러에는 Node.js 권한이 없고, 서버는 `127.0.0.1`에만 열립니다. 공개된 개발 빌드이며 Apple 개발자 서명과 공증을 받지 않았습니다.

## 구성

```text
server/      로컬 API, SQLite, 도구 실행, 모델 어댑터(providers.py), 계정 CLI 연결(accounts.py)
public/      데스크톱 UI (ego(lite) 토큰, HalftoneField WebGL 첫 화면)
desktop/     Electron 실행부, 제한된 IPC, 앱 아이콘
scripts/     패키징과 아이콘 생성
tests/       기능·안전·UI 검증
docs/        API 계약과 검증 기록
```

## 참고 문서

- [Codex 로그인](https://learn.chatgpt.com/docs/auth)
- [Claude Code 헤드리스 실행](https://docs.claude.com/en/docs/claude-code/headless)
- [Gemini CLI 인증](https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.md)
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)
- [OpenRouter OAuth PKCE](https://openrouter.ai/docs/use-cases/oauth-pkce)
- [Ollama Chat API](https://docs.ollama.com/api/chat)
- [Electron 보안](https://www.electronjs.org/docs/latest/tutorial/security)

## Hermes 기능 현황

[Hermes 기능 비교와 미지원 항목](docs/HERMES-COMPATIBILITY.md)을 참조하세요. Hermes 전체 기능은 아직 Naru에 통합되지 않았습니다.
