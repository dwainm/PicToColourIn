import { test, expect } from '@playwright/test';
import { AIColoringEvaluator } from '../evaluators/ai-evaluator.js';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '../outputs');

// Test parameter matrix for shader tuning
const PARAMETER_MATRIX = [
  { blurRadius: 0.5, edgeIntensity: 1.0, threshold: 0.2, label: 'sharp' },
  { blurRadius: 2.0, edgeIntensity: 0.8, threshold: 0.25, label: 'balanced' },
  { blurRadius: 4.0, edgeIntensity: 0.6, threshold: 0.3, label: 'smooth' },
  { blurRadius: 2.0, edgeIntensity: 1.2, threshold: 0.15, label: 'high-contrast' },
];

test.describe('Coloring Page Generation', () => {
  let evaluator;
  
  test.beforeAll(() => {
    // Skip if no API key
    if (!process.env.FIREWORKS_API_KEY) {
      console.log('⚠️  No FIREWORKS_API_KEY, AI evaluation will be skipped');
    }
    evaluator = new AIColoringEvaluator();
  });

  test.beforeEach(async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });
  });

  for (const params of PARAMETER_MATRIX) {
    test(`params: ${params.label} (${JSON.stringify(params)})`, async ({ page }) => {
      // Load the app
      await page.goto('http://localhost:3000'); // or file:// for static
      
      // Wait for WebGL init
      await page.waitForSelector('#canvas-container canvas');
      
      // Inject test image via File API
      const testImagePath = join(__dirname, '../fixtures/sample-photo.jpg');
      
      // Set shader parameters via exposed API
      await page.evaluate((p) => {
        window.setShaderParams?.(p) || 
        (window.app && window.app.setParams(p));
      }, params);
      
      // Upload and process
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles(testImagePath);
      
      // Wait for processing
      await page.waitForTimeout(2000);
      
      // Capture output canvas
      const canvas = await page.locator('#output-canvas');
      const screenshot = await canvas.screenshot({
        path: join(OUTPUT_DIR, `render-${params.label}.png`)
      });
      
      // AI Evaluation (if API key available)
      if (process.env.FIREWORKS_API_KEY) {
        const evaluation = await evaluator.evaluate(
          join(OUTPUT_DIR, `render-${params.label}.png`),
          'standard'
        );
        
        // Write evaluation results
        await writeFile(
          join(OUTPUT_DIR, `eval-${params.label}.json`),
          JSON.stringify(evaluation, null, 2)
        );
        
        // Assert quality threshold
        expect(evaluation.overall).toBeGreaterThan(6);
        expect(evaluation.LINE_CLARITY.score).toBeGreaterThan(5);
        expect(evaluation.COLORABILITY.score).toBeGreaterThan(5);
        
        console.log(`${params.label}: ${evaluation.overall}/10 - ${evaluation.suggestions[0]}`);
      }
    });
  }
});

test.describe('Shader Parameter Optimization', () => {
  test('find best parameters via AI comparison', async ({ page }) => {
    if (!process.env.FIREWORKS_API_KEY) {
      test.skip();
    }

    const variants = [];
    
    for (const params of PARAMETER_MATRIX) {
      await page.goto('http://localhost:3000');
      await page.waitForSelector('#canvas-container canvas');
      
      await page.evaluate((p) => window.setShaderParams?.(p), params);
      
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles(join(__dirname, '../fixtures/sample-photo.jpg'));
      await page.waitForTimeout(2000);
      
      const path = join(OUTPUT_DIR, `variant-${params.label}.png`);
      await page.locator('#output-canvas').screenshot({ path });
      
      variants.push({ path, label: params.label, params });
    }
    
    const comparison = await evaluator.compareVariants(null, variants);
    
    await writeFile(
      join(OUTPUT_DIR, 'optimization-report.json'),
      JSON.stringify(comparison, null, 2)
    );
    
    console.log('\n🏆 Winner:', comparison.winner.label);
    console.log('📊 Confidence:', comparison.analysis.confidence);
    console.log('💡', comparison.analysis.insights.join('\n💡 '));
    
    // The winner becomes our new default
    expect(comparison.analysis.confidence).toBe('high');
  });
});
