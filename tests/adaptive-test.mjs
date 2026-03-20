import { AIColoringEvaluator } from './evaluators/ai-evaluator.js';
import fs from 'fs';

const evaluator = new AIColoringEvaluator();
const orig = 'fixtures/test-photo.jpg';
const proc = 'outputs/opencv-adaptive.png';

const score = await evaluator.evaluate(proc, 'standard', orig, { method: 'adaptive-threshold' });
console.log(`OpenCV adaptive threshold: ${score}/10`);
