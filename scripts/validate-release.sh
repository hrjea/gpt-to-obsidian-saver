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
background = Path("background.js").read_text(encoding="utf-8")
options = Path("options.js").read_text(encoding="utf-8")
options_html = Path("options.html").read_text(encoding="utf-8")
values = {
    "manifest": manifest.get("version"),
    "content": re.search(r'const VERSION = "([^"]+)"', content).group(1),
    "background": re.search(r'const VERSION = "([^"]+)"', background).group(1),
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
if manifest.get("optional_permissions", []) != ["clipboardRead"]:
    print(f"optional permissions mismatch: {manifest.get('optional_permissions')!r}")
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
check_cmd "generated artifact mapping self-test" node tests/generated-markdown-and-multi-html-self-test.js
check_cmd "options path persistence self-test" node tests/options-path-settings-self-test.js
check_cmd "background clipboard permission self-test" node tests/background-clipboard-permission-self-test.js
check_cmd "Visualize share reference self-test" node tests/visualize-share-reference-self-test.js

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
check_cmd "release validation script syntax" bash -n scripts/validate-release.sh
check_cmd "release package script syntax" bash -n scripts/package-release.sh

if command -v pwsh >/dev/null 2>&1; then
  check_cmd "Windows PowerShell syntax" pwsh -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw 'installers/windows-install.ps1')) | Out-Null; [scriptblock]::Create((Get-Content -Raw 'installers/windows-uninstall.ps1')) | Out-Null"
else
  skip "Windows PowerShell validation (pwsh unavailable)"
fi

required_files=(
  .github/ISSUE_TEMPLATE/bug_report.yml .github/ISSUE_TEMPLATE/feature_request.yml
  .github/ISSUE_TEMPLATE/config.yml .github/PULL_REQUEST_TEMPLATE.md .gitignore
  CHANGELOG.md CONTRIBUTING.md LICENSE README.md README.ko.md RELEASE_CHECKLIST.md RELEASE_CHECKLIST_v1.5.50.md RELEASE_CHECKLIST_v1.5.52.md SECURITY.md
  _locales/en/messages.json _locales/ko/messages.json
  assets/demo.gif assets/screenshots/01-chatgpt-save-button.png assets/screenshots/03-obsidian-note.png
  assets/screenshots/04-html-attachment.png assets/screenshots/README.md
  background.js content.js manifest.json options.html options.js
  docs/architecture.md docs/github-installation.md docs/manual-smoke-test.md docs/manual-smoke-test-v1.5.50.md
  docs/native-messaging.md docs/permissions.md docs/privacy.md docs/privacy.ko.md docs/release.md docs/troubleshooting.md
  icons/icon16.png icons/icon48.png icons/icon128.png
  installers/macos-install.sh installers/macos-uninstall.sh installers/windows-install.ps1 installers/windows-uninstall.ps1
  native-host/native-open-obsidian.py native-host/native-open-obsidian.sh native-host/native-open-obsidian.cmd
  native-host/com.gpt_obsidian_saver.open_direct.json.template
  scripts/package-release.sh scripts/validate-release.sh
  tests/background-clipboard-permission-self-test.js tests/generated-markdown-and-multi-html-self-test.js
  tests/options-path-settings-self-test.js tests/previous-qa-html-learning-self-test.js tests/visualize-share-reference-self-test.js
)

missing=0
for file in "${required_files[@]}"; do
  if [ ! -e "$file" ]; then
    printf '  missing %s\n' "$file"
    missing=1
  fi
done
if [ "$missing" -eq 0 ]; then pass "required public files"; else fail "required public files"; fi

inventory_diff="$(comm -3 \
  <(printf '%s\n' "${required_files[@]}" | sort -u) \
  <({ git ls-files; git ls-files --others --exclude-standard; } | sort -u))"
if [ -z "$inventory_diff" ]; then
  pass "exact public file allowlist"
else
  fail "exact public file allowlist"
  printf '%s\n' "$inventory_diff" | sed 's/^/  /'
fi

# The exact inventory above is the in-tree package boundary. Export-only names are
# reviewed outside this public tree so the validator cannot disclose or exempt them.

if python3 - <<'PY' >/tmp/gpt_obsidian_markdown_links.out 2>&1
from pathlib import Path
import re
import sys

errors = []
for path in sorted(Path(".").rglob("*.md")):
    if any(part in {".git", ".worktrees", "dist"} for part in path.parts):
        continue
    text = path.read_text(encoding="utf-8")
    scan_text = re.sub(r"```.*?```", lambda match: "\n" * match.group(0).count("\n"), text, flags=re.S)
    for match in re.finditer(r"(?<!!)\[[^\]]*\]\(([^)]+)\)", scan_text):
        raw_target = match.group(1).strip()
        if raw_target.startswith("<") and raw_target.endswith(">"):
            raw_target = raw_target[1:-1]
        target = raw_target.split("#", 1)[0]
        if not target or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", target):
            continue
        target = target.split(" ", 1)[0]
        resolved = (path.parent / target).resolve()
        if not resolved.exists():
            line = scan_text.count("\n", 0, match.start()) + 1
            errors.append(f"{path}:{line}: missing local Markdown target {raw_target}")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print("local Markdown links ok")
PY
then
  pass "local Markdown link targets"
else
  fail "local Markdown link targets"
  sed 's/^/  /' /tmp/gpt_obsidian_markdown_links.out
fi

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

scan_private_identifiers() {
python3 - <<'PY'
from pathlib import Path
import re

excluded_dirs = {".git", ".worktrees", "dist", "smoke-test-artifacts"}
excluded_suffixes = {".png", ".gif"}
placeholder_users = {"example", "me", "test", "user", "username", "you"}
conversation_url_pattern = re.compile(r"https://(?:chatgpt|chat\.openai)\.com/c/(?P<token>[^/?#\s\"'<>`]+)")
share_url_pattern = re.compile(r"https://chatgpt\.com/(?:s|share)/(?P<token>[^/?#\s\"'<>`]+)")
mac_user_path_pattern = re.compile(r"(?<![A-Za-z0-9])/(?:Users|home)/(?P<user>[A-Za-z0-9._-]+)")
windows_user_path_pattern = re.compile(r"(?i)(?:[A-Z]:)?\\+(?:Users)\\+(?P<user>[A-Za-z0-9._-]+)")
chrome_extension_id_pattern = re.compile(r"(?<![a-p])[a-p]{32}(?![a-p])")

def should_report_conversation_token(token, is_test_fixture):
    if is_test_fixture and token.startswith("synthetic-"):
        return False
    return True

def should_report_share_token(token, is_test_fixture):
    if is_test_fixture and token.startswith("synthetic-"):
        return False
    return True

assert should_report_conversation_token("private-conversation-token", False)
assert should_report_conversation_token("ordinary-test-token", True)
assert not should_report_conversation_token("synthetic-conversation", True)
assert should_report_conversation_token("00000000-0000-4000-8000-000000000000", True)
assert should_report_conversation_token("123e4567-e89b-12d3-a456-426614174000", True)
assert should_report_share_token("arbitrary-private-share-token", False)
assert should_report_share_token("ordinary-test-token", True)
assert not should_report_share_token("synthetic-share", True)
assert should_report_share_token("...", False)
assert should_report_share_token("...", True)
assert should_report_share_token("…", False)
assert should_report_share_token("…", True)
assert should_report_share_token("00000000-0000-4000-8000-000000000000", True)
assert should_report_share_token("123e4567-e89b-12d3-a456-426614174000", True)
assert should_report_share_token("t_" + "f" * 32, True)

for path in sorted(Path(".").rglob("*")):
    if not path.is_file() or path.suffix.lower() in excluded_suffixes:
        continue
    if any(part in excluded_dirs for part in path.parts):
        continue
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        continue
    is_test_fixture = path.parts and path.parts[0] == "tests"
    for line_number, line in enumerate(lines, 1):
        for pattern in (mac_user_path_pattern, windows_user_path_pattern):
            for match in pattern.finditer(line):
                if match.group("user").lower() not in placeholder_users:
                    print(f"{path}:{line_number}:[redacted private user path]")
        if chrome_extension_id_pattern.search(line):
            print(f"{path}:{line_number}:[redacted Chrome extension id]")
        for match in conversation_url_pattern.finditer(line):
            token = match.group("token")
            if should_report_conversation_token(token, is_test_fixture):
                print(f"{path}:{line_number}:[redacted ChatGPT conversation URL]")
        for match in share_url_pattern.finditer(line):
            token = match.group("token")
            if should_report_share_token(token, is_test_fixture):
                print(f"{path}:{line_number}:[redacted ChatGPT share URL]")
PY
}

forbidden_found=0
while IFS= read -r line; do
  printf '  %s\n' "$line"
  forbidden_found=1
done < <(scan_private_identifiers | sort -u)
if [ "$forbidden_found" -eq 0 ]; then pass "forbidden private strings"; else fail "forbidden private strings"; fi

artifact_found=0
while IFS= read -r line; do
  printf '  %s\n' "$line"
  artifact_found=1
done < <(find . \
  \( -path './.git' -o -path './.worktrees' -o -path './dist' \) -prune -o \
  \( -name '.DS_Store' -o -name '__pycache__' -o -name '*.pyc' -o -name '*.log' -o -path './smoke-test-artifacts*' -o -path './screenshots-private*' \) -print | sort)
if [ "$artifact_found" -eq 0 ]; then pass "no generated logs/caches/test artifacts"; else fail "no generated logs/caches/test artifacts"; fi

if [ "$failures" -eq 0 ]; then
  printf 'PASS release validation complete\n'
else
  printf 'FAIL release validation failed with %s issue(s)\n' "$failures"
  exit 1
fi
