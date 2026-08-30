#!/usr/bin/env python3
import hashlib
from html import escape as html_escape, unescape as html_unescape
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import sys
import tempfile
import time
import unicodedata
from urllib.parse import quote, unquote, urlparse, urlsplit


HOST_NAME = "com.gpt_obsidian_saver.open_direct"
ATTACHMENT_MARKER = "%%GPT_OBSIDIAN_ATTACHMENTS%%"
DETAILED_MARKDOWN_MARKER = "%%GPT_OBSIDIAN_DETAILED_MARKDOWN%%"
DETAILED_MARKDOWN_HEADING = "장별 상세 한국어 요약"
ATTACHMENT_SECTION_MARKERS = [
    f"\n\n## Attachments\n\n{ATTACHMENT_MARKER}",
    f"\n\n## 첨부파일\n\n{ATTACHMENT_MARKER}",
]
MAX_MESSAGE_BYTES = 16 * 1024 * 1024
MAX_ATTACHMENTS = 100
MAX_ATTACHMENT_CHARS = 700_000
# Keep the attachment payload below Chrome's 16 MiB native-message ceiling
# while allowing large flat study-guide batches (for example, 50 HTML files).
MAX_TOTAL_ATTACHMENT_BYTES = 12 * 1024 * 1024
MAX_GENERATED_MARKDOWN_CHARS = 2_000_000
MAX_GENERATED_MARKDOWN_BYTES = 8 * 1024 * 1024
NOTE_OPEN_DELAY_SECONDS = 1.0
ANCHOR_HREF_RE = re.compile(r'(<a\b[^>]*?\bhref\s*=\s*)(["\'])(.*?)\2', re.I | re.S)


class NativeHostError(Exception):
    pass


class HtmlIdCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()

    def collect_id(self, attrs):
        for name, value in attrs:
            if str(name or "").lower() == "id" and value:
                self.ids.add(str(value))

    def handle_starttag(self, _tag, attrs):
        self.collect_id(attrs)

    def handle_startendtag(self, _tag, attrs):
        self.collect_id(attrs)


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


def unique_path_with_reserved(path, reserved):
    if not path.exists() and path not in reserved:
        return path

    for index in range(2, 10_000):
        candidate = path.with_name(f"{path.stem}-{index}{path.suffix}")
        if not candidate.exists() and candidate not in reserved:
            return candidate
    raise NativeHostError("could not create a unique reserved file path")


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


def read_downloaded_markdown_content(asset):
    if not isinstance(asset, dict):
        raise NativeHostError("downloadedMarkdown must be an object")

    download_id = asset.get("downloadId")
    if not isinstance(download_id, int) or download_id < 0:
        raise NativeHostError("downloadedMarkdown downloadId is required")

    raw_source = asset.get("sourcePath", "")
    if not isinstance(raw_source, str) or not raw_source.strip():
        raise NativeHostError("downloadedMarkdown sourcePath is required")
    if "\x00" in raw_source:
        raise NativeHostError("downloadedMarkdown sourcePath must not contain null bytes")

    source = Path(raw_source)
    if not source.is_absolute():
        raise NativeHostError("downloadedMarkdown sourcePath must be absolute")
    if source.is_symlink():
        raise NativeHostError("downloadedMarkdown sourcePath must not be a symbolic link")

    try:
        resolved = source.resolve(strict=True)
    except FileNotFoundError as exc:
        raise NativeHostError("downloadedMarkdown source file does not exist") from exc

    if not resolved.is_file():
        raise NativeHostError("downloadedMarkdown sourcePath must be a file")
    if resolved.suffix.lower() != ".md":
        raise NativeHostError("downloadedMarkdown must be a .md file")

    expected_name = Path(str(asset.get("name") or resolved.name)).name
    if not expected_name.lower().endswith(".md"):
        raise NativeHostError("downloadedMarkdown name must end with .md")

    byte_size = resolved.stat().st_size
    if byte_size <= 0:
        raise NativeHostError("downloadedMarkdown source file is empty")
    if byte_size > MAX_GENERATED_MARKDOWN_BYTES:
        raise NativeHostError("downloadedMarkdown source file is too large")

    text = resolved.read_bytes().decode("utf-8", errors="replace")
    text = text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    if len(text) > MAX_GENERATED_MARKDOWN_CHARS:
        raise NativeHostError("downloadedMarkdown content is too large")

    body = text.replace(ATTACHMENT_MARKER, "GPT_OBSIDIAN_ATTACHMENTS")
    body = body.replace(DETAILED_MARKDOWN_MARKER, "GPT_OBSIDIAN_DETAILED_MARKDOWN")
    body = re.sub(
        rf"^# {re.escape(DETAILED_MARKDOWN_HEADING)}\s*$",
        "",
        body,
        flags=re.M,
    ).strip()
    if not body:
        raise NativeHostError("downloadedMarkdown content is empty")

    return body, resolved, expected_name


def replace_downloaded_markdown_marker(content, downloaded_markdown):
    marker_count = content.count(DETAILED_MARKDOWN_MARKER)
    if not downloaded_markdown:
        if marker_count:
            raise NativeHostError("detailed Markdown marker requires downloadedMarkdown")
        return content, None
    if marker_count != 1:
        raise NativeHostError("downloadedMarkdown requires exactly one detailed Markdown marker")

    body, source, name = read_downloaded_markdown_content(downloaded_markdown)
    replaced = content.replace(DETAILED_MARKDOWN_MARKER, body, 1)
    if DETAILED_MARKDOWN_MARKER in replaced:
        raise NativeHostError("detailed Markdown marker was not replaced")
    return replaced, {
        "name": name,
        "sourcePath": str(source),
        "downloadId": downloaded_markdown.get("downloadId"),
        "characters": len(body),
    }


def note_relative_link_path(note_parent, target):
    rel_path = os.path.relpath(str(target), start=str(note_parent))
    return rel_path.replace(os.sep, "/").replace("\\", "/")


def save_attachment_to_target(target, vault_path, note_parent, content, source="", requested_name=""):
    target = target.resolve()
    if not is_relative_to(target, vault_path):
        raise NativeHostError("resolved attachment path escapes vaultPath")

    encoded = content.encode("utf-8")
    target.write_bytes(encoded)
    relative_path_from_vault = target.relative_to(vault_path).as_posix()
    saved = {
        "name": target.name,
        "path": str(target),
        "relativePathFromVault": relative_path_from_vault,
        "linkPathFromNote": note_relative_link_path(note_parent, target),
        "requestedName": requested_name or target.name,
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "bytes": len(encoded),
    }
    if source:
        saved["source"] = source
    return saved


def save_attachment_text(attachment_dir, vault_path, note_parent, name, content, source=""):
    target = (attachment_dir / name).resolve()
    if not is_relative_to(target, vault_path):
        raise NativeHostError("resolved attachment path escapes vaultPath")
    return save_attachment_to_target(unique_path(target), vault_path, note_parent, content, source, name)


def html_element_ids(content):
    collector = HtmlIdCollector()
    try:
        collector.feed(str(content or ""))
        collector.close()
    except (TypeError, ValueError):
        return set()
    return collector.ids


def filename_key(value):
    return unicodedata.normalize("NFC", str(value or "")).casefold()


def embedded_chapter_anchor_candidates(decoded_path, fragment=""):
    candidates = []

    def add(value):
        value = str(value or "").strip()
        if value and value not in candidates:
            candidates.append(value)

    add(unquote(fragment))
    stem = PurePosixPath(str(decoded_path or "")).stem
    add(stem)
    prefix = re.match(r"^(\d{1,3})(?:[-_]|$)", stem)
    if prefix:
        number = prefix.group(1)
        add(f"ch-{number}-title")
        add(f"chapter-{number}-title")
        add(f"ch-{number}")
        add(f"chapter-{number}")
    return candidates


def build_embedded_anchor_targets(records):
    targets = []
    for record in records:
        ids = html_element_ids(record.get("content"))
        target = record.get("target")
        if not ids or target is None:
            continue
        targets.append({
            "name": record["name"],
            "savedName": target.name,
            "ids": ids,
        })
    return targets


def resolve_embedded_html_anchor(decoded_path, fragment, current_name, anchor_targets):
    current_key = filename_key(current_name)
    for anchor in embedded_chapter_anchor_candidates(decoded_path, fragment):
        matches = [target for target in anchor_targets if anchor in target["ids"]]
        current_matches = [target for target in matches if filename_key(target["name"]) == current_key]
        if len(current_matches) == 1:
            return current_matches[0], anchor
        if len(matches) == 1:
            return matches[0], anchor
    return None


def rewrite_local_html_links(content, attachment_manifest, anchor_targets=None, current_name=""):
    manifest = {filename_key(name): str(saved_name) for name, saved_name in attachment_manifest.items()}
    anchor_targets = list(anchor_targets or [])
    unresolved = []

    def replace_href(match):
        original = match.group(3)
        href = html_unescape(original.strip())
        if not href or href.startswith(("#", "/", "//")):
            return match.group(0)

        try:
            parsed = urlsplit(href)
        except ValueError:
            return match.group(0)
        if parsed.scheme or parsed.netloc:
            return match.group(0)

        decoded_path = unquote(parsed.path).replace("\\", "/")
        if not re.search(r"\.html?$", decoded_path, re.I):
            return match.group(0)
        basename = PurePosixPath(decoded_path).name
        saved_name = manifest.get(filename_key(basename))
        if not saved_name:
            embedded = resolve_embedded_html_anchor(
                decoded_path,
                parsed.fragment,
                current_name,
                anchor_targets,
            )
            if not embedded:
                unresolved.append(href)
                return match.group(0)

            target, anchor = embedded
            if filename_key(target["name"]) == filename_key(current_name):
                flattened = ""
            else:
                flattened = "./" + quote(target["savedName"], safe="-._~()")
            if parsed.query:
                flattened += "?" + parsed.query
            flattened += "#" + quote(anchor, safe="-._~")
            escaped = html_escape(flattened, quote=False)
            return f"{match.group(1)}{match.group(2)}{escaped}{match.group(2)}"

        flattened = "./" + quote(saved_name, safe="-._~()")
        if parsed.query:
            flattened += "?" + parsed.query
        if parsed.fragment:
            flattened += "#" + parsed.fragment
        escaped = html_escape(flattened, quote=False)
        return f"{match.group(1)}{match.group(2)}{escaped}{match.group(2)}"

    rewritten = ANCHOR_HREF_RE.sub(replace_href, str(content or ""))
    return rewritten, list(dict.fromkeys(unresolved))


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

    attachment_names = normalize_attachment_names(message.get("attachmentNames"))
    if len(attachment_names) > MAX_ATTACHMENTS:
        raise NativeHostError(f"attachmentNames must not contain more than {MAX_ATTACHMENTS} files")
    allow_partial = message.get("allowPartialAttachments") is True

    attachment_dir = resolve_html_save_dir(message.get("htmlSaveDir"), vault_path)
    warnings = []
    records = []
    total_bytes = 0

    for index, asset in enumerate(attachments, start=1):
        content = validate_attachment_content(asset, index)
        encoded = content.encode("utf-8")
        total_bytes += len(encoded)
        if total_bytes > MAX_TOTAL_ATTACHMENT_BYTES:
            raise NativeHostError("total attachment content is too large")

        name = sanitize_attachment_filename(asset.get("name"), f"attachment-{index}.html")
        source = str(asset.get("source") or "")
        records.append({"name": name, "content": content, "source": source})

    offset = len(attachments)
    for index, asset in enumerate(downloaded_attachments, start=1):
        name, content, _source = read_downloaded_attachment_content(asset, offset + index)
        encoded = content.encode("utf-8")
        total_bytes += len(encoded)
        if total_bytes > MAX_TOTAL_ATTACHMENT_BYTES:
            raise NativeHostError("total attachment content is too large")

        records.append({"name": name, "content": content, "source": "chrome-download"})

    by_name = {}
    ambiguous_names = set()
    for record in records:
        key = filename_key(record["name"])
        digest = hashlib.sha256(record["content"].encode("utf-8")).hexdigest()
        record["digest"] = digest
        existing = by_name.get(key)
        if existing is None:
            by_name[key] = record
        elif existing["digest"] == digest:
            warnings.append(f"duplicate attachment source was ignored: {record['name']}")
        else:
            ambiguous_names.add(key)

    for key in ambiguous_names:
        record = by_name.pop(key, None)
        display_name = record["name"] if record else key
        warnings.append(f"conflicting attachment sources were excluded: {display_name}")

    content_groups = {}
    for record in by_name.values():
        content_groups.setdefault(record["digest"], []).append(record)
    rejected_names = set()
    for group in content_groups.values():
        names = list(dict.fromkeys(item["name"] for item in group))
        if len(names) > 1:
            rejected_names.update(filename_key(name) for name in names)
            warnings.append("identical HTML content under different filenames was excluded: " + ", ".join(names))

    safe_records = [record for key, record in by_name.items() if key not in rejected_names]
    requested_names = []
    requested_keys = set()
    for name in attachment_names or [record["name"] for record in records]:
        key = filename_key(name)
        if key in requested_keys:
            continue
        requested_keys.add(key)
        requested_names.append(name)

    safe_record_keys = {filename_key(record["name"]) for record in safe_records}
    missing_before_write = [name for name in requested_names if filename_key(name) not in safe_record_keys]
    if attachment_names and missing_before_write and not allow_partial:
        raise NativeHostError(
            "requested attachment content is missing; note was not saved: "
            + ", ".join(missing_before_write[:10])
        )
    if missing_before_write:
        warnings.append(
            "requested attachments without verified content were not saved: "
            + ", ".join(missing_before_write[:10])
        )

    saved = []
    attachment_manifest = {}
    reserved = set()
    if safe_records:
        attachment_dir.mkdir(parents=True, exist_ok=True)
        for record in safe_records:
            requested = (attachment_dir / record["name"]).resolve()
            if not is_relative_to(requested, vault_path):
                raise NativeHostError("resolved attachment path escapes vaultPath")
            target = unique_path_with_reserved(requested, reserved)
            reserved.add(target)
            record["target"] = target
            attachment_manifest[record["name"]] = target.name

        anchor_targets = build_embedded_anchor_targets(safe_records)
        for record in safe_records:
            rewritten, unresolved = rewrite_local_html_links(
                record["content"],
                attachment_manifest,
                anchor_targets,
                record["name"],
            )
            if unresolved:
                warnings.append(
                    f"unresolved local HTML links in {record['name']}: " + ", ".join(unresolved[:10])
                )
            saved.append(save_attachment_to_target(
                record["target"],
                vault_path,
                note_parent,
                rewritten,
                record["source"],
                record["name"],
            ))

    written_requested_names = [item["requestedName"] for item in saved]
    written_requested_keys = {filename_key(name) for name in written_requested_names}
    missing_after_write = [name for name in requested_names if filename_key(name) not in written_requested_keys]
    audit = {
        "complete": not missing_after_write,
        "allowPartial": allow_partial,
        "requestedCount": len(requested_names),
        "writtenCount": len(saved),
        "requestedNames": requested_names,
        "writtenRequestedNames": written_requested_names,
        "writtenNames": [item["name"] for item in saved],
        "missingNames": missing_after_write,
        "files": [
            {
                "requestedName": item["requestedName"],
                "writtenName": item["name"],
                "sha256": item["sha256"],
                "bytes": item["bytes"],
            }
            for item in saved
        ],
        "totalBytes": sum(item["bytes"] for item in saved),
    }

    return saved, warnings, audit


def saved_note_open_uri(message, vault_path, note_path):
    vault_name = str(message.get("vaultName") or "").strip()
    if vault_name:
        rel_open = note_path.relative_to(vault_path).as_posix()
        return f"obsidian://open?vault={quote(vault_name, safe='')}&file={quote(rel_open, safe='')}"
    return f"obsidian://open?path={quote(str(note_path.resolve()), safe='')}"


def maybe_open_saved_note(message, vault_path, note_path, warnings):
    uri = saved_note_open_uri(message, vault_path, note_path)

    try:
        if not note_path.is_file():
            raise NativeHostError("saved note file was not visible before opening Obsidian")
        if sys.platform == "darwin":
            # LaunchServices receives the exact file we just wrote, avoiding
            # Obsidian's URI/index lookup for long Unicode filenames.
            time.sleep(0.2)
            subprocess.run(
                ["open", "-a", "Obsidian", str(note_path)],
                shell=False,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return
        vault_name = str(message.get("vaultName") or "").strip()
        if vault_name:
            # If another vault is active, let Obsidian switch and index the
            # target vault before resolving the new note's relative path.
            open_obsidian_uri(f"obsidian://open?vault={quote(vault_name, safe='')}")
        time.sleep(NOTE_OPEN_DELAY_SECONDS)
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
    saved_attachments, warnings, attachment_audit = save_attachments(message, vault_path, note_path.parent)
    links = attachment_links(saved_attachments)

    content = replace_attached_html_code_blocks(
        content,
        saved_attachments,
        message.get("htmlCodeBlockReplacementText")
    )
    content = replace_attachment_marker(content, links)
    content, detailed_markdown = replace_downloaded_markdown_marker(
        content,
        message.get("downloadedMarkdown"),
    )

    note_path.parent.mkdir(parents=True, exist_ok=True)
    with note_path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())
    maybe_open_saved_note(message, vault_path, note_path, warnings)

    note_bytes = content.encode("utf-8")
    return {
        "ok": True,
        "notePath": str(note_path),
        "attachments": saved_attachments,
        "attachmentAudit": attachment_audit,
        "noteSha256": hashlib.sha256(note_bytes).hexdigest(),
        "noteBytes": len(note_bytes),
        "detailedMarkdown": detailed_markdown,
        "warnings": warnings,
    }


def handle_message(message):
    action = message.get("action")
    if action == "ping":
        return {"ok": True, "pong": True}
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
    assert handle_message({"action": "ping"}) == {"ok": True, "pong": True}
    assert filename_key("전체.html") == filename_key(unicodedata.normalize("NFD", "전체.html"))
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
        saved, warnings, audit = save_attachments({
            "htmlSaveDir": "ChatGPT_Test/Attachments",
            "downloadedAttachments": [{
                "name": "from-download.html",
                "sourcePath": str(downloaded),
                "downloadId": 123,
            }]
        }, vault.resolve(), chatgpt_dir.resolve())
        assert not warnings
        assert len(saved) == 1
        assert audit["complete"] is True
        assert audit["requestedCount"] == audit["writtenCount"] == 1
        assert len(audit["files"][0]["sha256"]) == 64
        assert saved[0]["relativePathFromVault"] == "ChatGPT_Test/Attachments/from-download.html"
        assert saved[0]["linkPathFromNote"] == "Attachments/from-download.html"
        assert (chatgpt_dir / "Attachments" / "from-download.html").read_text(encoding="utf-8").startswith("<!doctype html>")

        root_attachment = base / "root-attachment.html"
        root_attachment.write_text("<html><body>root</body></html>", encoding="utf-8")
        saved_root, warnings_root, _audit_root = save_attachments({
            "htmlSaveDir": "Attachments",
            "attachments": [{
                "name": "root-file.html",
                "content": root_attachment.read_text(encoding="utf-8"),
            }]
        }, vault.resolve(), chatgpt_dir.resolve())
        assert not warnings_root
        assert saved_root[0]["relativePathFromVault"] == "Attachments/root-file.html"
        assert saved_root[0]["linkPathFromNote"] == "../Attachments/root-file.html"

        batch_assets = [
            {
                "name": f"{index:02d}-chapter.html",
                "content": f"<!doctype html><html><head><title>{index}</title></head><body>chapter {index}</body></html>",
            }
            for index in range(50)
        ]
        batch_names = [item["name"] for item in batch_assets]
        batch_saved, batch_warnings, batch_audit = save_attachments({
            "htmlSaveDir": "ChatGPT_Test/FiftyAttachments",
            "attachments": batch_assets,
            "attachmentNames": batch_names,
        }, vault.resolve(), chatgpt_dir.resolve())
        assert not batch_warnings
        assert len(batch_saved) == 50
        assert batch_audit["complete"] is True
        assert batch_audit["requestedCount"] == batch_audit["writtenCount"] == 50

        assert_raises(lambda: save_attachments({
            "htmlSaveDir": "ChatGPT_Test/MissingStrict",
            "attachmentNames": ["missing.html"],
        }, vault.resolve(), chatgpt_dir.resolve()), "note was not saved")
        partial_saved, partial_warnings, partial_audit = save_attachments({
            "htmlSaveDir": "ChatGPT_Test/MissingPartial",
            "attachmentNames": ["missing.html"],
            "allowPartialAttachments": True,
        }, vault.resolve(), chatgpt_dir.resolve())
        assert partial_saved == []
        assert partial_audit["complete"] is False
        assert partial_audit["missingNames"] == ["missing.html"]
        assert any("without verified content" in warning for warning in partial_warnings)

        flat_saved, flat_warnings, _flat_audit = save_attachments({
            "htmlSaveDir": "ChatGPT_Test/FlatAttachments",
            "attachments": [
                {
                    "name": "complete.html",
                    "content": "<!doctype html><html><head><title>Complete</title></head><body>"
                               "<a href=\"chapters/index.html\">Index</a>"
                               "<a href=\"chapters/00-overview.html#start\">Overview</a>"
                               "<a href=\"https://example.com/external.html\">External</a>"
                               "<a href=\"#inside\">Inside</a>"
                               "<img src=\"chapters/00-overview.html\">"
                               "<a href=\"chapters/missing.html\">Missing</a>"
                               "</body></html>",
                },
                {
                    "name": "index.html",
                    "content": "<!doctype html><html><head><title>Index</title></head><body>"
                               "<a href=\"./00-overview.html\">Overview</a>"
                               "<a href=\"../complete.html\">Complete</a>"
                               "</body></html>",
                },
                {
                    "name": "00-overview.html",
                    "content": "<!doctype html><html><head><title>Overview</title></head><body>"
                               "<a href=\"../index.html\">Index</a>"
                               "<p>Unique overview content</p>"
                               "</body></html>",
                },
            ],
        }, vault.resolve(), chatgpt_dir.resolve())
        assert len(flat_saved) == 3
        assert any("unresolved local HTML links" in warning for warning in flat_warnings)
        flat_dir = chatgpt_dir / "FlatAttachments"
        complete_text = (flat_dir / "complete.html").read_text(encoding="utf-8")
        assert 'href="./index.html"' in complete_text
        assert 'href="./00-overview.html#start"' in complete_text
        assert 'href="https://example.com/external.html"' in complete_text
        assert 'href="#inside"' in complete_text
        assert 'src="chapters/00-overview.html"' in complete_text
        assert 'href="chapters/missing.html"' in complete_text
        index_text = (flat_dir / "index.html").read_text(encoding="utf-8")
        assert 'href="./00-overview.html"' in index_text
        assert 'href="./complete.html"' in index_text
        overview_text = (flat_dir / "00-overview.html").read_text(encoding="utf-8")
        assert 'href="./index.html"' in overview_text

        embedded_saved, embedded_warnings, _embedded_audit = save_attachments({
            "htmlSaveDir": "ChatGPT_Test/EmbeddedChapterAttachments",
            "attachments": [
                {
                    "name": "complete.html",
                    "content": "<!doctype html><html><head><title>Complete</title></head><body>"
                               "<nav><a href=\"chapters/00-overview.html\">Overview</a></nav>"
                               "<h2 id=\"ch-00-title\">Embedded overview</h2>"
                               "</body></html>",
                },
                {
                    "name": "index.html",
                    "content": "<!doctype html><html><head><title>Index</title></head><body>"
                               "<a href=\"chapters/00-overview.html\">Overview</a>"
                               "</body></html>",
                },
            ],
        }, vault.resolve(), chatgpt_dir.resolve())
        assert len(embedded_saved) == 2
        assert not embedded_warnings
        embedded_dir = chatgpt_dir / "EmbeddedChapterAttachments"
        embedded_complete = (embedded_dir / "complete.html").read_text(encoding="utf-8")
        assert 'href="#ch-00-title"' in embedded_complete
        embedded_index = (embedded_dir / "index.html").read_text(encoding="utf-8")
        assert 'href="./complete.html#ch-00-title"' in embedded_index

        duplicate_html = "<!doctype html><html><head><title>Duplicate</title></head><body>same</body></html>"
        duplicate_saved, duplicate_warnings, duplicate_audit = save_attachments({
            "htmlSaveDir": "ChatGPT_Test/DuplicateAttachments",
            "attachments": [
                {"name": "first.html", "content": duplicate_html},
                {"name": "second.html", "content": duplicate_html},
            ],
        }, vault.resolve(), chatgpt_dir.resolve())
        assert duplicate_saved == []
        assert duplicate_audit["complete"] is False
        assert any("identical HTML content under different filenames" in warning for warning in duplicate_warnings)

        conflict_saved, conflict_warnings, conflict_audit = save_attachments({
            "htmlSaveDir": "ChatGPT_Test/ConflictAttachments",
            "attachments": [
                {"name": "same.html", "content": "<!doctype html><html><body>one</body></html>"},
                {"name": "same.html", "content": "<!doctype html><html><body>two</body></html>"},
            ],
        }, vault.resolve(), chatgpt_dir.resolve())
        assert conflict_saved == []
        assert conflict_audit["complete"] is False
        assert any("conflicting attachment sources" in warning for warning in conflict_warnings)

        bad_download = base / "bad.txt"
        bad_download.write_text("not html", encoding="utf-8")
        assert_raises(lambda: save_attachments({
            "downloadedAttachments": [{"sourcePath": str(bad_download), "downloadId": 124}]
        }, vault.resolve(), chatgpt_dir.resolve()), ".html or .htm")

        detailed_download = base / "code-for-all-detailed-summary-ko.md"
        detailed_body = "## 연구 설계\n\n" + "보존해야 하는 상세 한국어 요약과 표 데이터입니다.\n" * 22000
        assert len(detailed_body) > 400_000
        detailed_download.write_text(
            f"# {DETAILED_MARKDOWN_HEADING}\n\n{detailed_body}\n{ATTACHMENT_MARKER}\n",
            encoding="utf-8",
        )
        detailed_note = "\n".join([
            "---",
            'title: "Detailed download"',
            "---",
            "",
            "# 질문",
            "",
            "질문",
            "",
            f"# {DETAILED_MARKDOWN_HEADING}",
            "",
            DETAILED_MARKDOWN_MARKER,
        ])
        detailed_replaced, detailed_metadata = replace_downloaded_markdown_marker(
            detailed_note,
            {
                "name": detailed_download.name,
                "sourcePath": str(detailed_download),
                "downloadId": 741,
                "startTime": "2026-08-25T05:00:00.000Z",
                "endTime": "2026-08-25T05:00:01.000Z",
            },
        )
        assert detailed_replaced.count(f"# {DETAILED_MARKDOWN_HEADING}") == 1
        assert DETAILED_MARKDOWN_MARKER not in detailed_replaced
        assert ATTACHMENT_MARKER not in detailed_replaced
        assert detailed_body.strip() in detailed_replaced
        assert detailed_metadata["downloadId"] == 741
        assert detailed_metadata["characters"] > 400_000
        assert_raises(
            lambda: replace_downloaded_markdown_marker(
                detailed_note + "\n" + DETAILED_MARKDOWN_MARKER,
                {
                    "name": detailed_download.name,
                    "sourcePath": str(detailed_download),
                    "downloadId": 742,
                },
            ),
            "exactly one detailed Markdown marker",
        )
        assert_raises(
            lambda: replace_downloaded_markdown_marker(detailed_note, None),
            "marker requires downloadedMarkdown",
        )

        wrong_markdown = base / "not-markdown.txt"
        wrong_markdown.write_text("plain text", encoding="utf-8")
        assert_raises(
            lambda: read_downloaded_markdown_content({
                "name": "not-markdown.md",
                "sourcePath": str(wrong_markdown),
                "downloadId": 743,
            }),
            "must be a .md file",
        )

        oversized_markdown = base / "oversized.md"
        oversized_markdown.write_text("x" * (MAX_GENERATED_MARKDOWN_CHARS + 1), encoding="utf-8")
        assert_raises(
            lambda: read_downloaded_markdown_content({
                "name": oversized_markdown.name,
                "sourcePath": str(oversized_markdown),
                "downloadId": 744,
            }),
            "content is too large",
        )

        open_uri = saved_note_open_uri(
            {"vaultName": "Test Vault"},
            vault.resolve(),
            (chatgpt_dir / "새 노트.md").resolve(),
        )
        assert open_uri.startswith("obsidian://open?vault=Test%20Vault&file=")
        assert "ChatGPT_Test%2F" in open_uri

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

    current_learning_content = "\n".join([
        "---",
        'title: "Current HTML learning"',
        "---",
        "",
        "# HTML 학습자료",
        "",
        ATTACHMENT_MARKER,
        "",
        "# 질문",
        "",
        "질문",
    ])
    current_learning_replaced = replace_attachment_marker(
        current_learning_content,
        "- [lesson.html](Attachments/lesson.html)"
    )
    assert ATTACHMENT_MARKER not in current_learning_replaced
    assert "# HTML 학습자료\n\n- [lesson.html](Attachments/lesson.html)" in current_learning_replaced
    assert "# 질문" in current_learning_replaced

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
