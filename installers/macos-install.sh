#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gpt_obsidian_saver.open_direct"
BROWSER="chrome"
EXTENSION_ID=""

usage() {
  cat <<USAGE
Usage: $0 --extension-id <id> [--browser chrome]

Installs the GPT -> Obsidian Saver native host for Google Chrome on macOS.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extension-id)
      if [[ $# -lt 2 ]]; then
        echo "Error: --extension-id requires a value." >&2
        exit 1
      fi
      EXTENSION_ID="$2"
      shift 2
      ;;
    --browser)
      if [[ $# -lt 2 ]]; then
        echo "Error: --browser requires a value." >&2
        exit 1
      fi
      BROWSER="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$BROWSER" != "chrome" ]]; then
  echo "Error: only --browser chrome is supported in this release." >&2
  exit 1
fi

if [[ -z "$EXTENSION_ID" ]]; then
  echo "Error: --extension-id is required." >&2
  usage >&2
  exit 1
fi

if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Error: invalid Chrome extension ID: $EXTENSION_ID" >&2
  echo "Expected 32 lowercase characters in the range a-p." >&2
  exit 1
fi

PYTHON_BIN="$(command -v python3 || true)"
if [[ -z "$PYTHON_BIN" ]]; then
  echo "Error: python3 was not found. Install Python 3, then rerun this installer." >&2
  exit 1
fi
if [[ "$PYTHON_BIN" != /* || ! -x "$PYTHON_BIN" ]]; then
  echo "Error: python3 path is not an executable absolute path: $PYTHON_BIN" >&2
  exit 1
fi
if ! "$PYTHON_BIN" --version >/dev/null 2>&1; then
  echo "Error: python3 failed to run: $PYTHON_BIN" >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/native-host"
SOURCE_PY="$SOURCE_DIR/native-open-obsidian.py"
TEMPLATE="$SOURCE_DIR/${HOST_NAME}.json.template"

if [[ ! -f "$SOURCE_PY" || ! -f "$TEMPLATE" ]]; then
  echo "Error: native-host source files are missing from $SOURCE_DIR." >&2
  exit 1
fi

INSTALL_DIR="$HOME/Library/Application Support/GPTObsidianSaver/native-host"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/${HOST_NAME}.json"
HOST_PATH="$INSTALL_DIR/native-open-obsidian.sh"

mkdir -p "$INSTALL_DIR" "$MANIFEST_DIR"
install -m 0644 "$SOURCE_PY" "$INSTALL_DIR/native-open-obsidian.py"

# Chrome's GUI native-messaging environment can have a smaller PATH than an
# interactive shell. Generate the installed wrapper with the absolute Python
# binary discovered during install, and log wrapper startup details to a file
# without writing anything except the native-messaging protocol to stdout.
cat > "$HOST_PATH" <<SH
#!/bin/sh
LOG_DIR="\$HOME/Library/Logs/GPTObsidianSaver"
LOG_FILE="\$LOG_DIR/native-wrapper.log"
SCRIPT_DIR="\$(CDPATH= cd -- "\$(dirname -- "\$0")" && pwd)"
PYTHON_BIN="$PYTHON_BIN"
HELPER_PATH="\$SCRIPT_DIR/native-open-obsidian.py"

log_line() {
  mkdir -p "\$LOG_DIR" 2>/dev/null || true
  printf '[%s] %s\\n' "\$(date '+%Y-%m-%dT%H:%M:%S%z')" "\$1" >> "\$LOG_FILE" 2>/dev/null || true
}

log_line "wrapper start"
log_line "PATH=\$PATH"
log_line "SCRIPT_DIR=\$SCRIPT_DIR"
log_line "PYTHON_BIN=\$PYTHON_BIN"
log_line "HELPER_PATH=\$HELPER_PATH"
if [ -x "\$PYTHON_BIN" ]; then
  log_line "PYTHON_BIN executable=yes"
else
  log_line "PYTHON_BIN executable=no"
fi
if [ -f "\$HELPER_PATH" ]; then
  log_line "helper exists=yes"
else
  log_line "helper exists=no"
fi

exec "\$PYTHON_BIN" "\$HELPER_PATH" "\$@"
SH
chmod 0755 "$HOST_PATH"

"$PYTHON_BIN" - "$TEMPLATE" "$MANIFEST_PATH" "$HOST_PATH" "$EXTENSION_ID" <<'PY'
import json
import sys
from pathlib import Path

template_path, manifest_path, host_path, extension_id = sys.argv[1:]
text = Path(template_path).read_text(encoding="utf-8")
text = text.replace("__HOST_PATH__", host_path)
text = text.replace("__EXTENSION_ID__", extension_id)
json.loads(text)
Path(manifest_path).write_text(text + "\n", encoding="utf-8")
PY

echo "GPT -> Obsidian Saver native host installed."
echo "Helper: $HOST_PATH"
echo "Native host manifest: $MANIFEST_PATH"
echo "Extension ID: $EXTENSION_ID"
