#!/bin/bash
# Build script for Cloudflare Pages
# Compiles WASM and copies production files to dist/

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Building PicToColourIn.com..."
echo "Working directory: $(pwd)"

# Build WASM if Emscripten is available
if command -v emcc &> /dev/null; then
    echo "→ Building WASM module..."
    cd cpp-wasm
    make clean
    make verify
    make
    cd "$SCRIPT_DIR"
    echo "✓ WASM build complete"
else
    echo "⚠ Emscripten not found, skipping WASM build"
    echo "  Install: https://emscripten.org/docs/getting_started/downloads.html"
fi

# Create dist directory
mkdir -p dist

# Copy production files
echo "→ Copying files to dist/..."
cp index.html dist/
cp app.js dist/
cp processing-queue.js dist/
cp styles.css dist/
cp ads.txt dist/

# Copy WASM files to dist/ only (not root - test server looks in src-js/)
if [ -f "src-js/wasm-processor.js" ]; then
    cp src-js/wasm-processor.js dist/
    echo "✓ Copied wasm-processor.js"
fi

if [ -f "src-js/imgproc-wasm.js" ]; then
    cp src-js/imgproc-wasm.js dist/
    echo "✓ Copied imgproc-wasm.js"
fi

if [ -f "src-js/imgproc-wasm.wasm" ]; then
    cp src-js/imgproc-wasm.wasm dist/
    echo "✓ Copied imgproc-wasm.wasm"
fi

# Copy workers
if [ -d "workers" ]; then
    cp -r workers dist/
    echo "✓ Copied workers/"
fi

echo ""
echo "✓ Build complete. Ready for deployment."
echo ""
ls -lh dist/
