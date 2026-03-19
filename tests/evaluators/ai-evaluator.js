import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * AI-powered image quality evaluator
 * Uses Kimi 2 via Fireworks AI to assess coloring book suitability
 */
export class AIColoringEvaluator {
  constructor(apiKey = process.env.FIREWORKS_API_KEY) {
    if (!apiKey) {
      throw new Error('FIREWORKS_API_KEY required. Get one at https://fireworks.ai/account/api-keys');
    }
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.fireworks.ai/inference/v1';
    this.model = 'accounts/fireworks/routers/kimi-k2p5-turbo'; // Kimi 2.5 Turbo on Fireworks
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

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        temperature: 0.2, // Lower for consistent JSON output
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            },
            {
              type: 'text',
              text: criteriaPrompts[criteria] || criteriaPrompts.standard
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Fireworks API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.error('Raw response:', text);
      throw new Error('Could not parse AI response as JSON');
    }

    return JSON.parse(jsonMatch[0]);
  }

  async compareVariants(variants) {
    // variants = [{ path: '...', label: 'blur-2.0', params: {...} }, ...]
    
    const results = [];
    for (const variant of variants) {
      console.log(`  Evaluating: ${variant.label}...`);
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
      insights: winner.evaluation.suggestions || [],
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
    console.log('');
    console.log('Environment:');
    console.log('  FIREWORKS_API_KEY - Required. Get at https://fireworks.ai/account/api-keys');
    process.exit(1);
  }

  const evaluator = new AIColoringEvaluator();
  const result = await evaluator.evaluate(imagePath, criteria || 'standard');
  
  console.log(JSON.stringify(result, null, 2));
}
