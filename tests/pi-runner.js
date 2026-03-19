#!/usr/bin/env node
/**
 * Pi Session Test Runner
 * Simple headless browser test harness for shader tuning
 * Run this in a pi session: node tests/pi-runner.js
 */

import { chromium } from 'playwright';
import { AIColoringEvaluator } from './evaluators/ai-evaluator.js';
import { mkdir, writeFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';

const TEST_IMAGE = process.env.TEST_IMAGE || './tests/fixtures/sample.jpg';
const OUTPUT_DIR = './tests/outputs';
const PORT = 8888;

// Parameter variants to test
const VARIANTS = [
  { blurRadius: 0.5, edgeIntensity: 1.0, threshold: 0.2, label: 'sharp' },
  { blurRadius: 2.0, edgeIntensity: 0.8, threshold: 0.25, label: 'balanced' },
  { blurRadius: 4.0, edgeIntensity: 0.6, threshold: 0.3, label: 'smooth' },
  { blurRadius: 1.0, edgeIntensity: 1.2, threshold: 0.18, label: 'crisp' },
  { blurRadius: 3.0, edgeIntensity: 0.9, threshold: 0.22, label: 'soft' },
];

async function startServer() {
  // Simple static file server
  const { createServer } = await import('http');
  const { readFile } = await import('fs/promises');
  
  const server = createServer(async (req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url;
    const path = join('.', url);
    
    try {
      const content = await readFile(path);
      const ext = path.split('.').pop();
      const ct = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', jpg: 'image/jpeg' }[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': ct });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`🌐 Server: http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function renderVariant(browser, params, testImagePath) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  
  try {
    await page.goto(`http://localhost:${PORT}`);
    
    // Wait for app init
    await page.waitForSelector('#outputCanvas', { timeout: 10000 });
    
    // Expose params setter
    await page.evaluate((p) => {
      // Try to set params if the app exposes them
      if (window.app && window.app.processor) {
        window.app.blurSlider.value = p.blurRadius;
        window.app.edgeSlider.value = p.edgeIntensity;
        window.app.thresholdSlider.value = p.threshold;
        window.app.onParamChange();
      }
    }, params);
    
    // Upload test image
    const input = await page.locator('#fileInput');
    await input.setInputFiles(testImagePath);
    
    // Wait for processing
    await page.waitForTimeout(3000);
    
    // Screenshot the canvas
    const canvas = await page.locator('#outputCanvas');
    const outputPath = join(OUTPUT_DIR, `variant-${params.label}.png`);
    await canvas.screenshot({ path: outputPath });
    
    await page.close();
    return outputPath;
    
  } catch (err) {
    await page.close();
    throw err;
  }
}

async function main() {
  console.log('🎨 Pi Session Shader Tester\n');
  
  // Check API key
  if (!process.env.FIREWORKS_API_KEY) {
    console.error('❌ Set FIREWORKS_API_KEY first');
    process.exit(1);
  }
  
  // Check test image exists
  try {
    await readdir(join(TEST_IMAGE, '..'));
  } catch {
    console.error(`❌ Test image not found: ${TEST_IMAGE}`);
    console.log('   Place a test image at tests/fixtures/sample.jpg');
    process.exit(1);
  }
  
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  // Clean old outputs
  const oldFiles = await readdir(OUTPUT_DIR).catch(() => []);
  for (const f of oldFiles.filter(x => x.startsWith('variant-'))) {
    await unlink(join(OUTPUT_DIR, f));
  }
  
  // Start server & browser
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  
  console.log(`🧪 Testing ${VARIANTS.length} parameter combinations...\n`);
  
  const evaluator = new AIColoringEvaluator();
  const results = [];
  
  for (const params of VARIANTS) {
    process.stdout.write(`  ${params.label}... `);
    
    try {
      const path = await renderVariant(browser, params, TEST_IMAGE);
      
      if (process.env.SKIP_AI) {
        console.log('✓ rendered (skipped AI eval)');
        results.push({ params, path, evaluation: { overall: 0 } });
      } else {
        const evalResult = await evaluator.evaluate(path, 'standard');
        results.push({ params, path, evaluation: evalResult });
        console.log(`✓ ${evalResult.overall}/10`);
      }
      
    } catch (err) {
      console.log(`✗ ${err.message}`);
    }
  }
  
  await browser.close();
  server.close();
  
  if (!process.env.SKIP_AI && results.length > 0) {
    // Rank results
    results.sort((a, b) => b.evaluation.overall - a.evaluation.overall);
    
    console.log('\n📊 Results');
    console.log('=========');
    
    results.forEach((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
      console.log(`${medal} ${r.params.label}: ${r.evaluation.overall}/10`);
      if (r.evaluation.suggestions?.[0]) {
        console.log(`   💡 ${r.evaluation.suggestions[0]}`);
      }
    });
    
    const winner = results[0];
    console.log('\n🏆 Recommended defaults:');
    console.log(JSON.stringify(winner.params, null, 2));
    
    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      winner: winner.params,
      allResults: results.map(r => ({
        label: r.params.label,
        score: r.evaluation.overall,
        params: r.params,
        path: r.path
      }))
    };
    
    await writeFile(
      join(OUTPUT_DIR, 'report.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n💾 Report saved to ${OUTPUT_DIR}/report.json`);
    
    if (winner.evaluation.overall < 6) {
      console.log('\n⚠️  Quality is low - consider adjusting shader code');
      process.exit(1);
    }
  }
  
  console.log('\n✅ Done');
}

main().catch(err => {
  console.error('💥', err);
  process.exit(1);
});
