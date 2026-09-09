import type { GradeLevel, Theme, Topic, TopicDifficultySettings } from '../types';
import { DIFFICULTY_FULL_LABELS } from '../types';

export interface GenerateQuestionParams {
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

export const QUESTION_SYSTEM_PROMPT =
  'You are a helpful math teacher creating engaging word problems for students. Always respond with valid JSON. Write all text in plain language with NO LaTeX or markdown formatting — express fractions as "3/4" (or mixed numbers like "1 1/2"), never as \\(\\tfrac{3}{4}\\) or \\frac{3}{4}. CRITICAL: Before responding, verify that your "answer" field contains the EXACT same value that your "explanation" concludes with. Double-check your math.';

// Build the user prompt for a question generation request. Pure function so it
// can run identically on the server (serverless function) or anywhere else.
export function buildQuestionPrompt(params: GenerateQuestionParams): string {
  const {
    theme, customTheme, gradeLevel, topics, customTopics, topicDifficulties,
    previousQuestion, previousGenre, previousSubTopic, recentSubTopics,
    selectedTopic, isRetry, retryGenre, retrySubTopic,
  } = params;

  // Combined pool of preset + custom topics.
  const presetTopics = topics ?? [];
  const freeTopics = customTopics ?? [];
  const allTopics: string[] = [...presetTopics, ...freeTopics];

  const themeDescription = theme === 'custom' && customTheme
    ? customTheme
    : theme === 'standard'
    ? 'general everyday scenarios'
    : theme;

  const isTopicMode = allTopics.length > 0;

  let prompt: string;

  if (isTopicMode) {
    const topicToUse = selectedTopic || allTopics[0];
    const topicList = selectedTopic ? selectedTopic : allTopics.join(', ');

    // Difficulty constraints per preset topic (custom topics have none).
    let difficultyConstraints = '';
    if (topicDifficulties) {
      const presetToConstrain = selectedTopic
        ? presetTopics.filter(t => t === selectedTopic)
        : presetTopics;
      const constraints = presetToConstrain.map(topic => {
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

    // Variety constraints
    let varietyConstraints = '';
    if (previousGenre || previousSubTopic || (recentSubTopics && recentSubTopics.length > 0)) {
      varietyConstraints = '\nVARIETY REQUIREMENTS (CRITICAL - MUST FOLLOW):\n';

      const recentCategories = new Set<string>();
      if (recentSubTopics) {
        for (const subTopic of recentSubTopics) {
          const category = subTopic.split('-')[0];
          if (category) recentCategories.add(category);
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
- Focus on one of these topics: ${allTopics.join(', ')}
- The answer MUST be a single value (a whole number, decimal, or a fraction written as one value like "3/4" or "0.75") — never a list, pair, or multiple values. Even for a custom topic, design the problem so it has exactly ONE such answer.
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

  return prompt;
}
