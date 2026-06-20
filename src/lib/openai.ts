import OpenAI from 'openai';
import type { GradeLevel, Theme, Topic, GeneratedQuestion, Difficulty, TopicDifficultySettings } from '../types';
import { DIFFICULTY_FULL_LABELS } from '../types';

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
  topicDifficulties?: TopicDifficultySettings; // Difficulty settings per topic
  previousQuestion?: string;
  previousGenre?: string; // Genre of previous question for variety
  previousSubTopic?: string; // Sub-topic of previous question for variety
  recentSubTopics?: string[]; // Last N sub-topics to avoid repeating
  selectedTopic?: Topic; // Pre-selected topic (for random selection)
  isRetry?: boolean;
  retryGenre?: string;
  retrySubTopic?: string; // Sub-topic to match when generating a similar problem
}

export async function generateQuestion(params: GenerateQuestionParams): Promise<GeneratedQuestion> {
  const { theme, customTheme, gradeLevel, topics, topicDifficulties, previousQuestion, previousGenre, previousSubTopic, recentSubTopics, selectedTopic, isRetry, retryGenre, retrySubTopic } = params;

  const themeDescription = theme === 'custom' && customTheme
    ? customTheme
    : theme === 'standard'
    ? 'general everyday scenarios'
    : theme;

  // Determine if we're in topic mode or grade mode
  const isTopicMode = topics && topics.length > 0;

  let prompt: string;

  if (isTopicMode) {
    // Topic-based mode - use pre-selected topic if provided, otherwise list all
    const topicToUse = selectedTopic || topics[0];
    const topicList = selectedTopic ? selectedTopic : topics.join(', ');

    // Build difficulty constraints per topic
    let difficultyConstraints = '';
    if (topicDifficulties) {
      const topicsToConstrain = selectedTopic ? [selectedTopic] : topics;
      const constraints = topicsToConstrain.map(topic => {
        const difficulties = topicDifficulties[topic];
        if (difficulties && difficulties.length > 0 && difficulties.length < 4) {
          const diffLabels = difficulties.map(d => DIFFICULTY_FULL_LABELS[d]).join(', ');
          return `- ${topic}: only ${diffLabels} difficulty`;
        }
        return null;
      }).filter(Boolean);

      if (constraints.length > 0) {
        difficultyConstraints = `
Difficulty constraints by topic:
${constraints.join('\n')}
`;
      }
    }

    // Build variety constraints
    let varietyConstraints = '';
    if (previousGenre || previousSubTopic || (recentSubTopics && recentSubTopics.length > 0)) {
      varietyConstraints = '\nVARIETY REQUIREMENTS (CRITICAL - MUST FOLLOW):\n';

      // Extract parent categories from recent sub-topics (e.g., "perimeter-triangles" -> "perimeter")
      const recentCategories = new Set<string>();
      if (recentSubTopics) {
        for (const subTopic of recentSubTopics) {
          // Extract the first word/concept as the parent category
          const category = subTopic.split('-')[0];
          if (category) {
            recentCategories.add(category);
          }
        }
      }

      if (previousGenre) {
        varietyConstraints += `- The previous question was "${previousGenre}"${previousSubTopic ? ` with sub-topic "${previousSubTopic}"` : ''}. Choose a COMPLETELY DIFFERENT concept.\n`;
      }
      if (recentSubTopics && recentSubTopics.length > 0) {
        varietyConstraints += `- DO NOT use any of these recently used sub-topics: ${recentSubTopics.join(', ')}\n`;
      }
      if (recentCategories.size > 0) {
        varietyConstraints += `- AVOID these concept categories entirely (they've been used recently): ${Array.from(recentCategories).join(', ')}\n`;
        varietyConstraints += `- For example, if "perimeter" is listed, do NOT pick perimeter-triangles, perimeter-irregular, etc.\n`;
      }
      varietyConstraints += `- Pick a FRESH concept that is fundamentally different from recent questions.\n`;
    }

    prompt = `Generate a math word problem focusing on ${selectedTopic ? `this topic: ${topicToUse}` : `one of these topics: ${topicList}`}.

Theme: ${themeDescription}
${theme === 'custom' ? `Use this theme for the story context: ${customTheme}` : `Incorporate ${themeDescription} elements into the story.`}
${difficultyConstraints}${varietyConstraints}
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
    prompt += `The student struggled with this concept: ${retryGenre}${retrySubTopic && retrySubTopic !== 'general' ? ` (specifically the sub-topic: ${retrySubTopic})` : ''}
Generate a similar problem testing the same skill at the same difficulty, but with different numbers and a different story context.

`;
  } else if (previousQuestion) {
    prompt += `The previous question was: "${previousQuestion}"
Generate a DIFFERENT type of math problem (different operation or concept).

`;
  }

  // Sub-topic taxonomy guidance for the AI with difficulty hints
  const subTopicGuidance = `
Sub-topic examples by genre (with difficulty hints E=Easy, M=Medium, H=Hard, SH=Super-Hard):
- addition: "single-digit" (E), "double-digit-no-carrying" (E), "double-digit-with-carrying" (M), "adding-three-numbers" (M), "adding-money" (M)
- subtraction: "single-digit" (E), "double-digit-no-borrowing" (E), "double-digit-with-borrowing" (M), "subtracting-across-zeros" (H), "subtracting-money" (M)
- multiplication: "times-tables" (E), "single-by-double-digit" (M), "double-by-double-digit" (H), "multiplying-by-10-100-1000" (E), "multiplying-decimals" (H)
- division: "basic-division-facts" (E), "division-with-remainders" (M), "long-division" (H), "dividing-by-10-100-1000" (E), "dividing-decimals" (H)
- fractions: "identifying-fractions" (E), "equivalent-fractions" (E), "comparing-fractions" (M), "adding-same-denominator" (E), "adding-different-denominators" (M), "subtracting-fractions" (M), "multiplying-fractions" (H), "dividing-fractions" (H), "mixed-numbers" (M), "fraction-of-whole" (M)
- decimals: "place-value" (E), "comparing-decimals" (E), "adding-decimals" (M), "subtracting-decimals" (M), "multiplying-decimals" (H), "dividing-decimals" (H), "decimal-fraction-conversion" (M)
- percentages: "percent-of-number" (M), "fraction-decimal-percent-conversion" (M), "percent-increase-decrease" (H), "discounts-sales-tax" (M), "tips-gratuity" (M)
- word-problems: "money-problems" (E-M), "time-distance-rate" (M-H), "measurement" (E-M), "comparison" (E-M), "multi-step" (H)
- pre-algebra: "order-of-operations" (M), "variables-expressions" (M), "one-step-equations" (M), "inequalities" (H), "negative-numbers" (M), "absolute-value" (M), "ratios-proportions" (M)
- algebra: "two-step-equations" (M), "multi-step-equations" (H), "systems-of-equations" (SH), "polynomials" (H), "factoring" (H), "quadratics" (SH)
- geometry: "shape-identification" (E), "counting-sides-vertices" (E), "shape-properties" (E-M), "perimeter-squares-rectangles" (E), "perimeter-triangles" (M), "perimeter-irregular" (M), "area-rectangles" (E-M), "area-triangles" (M), "area-circles" (M), "area-composite-shapes" (H), "volume-cubes-boxes" (M), "volume-cylinders" (H), "angles-identifying" (E), "angles-measuring" (M), "angles-calculating" (M), "complementary-supplementary" (M), "pythagorean-theorem" (H), "coordinate-geometry" (H-SH)
`;

  if (isTopicMode) {
    prompt += `Requirements:
- Focus on one of these topics: ${topics!.join(', ')}
- The answer must be a single number (can be a whole number, decimal, or fraction written as a single value like "3/4" or "0.75")
- Make the word problem engaging and fun with the ${themeDescription} theme
- Gradually increase difficulty over time - start with easier problems and progress to harder ones
- Use varied sub-topics within the genre to ensure variety
- IMPORTANT: Double-check your math! The "answer" field MUST match the final answer in your "explanation". Verify the calculation is correct before responding.
${subTopicGuidance}
Respond in JSON format exactly like this:
{
  "question": "The word problem text",
  "answer": "The numeric answer (number only, e.g., '42' or '3.5' or '3/4')",
  "explanation": "Step-by-step solution explanation showing how to solve it",
  "genre": "The specific math concept being tested (e.g., 'addition', 'subtraction', 'multiplication', 'division', 'fractions', 'decimals', 'percentages', 'pre-algebra', 'algebra', 'geometry', 'word-problems')",
  "subTopic": "The specific sub-topic within the genre (e.g., 'double-digit-with-carrying', 'adding-different-denominators', 'percent-of-number')",
  "difficulty": "The difficulty level of this problem: 'easy', 'medium', 'hard', or 'super-hard'"
}`;
  } else {
    const gradeDescription = !gradeLevel ? 'Grade 3' : (gradeLevel === 'K' ? 'Kindergarten (ages 5-6)' : `Grade ${gradeLevel}`);
    prompt += `Requirements:
- The problem should be appropriate for ${gradeDescription} students
- The answer must be a single number (can be a whole number, decimal, or fraction written as a single value like "3/4" or "0.75")
- Make the word problem engaging and fun with the ${themeDescription} theme
- Use varied sub-topics to ensure variety
- IMPORTANT: Double-check your math! The "answer" field MUST match the final answer in your "explanation". Verify the calculation is correct before responding.
${subTopicGuidance}
Respond in JSON format exactly like this:
{
  "question": "The word problem text",
  "answer": "The numeric answer (number only, e.g., '42' or '3.5' or '3/4')",
  "explanation": "Step-by-step solution explanation showing how to solve it",
  "genre": "The math concept being tested (e.g., 'addition', 'subtraction', 'multiplication', 'division', 'fractions', 'percentages', 'word-problems')",
  "subTopic": "The specific sub-topic within the genre (e.g., 'double-digit-with-carrying', 'adding-different-denominators', 'money-problems')",
  "difficulty": "The difficulty level of this problem: 'easy', 'medium', 'hard', or 'super-hard'"
}`;
  }

  // Log the full prompt for debugging
  console.log('=== QUESTION GENERATION PROMPT ===');
  console.log(prompt);
  console.log('=================================');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful math teacher creating engaging word problems for students. Always respond with valid JSON. CRITICAL: Before responding, verify that your "answer" field contains the EXACT same value that your "explanation" concludes with. Double-check your math.',
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

    // Default subTopic if not provided
    if (!parsed.subTopic) {
      parsed.subTopic = 'general';
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
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'system',
          content:
            'You read a single handwritten math answer from an image. Respond with ONLY the value the student wrote — digits, an optional leading minus sign, a decimal point, or a fraction like "3/4" (or a mixed number like "1 1/2"). Do not include words, units, or explanation. If nothing is legible, respond with an empty string.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What value is written here?' },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    });

    const raw = (response.choices[0]?.message?.content || '').trim();
    // Safety net: if stray words slipped in, pull out the numeric/fraction value.
    const match = raw.match(/-?\d+\s+\d+\/\d+|-?\d+\/\d+|-?\d*\.?\d+/);
    return match ? match[0] : raw;
  } catch (error) {
    console.error('Error recognizing handwritten answer:', error);
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
  console.log('Answer comparison:', {
    userAnswer,
    correctAnswer,
    normalizedUser,
    normalizedCorrect,
    isEqual: normalizedUser === normalizedCorrect,
  });
  return normalizedUser === normalizedCorrect;
}
