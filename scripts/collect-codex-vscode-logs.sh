#!/usr/bin/env bash
set -euo pipefail

LOG_ROOT=${VS_CODE_LOG_ROOT:-"$HOME/.config/Code/logs"}
OVERRIDE_DIR=${VS_CODE_LOG_DIR:-""}
PATTERN=${1:-"Unknown MCP notification"}
SHOW_LINES=${SHOW_LINES:-200}

determine_log_dir() {
  if [[ -n "$OVERRIDE_DIR" ]]; then
    if [[ ! -d "$OVERRIDE_DIR" ]]; then
      echo "VS_CODE_LOG_DIR points to a non-directory: $OVERRIDE_DIR" >&2
      exit 1
    fi
    printf '%s\n' "$OVERRIDE_DIR"
    return
  fi

  if [[ ! -d "$LOG_ROOT" ]]; then
    echo "VS Code log root not found: $LOG_ROOT" >&2
    exit 1
  fi

  local latest_dir
  latest_dir=$(find "$LOG_ROOT" -maxdepth 1 -mindepth 1 -type d -name '20*' -printf '%T@ %P\n' \
    | sort -nr | head -n1 | cut -d' ' -f2-)
  if [[ -z "$latest_dir" ]]; then
    echo "No timestamped log directories found in $LOG_ROOT" >&2
    exit 1
  fi
  printf '%s/%s\n' "$LOG_ROOT" "$latest_dir"
}

collect_log() {
  local label=$1
  shift
  local files=("$@")
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "[warn] No $label logs found"
    return
  fi
  for log in "${files[@]}"; do
    echo -e "\n=== $label log: $log ==="
    if command -v rg >/dev/null 2>&1; then
      if ! rg --no-heading --line-number "$PATTERN" "$log"; then
        echo "[info] Pattern '$PATTERN' not found; showing last $SHOW_LINES lines"
        tail -n "$SHOW_LINES" "$log"
      fi
    else
      echo "[warn] rg not installed; showing last $SHOW_LINES lines"
      tail -n "$SHOW_LINES" "$log"
    fi
  done
}

log_dir=$(determine_log_dir)
echo "Using VS Code logs at: $log_dir"

mapfile -t codex_logs < <(find "$log_dir" -type f -path '*/exthost/openai.chatgpt/Codex.log' | sort)
collect_log "Codex" "${codex_logs[@]}"

mapfile -t renderer_logs < <(find "$log_dir" -type f -path '*/renderer.log' | sort)
collect_log "renderer" "${renderer_logs[@]}"
