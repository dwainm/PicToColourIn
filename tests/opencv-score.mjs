#!/usr/bin/env node
/**
 * Quick OpenCV benchmark with AI scoring
 */
import ai from './evaluators/ai-evaluator.js';
import fs from 'fs';

const orig = fs.readFileSync('fixtures/test-photo.jpg').toString('base64');

const variants = [
  'opencv-canny.png',
  'opencv-dog.png', 
  'opencv-scharr.png',
  'opencv-canny-l2.png',
  'native-pure-7-5.5.png'  // Our best for comparison
];

console.log('🤖 AI Evaluation: OpenCV vs Custom\n');

for (const file of variants) {
  try {
    const proc = fs.readFileSync('outputs/' + file).toString('base64');
    const score = await ai.evaluate(orig, proc, { label: file });
    console.log(`${file}: ${score}/10`);
  } catch (e) {
    console.log(`${file}: ERROR - ${e.message}`);
  }
}
