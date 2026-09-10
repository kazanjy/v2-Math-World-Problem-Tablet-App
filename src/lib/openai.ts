import type { GeneratedQuestion } from '../types';
import type { GenerateQuestionParams } from './questionPrompt';

// Re-exported so existing imports (`from '../lib/openai'`) keep working.
export { formatMathText } from './mathText';
export type { GenerateQuestionParams } from './questionPrompt';

// Generate a question via the server-side function (keeps the API key off the
// client). Falls back to a simple local question if the request fails.
export async function generateQuestion(params: GenerateQuestionParams): Promise<GeneratedQuestion> {
  try {
    const res = await fetch('/api/generate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      throw new Error(`Question API returned ${res.status}`);
    }
    return (await res.json()) as GeneratedQuestion;
  } catch (error) {
    console.error('Error generating question:', error);
    // Fallback so the UI doesn't hang if generation is unavailable.
    return {
      question: `[Development Mode] If you have 5 ${params.theme === 'pokemon' ? 'Pokémon' : 'items'} and get 3 more, how many do you have?`,
      answer: '8',
      explanation: 'Start with 5, add 3 more. 5 + 3 = 8.',
      genre: 'addition',
      subTopic: 'single-digit',
      difficulty: 'easy',
    };
  }
}

// Recognize a single handwritten answer via the server-side function.
// Returns the parsed value (e.g. "42", "3/4"), or "" if unavailable/illegible.
export async function recognizeHandwrittenAnswer(imageDataUrl: string): Promise<string> {
  try {
    const res = await fetch('/api/recognize-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl }),
    });
    if (!res.ok) {
      throw new Error(`Recognize API returned ${res.status}`);
    }
    const data = (await res.json()) as { value?: string };
    return data.value ?? '';
  } catch (error) {
    console.error('Error recognizing handwritten answer:', error);
    return '';
  }
}

// Ask the server for a kid-friendly analysis of a specific wrong answer.
// Returns the analysis text, or "" if unavailable.
export async function analyzeMistake(input: {
  question: string;
  userAnswer?: string;
  correctAnswer: string;
  explanation?: string;
}): Promise<string> {
  try {
    const res = await fetch('/api/analyze-mistake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`Analyze API returned ${res.status}`);
    }
    const data = (await res.json()) as { analysis?: string };
    return data.analysis ?? '';
  } catch (error) {
    console.error('Error analyzing mistake:', error);
    return '';
  }
}

// Helper to normalize answers for comparison
export function normalizeAnswer(answer: string): string {
  // Remove extra whitespace and lowercase
  let normalized = answer.trim().toLowerCase();

  // Handle mixed numbers like "1 1/2" or "2 3/4"
  const mixedNumberMatch = normalized.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixedNumberMatch) {
    const whole = parseFloat(mixedNumberMatch[1]);
    const numerator = parseFloat(mixedNumberMatch[2]);
    const denominator = parseFloat(mixedNumberMatch[3]);
    if (!isNaN(whole) && !isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
      const sign = whole < 0 ? -1 : 1;
      normalized = (whole + sign * (numerator / denominator)).toString();
    }
  }
  // Handle simple fractions like "3/4"
  else if (normalized.includes('/')) {
    const parts = normalized.split('/');
    if (parts.length === 2) {
      const numerator = parseFloat(parts[0].trim());
      const denominator = parseFloat(parts[1].trim());
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        normalized = (numerator / denominator).toString();
      }
    }
  }

  // Parse as number and round to avoid floating point issues
  const num = parseFloat(normalized);
  if (!isNaN(num)) {
    // Round to 4 decimal places to handle floating point comparison
    return (Math.round(num * 10000) / 10000).toString();
  }

  return normalized;
}

export function checkAnswer(userAnswer: string, correctAnswer: string): boolean {
  const normalizedUser = normalizeAnswer(userAnswer);
  const normalizedCorrect = normalizeAnswer(correctAnswer);
  return normalizedUser === normalizedCorrect;
}
