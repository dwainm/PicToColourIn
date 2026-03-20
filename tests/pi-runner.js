#!/usr/bin/env node
/**
 * Pi Session Test Runner
 * Simple headless browser test harness for shader tuning
 * Run this in a pi session: node tests/pi-runner.js
 */

import { chromium } from 'playwright';
import { AIColoringEvaluator } from './evaluators/ai-evaluator.js';
import { mkdir, writeFile, readdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = process.env.TEST_IMAGE || join(__dirname, 'fixtures', 'sample.jpg');
const OUTPUT_DIR = join(__dirname, 'outputs');
const PORT = 8888;

// Parameter variants - pushing for 6/10 from 5/10 baseline
const VARIANTS = [
  { blurRadius: 3.2, edgeIntensity: 1.35, threshold: 0.16, sigmaRatio: 3.2, label: 'tuned-a' },
  { blurRadius: 3.5, edgeIntensity: 1.4, threshold: 0.17, sigmaRatio: 3.5, label: 'tuned-b' },
  { blurRadius: 3.8, edgeIntensity: 1.45, threshold: 0.19, sigmaRatio: 3.8, label: 'tuned-c' },
  { blurRadius: 3.3, edgeIntensity: 1.38, threshold: 0.165, sigmaRatio: 3.3, label: 'tuned-d' },
  { blurRadius: 3.6, edgeIntensity: 1.42, threshold: 0.175, sigmaRatio: 3.6, label: 'tuned-e' },
];

async function startServer() {
  // Simple static file server - serve from parent directory (project root)
  const { createServer } = await import('http');
  const { readFile } = await import('fs/promises');
  const { join: pathJoin } = await import('path');
  
  const rootDir = pathJoin(__dirname, '..'); // Serve from project root
  
  const server = createServer(async (req, res) => {
    let url = req.url === '/' ? '/index.html' : req.url;
    
    // Serve empty favicon to prevent 404 errors
    if (url === '/favicon.ico') {
      res.writeHead(200, { 'Content-Type': 'image/x-icon' });
      res.end(Buffer.from([]));
      return;
    }
    
    // Try to serve from root first
    let filePath = pathJoin(rootDir, url);
    let content;
    
    try {
      content = await readFile(filePath);
    } catch {
      // If not found in root, try src-js/ (for WASM files)
      if (url.endsWith('.wasm') || url.endsWith('wasm-processor.js') || url.endsWith('imgproc-wasm.js')) {
        try {
          filePath = pathJoin(rootDir, 'src-js', url);
          content = await readFile(filePath);
        } catch {
          res.writeHead(404);
          res.end('Not found: ' + url);
          return;
        }
      } else {
        res.writeHead(404);
        res.end('Not found: ' + url);
        return;
      }
    }
      res.end('Not found: ' + url);
    }
  });
  
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`🌐 Server: http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function renderVariantWithPage(page, params, testImagePath) {
  // Capture console errors (but ignore favicon 404s)
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore favicon and common non-critical 404s
      if (!text.includes('favicon') && !text.includes('::ERR_FAILED') && !text.includes('404')) {
        errors.push(text);
      }
    }
  });
  page.on('pageerror', err => errors.push(err.message));
  
  try {
    await page.goto(`http://localhost:${PORT}`);
    await page.waitForLoadState('networkidle');
    
    // Upload test image
    await page.locator('#fileInput').setInputFiles(testImagePath);
    
    // Wait for editor section to become visible (not just canvas)
    await page.waitForSelector('#editorSection', { 
      state: 'visible',
      timeout: 15000 
    });
    
    // Wait for processing
    await page.waitForTimeout(2000);
    
    if (errors.length > 0) {
      throw new Error('JS errors: ' + errors.slice(0, 3).join('; '));
    }
    
    // Set params
    await page.evaluate((p) => {
      const app = window.app;
      if (app) {
        if (app.blurSlider) app.blurSlider.value = p.blurRadius;
        if (app.edgeSlider) app.edgeSlider.value = p.edgeIntensity;
        if (app.thresholdSlider) app.thresholdSlider.value = p.threshold;
        if (app.onParamChange) app.onParamChange();
      }
    }, params);
    
    await page.waitForTimeout(2000);
    
    // Wait for processing to complete (look for status text)
    await page.waitForTimeout(3000); // Give WASM time to process
    
    // Screenshot the SOURCE canvas (original image)
    const sourceCanvas = await page.locator('#sourceCanvas');
    const sourcePath = join(OUTPUT_DIR, `source-${params.label}.png`);
    await sourceCanvas.screenshot({ path: sourcePath });
    
    // Screenshot the OUTPUT canvas (processed coloring page)
    const outputCanvas = await page.locator('#outputCanvas');
    const outputPath = join(OUTPUT_DIR, `variant-${params.label}.png`);
    await outputCanvas.screenshot({ path: outputPath });
    
    return { sourcePath, outputPath };
    
  } catch (err) {
    // Debug screenshot on failure
    const debugPath = join(OUTPUT_DIR, `debug-${params.label}.png`);
    await page.screenshot({ path: debugPath, fullPage: true });
    console.log(`   Debug screenshot: ${debugPath}`);
    if (errors.length > 0) {
      console.log(`   JS errors: ${errors.slice(0, 3).join(', ')}`);
    }
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
  const browser = await chromium.launch({ 
    headless: true,
    args: [
      '--use-angle=swiftshader',  // Software WebGL
      '--enable-unsafe-webgpu',
      '--disable-web-security',
      '--allow-file-access-from-files'
    ]
  });
  
  console.log(`🧪 Testing ${VARIANTS.length} parameter combinations in parallel...\n`);
  
  const evaluator = new AIColoringEvaluator();
  
  // Run all variants in parallel with progress tracking
  const status = {};
  VARIANTS.forEach(p => status[p.label] = 'pending');
  
  const printStatus = () => {
    const lines = VARIANTS.map(p => {
      const s = status[p.label];
      if (s === 'pending') return `  ${p.label}: ⏳ waiting...`;
      if (s === 'running') return `  ${p.label}: 🔄 processing...`;
      if (s.startsWith('done:')) return `  ${p.label}: ${s.slice(5)}`;
      return `  ${p.label}: ${s}`;
    }).join('\n');
    
    // Clear screen and redraw
    console.clear();
    console.log(`🧪 Testing ${VARIANTS.length} parameter combinations in parallel...\n`);
    console.log(lines);
  };
  
  const promises = VARIANTS.map(async (params) => {
    status[params.label] = 'running';
    printStatus();
    
    // Create page for this variant (sequential to avoid Playwright errors)
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        const { sourcePath, outputPath } = await renderVariantWithPage(page, params, TEST_IMAGE);
        
        if (process.env.SKIP_AI) {
          status[params.label] = 'done: ✓ rendered (skipped AI)';
          printStatus();
          await page.close();
          return { params, sourcePath, outputPath, evaluation: { overall: 0 } };
        } else {
          const evalResult = await evaluator.evaluate(outputPath, 'standard', TEST_IMAGE);
          status[params.label] = `done: ✓ ${evalResult.overall}/10`;
          printStatus();
          await page.close();
          return { params, sourcePath, outputPath, evaluation: evalResult };
        }
        
      } catch (err) {
        if (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, attempts * 1000));
        } else {
          status[params.label] = `done: ✗ ${err.message.slice(0, 30)}`;
          printStatus();
          await page.close();
          return { params, path: null, evaluation: { overall: 0 }, error: err.message };
        }
      }
    }
  });
  
  const results = await Promise.all(promises);
  
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
