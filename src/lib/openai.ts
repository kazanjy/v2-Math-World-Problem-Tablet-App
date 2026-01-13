import OpenAI from 'openai';
import type { GradeLevel, Theme, Topic, GeneratedQuestion, Difficulty } from '../types';

const openaiApiKey = import.meta.env.VITE_OPENAI_API_KEY;

if (!openaiApiKey) {
  console.warn('OpenAI API key not set. Please set VITE_OPENAI_API_KEY');
}

const openai = new OpenAI({
  apiKey: openaiApiKey || 'placeholder-key',
  dangerouslyAllowBrowser: true, // For MVP; in production, use a backend
});

interface GenerateQuestionParams {
  theme: Theme;
  customTheme?: string;
  gradeLevel?: GradeLevel; // Optional - used when not selecting topics
  topics?: Topic[]; // Optional - used when selecting specific topics
  previousQuestion?: string;
  isRetry?: boolean;
  retryGenre?: string;
}

export async function generateQuestion(params: GenerateQuestionParams): Promise<GeneratedQuestion> {
  const { theme, customTheme, gradeLevel, topics, previousQuestion, isRetry, retryGenre } = params;

  const themeDescription = theme === 'custom' && customTheme
    ? customTheme
    : theme === 'standard'
    ? 'general everyday scenarios'
    : theme;

  // Determine if we're in topic mode or grade mode
  const isTopicMode = topics && topics.length > 0;

  let prompt: string;

  if (isTopicMode) {
    // Topic-based mode
    const topicList = topics.join(', ');
    prompt = `Generate a math word problem focusing on one of these topics: ${topicList}.

Theme: ${themeDescription}
${theme === 'custom' ? `Use this theme for the story context: ${customTheme}` : `Incorporate ${themeDescription} elements into the story.`}

`;
  } else {
    // Grade-based mode
    const gradeDescription = !gradeLevel ? 'Grade 3' : (gradeLevel === 'K' ? 'Kindergarten (ages 5-6)' : `Grade ${gradeLevel}`);
    prompt = `Generate a math word problem for a ${gradeDescription} student.

Theme: ${themeDescription}
${theme === 'custom' ? `Use this theme for the story context: ${customTheme}` : `Incorporate ${themeDescription} elements into the story.`}

`;
  }

  if (isRetry && retryGenre) {
    prompt += `The student struggled with this concept: ${retryGenre}
Generate a similar problem testing the same skill, but with different numbers and context.

`;
  } else if (previousQuestion) {
    prompt += `The previous question was: "${previousQuestion}"
Generate a DIFFERENT type of math problem (different operation or concept).

`;
  }

  if (isTopicMode) {
    prompt += `Requirements:
- Focus on one of these topics: ${topics!.join(', ')}
- The answer must be a single number (can be a whole number, decimal, or fraction written as a single value like "3/4" or "0.75")
- Make the word problem engaging and fun with the ${themeDescription} theme
- Gradually increase difficulty over time - start with easier problems and progress to harder ones

Respond in JSON format exactly like this:
{
  "question": "The word problem text",
  "answer": "The numeric answer (number only, e.g., '42' or '3.5' or '3/4')",
  "explanation": "Step-by-step solution explanation showing how to solve it",
  "genre": "The specific math concept being tested (e.g., 'addition', 'subtraction', 'multiplication', 'division', 'fractions', 'decimals', 'percentages', 'pre-algebra', 'algebra', 'geometry', 'word-problems')",
  "difficulty": "The difficulty level of this problem: 'easy', 'medium', 'hard', or 'super-hard'"
}`;
  } else {
    const gradeDescription = !gradeLevel ? 'Grade 3' : (gradeLevel === 'K' ? 'Kindergarten (ages 5-6)' : `Grade ${gradeLevel}`);
    prompt += `Requirements:
- The problem should be appropriate for ${gradeDescription} students
- The answer must be a single number (can be a whole number, decimal, or fraction written as a single value like "3/4" or "0.75")
- Make the word problem engaging and fun with the ${themeDescription} theme

Respond in JSON format exactly like this:
{
  "question": "The word problem text",
  "answer": "The numeric answer (number only, e.g., '42' or '3.5' or '3/4')",
  "explanation": "Step-by-step solution explanation showing how to solve it",
  "genre": "The math concept being tested (e.g., 'addition', 'subtraction', 'multiplication', 'division', 'fractions', 'percentages', 'word-problem-distance', 'word-problem-money')",
  "difficulty": "The difficulty level of this problem: 'easy', 'medium', 'hard', or 'super-hard'"
}`;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful math teacher creating engaging word problems for students. Always respond with valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content) as GeneratedQuestion;

    // Validate the response has all required fields
    if (!parsed.question || !parsed.answer || !parsed.explanation || !parsed.genre || !parsed.difficulty) {
      throw new Error('Invalid response format from OpenAI');
    }

    // Validate difficulty is one of the expected values
    const validDifficulties: Difficulty[] = ['easy', 'medium', 'hard', 'super-hard'];
    if (!validDifficulties.includes(parsed.difficulty)) {
      parsed.difficulty = 'medium'; // Default to medium if invalid
    }

    return parsed;
  } catch (error) {
    console.error('Error generating question:', error);
    // Return a fallback question for development/testing
    return {
      question: `[Development Mode] If you have 5 ${theme === 'pokemon' ? 'Pokémon' : 'items'} and get 3 more, how many do you have?`,
      answer: '8',
      explanation: 'Start with 5, add 3 more. 5 + 3 = 8.',
      genre: 'addition',
      difficulty: 'easy',
    };
  }
}

// Helper to normalize answers for comparison
export function normalizeAnswer(answer: string): string {
  // Remove whitespace
  let normalized = answer.trim().toLowerCase();

  // Handle fractions - convert to decimal for comparison
  if (normalized.includes('/')) {
    const parts = normalized.split('/');
    if (parts.length === 2) {
      const numerator = parseFloat(parts[0]);
      const denominator = parseFloat(parts[1]);
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
  return normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer);
}
