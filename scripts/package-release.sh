#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

./scripts/validate-release.sh

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1 || ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "Release packaging requires a Git worktree with a committed HEAD" >&2
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=all -- .)" ]; then
  echo "Release packaging requires a clean committed worktree" >&2
  exit 1
fi

VERSION="$(python3 - <<'PY'
import json
from pathlib import Path
print(json.loads(Path("manifest.json").read_text(encoding="utf-8"))["version"])
PY
)"

DIST="$ROOT/dist"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rm -rf "$DIST"
mkdir -p "$DIST"

copy_items() {
  local target="$1"
  shift
  local pkg="$TMP/$target"
  rm -rf "$pkg"
  mkdir -p "$pkg"
  for item in "$@"; do
    mkdir -p "$pkg/$(dirname "$item")"
    cp -R "$ROOT/$item" "$pkg/$item"
  done
  (cd "$pkg" && zip -qr "$DIST/$target" .)
}

copy_items "gpt-to-obsidian-saver-v${VERSION}-unpacked-extension.zip" \
  manifest.json background.js content.js options.html options.js \
  _locales/en/messages.json \
  _locales/ko/messages.json \
  icons/icon16.png \
  icons/icon48.png \
  icons/icon128.png

copy_items "gpt-to-obsidian-saver-v${VERSION}-native-host-macos.zip" \
  native-host/native-open-obsidian.py \
  native-host/native-open-obsidian.sh \
  native-host/com.gpt_obsidian_saver.open_direct.json.template \
  installers/macos-install.sh \
  installers/macos-uninstall.sh \
  docs/github-installation.md \
  docs/native-messaging.md \
  docs/troubleshooting.md \
  LICENSE

copy_items "gpt-to-obsidian-saver-v${VERSION}-native-host-windows-experimental.zip" \
  native-host/native-open-obsidian.py \
  native-host/native-open-obsidian.cmd \
  native-host/com.gpt_obsidian_saver.open_direct.json.template \
  installers/windows-install.ps1 \
  installers/windows-uninstall.ps1 \
  docs/github-installation.md \
  docs/native-messaging.md \
  docs/troubleshooting.md \
  LICENSE

git archive --format=zip --output="$DIST/gpt-to-obsidian-saver-v${VERSION}-source.zip" HEAD

inspect_zip() {
  local zipfile="$1"
  local list="$TMP/list.txt"
  unzip -Z1 "$zipfile" > "$list"

  if grep -E '(^/|(^|/)\.\.($|/))' "$list" >/dev/null; then
    echo "Archive has unsafe path: $zipfile" >&2
    return 1
  fi
  if grep -E '(^|/)(\.DS_Store|__pycache__|smoke-test-artifacts|screenshots-private)(/|$)|\.pyc$|\.log$' "$list" >/dev/null; then
    echo "Archive contains generated/private artifacts: $zipfile" >&2
    return 1
  fi

  local unpack="$TMP/inspect"
  rm -rf "$unpack"
  mkdir -p "$unpack"
  unzip -q "$zipfile" -d "$unpack"
  if ! python3 - "$unpack" <<'PY'
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
placeholder_users = {"example", "me", "test", "user", "username", "you"}
mac_user_path_pattern = re.compile(r"(?<![A-Za-z0-9])/(?:Users|home)/(?P<user>[A-Za-z0-9._-]+)")
windows_user_path_pattern = re.compile(r"(?i)(?:[A-Z]:)?\\+(?:Users)\\+(?P<user>[A-Za-z0-9._-]+)")
chrome_extension_id_pattern = re.compile(r"(?<![a-p])[a-p]{32}(?![a-p])")

for path in root.rglob("*"):
    if not path.is_file() or path.suffix.lower() in {".png", ".gif"}:
        continue
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        continue
    for pattern in (mac_user_path_pattern, windows_user_path_pattern):
        if any(match.group("user").lower() not in placeholder_users for match in pattern.finditer(text)):
            sys.exit(1)
    if chrome_extension_id_pattern.search(text):
        sys.exit(1)
PY
  then
    echo "Archive contains a private user path or local Chrome extension ID: $zipfile" >&2
    return 1
  fi

  case "$(basename "$zipfile")" in
    *unpacked-extension.zip)
      if ! grep -qx 'manifest.json' "$list"; then
        echo "Extension ZIP does not contain manifest.json at ZIP root" >&2
        return 1
      fi
      ;;
  esac
}

for zipfile in "$DIST"/*.zip; do
  inspect_zip "$zipfile"
done

(cd "$DIST" && shasum -a 256 *.zip > SHA256SUMS.txt)

printf 'Release archives:\n'
for file in "$DIST"/*.zip "$DIST/SHA256SUMS.txt"; do
  [ -e "$file" ] || continue
  size="$(wc -c < "$file" | tr -d ' ')"
  printf '  %s  %s bytes\n' "$(basename "$file")" "$size"
done

printf '\nSHA-256 checksums:\n'
cat "$DIST/SHA256SUMS.txt"
