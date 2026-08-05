#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

failures=0

pass() { printf 'PASS %s\n' "$1"; }
skip() { printf 'SKIP %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }

check_cmd() {
  local label="$1"
  shift
  if "$@" >/tmp/gpt_obsidian_validate.out 2>/tmp/gpt_obsidian_validate.err; then
    pass "$label"
  else
    fail "$label"
    sed 's/^/  /' /tmp/gpt_obsidian_validate.err
    sed 's/^/  /' /tmp/gpt_obsidian_validate.out
  fi
}

version_report="$(python3 - <<'PY'
import json, re, sys
from pathlib import Path
manifest = json.loads(Path("manifest.json").read_text(encoding="utf-8"))
content = Path("content.js").read_text(encoding="utf-8")
options = Path("options.js").read_text(encoding="utf-8")
options_html = Path("options.html").read_text(encoding="utf-8")
values = {
    "manifest": manifest.get("version"),
    "content": re.search(r'const VERSION = "([^"]+)"', content).group(1),
    "options_build": re.search(r'const BUILD_VERSION = "([^"]+)"', options).group(1),
    "options_content": re.search(r'const CONTENT_SCRIPT_VERSION = "([^"]+)"', options).group(1),
}
diag = re.search(r'Build version ([0-9.]+).*content script VERSION: ([0-9.]+)', options_html)
if not diag:
    print("missing options diagnostic")
    sys.exit(1)
values["options_html_build"] = diag.group(1)
values["options_html_content"] = diag.group(2)
if len(set(values.values())) != 1:
    print(values)
    sys.exit(1)
print(next(iter(values.values())))
PY
)" && pass "version consistency: $version_report" || { fail "version consistency"; printf '  %s\n' "$version_report"; }

python3 - <<'PY' >/tmp/gpt_obsidian_permissions.out
import json, sys
from pathlib import Path
manifest = json.loads(Path("manifest.json").read_text(encoding="utf-8"))
expected = ["storage", "nativeMessaging", "downloads"]
actual = manifest.get("permissions", [])
if actual != expected:
    print(f"permissions mismatch: {actual!r}")
    sys.exit(1)
expected_hosts = ["https://chat.openai.com/*", "https://chatgpt.com/*"]
if manifest.get("host_permissions", []) != expected_hosts:
    print(f"host permissions mismatch: {manifest.get('host_permissions')!r}")
    sys.exit(1)
print("permissions ok")
PY
if [ $? -eq 0 ]; then pass "manifest permissions"; else fail "manifest permissions"; cat /tmp/gpt_obsidian_permissions.out; fi

for file in content.js background.js options.js; do
  check_cmd "syntax $file" node --check "$file"
done
check_cmd "content behavior self-test" node tests/previous-qa-html-learning-self-test.js

check_cmd "manifest JSON" python3 -m json.tool manifest.json
check_cmd "English locale JSON" python3 -m json.tool _locales/en/messages.json
check_cmd "Korean locale JSON" python3 -m json.tool _locales/ko/messages.json
PYCACHE_TMP="$(mktemp -d)"
if PYTHONPYCACHEPREFIX="$PYCACHE_TMP" python3 -m py_compile native-host/native-open-obsidian.py >/tmp/gpt_obsidian_validate.out 2>/tmp/gpt_obsidian_validate.err; then
  pass "Python compile"
else
  fail "Python compile"
  sed 's/^/  /' /tmp/gpt_obsidian_validate.err
  sed 's/^/  /' /tmp/gpt_obsidian_validate.out
fi
rm -rf "$PYCACHE_TMP"
check_cmd "native helper self-test" python3 native-host/native-open-obsidian.py --self-test
check_cmd "macOS installer syntax" bash -n installers/macos-install.sh
check_cmd "macOS uninstaller syntax" bash -n installers/macos-uninstall.sh

if command -v pwsh >/dev/null 2>&1; then
  check_cmd "Windows PowerShell syntax" pwsh -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw 'installers/windows-install.ps1')) | Out-Null; [scriptblock]::Create((Get-Content -Raw 'installers/windows-uninstall.ps1')) | Out-Null"
else
  skip "Windows PowerShell validation (pwsh unavailable)"
fi

required_files=(
  manifest.json background.js content.js options.html options.js
  README.md README.ko.md LICENSE CHANGELOG.md CONTRIBUTING.md SECURITY.md RELEASE_CHECKLIST.md .gitignore
  docs/architecture.md docs/permissions.md docs/privacy.md docs/privacy.ko.md docs/native-messaging.md
  docs/troubleshooting.md docs/manual-smoke-test.md docs/release.md docs/github-installation.md
  docs/codex-for-oss-application-notes.md assets/screenshots/README.md
  scripts/validate-release.sh scripts/package-release.sh
  tests/previous-qa-html-learning-self-test.js
  .github/ISSUE_TEMPLATE/bug_report.yml .github/ISSUE_TEMPLATE/feature_request.yml
  .github/ISSUE_TEMPLATE/config.yml .github/PULL_REQUEST_TEMPLATE.md
  native-host/native-open-obsidian.py native-host/native-open-obsidian.sh native-host/native-open-obsidian.cmd
  native-host/com.gpt_obsidian_saver.open_direct.json.template
  installers/macos-install.sh installers/macos-uninstall.sh installers/windows-install.ps1 installers/windows-uninstall.ps1
)

missing=0
for file in "${required_files[@]}"; do
  if [ ! -e "$file" ]; then
    printf '  missing %s\n' "$file"
    missing=1
  fi
done
if [ "$missing" -eq 0 ]; then pass "required public files"; else fail "required public files"; fi

python3 - <<'PY' >/tmp/gpt_obsidian_icons.out
import json, sys
from pathlib import Path
manifest = json.loads(Path("manifest.json").read_text(encoding="utf-8"))
paths = set()
for section in ("icons", "action"):
    data = manifest.get(section, {})
    if section == "action":
        data = data.get("default_icon", {})
    if isinstance(data, dict):
        paths.update(data.values())
for required in ["icons/icon16.png", "icons/icon48.png", "icons/icon128.png"]:
    paths.add(required)
missing = [p for p in sorted(paths) if not Path(p).is_file()]
if missing:
    print("missing icons:", missing)
    sys.exit(1)
print("icons ok")
PY
if [ $? -eq 0 ]; then pass "icon files and manifest icon paths"; else fail "icon files and manifest icon paths"; cat /tmp/gpt_obsidian_icons.out; fi

forbidden_found=0
private_user_path="/Users""/jea"
private_vault_name="Obsidian ""Test Vault"
private_extension_id="njcdfcpckkjfnmm""hacfnmdppeikkkhif"
while IFS= read -r line; do
  printf '  %s\n' "$line"
  forbidden_found=1
done < <(
  {
    grep -R -n -F "$private_user_path" . --exclude-dir=.git --exclude-dir=dist --exclude-dir=smoke-test-artifacts --exclude='*.png' --exclude='*.gif' || true
    grep -R -n -F "$private_vault_name" . --exclude-dir=.git --exclude-dir=dist --exclude-dir=smoke-test-artifacts --exclude='*.png' --exclude='*.gif' || true
    grep -R -n -F "$private_extension_id" . --exclude-dir=.git --exclude-dir=dist --exclude-dir=smoke-test-artifacts --exclude='*.png' --exclude='*.gif' || true
    grep -R -n -E 'https://(chatgpt|chat\\.openai)\\.com/c/[A-Za-z0-9_-]+' . --exclude-dir=.git --exclude-dir=dist --exclude-dir=smoke-test-artifacts --exclude='*.png' --exclude='*.gif' || true
  } | sort -u
)
if [ "$forbidden_found" -eq 0 ]; then pass "forbidden private strings"; else fail "forbidden private strings"; fi

artifact_found=0
while IFS= read -r line; do
  printf '  %s\n' "$line"
  artifact_found=1
done < <(find . \
  \( -path './.git' -o -path './dist' \) -prune -o \
  \( -name '.DS_Store' -o -name '__pycache__' -o -name '*.pyc' -o -name '*.log' -o -path './smoke-test-artifacts*' -o -path './screenshots-private*' \) -print | sort)
if [ "$artifact_found" -eq 0 ]; then pass "no generated logs/caches/test artifacts"; else fail "no generated logs/caches/test artifacts"; fi

if [ "$failures" -eq 0 ]; then
  printf 'PASS release validation complete\n'
else
  printf 'FAIL release validation failed with %s issue(s)\n' "$failures"
  exit 1
fi
