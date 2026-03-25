#!/bin/bash
# Build, codesign (macOS), and run the interactive CLI.
# Usage: ./script/run-interactive.sh

set -e

BINARY="target/release/interactive"

# Build (suppress build.rs info messages, keep errors)
echo "Building interactive CLI..."
cargo build --release --bin interactive 2>&1 | grep -v "^warning:" || true

# macOS: codesign for Keychain access
# Tries Developer ID first (trusted by macOS), falls back to ad-hoc
if [[ "$(uname)" == "Darwin" ]]; then
    DEV_ID=$(security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)"/\1/')
    if [[ -n "$DEV_ID" ]]; then
        codesign -f -s "$DEV_ID" "$BINARY" 2>/dev/null || codesign -f -s - "$BINARY" 2>/dev/null
    else
        codesign -f -s - "$BINARY" 2>/dev/null
    fi
fi

# Run
exec "$BINARY"
