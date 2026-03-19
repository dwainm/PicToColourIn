# Automated Quality Testing

AI-powered visual regression testing for the coloring page generator.

## Structure

```
tests/
├── evaluators/         # AI evaluation logic
│   └── ai-evaluator.js # Claude Vision integration
├── fixtures/           # Test images
├── outputs/           # Generated renders (gitignored)
├── tuning-results/    # Parameter optimization results (gitignored)
├── *.spec.js         # Playwright tests
└── tuner.js          # Parameter search harness
```

## Usage

### 1. Install dependencies
```bash
cd tests
npm install
```

### 2. Set API key
```bash
export ANTHROPIC_API_KEY=your_key_here
```

### 3. Run quality tests
```bash
# Start your dev server first (localhost:3000)
npm run test

# Or with UI
npm run test:ui
```

### 4. Run parameter optimization
```bash
npm run benchmark
```

## How It Works

1. **Generate variants** with different shader parameters
2. **AI evaluates** each output on 5 criteria:
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
