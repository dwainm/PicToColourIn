# Automated Quality Testing

AI-powered visual regression testing using **Kimi 2 via Fireworks AI** for the coloring page generator.

## Structure

```
tests/
├── evaluators/         # AI evaluation logic
│   └── ai-evaluator.js # Kimi 2 Vision via Fireworks AI
├── fixtures/           # Test images
├── outputs/           # Generated renders (gitignored)
├── tuning-results/    # Parameter optimization results (gitignored)
├── *.spec.js         # Playwright tests
└── tuner.js          # Parameter search harness
```

## Setup

### 1. Get Fireworks API Key
- Go to [fireworks.ai](https://fireworks.ai/account/api-keys)
- Create an API key
- Kimi 2 model: `accounts/fireworks/models/kimi-k2`

### 2. Install dependencies
```bash
cd tests
npm install
```

### 3. Set API key
```bash
export FIREWORKS_API_KEY=your_key_here
```

## Usage

### Quick evaluation
```bash
# Evaluate a single image
node evaluators/ai-evaluator.js ./outputs/render-balanced.png

# With strict criteria
node evaluators/ai-evaluator.js ./outputs/render-balanced.png strict
```

### Run full test suite
```bash
# Start your dev server first (localhost:3000)
npm run test

# Or with UI
npm run test:ui
```

### Run parameter optimization
```bash
npm run benchmark
```

## How It Works

1. **Generate variants** with different shader parameters
2. **Kimi 2 evaluates** each output on 5 criteria:
   - Line clarity (crisp, continuous outlines)
   - Detail balance (not too cluttered/empty)
   - Recognizability (clear subject identification)
   - Colorability (closed regions for coloring)
   - Print quality
3. **Scores & ranks** all variants
4. **Recommends** best parameters

## CI Integration

Tests run in CI but skip AI evaluation if no API key:
- With API key: Full quality gates
- Without: Basic rendering tests only

## Deployment Exclusion

Tests are NOT deployed to Cloudflare Pages (see `../.gitignore`).

## Model Info

- **Provider**: Fireworks AI
- **Model**: Kimi 2 (`accounts/fireworks/models/kimi-k2`)
- **Pricing**: ~$0.50-1.00 per 1K images (much cheaper than Claude)
- **Vision**: Native image understanding for quality assessment