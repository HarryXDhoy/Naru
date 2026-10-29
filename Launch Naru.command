#!/bin/zsh
set -eu
NARU_PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
NARU_APP_PATH="/Applications/Naru.app"
if [[ ! -d "$NARU_APP_PATH" ]]; then
  NARU_APP_PATH="$NARU_PROJECT_DIR/dist/Naru-darwin-arm64/Naru.app"
fi
if [[ -d "$NARU_APP_PATH" ]]; then
  open "$NARU_APP_PATH"
else
  cd "$NARU_PROJECT_DIR"
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  npm start
fi
