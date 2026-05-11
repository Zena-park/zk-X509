#!/bin/bash
# Build, codesign (macOS), and run the interactive CLI.
# Usage: ./script/run-interactive.sh

set -eo pipefail

# Pin the ELF to the shipped prebuilt artifact so the vkey baked
# into Groth16 proofs matches what production / Docker / the
# on-chain RegistryFactory expects (vkey 0x0048b091…). Without
# this, every `cargo build` recompiles the program crate against
# the host SP1 toolchain and produces a divergent vkey that
# `SP1Verifier.verifyProof()` rejects as `ProofInvalid()`.
ELF_PATH="$(cd "$(dirname "$0")/.." && pwd)/elf/zk-x509-program"
if [ -f "$ELF_PATH" ]; then
    export PREBUILT_ELF="$ELF_PATH"
    echo "Using pinned ELF: $PREBUILT_ELF"
else
    echo "⚠ Prebuilt ELF not found at $ELF_PATH — falling back to host build (vkey may diverge from RegistryFactory)" >&2
fi

BINARY="target/release/interactive"

# Build (suppress warnings from output but preserve cargo's exit status)
echo "Building interactive CLI..."
cargo build --release --bin interactive 2>&1 | { grep -v "^warning:" || true; }

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
