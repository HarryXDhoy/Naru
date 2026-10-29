# Naru implementation contract (0.2.0)

Local desktop harness. Python 3 stdlib HTTP backend + SQLite (JSON documents, json_extract indexes); vanilla JS/CSS UI; Electron shell. Backend binds 127.0.0.1; static UI and JSON API share one origin. Mutating requests carry X-Naru-Token from GET /api/state; Host and Origin are checked, CORS is off. Electron renderer is isolated, sandboxed, without Node.

JSON responses; errors {error:string}. Dates ISO strings. snake_case fields.

## State and settings
GET /api/state -> {providers,sessions,settings,skills,memories,accounts|null,oauth,active:{session_id:run_status},version,csrf_token,rev}  (oauth = legacy copy of the codex account)
- settings {workspace,report_directory,max_steps,max_output_tokens,system_prompt}; POST /api/settings with any subset -> settings.
- accounts is the cached account map (see below) or null until the first background check finishes.
- rev increases on every write; clients use it for cheap change detection.
GET /api/health -> {ok:true,version}. GET /api/search?q= -> {results:[{session_id,title,snippet}]} over titles and message text.

## Providers
Provider {id,name,kind,base_url,model,has_key,tools_enabled,account?}. kind codex|claude_code|gemini_cli|copilot_cli|responses|openai|anthropic|gemini|ollama. api_key is never returned.
POST /api/providers {id?,name,kind,base_url,model,api_key?,clear_key?,tools_enabled} -> provider (blank api_key keeps the stored key). DELETE /api/providers/:id.
POST /api/providers/:id/test -> {ok,models,message} (no paid inference). GET /api/providers/:id/models -> {models}.

## Accounts (sign-in providers)
GET /api/accounts[?refresh=1] -> {codex,claude_code,gemini_cli,copilot_cli,openrouter}: each {available,authenticated,message,install?,execution_blocked?}.
POST /api/accounts/:kind/login -> {started:true, terminal?:true, url?}. CLI kinds open the official login (Terminal or browser); openrouter returns the OAuth PKCE url (S256, state, 15-minute expiry).
GET /oauth/openrouter/callback?code&state -> small HTML page; exchanges the code at openrouter.ai/api/v1/auth/keys, stores the key in Keychain, creates provider {account:'openrouter',kind:'openai'}.
POST /api/accounts/:kind/connect -> provider for that account (created on first use).
Legacy: GET /api/oauth/status, POST /api/oauth/login map to the codex account.
Rules: never read CLI token files; delegate login and inference to official CLIs; chat mode runs CLIs with tools, MCP and session persistence disabled in a scratch directory; ANTHROPIC_API_KEY is removed from the Claude CLI environment; in agent mode a CLI returns a JSON plan whose tool calls are validated against Naru's tool list and executed by Naru with approvals.

## Sessions and runs
Session {id,title,provider_id,model,mode:'chat'|'agent',created_at,updated_at}.
POST /api/sessions {title?,provider_id?,model?,mode?} -> session. PATCH /api/sessions/:id {title?,provider_id?,model?,mode?}. DELETE /api/sessions/:id (rejected while a run is active).
GET /api/sessions/:id -> {session,messages,runs,events,approvals,artifacts,live,rev}. live = {run_id,status,text} for the active run's streamed text.
GET /api/sessions/:id/live -> {rev,run_id,status,text}: cheap poll (~280 ms) while a run is active; the client reloads the full view when status or rev changes.
POST /api/sessions/:id/messages {content,provider_id?,model?,mode?,skill_ids?} -> {run_id}.
POST /api/sessions/:id/regenerate {provider_id?,model?,mode?,skill_ids?} -> {run_id}: replaces the last assistant answer without adding a user message.
GET /api/sessions/:id/export -> Markdown download.
Run {id,session_id,provider_id,model,status,started_at,finished_at,error,usage,auto_approve?}; status running|awaiting_approval|completed|failed|cancelled|interrupted.
POST /api/runs/:id/cancel; POST /api/runs/:id/resume -> {run_id}; GET /api/runs/:id -> {run,events,approvals}.
Event {id,run_id,type,data,created_at}; type status|note|delta|tool_call|tool_result|usage|error. Streamed text is buffered in memory and written as coalesced delta events, not one row per token.

## Message queue
POST /api/sessions/:id/queue enqueues a message with its provider, model, mode, selected skills and settings; PATCH or DELETE /api/sessions/:id/queue/:queue_id edits or removes it. The session view includes the queue and its pause state. Entries are dispatched in order after a successful run, and remain paused after failure, cancellation or restart until POST /api/sessions/:id/queue/resume. Dispatch uses the more restrictive access mode of the saved and current settings.

## Tools and approvals
Tools: load_skill, read_skill_file, list_files, read_file, search_files, git_status, git_diff, write_file (overwrite only when asked), edit_file (exact unique old_text, atomic, keeps file mode), run_command, fetch_url, browser_search. browser_read is disabled until browser requests can be isolated from private networks. File tools are restricted to configured workspace or report paths except in full_access mode. Shell commands run as the current OS user without a filesystem sandbox.
Each session may inherit the default access mode or override it with manual, auto_approve, or full_access. New runs snapshot the session effective access; resumed runs keep their prior snapshot. Queued messages use the more restrictive effective access at enqueue and dispatch.
Settings access_mode is manual (default), auto_approve (file changes and commands; skill loading, conversation search and Git diff require approval), or full_access (all tools). Access mode is captured for each new run; resumed pending actions require fresh approval.
Approval {id,run_id,tool,arguments,status,created_at}. POST /api/approvals/:id {decision:'approve'|'approve_all'|'deny'}. approve_all adds the tool to the run's auto_approve list; later calls of that tool in the same run are recorded with data.auto=true.

## Artifacts, skills, memory
Artifact {id,session_id,name,path,size,created_at}. GET /api/artifacts/:id/content -> {name,path,mime,size,text|null}. GET /api/artifacts/:id/download[?inline=1] (inline only for images, sandbox CSP).
GET /api/skills/discover lists local skill metadata; POST /api/skills/import {path} connects a folder containing SKILL.md. POST /api/skills {id?,name,description,instructions,enabled} -> skill; DELETE /api/skills/:id. Selected or approved skill folders expose relative text references through read_skill_file; scripts execute through run_command and its access policy.
POST /api/memories {content} -> memory; DELETE /api/memories/:id. Memory is user-written only and sent as data, not authority.

## Python module interfaces
providers.py: list_models(p), test_provider(p), complete(p,messages,tools,on_delta,cancel,max_tokens=4096) -> {content,tool_calls:[{id,name,arguments}],usage,native?}, codex_status(), start_codex_login(), run_codex(...).
accounts.py: KINDS, SPECS, status(kind), start_login(kind), models(p), test(p), chat(p,messages,on_delta,cancel), complete(p,messages,tools,on_delta,cancel,max_tokens) with the same return shape as providers.complete.

## Desktop bridge (preload `naruDesktop`)
platform, chooseDirectory(), revealPath(path), openPath(path), openExternal(url), setTheme('system'|'light'|'dark'), version(). Every IPC call checks the sender frame against the backend origin. openPath resolves symlinks and opens only document and media types; scripts, apps and other executables are refused. openExternal accepts only http(s) without credentials.

## Interface
ego(lite) Style tokens (grey surfaces, black-alpha text, hairline rings, pill controls, navy→blue-5 primary), Mona Sans bundled locally, Korean-first copy, one HalftoneField WebGL2 scene on the empty chat screen with a CSS fallback and reduced-motion still frame. Status uses badges (실행 중, 확인 필요, 연결됨, 로그인 필요, 설치 필요). No decorative captions, eyebrows or keyboard hints in the layout; shortcuts live in tooltips.

Dotted texture tokens and usage rules: [DOT-PATTERN.md](DOT-PATTERN.md).

`git_status` and `git_diff` inspect the workspace Git root; `git_diff` requires fresh approval before changes reach the model.
