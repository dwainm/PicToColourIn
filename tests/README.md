# Pi Session Testing

Simple headless browser test harness for shader tuning. Runs entirely in a pi session.

## Quick Start

```bash
cd tests
npm install
npx playwright install chromium

export FIREWORKS_API_KEY=fw_xxx...
export TEST_IMAGE=./fixtures/photo.jpg  # optional

npm test
```

## How It Works

1. **Spins up** a local static server (port 8888)
2. **Launches** headless Chromium via Playwright
3. **Renders** your test image with 5 parameter variants:
   - `sharp` - minimal blur, high edges
   - `balanced` - middle ground
   - `smooth` - heavy blur, gentle edges
   - `crisp` - tuned for clarity
   - `soft` - forgiving on noise
4. **Evaluates** each with Kimi 2 via Fireworks AI
5. **Ranks** results and recommends winner

## Options

```bash
# Skip AI evaluation (just render screenshots)
SKIP_AI=1 npm test

# Custom test image
TEST_IMAGE=/path/to/photo.jpg npm test
```

## Output

- `outputs/variant-*.png` - Rendered coloring pages
- `outputs/report.json` - Full comparison with scores

## Workflow in Pi

```
pi> cd tests && npm install && npx playwright install

# Make a shader change in webgl-processor.js...

pi> export FIREWORKS_API_KEY=...
pi> npm test

# Review report.json, update defaults in app.js if winner is better
```

## No CI Needed

This runs in your pi session when you want to test changes. No GitHub Actions, no deployment complexity.
