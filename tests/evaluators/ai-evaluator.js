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

  /**
   * Evaluate a coloring page image
   * @param {string} processedPath - Path to processed coloring page
   * @param {string} criteria - Evaluation criteria
   * @param {string|null} originalPath - Optional path to original photo for comparison
   */
  async evaluate(processedPath, criteria = 'standard', originalPath = null) {
    const processedBuffer = await fs.readFile(processedPath);
    const processedBase64 = processedBuffer.toString('base64');
    
    let originalBase64 = null;
    if (originalPath) {
      try {
        const originalBuffer = await fs.readFile(originalPath);
        originalBase64 = originalBuffer.toString('base64');
      } catch (err) {
        console.warn('Could not load original image:', err.message);
      }
    }

    const criteriaPrompts = {
      standard: originalBase64 
        ? `I have TWO images: 1) Original photo 2) Coloring page version. Rate the coloring page 1-10 for how well it captures the subject with clean, colorable outlines. CRITICAL: Respond ONLY with a number, then brief reason comparing to original. Examples: "7 - captures dog well, good outlines" or "4 - lost facial details, faint lines".`
        : `Rate this coloring page 1-10. CRITICAL: Respond with ONLY a number, then brief reason. Examples: "7 - good outlines, usable" or "4 - faint lines, hard to color".`,

      strict: originalBase64
        ? `Compare original photo to coloring page. Rate harshly 1-10. ONLY number + brief reason. Example: "5 - lost detail, broken lines". Did it preserve key features? 10 words max.`
        : `Rate harshly 1-10. ONLY number + brief reason. Example: "5 - broken lines, noisy". Respond in 10 words max.`,
    };

    const messages = [{
      role: 'user',
      content: []
    }];
    
    // Add original if available
    if (originalBase64) {
      messages[0].content.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${originalBase64}` }
      });
    }
    
    // Add processed image
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${processedBase64}` }
    });
    
    // Add text prompt
    messages[0].content.push({
      type: 'text',
      text: criteriaPrompts[criteria] || criteriaPrompts.standard
    });

    // Make API request
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        max_tokens: 500,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Fireworks API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    
    // Debug: log raw response
    console.log('  🤖 AI raw:', text.substring(0, 150).replace(/\n/g, ' '));

    // Extract first number from response (simple format: "7 - reason")
    const numberMatch = text.match(/(\d+)/);
    
    if (!numberMatch) {
      console.error('Raw response:', text);
      throw new Error('Could not parse score from AI response');
    }
    
    const score = parseInt(numberMatch[1], 10);
    
    // Return in expected format
    return {
      overall: score,
      suggestions: [text.slice(0, 100)] // First 100 chars as suggestion
    };
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
