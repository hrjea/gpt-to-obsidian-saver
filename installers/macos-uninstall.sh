#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.gpt_obsidian_saver.open_direct"
MANIFEST_PATH="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/${HOST_NAME}.json"
HELPER_DIR="$HOME/Library/Application Support/GPTObsidianSaver/native-host"

rm -f "$MANIFEST_PATH"
rm -rf "$HELPER_DIR"

echo "GPT -> Obsidian Saver native host removed."
echo "Removed native host manifest: $MANIFEST_PATH"
echo "Removed helper directory: $HELPER_DIR"
echo "User Obsidian vaults and notes were not touched."
