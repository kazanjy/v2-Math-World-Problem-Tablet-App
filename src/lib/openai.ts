import type { GradeLevel, Theme, Topic, GeneratedQuestion, TopicDifficultySettings } from '../types';

// All OpenAI traffic goes through the serverless functions in /api so the API
// key stays on the server. Anything read from import.meta.env with a VITE_
// prefix is inlined into the client bundle at build time and is therefore
// public - the key must never be exposed that way.

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = `Request to ${path} failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) detail = body.error;
    } catch {
      // Response had no JSON body; keep the status-based message.
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export function formatMathText(input: string): string {
  if (!input) return input;
  let s = input;

  // Fractions: \frac{a}{b}, \tfrac{a}{b}, \dfrac{a}{b} -> a/b
  s = s.replace(/\\(?:t|d)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2');

  // Common math operators / symbols
  s = s
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\cdot/g, '·')
    .replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\%/g, '%')
    .replace(/\\\$/g, '$');

  // Strip math delimiters: \( \) \[ \] and $ ... $
  s = s.replace(/\\[()[\]]/g, '');
  s = s.replace(/\$/g, '');

  // Collapse spacing macros (\, \; \: \!) and extra whitespace
  s = s.replace(/\\[,;:!]/g, ' ');
  s = s.replace(/[ \t]{2,}/g, ' ').trim();

  return s;
}

interface GenerateQuestionParams {
  theme: Theme;
  customTheme?: string;
  gradeLevel?: GradeLevel; // Optional - used when not selecting topics
  topics?: Topic[]; // Optional - used when selecting specific topics
  customTopics?: string[]; // Optional - free-text topics entered by the user
  topicDifficulties?: TopicDifficultySettings; // Difficulty settings per topic
  previousQuestion?: string;
  previousGenre?: string; // Genre of previous question for variety
  previousSubTopic?: string; // Sub-topic of previous question for variety
  recentSubTopics?: string[]; // Last N sub-topics to avoid repeating
  selectedTopic?: string; // Pre-selected topic (preset or custom, for random selection)
  isRetry?: boolean;
  retryGenre?: string;
  retrySubTopic?: string; // Sub-topic to match when generating a similar problem
}


export async function generateQuestion(params: GenerateQuestionParams): Promise<GeneratedQuestion> {
  const { theme } = params;

  try {
    const parsed = await postJson<GeneratedQuestion>('/api/generate-question', params);

    // Convert any LaTeX the model emitted into plain text so it renders cleanly.
    parsed.question = formatMathText(parsed.question);
    parsed.explanation = formatMathText(parsed.explanation);
    parsed.answer = formatMathText(parsed.answer);

    return parsed;
  } catch (error) {
    console.error('Error generating question:', error);
    // Return a fallback question for development/testing
    return {
      question: `[Development Mode] If you have 5 ${theme === 'pokemon' ? 'Pokémon' : 'items'} and get 3 more, how many do you have?`,
      answer: '8',
      explanation: 'Start with 5, add 3 more. 5 + 3 = 8.',
      genre: 'addition',
      subTopic: 'single-digit',
      difficulty: 'easy',
    };
  }
}

// Recognize a single handwritten answer from a canvas image (data URL) using
// OpenAI vision. Returns the parsed value as a string (e.g. "42", "3/4",
// "-1.5"), or an empty string if nothing legible was found.
export async function recognizeHandwrittenAnswer(imageDataUrl: string): Promise<string> {
  try {
    const { value } = await postJson<{ value: string }>('/api/recognize-answer', { imageDataUrl });
    return value || '';
  } catch (error) {
    console.error('Error recognizing handwritten answer:', error);
    return '';
  }
}

// Coaching feedback produced by looking at the student's scratch pad after a
// wrong answer.
export interface WorkAnalysis {
  whatYouDidWell: string;
  whereYouWentWrong: string;
  howToFixIt: string;
}

export interface AnalyzeWorkParams {
  questionText: string;
  correctAnswer: string;
  userAnswer: string;
  explanation?: string;
  genre?: string;
  subTopic?: string;
  gradeLevel?: GradeLevel;
  scratchpadImage: string;
}

// Ask the tutor to read the student's handwritten scratch work and explain
// where it went wrong. Returns null if the analysis is unavailable, so callers
// can simply fall back to showing the worked solution.
export async function analyzeWork(params: AnalyzeWorkParams): Promise<WorkAnalysis | null> {
  try {
    const analysis = await postJson<WorkAnalysis>('/api/analyze-work', params);
    if (!analysis?.whereYouWentWrong && !analysis?.howToFixIt) return null;
    return {
      whatYouDidWell: formatMathText(analysis.whatYouDidWell || ''),
      whereYouWentWrong: formatMathText(analysis.whereYouWentWrong || ''),
      howToFixIt: formatMathText(analysis.howToFixIt || ''),
    };
  } catch (error) {
    console.error('Error analyzing scratch work:', error);
    return null;
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
  console.log('Answer comparison:', {
    userAnswer,
    correctAnswer,
    normalizedUser,
    normalizedCorrect,
    isEqual: normalizedUser === normalizedCorrect,
  });
  return normalizedUser === normalizedCorrect;
}
