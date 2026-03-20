/**
 * Native C++ Test Runner
 * Compiles and runs mini_imgproc directly (no browser/WASM)
 * Tests parameter combinations and sends output to AI evaluator
 */

import { spawn } from 'child_process';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AIColoringEvaluator } from './evaluators/ai-evaluator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CPP_DIR = join(__dirname, '..', 'cpp-wasm');
const OUTPUT_DIR = join(__dirname, 'outputs');
const TEST_IMAGE = process.env.TEST_IMAGE || join(__dirname, 'fixtures', 'sample.ppm'); // Native test needs PPM format

// Helper: check if file exists
async function fileExists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

// Helper: convert JPG to PPM using ffmpeg
async function convertToPPM(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-i', inputPath, '-f', 'ppm', outputPath, '-y']);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed with code ${code}`));
    });
  });
}

// Helper: convert PPM to PNG using ffmpeg
async function convertPPMtoPNG(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-i', inputPath, '-f', 'png', outputPath, '-y']);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg PNG conversion failed with code ${code}`));
    });
  });
}

// Parameter variants to test
const VARIANTS = [
  { blurRadius: 3.2, edgeIntensity: 1.35, sigmaRatio: 3.2, closeRadius: 1, label: 'tuned-a' },
  { blurRadius: 3.5, edgeIntensity: 1.4, sigmaRatio: 3.5, closeRadius: 1, label: 'tuned-b' },
  { blurRadius: 3.8, edgeIntensity: 1.45, sigmaRatio: 3.8, closeRadius: 1, label: 'tuned-c' },
  { blurRadius: 3.3, edgeIntensity: 1.38, sigmaRatio: 3.3, closeRadius: 1, label: 'tuned-d' },
  { blurRadius: 3.6, edgeIntensity: 1.42, sigmaRatio: 3.6, closeRadius: 1, label: 'tuned-e' },
];

async function compileNative() {
  console.log('→ Compiling native C++ test runner...');
  
  return new Promise((resolve, reject) => {
    const proc = spawn('g++', [
      '-O3', '-std=c++17',
      join(CPP_DIR, 'mini_imgproc.cpp'),
      join(CPP_DIR, 'native-test.cpp'),
      '-o', join(OUTPUT_DIR, 'native-test'),
      '-I', CPP_DIR
    ], { cwd: CPP_DIR });
    
    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      if (code === 0) {
        console.log('✓ Native binary compiled');
        resolve();
      } else {
        reject(new Error(`Compilation failed: ${stderr}`));
      }
    });
  });
}

async function runNativeProcess(inputPath, outputPath, params) {
  return new Promise((resolve, reject) => {
    const args = [
      inputPath,
      outputPath,
      params.blurRadius.toString(),
      params.edgeIntensity.toString(),
      params.sigmaRatio.toString(),
      params.closeRadius.toString()
    ];
    
    const proc = spawn(join(OUTPUT_DIR, 'native-test'), args);
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Process failed: ${stderr}`));
      }
    });
  });
}

async function main() {
  console.log('🎨 Native C++ Test Runner\n');
  
  // Check API key
  if (!process.env.FIREWORKS_API_KEY && !process.env.SKIP_AI) {
    console.error('❌ Set FIREWORKS_API_KEY or SKIP_AI=1');
    process.exit(1);
  }
  
  // Auto-convert test image to PPM if needed
  if (TEST_IMAGE.endsWith('.ppm') && !await fileExists(TEST_IMAGE)) {
    const jpgPath = TEST_IMAGE.replace('.ppm', '.jpg');
    if (await fileExists(jpgPath)) {
      console.log(`→ Converting ${jpgPath} to PPM format...`);
      await convertToPPM(jpgPath, TEST_IMAGE);
    }
  }
  
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  // Compile native binary
  try {
    await compileNative();
  } catch (err) {
    console.error('❌ Compilation failed:', err.message);
    process.exit(1);
  }
  
  console.log(`🧪 Testing ${VARIANTS.length} parameter combinations...\n`);
  
  const evaluator = new AIColoringEvaluator();
  const results = [];
  
  // Test each variant
  for (const params of VARIANTS) {
    process.stdout.write(`  ${params.label}: `);
    
    try {
      // Native C++ outputs PPM format
      const ppmOutputPath = join(OUTPUT_DIR, `native-${params.label}.ppm`);
      
      // Run native C++ processor
      const start = Date.now();
      await runNativeProcess(TEST_IMAGE, ppmOutputPath, params);
      const elapsed = Date.now() - start;
      
      process.stdout.write(`${elapsed}ms → `);
      
      // Convert PPM to PNG for AI evaluator (which expects PNG)
      const pngOutputPath = join(OUTPUT_DIR, `native-${params.label}.png`);
      await convertPPMtoPNG(ppmOutputPath, pngOutputPath);
      
      // Evaluate with AI (unless skipped)
      if (process.env.SKIP_AI) {
        console.log('✓ (skipped AI)');
        results.push({ params, outputPath: pngOutputPath, evaluation: { overall: 0 } });
      } else {
        const evalResult = await evaluator.evaluate(pngOutputPath, 'standard', TEST_IMAGE);
        console.log(`${evalResult.overall}/10`);
        results.push({ params, outputPath: pngOutputPath, evaluation: evalResult });
      }
      
    } catch (err) {
      console.log(`✗ ${err.message.slice(0, 40)}`);
    }
  }
  
  // Rank and show winner
  if (!process.env.SKIP_AI && results.length > 0) {
    results.sort((a, b) => b.evaluation.overall - a.evaluation.overall);
    
    console.log('\n📊 Results');
    console.log('=========');
    
    results.forEach((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
      console.log(`${medal} ${r.params.label}: ${r.evaluation.overall}/10`);
    });
    
    const winner = results[0];
    console.log('\n🏆 Winner (encode these params):');
    console.log(JSON.stringify(winner.params, null, 2));
    
    // Save report
    const reportPath = join(OUTPUT_DIR, 'native-report.json');
    await writeFile(reportPath, JSON.stringify({ winner: winner.params, all: results }, null, 2));
    console.log(`\n💾 Report saved to ${reportPath}`);
  }
  
  // Cleanup
  try {
    await unlink(join(OUTPUT_DIR, 'native-test'));
  } catch {}
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
