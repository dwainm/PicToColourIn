import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * AI-powered image quality evaluator
 * Uses Claude Vision to assess coloring book suitability
 */
export class AIColoringEvaluator {
  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY required');
    }
    this.client = new Anthropic({ apiKey });
  }

  async evaluate(imagePath, criteria = 'standard') {
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const criteriaPrompts = {
      standard: `Evaluate this image as a coloring book page. Score each criterion 1-10:

1. LINE_CLARITY: Are outlines crisp, continuous, and clear? (no gaps, no fuzziness)
2. DETAIL_BALANCE: Is there a good mix of simple and detailed areas? (not too cluttered, not too empty)
3. RECOGNIZABILITY: Can you clearly identify what the subject is?
4. COLORABILITY: Are regions well-defined and closed for coloring? (no open lines that bleed)
5. PRINT_QUALITY: Would this look good printed on standard paper?

Respond ONLY as JSON:
{
  "LINE_CLARITY": {"score": 0, "reason": "brief explanation"},
  "DETAIL_BALANCE": {"score": 0, "reason": "brief explanation"},
  "RECOGNIZABILITY": {"score": 0, "reason": "brief explanation"},
  "COLORABILITY": {"score": 0, "reason": "brief explanation"},
  "PRINT_QUALITY": {"score": 0, "reason": "brief explanation"},
  "overall": 0,
  "suggestions": ["suggestion 1", "suggestion 2"]
}`,

      strict: `As a professional coloring book artist, critique this page harshly. Score 1-10:

1. LINE_WEIGHT: Are lines consistent thickness appropriate for crayons/markers?
2. COMPOSITION: Is the subject centered and well-framed?
3. BACKGROUND: Is background clean (white/transparent) or appropriately handled?
4. COMPLEXITY: Is this appropriate for the target age (assume 6-10 years)?
5. ARTIFACTS: Any stray marks, noise, or processing errors?

JSON response only:
{
  "LINE_WEIGHT": {"score": 0, "reason": ""},
  "COMPOSITION": {"score": 0, "reason": ""},
  "BACKGROUND": {"score": 0, "reason": ""},
  "COMPLEXITY": {"score": 0, "reason": ""},
  "ARTIFACTS": {"score": 0, "reason": ""},
  "overall": 0,
  "rejects": false,
  "rejection_reason": "if rejects"
}`
    };

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image
            }
          },
          {
            type: 'text',
            text: criteriaPrompts[criteria] || criteriaPrompts.standard
          }
        ]
      }]
    });

    // Extract JSON from response
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Could not parse AI response as JSON');
    }

    return JSON.parse(jsonMatch[0]);
  }

  async compareVariants(originalPath, variants) {
    // variants = [{ path: '...', label: 'blur-2.0', params: {...} }, ...]
    
    const results = [];
    for (const variant of variants) {
      const evaluation = await this.evaluate(variant.path);
      results.push({
        ...variant,
        evaluation
      });
    }

    // Sort by overall score
    results.sort((a, b) => b.evaluation.overall - a.evaluation.overall);
    
    return {
      winner: results[0],
      rankings: results,
      analysis: this.generateAnalysis(results)
    };
  }

  generateAnalysis(results) {
    const winner = results[0];
    const runnerUp = results[1];
    
    return {
      recommendedParams: winner.params,
      margin: winner.evaluation.overall - runnerUp.evaluation.overall,
      insights: winner.evaluation.suggestions,
      confidence: winner.evaluation.overall > 8 ? 'high' : winner.evaluation.overall > 6 ? 'medium' : 'low'
    };
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const [,, imagePath, criteria] = process.argv;
  
  if (!imagePath) {
    console.log('Usage: node ai-evaluator.js <image-path> [criteria]');
    console.log('  criteria: standard (default) | strict');
    process.exit(1);
  }

  const evaluator = new AIColoringEvaluator();
  const result = await evaluator.evaluate(imagePath, criteria || 'standard');
  
  console.log(JSON.stringify(result, null, 2));
}
