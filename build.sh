#!/bin/bash
# Build script for Cloudflare Pages
# Copies only production files to dist/

mkdir -p dist

# Copy production files
cp index.html dist/
cp app.js dist/
cp webgl-processor.js dist/
cp styles.css dist/
cp ads.txt dist/

# Cloudflare Pages uses dist/ as build output
echo "✓ Build complete. Ready for deployment."
