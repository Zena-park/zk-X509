#!/bin/bash
# Build macOS .app bundle for zk-X509 Interactive CLI.
#
# Usage:
#   ./script/build-app.sh              # Build + ad-hoc sign
#   ./script/build-app.sh --sign       # Build + Developer ID sign
#
# Output: dist/zk-X509.app

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_NAME="zk-X509"
APP_DIR="$PROJECT_DIR/dist/$APP_NAME.app"
BINARY="$PROJECT_DIR/target/release/interactive"

echo "╔══════════════════════════════════╗"
echo "║  Building zk-X509.app            ║"
echo "╚══════════════════════════════════╝"
echo

# ── Step 1: Build release binary ──────────────────
echo "[1/5] Building release binary..."
cd "$PROJECT_DIR"
RUSTFLAGS="--remap-path-prefix=$HOME/.cargo/registry=/registry --remap-path-prefix=$PROJECT_DIR=/zk-x509" \
  cargo build --release --bin interactive 2>&1 | { grep -v "^warning: zk-x509-script" || true; }

if [ ! -f "$BINARY" ]; then
    echo "  ✗ Build failed: $BINARY not found"
    exit 1
fi
echo "  ✓ Binary built: $(du -h "$BINARY" | cut -f1) "

# ── Step 2: Create .app structure ─────────────────
echo "[2/5] Creating .app bundle..."
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# Copy Info.plist with version from Cargo.toml
APP_VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' "$SCRIPT_DIR/Cargo.toml" | head -1)
cp "$SCRIPT_DIR/app-resources/Info.plist" "$APP_DIR/Contents/"
sed -i '' "s/0\.1\.0/$APP_VERSION/g" "$APP_DIR/Contents/Info.plist"

# Copy binary
cp "$BINARY" "$APP_DIR/Contents/MacOS/interactive"

# Create launcher script
cat > "$APP_DIR/Contents/MacOS/launcher" << 'LAUNCHER_EOF'
#!/bin/bash
# Launcher for zk-X509 Interactive CLI
# Opens Terminal.app and runs the interactive binary

DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="$DIR/interactive"

if [ ! -x "$BINARY" ]; then
    osascript -e 'display dialog "zk-X509 binary not found." buttons {"OK"} default button "OK" with icon stop'
    exit 1
fi

# Open Terminal.app with the interactive binary
osascript <<APPLESCRIPT
set binPath to quoted form of "$BINARY"
tell application "Terminal"
    activate
    set newTab to do script "clear && " & binPath & "; echo ''; echo 'Press Enter to close...'; read"
    set custom title of newTab to "zk-X509 Proof Generator"
    set title displays custom title of newTab to true
end tell
APPLESCRIPT
LAUNCHER_EOF
chmod +x "$APP_DIR/Contents/MacOS/launcher"

# Copy app icon
if [ -f "$SCRIPT_DIR/app-resources/AppIcon.icns" ]; then
    cp "$SCRIPT_DIR/app-resources/AppIcon.icns" "$APP_DIR/Contents/Resources/"
fi

echo "  ✓ App structure created"

# ── Step 3: Bundle resources ──────────────────────
echo "[3/5] Bundling CA certificates..."
if [ -d "$PROJECT_DIR/data/ca-certs" ]; then
    cp -r "$PROJECT_DIR/data/ca-certs" "$APP_DIR/Contents/Resources/ca-certs"
    CERT_COUNT=$(ls "$APP_DIR/Contents/Resources/ca-certs/"*.der 2>/dev/null | wc -l | tr -d ' ')
    echo "  ✓ $CERT_COUNT CA certificates bundled"
else
    echo "  ⚠ data/ca-certs/ not found, skipping"
fi

# ── Step 4: Code signing ─────────────────────────
echo "[4/5] Code signing..."
if [[ "$1" == "--sign" ]]; then
    # Developer ID signing (for distribution)
    DEV_ID=$(security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)"/\1/')
    if [ -n "$DEV_ID" ]; then
        codesign --deep --force --options runtime -s "$DEV_ID" "$APP_DIR" 2>&1
        echo "  ✓ Signed with: $DEV_ID"
    else
        echo "  ✗ No Developer ID found. Using ad-hoc signing."
        codesign --deep --force -s - "$APP_DIR" 2>/dev/null
        echo "  ✓ Ad-hoc signed"
    fi
else
    # Ad-hoc signing (for local development)
    codesign --deep --force -s - "$APP_DIR" 2>/dev/null
    echo "  ✓ Ad-hoc signed (use --sign for Developer ID)"
fi

# ── Step 5: Verify ────────────────────────────────
echo "[5/5] Verifying..."
codesign -v "$APP_DIR" >/dev/null 2>&1 && echo "  ✓ Signature valid" || echo "  ⚠ Signature verification failed"

APP_SIZE=$(du -sh "$APP_DIR" | cut -f1)
echo
echo "╔══════════════════════════════════╗"
echo "║  ✓ Build complete!               ║"
echo "╚══════════════════════════════════╝"
echo
echo "  Output: dist/$APP_NAME.app ($APP_SIZE)"
echo "  Open:   open dist/$APP_NAME.app"
echo
echo "  To distribute with Developer ID:"
echo "    ./script/build-app.sh --sign"
