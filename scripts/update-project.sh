#!/usr/bin/env bash

set -euo pipefail

REPO_URL="${1:-https://github.com/Z1rconium/reading-helper}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

command -v git >/dev/null 2>&1 || {
  echo "Error: git is required but not installed." >&2
  exit 1
}

command -v rsync >/dev/null 2>&1 || {
  echo "Error: rsync is required but not installed." >&2
  exit 1
}

echo "Cloning latest project files from ${REPO_URL}..."
git clone --depth 1 "${REPO_URL}" "${TMP_DIR}/repo"

echo "Syncing project files into ${PROJECT_ROOT}..."
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'data/' \
  --exclude 'logs/' \
  --exclude 'config/admin.config.json' \
  --exclude 'config/platform.config.json' \
  --exclude 'config/users.config.json' \
  --exclude 'ecosystem.config.js' \
  "${TMP_DIR}/repo/" "${PROJECT_ROOT}/"

echo "Update complete."
echo "Preserved files:"
echo "  - config/admin.config.json"
echo "  - config/platform.config.json"
echo "  - config/users.config.json"
echo "  - ecosystem.config.js"
