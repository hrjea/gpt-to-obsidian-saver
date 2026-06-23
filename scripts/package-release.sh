#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

./scripts/validate-release.sh

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
  manifest.json background.js content.js options.html options.js _locales icons

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

if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git rev-parse --verify HEAD >/dev/null 2>&1; then
  git archive --format=zip --output="$DIST/gpt-to-obsidian-saver-v${VERSION}-source.zip" HEAD
else
  echo "SKIP source archive: Git repository with HEAD is required" >&2
fi

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
  local private_user_path="/Users""/jea"
  local private_extension_id="njcdfcpckkjfnmm""hacfnmdppeikkkhif"
  local private_vault_name="Obsidian ""Test Vault"
  if grep -R -n -F "$private_user_path" "$unpack" >/dev/null 2>&1; then
    echo "Archive contains private user path: $zipfile" >&2
    return 1
  fi
  if grep -R -n -F "$private_extension_id" "$unpack" >/dev/null 2>&1; then
    echo "Archive contains local extension ID: $zipfile" >&2
    return 1
  fi
  if grep -R -n -F "$private_vault_name" "$unpack" >/dev/null 2>&1; then
    echo "Archive contains local test vault name: $zipfile" >&2
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
