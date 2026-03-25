#!/bin/bash
# Build, codesign (macOS), and run the interactive CLI.
# Usage: ./script/run-interactive.sh

set -e

BINARY="target/release/interactive"

# Build (suppress build.rs info messages, keep errors)
echo "Building interactive CLI..."
cargo build --release --bin interactive 2>&1 | grep -v "^warning:" || true

# macOS: ad-hoc codesign for Keychain access
if [[ "$(uname)" == "Darwin" ]]; then
    codesign -f -s - "$BINARY" 2>/dev/null
fi

# Run
exec "$BINARY"
