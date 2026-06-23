#!/usr/bin/env python3
import json
import os
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import sys
import tempfile
from urllib.parse import quote, urlparse


HOST_NAME = "com.gpt_obsidian_saver.open_direct"
ATTACHMENT_MARKER = "%%GPT_OBSIDIAN_ATTACHMENTS%%"
ATTACHMENT_SECTION_MARKERS = [
    f"\n\n## Attachments\n\n{ATTACHMENT_MARKER}",
    f"\n\n## 첨부파일\n\n{ATTACHMENT_MARKER}",
]
MAX_MESSAGE_BYTES = 16 * 1024 * 1024
MAX_ATTACHMENTS = 20
MAX_ATTACHMENT_CHARS = 700_000
MAX_TOTAL_ATTACHMENT_BYTES = 5 * 1024 * 1024


class NativeHostError(Exception):
    pass


def configure_windows_binary_stdio():
    if not sys.platform.startswith("win"):
        return

    import msvcrt

    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


def native_host_log_path():
    if sys.platform.startswith("win"):
        base = os.environ.get("LOCALAPPDATA")
        if base:
            return Path(base) / "GPTObsidianSaver" / "Logs" / "native-host.log"
        return Path.home() / "AppData" / "Local" / "GPTObsidianSaver" / "Logs" / "native-host.log"

    return Path.home() / "Library" / "Logs" / "GPTObsidianSaver" / "native-host.log"


def log(message):
    text = f"[{HOST_NAME}] {message}"
    try:
        print(text, file=sys.stderr)
    except Exception:
        pass

    try:
        log_path = native_host_log_path()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as handle:
            handle.write(text + "\n")
    except Exception:
        pass


def read_native_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        raise NativeHostError("missing message length")
    if len(raw_length) != 4:
        raise NativeHostError("invalid message length header")

    message_length = struct.unpack("<I", raw_length)[0]
    if message_length <= 0:
        raise NativeHostError("empty message payload")
    if message_length > MAX_MESSAGE_BYTES:
        raise NativeHostError("message payload too large")

    payload = sys.stdin.buffer.read(message_length)
    if len(payload) != message_length:
        raise NativeHostError("incomplete message payload")

    try:
        message = json.loads(payload.decode("utf-8"))
    except UnicodeDecodeError as exc:
        raise NativeHostError("message payload is not valid UTF-8") from exc
    except json.JSONDecodeError as exc:
        raise NativeHostError("message payload is not valid JSON") from exc

    if not isinstance(message, dict):
        raise NativeHostError("message payload must be a JSON object")
    return message


def write_native_message(message):
    payload = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(payload)))
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def is_relative_to(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def validate_obsidian_uri(uri):
    if not isinstance(uri, str):
        raise NativeHostError("uri must be a string")

    if uri != uri.strip():
        raise NativeHostError("uri must not contain leading or trailing whitespace")

    text = uri
    if not text:
        raise NativeHostError("uri is required")
    if re.search(r"[\x00-\x20\x7f]", text):
        raise NativeHostError("uri must not contain whitespace or control characters")
    if not text.lower().startswith("obsidian://"):
        raise NativeHostError("only obsidian:// URIs are allowed")

    parsed = urlparse(text)
    if parsed.scheme.lower() != "obsidian":
        raise NativeHostError("only obsidian:// URIs are allowed")
    return text


def open_obsidian_uri(uri):
    safe_uri = validate_obsidian_uri(uri)
    if sys.platform == "darwin":
        subprocess.run(["open", safe_uri], shell=False, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    elif sys.platform.startswith("win"):
        os.startfile(safe_uri)
    else:
        raise NativeHostError("opening Obsidian URI is supported only on macOS and Windows")
    return {"ok": True, "opened": True}


def validate_vault_path(value):
    raw = str(value or "").strip()
    if not raw:
        raise NativeHostError("vaultPath is required for native save-note mode")
    if "\x00" in raw:
        raise NativeHostError("vaultPath must not contain null bytes")

    path = Path(raw).expanduser()
    if not path.is_absolute():
        raise NativeHostError("vaultPath must be an absolute path")

    try:
        resolved = path.resolve(strict=True)
    except FileNotFoundError as exc:
        raise NativeHostError("vaultPath does not exist") from exc

    if not resolved.is_dir():
        raise NativeHostError("vaultPath must be a directory")
    return resolved


def validate_note_relative_path(value):
    raw = str(value or "").strip()
    if not raw:
        raise NativeHostError("filePath is required")
    if "\x00" in raw:
        raise NativeHostError("filePath must not contain null bytes")
    if re.match(r"^[A-Za-z]:[\\/]", raw) or raw.startswith("\\\\") or raw.startswith("//"):
        raise NativeHostError("filePath must be a relative vault-internal path")
    if raw.startswith("/") or Path(raw).is_absolute():
        raise NativeHostError("filePath must be a relative vault-internal path")
    if not raw.lower().endswith(".md"):
        raise NativeHostError("filePath must end with .md")

    path = PurePosixPath(raw.replace("\\", "/"))
    clean_parts = []
    for part in path.parts:
        if part in ("", "."):
            continue
        if part == "..":
            raise NativeHostError("filePath must not contain .. path traversal")
        clean_parts.append(part)

    if not clean_parts:
        raise NativeHostError("filePath must include a file name")
    if clean_parts[-1] in ("", ".", ".."):
        raise NativeHostError("filePath must include a file name")

    return Path(*clean_parts)


def resolve_note_path(vault_path, file_path):
    rel_path = validate_note_relative_path(file_path)
    target = (vault_path / rel_path).resolve()
    if not is_relative_to(target, vault_path):
        raise NativeHostError("resolved note path escapes vaultPath")
    return target


def validate_relative_dir(value):
    raw = str(value or "").strip()
    if "\x00" in raw:
        raise NativeHostError("htmlSaveDir must not contain null bytes")
    if re.match(r"^[A-Za-z]:[\\/]", raw) or raw.startswith("\\\\") or raw.startswith("//"):
        raise NativeHostError("htmlSaveDir must be relative in this context")
    if raw.startswith("/") or Path(raw).is_absolute():
        raise NativeHostError("htmlSaveDir must be relative in this context")

    path = PurePosixPath(raw.replace("\\", "/"))
    clean_parts = []
    for part in path.parts:
        if part in ("", "."):
            continue
        if part == "..":
            raise NativeHostError("htmlSaveDir must not contain .. path traversal")
        clean_parts.append(part)
    return Path(*clean_parts) if clean_parts else Path("Attachments")


def resolve_html_save_dir(value, vault_path):
    raw = str(value or "").strip()
    if not raw:
        target = vault_path / "Attachments"
    else:
        if "\x00" in raw:
            raise NativeHostError("htmlSaveDir must not contain null bytes")
        candidate = Path(raw).expanduser()
        if candidate.is_absolute():
            target = candidate.resolve()
        else:
            target = (vault_path / validate_relative_dir(raw)).resolve()

    if not is_relative_to(target, vault_path):
        raise NativeHostError("htmlSaveDir must resolve inside vaultPath")
    return target


def unique_path(path):
    if not path.exists():
        return path

    for index in range(2, 10_000):
        candidate = path.with_name(f"{path.stem}-{index}{path.suffix}")
        if not candidate.exists():
            return candidate
    raise NativeHostError("could not create a unique file path")


def sanitize_attachment_filename(value, default="attachment.html"):
    raw = str(value or default)
    raw = raw.replace("\x00", "")
    raw = re.split(r"[\\/]+", raw)[-1]
    raw = re.sub(r'[:*?"<>|#^\[\]\x00-\x1f]', " ", raw)
    raw = re.sub(r"\s+", " ", raw).strip(" .")
    if not raw or raw in (".", ".."):
        raw = default

    path = PurePosixPath(raw)
    suffix = path.suffix.lower()
    stem = path.stem if suffix else raw
    stem = re.sub(r"\s+", " ", stem).strip(" .") or "attachment"

    if not suffix:
        suffix = ".html"
    elif suffix not in (".html", ".htm"):
        raise NativeHostError(f"attachment must be .html or .htm: {raw}")

    return f"{stem}{suffix}"


def validate_attachment_content(asset, index):
    if not isinstance(asset, dict):
        raise NativeHostError(f"attachment {index} must be an object")

    content = asset.get("content", "")
    if not isinstance(content, str):
        raise NativeHostError(f"attachment {index} content must be a string")
    if len(content) > MAX_ATTACHMENT_CHARS:
        raise NativeHostError(f"attachment {index} content is too large")
    return content


def read_downloaded_attachment_content(asset, index):
    if not isinstance(asset, dict):
        raise NativeHostError(f"downloaded attachment {index} must be an object")

    download_id = asset.get("downloadId")
    if not isinstance(download_id, int) or download_id < 0:
        raise NativeHostError(f"downloaded attachment {index} downloadId is required")

    raw_source = asset.get("sourcePath", "")
    if not isinstance(raw_source, str) or not raw_source.strip():
        raise NativeHostError(f"downloaded attachment {index} sourcePath is required")
    if "\x00" in raw_source:
        raise NativeHostError(f"downloaded attachment {index} sourcePath must not contain null bytes")

    source = Path(raw_source)
    if not source.is_absolute():
        raise NativeHostError(f"downloaded attachment {index} sourcePath must be absolute")

    try:
        resolved = source.resolve(strict=True)
    except FileNotFoundError as exc:
        raise NativeHostError(f"downloaded attachment {index} source file does not exist") from exc

    if not resolved.is_file():
        raise NativeHostError(f"downloaded attachment {index} sourcePath must be a file")
    if resolved.suffix.lower() not in (".html", ".htm"):
        raise NativeHostError(f"downloaded attachment {index} must be .html or .htm")

    byte_size = resolved.stat().st_size
    if byte_size > MAX_TOTAL_ATTACHMENT_BYTES:
        raise NativeHostError(f"downloaded attachment {index} source file is too large")

    data = resolved.read_bytes()
    text = data.decode("utf-8", errors="replace")
    if len(text) > MAX_ATTACHMENT_CHARS:
        raise NativeHostError(f"downloaded attachment {index} content is too large")

    name = sanitize_attachment_filename(asset.get("name") or resolved.name, f"attachment-{index}.html")
    return name, text, resolved


def note_relative_link_path(note_parent, target):
    rel_path = os.path.relpath(str(target), start=str(note_parent))
    return rel_path.replace(os.sep, "/").replace("\\", "/")


def save_attachment_text(attachment_dir, vault_path, note_parent, name, content, source=""):
    target = (attachment_dir / name).resolve()
    if not is_relative_to(target, vault_path):
        raise NativeHostError("resolved attachment path escapes vaultPath")

    target = unique_path(target)
    target.write_text(content, encoding="utf-8")
    relative_path_from_vault = target.relative_to(vault_path).as_posix()
    saved = {
        "name": target.name,
        "path": str(target),
        "relativePathFromVault": relative_path_from_vault,
        "linkPathFromNote": note_relative_link_path(note_parent, target),
    }
    if source:
        saved["source"] = source
    return saved


def attachment_links(saved_attachments):
    lines = []
    for item in saved_attachments:
        link_target = quote(item["linkPathFromNote"], safe="/-._~%")
        lines.append(f"- [{item['name']}]({link_target})")
    return "\n".join(lines)


def html_code_block_replacement_count(saved_attachments):
    return sum(1 for item in saved_attachments if item.get("source") == "html-code-block")


def looks_like_html_code_block(lang, code):
    lang = str(lang or "").strip().lower()
    code = str(code or "").strip()
    return lang == "html" or re.match(r"^(?:<!doctype html>|<html\b)", code, re.I)


def replace_attached_html_code_blocks(content, saved_attachments, replacement_text):
    remaining = html_code_block_replacement_count(saved_attachments)
    if remaining <= 0:
        return content

    replacement = str(replacement_text or "").strip() or "HTML file saved as attachment."
    pattern = re.compile(r"(^|\n)(`{3,})([^\n`]*)\n([\s\S]*?)\n\2(?=\n|$)")

    def replace_one(match):
        nonlocal remaining
        if remaining <= 0:
            return match.group(0)
        if not looks_like_html_code_block(match.group(3), match.group(4)):
            return match.group(0)
        remaining -= 1
        return match.group(1) + replacement

    return pattern.sub(replace_one, content)


def replace_attachment_marker(content, links):
    for section_marker in ATTACHMENT_SECTION_MARKERS:
        if section_marker in content:
            before, _, after = content.rpartition(section_marker)
            if links:
                heading = section_marker.replace(ATTACHMENT_MARKER, "")
                return before + heading + links + after
            return (before + after).rstrip() + "\n"

    if ATTACHMENT_MARKER in content:
        before, _, after = content.rpartition(ATTACHMENT_MARKER)
        if links:
            return before + links + after
        return (before + after).rstrip() + "\n"

    if links:
        return content.rstrip() + "\n\n## Attachments\n\n" + links + "\n"
    return content.rstrip() + "\n"


def normalize_attachment_names(value):
    if not isinstance(value, list):
        return []
    names = []
    for item in value:
        try:
            names.append(sanitize_attachment_filename(item))
        except NativeHostError:
            continue
    return names


def save_attachments(message, vault_path, note_parent):
    attachments = message.get("attachments") or []
    downloaded_attachments = message.get("downloadedAttachments") or []
    if not isinstance(attachments, list):
        raise NativeHostError("attachments must be an array")
    if not isinstance(downloaded_attachments, list):
        raise NativeHostError("downloadedAttachments must be an array")
    if len(attachments) + len(downloaded_attachments) > MAX_ATTACHMENTS:
        raise NativeHostError(f"attachments must not contain more than {MAX_ATTACHMENTS} files")

    attachment_dir = resolve_html_save_dir(message.get("htmlSaveDir"), vault_path)
    saved = []
    warnings = []
    total_bytes = 0

    if attachments or downloaded_attachments:
        attachment_dir.mkdir(parents=True, exist_ok=True)

    for index, asset in enumerate(attachments, start=1):
        content = validate_attachment_content(asset, index)
        encoded = content.encode("utf-8")
        total_bytes += len(encoded)
        if total_bytes > MAX_TOTAL_ATTACHMENT_BYTES:
            raise NativeHostError("total attachment content is too large")

        name = sanitize_attachment_filename(asset.get("name"), f"attachment-{index}.html")
        source = str(asset.get("source") or "")
        saved.append(save_attachment_text(attachment_dir, vault_path, note_parent, name, content, source))

    offset = len(attachments)
    for index, asset in enumerate(downloaded_attachments, start=1):
        name, content, _source = read_downloaded_attachment_content(asset, offset + index)
        encoded = content.encode("utf-8")
        total_bytes += len(encoded)
        if total_bytes > MAX_TOTAL_ATTACHMENT_BYTES:
            raise NativeHostError("total attachment content is too large")

        saved.append(save_attachment_text(attachment_dir, vault_path, note_parent, name, content, "chrome-download"))

    attachment_names = normalize_attachment_names(message.get("attachmentNames"))
    saved_names = {item["name"] for item in saved}
    missing_named = [name for name in dict.fromkeys(attachment_names) if name not in saved_names]
    if missing_named:
        warnings.append("attachmentNames without attachment content were not saved: " + ", ".join(missing_named[:5]))

    return saved, warnings


def maybe_open_saved_note(message, vault_path, note_path, warnings):
    rel_open = note_path.relative_to(vault_path).as_posix()
    vault_name = str(message.get("vaultName") or "").strip()
    if vault_name:
        uri = f"obsidian://open?vault={quote(vault_name, safe='')}&file={quote(rel_open, safe='')}"
    else:
        uri = f"obsidian://open?path={quote(str(note_path), safe='')}"

    try:
        open_obsidian_uri(uri)
    except Exception as exc:
        warnings.append(f"saved note but could not open Obsidian URI: {exc}")


def save_note(message):
    vault_path = validate_vault_path(message.get("vaultPath"))
    note_target = resolve_note_path(vault_path, message.get("filePath"))
    note_path = unique_path(note_target)
    if not is_relative_to(note_path.resolve(), vault_path):
        raise NativeHostError("resolved unique note path escapes vaultPath")

    content = str(message.get("content") or "").replace("\r\n", "\n")
    saved_attachments, warnings = save_attachments(message, vault_path, note_path.parent)
    links = attachment_links(saved_attachments)

    content = replace_attached_html_code_blocks(
        content,
        saved_attachments,
        message.get("htmlCodeBlockReplacementText")
    )
    content = replace_attachment_marker(content, links)

    note_path.parent.mkdir(parents=True, exist_ok=True)
    note_path.write_text(content, encoding="utf-8")
    maybe_open_saved_note(message, vault_path, note_path, warnings)

    return {
        "ok": True,
        "notePath": str(note_path),
        "attachments": saved_attachments,
        "warnings": warnings,
    }


def handle_message(message):
    action = message.get("action")
    if action == "save-note":
        return save_note(message)
    if action == "open-uri":
        return open_obsidian_uri(message.get("uri", ""))
    if "uri" in message:
        return open_obsidian_uri(message.get("uri", ""))
    raise NativeHostError("unsupported native message")


def run_native_host():
    try:
        response = handle_message(read_native_message())
    except Exception as exc:
        log(f"error: {exc}")
        response = {"ok": False, "error": str(exc)}
    write_native_message(response)


def assert_raises(fn, expected):
    try:
        fn()
    except Exception as exc:
        if expected not in str(exc):
            raise AssertionError(f"expected {expected!r} in {exc!r}") from exc
        return
    raise AssertionError(f"expected exception containing {expected!r}")


def self_test():
    assert_raises(lambda: validate_note_relative_path("../escape.md"), "path traversal")
    assert_raises(lambda: validate_note_relative_path("safe/../../escape.md"), "path traversal")
    assert_raises(lambda: validate_note_relative_path("safe\\..\\escape.md"), "path traversal")
    assert_raises(lambda: validate_note_relative_path("C:\\Users\\me\\note.md"), "relative")
    assert validate_note_relative_path("safe/file.md").as_posix() == "safe/file.md"

    clean = sanitize_attachment_filename("../bad:name")
    assert clean == "bad name.html", clean
    assert sanitize_attachment_filename("report") == "report.html"
    assert sanitize_attachment_filename("report.htm") == "report.htm"
    assert_raises(lambda: sanitize_attachment_filename("report.txt"), ".html or .htm")

    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        target = base / "note.md"
        target.write_text("one", encoding="utf-8")
        assert unique_path(target).name == "note-2.md"
        (base / "note-2.md").write_text("two", encoding="utf-8")
        assert unique_path(target).name == "note-3.md"
        assert_raises(lambda: resolve_html_save_dir("/tmp/outside", base.resolve()), "inside vaultPath")
        assert_raises(lambda: validate_relative_dir("safe\\..\\outside"), "path traversal")

        vault = base / "vault"
        chatgpt_dir = vault / "ChatGPT_Test"
        chatgpt_dir.mkdir(parents=True)
        downloaded = base / "downloaded.html"
        downloaded.write_text("<!doctype html><html><body>ok</body></html>", encoding="utf-8")
        saved, warnings = save_attachments({
            "htmlSaveDir": "ChatGPT_Test/Attachments",
            "downloadedAttachments": [{
                "name": "from-download.html",
                "sourcePath": str(downloaded),
                "downloadId": 123,
            }]
        }, vault.resolve(), chatgpt_dir.resolve())
        assert not warnings
        assert len(saved) == 1
        assert saved[0]["relativePathFromVault"] == "ChatGPT_Test/Attachments/from-download.html"
        assert saved[0]["linkPathFromNote"] == "Attachments/from-download.html"
        assert (chatgpt_dir / "Attachments" / "from-download.html").read_text(encoding="utf-8").startswith("<!doctype html>")

        root_attachment = base / "root-attachment.html"
        root_attachment.write_text("<html><body>root</body></html>", encoding="utf-8")
        saved_root, warnings_root = save_attachments({
            "htmlSaveDir": "Attachments",
            "attachments": [{
                "name": "root-file.html",
                "content": root_attachment.read_text(encoding="utf-8"),
            }]
        }, vault.resolve(), chatgpt_dir.resolve())
        assert not warnings_root
        assert saved_root[0]["relativePathFromVault"] == "Attachments/root-file.html"
        assert saved_root[0]["linkPathFromNote"] == "../Attachments/root-file.html"

        bad_download = base / "bad.txt"
        bad_download.write_text("not html", encoding="utf-8")
        assert_raises(lambda: save_attachments({
            "downloadedAttachments": [{"sourcePath": str(bad_download), "downloadId": 124}]
        }, vault.resolve(), chatgpt_dir.resolve()), ".html or .htm")

    validate_obsidian_uri("obsidian://new?vault=Vault&file=test.md")
    assert_raises(lambda: validate_obsidian_uri("http://example.com"), "obsidian://")
    assert_raises(lambda: validate_obsidian_uri("https://example.com"), "obsidian://")
    assert_raises(lambda: validate_obsidian_uri("file:///tmp/test"), "obsidian://")
    assert_raises(lambda: validate_obsidian_uri("javascript:alert(1)"), "obsidian://")
    assert_raises(lambda: validate_obsidian_uri("obsidian:new"), "obsidian://")
    assert_raises(lambda: validate_obsidian_uri("obsidian://new?file=bad name.md"), "whitespace")

    marker_example = "Example %%GPT_OBSIDIAN_ATTACHMENTS%% stays"
    content = marker_example + "\n\n## Attachments\n\n%%GPT_OBSIDIAN_ATTACHMENTS%%"
    replaced = replace_attachment_marker(content, "- [a.html](Attachments/a.html)")
    assert marker_example in replaced
    assert replaced.endswith("## Attachments\n\n- [a.html](Attachments/a.html)")
    removed = replace_attachment_marker(content, "")
    assert marker_example in removed
    assert "## Attachments" not in removed

    learning_content = "\n".join([
        "---",
        'title: "HTML learning"',
        "---",
        "",
        "## HTML Learning Material",
        "",
        ATTACHMENT_MARKER,
        "",
        "## Original Question",
        "",
        "What is this?",
    ])
    learning_replaced = replace_attachment_marker(learning_content, "- [lesson.html](Attachments/lesson.html)")
    assert ATTACHMENT_MARKER not in learning_replaced
    assert "## HTML Learning Material\n\n- [lesson.html](Attachments/lesson.html)" in learning_replaced
    assert "## Original Question" in learning_replaced

    plain_filenames = "The literal filenames options 2.html and example 1.html stay plain."
    plain_removed = replace_attachment_marker(plain_filenames, "")
    assert "Attachments" not in plain_removed
    assert "options 2.html" in plain_removed
    assert "example 1.html" in plain_removed

    html_block = "Before\n```html\n<!doctype html>\n<html></html>\n```\nAfter"
    not_saved = replace_attached_html_code_blocks(html_block, [], "HTML file saved as attachment.")
    assert "```html" in not_saved
    saved_block = replace_attached_html_code_blocks(
        html_block,
        [{"source": "html-code-block"}],
        "HTML file saved as attachment."
    )
    assert "HTML file saved as attachment." in saved_block
    assert "```html" not in saved_block
    assert "<html>" not in saved_block

    normal_code = "Before\n```js\nconsole.log('<html>');\n```\nAfter"
    normal_kept = replace_attached_html_code_blocks(
        normal_code,
        [{"source": "html-code-block"}],
        "HTML file saved as attachment."
    )
    assert "```js" in normal_kept
    assert "console.log" in normal_kept
    print("native-open-obsidian.py self-test ok", file=sys.stderr)


def main():
    configure_windows_binary_stdio()
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        self_test()
        return
    run_native_host()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"fatal: {exc}")
        if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
            raise
        try:
            write_native_message({"ok": False, "error": str(exc)})
        except Exception as write_exc:
            log(f"fatal while writing error response: {write_exc}")
            raise
