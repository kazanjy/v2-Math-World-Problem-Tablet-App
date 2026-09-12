import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// This function is intentionally self-contained (no imports from ../src): the
// Vercel Node runtime cannot resolve TypeScript modules outside the api/ folder.

const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
// Overridable without a code change (set OPENAI_MODEL in Vercel) so a model
// deprecation can be fixed by pointing at a current model.
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.2';

type Difficulty = 'easy' | 'medium' | 'hard' | 'super-hard';

const DIFFICULTY_FULL_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  'super-hard': 'Super Hard',
};

interface GenerateQuestionParams {
  theme: string;
  customTheme?: string;
  gradeLevel?: string;
  topics?: string[];
  customTopics?: string[];
  topicDifficulties?: Record<string, Difficulty[]>;
  format?: 'word' | 'numerical';
  previousQuestion?: string;
  previousGenre?: string;
  previousSubTopic?: string;
  recentSubTopics?: string[];
  selectedTopic?: string;
  isRetry?: boolean;
  retryGenre?: string;
  retrySubTopic?: string;
}

interface GeneratedQuestion {
  question: string;
  answer: string;
  explanation: string;
  genre: string;
  subTopic: string;
  difficulty: Difficulty;
}

const SYSTEM_PROMPT =
  'You are a helpful math teacher creating engaging word problems for students. Always respond with valid JSON. Write all text in plain language with NO LaTeX or markdown formatting — express fractions as "3/4" (or mixed numbers like "1 1/2"), never as \\(\\tfrac{3}{4}\\) or \\frac{3}{4}. CRITICAL: Before responding, verify (1) that the problem is actually solvable and has a valid, well-defined single answer — never produce an unsolvable, contradictory, or under-specified problem — and (2) that your "answer" field contains the EXACT same value that your "explanation" concludes with. Double-check your math.';

// Convert LaTeX the model may emit into plain text (e.g. "\\tfrac{3}{4}" -> "3/4").
function formatMathText(input: string): string {
  if (!input) return input;
  let s = input;
  s = s.replace(/\\(?:t|d)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2');
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
  s = s.replace(/\\[()[\]]/g, '');
  s = s.replace(/\$/g, '');
  s = s.replace(/\\[,;:!]/g, ' ');
  s = s.replace(/[ \t]{2,}/g, ' ').trim();
  return s;
}

function buildQuestionPrompt(params: GenerateQuestionParams): string {
  const {
    theme, customTheme, gradeLevel, topics, customTopics, topicDifficulties, format,
    previousQuestion, previousGenre, previousSubTopic, recentSubTopics,
    selectedTopic, isRetry, retryGenre, retrySubTopic,
  } = params;

  const presetTopics = topics ?? [];
  const freeTopics = customTopics ?? [];
  const allTopics: string[] = [...presetTopics, ...freeTopics];

  const themeDescription = theme === 'custom' && customTheme
    ? customTheme
    : theme === 'standard'
    ? 'general everyday scenarios'
    : theme;

  const isTopicMode = allTopics.length > 0;

  // Presentation style: word problem (default) vs a bare numerical expression.
  const isNumerical = format === 'numerical';
  const problemNoun = isNumerical
    ? 'direct numerical math problem (just the equation/computation, no story or theme)'
    : 'math word problem';
  const themeBlock = isNumerical
    ? ''
    : `\nTheme: ${themeDescription}\n${theme === 'custom' ? `Use this theme for the story context: ${customTheme}` : `Incorporate ${themeDescription} elements into the story.`}\n`;
  const formatRequirement = isNumerical
    ? `\n- FORMAT: The "question" field must be ONLY the math expression or a short direct question (e.g. "47 × 8 = ?", "What is 3/4 + 2/3?", "Solve for p: 2p + 3 = 17"). Do NOT include any story, names, characters, scenario, or theme.`
    : '';

  let prompt: string;

  if (isTopicMode) {
    const topicToUse = selectedTopic || allTopics[0];
    const topicList = selectedTopic ? selectedTopic : allTopics.join(', ');

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

    prompt = `Generate a ${problemNoun} focusing on ${selectedTopic ? `this topic: ${topicToUse}` : `one of these topics: ${topicList}`}.
${themeBlock}${difficultyConstraints}${varietyConstraints}
`;
  } else {
    const gradeDescription = !gradeLevel ? 'Grade 3' : (gradeLevel === 'K' ? 'Kindergarten (ages 5-6)' : `Grade ${gradeLevel}`);
    prompt = `Generate a ${problemNoun} for a ${gradeDescription} student.
${themeBlock}
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
- integers: "adding-integers" (E-M), "subtracting-integers" (M), "multiplying-integers" (M), "dividing-integers" (M), "absolute-value" (E-M), "order-of-operations-with-negatives" (H)
- exponents-roots: "squares" (E), "cubes" (M), "square-roots" (E-M), "cube-roots" (M), "powers-of-ten" (E), "exponent-rules" (M-H), "negative-exponents" (H), "scientific-notation" (M-H)
- statistics: "mean" (E-M), "median" (E), "mode" (E), "range" (E), "mean-from-frequency" (M), "weighted-average" (H), "simple-probability" (M), "probability-of-events" (M-H)
- word-problems: "money-problems" (E-M), "time-distance-rate" (M-H), "measurement" (E-M), "comparison" (E-M), "multi-step" (H)
- pre-algebra: "order-of-operations" (M), "variables-expressions" (M), "one-step-equations" (M), "inequalities" (H), "negative-numbers" (M), "absolute-value" (M), "ratios-proportions" (M)
- algebra: "two-step-equations" (M), "multi-step-equations" (H), "systems-of-equations" (SH), "polynomials" (H), "factoring" (H), "quadratics" (SH)
- geometry: "shape-identification" (E), "counting-sides-vertices" (E), "shape-properties" (E-M), "perimeter-squares-rectangles" (E), "perimeter-triangles" (M), "perimeter-irregular" (M), "area-rectangles" (E-M), "area-triangles" (M), "area-circles" (M), "area-composite-shapes" (H), "volume-cubes-boxes" (M), "volume-cylinders" (H), "angles-identifying" (E), "angles-measuring" (M), "angles-calculating" (M), "complementary-supplementary" (M), "pythagorean-theorem" (H), "coordinate-geometry" (H-SH)
- trigonometry: "degree-radian-conversion" (E-M), "sohcahtoa-ratios" (M), "sine-cosine-tangent-values" (M), "solving-right-triangles" (M-H), "angle-of-elevation-depression" (H), "unit-circle-values" (M-H), "pythagorean-identity" (H), "law-of-sines" (H), "law-of-cosines" (H)
- pre-calculus: "function-evaluation" (M), "composite-functions" (H), "inverse-functions" (H), "exponential-expressions" (H), "logarithms" (H), "arithmetic-geometric-sequences" (H), "polynomial-roots" (H), "rational-function-values" (H), "vector-magnitude" (M-H), "basic-limits" (H-SH)
- calculus: "evaluate-derivative-at-point" (H), "power-rule-derivative-value" (H), "slope-of-tangent-at-point" (H), "average-rate-of-change" (M-H), "definite-integral-value" (H-SH), "limit-value" (H)
`;

  if (isTopicMode) {
    prompt += `Requirements:
- Focus on one of these topics: ${allTopics.join(', ')}
- The answer MUST be a single value (a whole number, decimal, or a fraction written as one value like "3/4" or "0.75") — never a list, pair, or multiple values. Even for a custom topic, design the problem so it has exactly ONE such answer.
- If the exact answer is irrational (e.g. involves π or a square root, as often happens in trigonometry, pre-calculus, or geometry), give a decimal rounded to 2 decimal places (e.g. 0.87) so the answer is a single clean number.
- The problem MUST be fully solvable from the information given, with a valid, well-defined answer. NEVER generate an impossible, contradictory, under-specified, or undefined problem (e.g. missing information, or division by zero).${formatRequirement}
- ${isNumerical ? 'Keep it a clean computation' : `Make the word problem engaging and fun with the ${themeDescription} theme`}
- Gradually increase difficulty over time - start with easier problems and progress to harder ones
- Use varied sub-topics within the genre to ensure variety
- IMPORTANT: Double-check your math! The "answer" field MUST match the final answer in your "explanation". Verify the calculation is correct before responding.
${subTopicGuidance}
Respond in JSON format exactly like this. IMPORTANT: fill in the fields IN THIS ORDER — work the problem out completely in "explanation" FIRST, and only then set "answer" to the exact final value your explanation arrives at:
{
  "question": "The word problem text",
  "explanation": "Step-by-step solution showing how to solve it, ending with the final value",
  "answer": "The final numeric answer from the explanation (number only, e.g., '42' or '3.5' or '3/4')",
  "genre": "The specific math concept being tested (e.g., 'addition', 'subtraction', 'multiplication', 'division', 'fractions', 'decimals', 'percentages', 'pre-algebra', 'algebra', 'geometry', 'word-problems')",
  "subTopic": "The specific sub-topic within the genre (e.g., 'double-digit-with-carrying', 'adding-different-denominators', 'percent-of-number')",
  "difficulty": "The difficulty level of this problem: 'easy', 'medium', 'hard', or 'super-hard'"
}`;
  } else {
    const gradeDescription = !gradeLevel ? 'Grade 3' : (gradeLevel === 'K' ? 'Kindergarten (ages 5-6)' : `Grade ${gradeLevel}`);
    prompt += `Requirements:
- The problem should be appropriate for ${gradeDescription} students
- The answer must be a single number (can be a whole number, decimal, or fraction written as a single value like "3/4" or "0.75")
- If the exact answer is irrational (e.g. involves π or a square root), give a decimal rounded to 2 decimal places (e.g. 0.87) so the answer is a single clean number.
- The problem MUST be fully solvable from the information given, with a valid, well-defined answer. NEVER generate an impossible, contradictory, under-specified, or undefined problem (e.g. missing information, or division by zero).${formatRequirement}
- ${isNumerical ? 'Keep it a clean computation' : `Make the word problem engaging and fun with the ${themeDescription} theme`}
- Use varied sub-topics to ensure variety
- IMPORTANT: Double-check your math! The "answer" field MUST match the final answer in your "explanation". Verify the calculation is correct before responding.
${subTopicGuidance}
Respond in JSON format exactly like this. IMPORTANT: fill in the fields IN THIS ORDER — work the problem out completely in "explanation" FIRST, and only then set "answer" to the exact final value your explanation arrives at:
{
  "question": "The word problem text",
  "explanation": "Step-by-step solution showing how to solve it, ending with the final value",
  "answer": "The final numeric answer from the explanation (number only, e.g., '42' or '3.5' or '3/4')",
  "genre": "The math concept being tested (e.g., 'addition', 'subtraction', 'multiplication', 'division', 'fractions', 'percentages', 'word-problems')",
  "subTopic": "The specific sub-topic within the genre (e.g., 'double-digit-with-carrying', 'adding-different-denominators', 'money-problems')",
  "difficulty": "The difficulty level of this problem: 'easy', 'medium', 'hard', or 'super-hard'"
}`;
  }

  return prompt;
}

// Normalize a numeric/fraction answer for comparison (mirrors the client).
function normalizeAnswer(answer: string): string {
  let normalized = answer.trim().toLowerCase();
  const mixed = normalized.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = parseFloat(mixed[1]);
    const num = parseFloat(mixed[2]);
    const den = parseFloat(mixed[3]);
    if (!isNaN(whole) && !isNaN(num) && !isNaN(den) && den !== 0) {
      normalized = (whole + (whole < 0 ? -1 : 1) * (num / den)).toString();
    }
  } else if (normalized.includes('/')) {
    const parts = normalized.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0].trim());
      const den = parseFloat(parts[1].trim());
      if (!isNaN(num) && !isNaN(den) && den !== 0) {
        normalized = (num / den).toString();
      }
    }
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? normalized : (Math.round(n * 10000) / 10000).toString();
}

// Pull the final stated value out of a worked explanation: prefer the value
// after the last "=" sign, otherwise the last number in the text.
const VALUE = String.raw`-?\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?`;
function extractFinalValue(explanation: string): string | null {
  const eq = [...explanation.matchAll(new RegExp(String.raw`=\s*(${VALUE})`, 'g'))];
  if (eq.length > 0) return eq[eq.length - 1][1];
  const nums = [...explanation.matchAll(new RegExp(VALUE, 'g'))];
  if (nums.length > 0) return nums[nums.length - 1][0];
  return null;
}

// True when the answer field agrees with the explanation's concluding value
// (or when we can't extract one to compare against).
function answerMatchesExplanation(q: GeneratedQuestion): boolean {
  const final = extractFinalValue(q.explanation);
  if (!final) return true;
  return normalizeAnswer(final) === normalizeAnswer(q.answer);
}

const MAX_ATTEMPTS = 3;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
  }

  const openai = new OpenAI({ apiKey });

  const generateOnce = async (userPrompt: string): Promise<GeneratedQuestion> => {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content) as GeneratedQuestion;

    if (!parsed.question || !parsed.answer || !parsed.explanation || !parsed.genre || !parsed.difficulty) {
      throw new Error('Invalid response format from OpenAI');
    }

    const validDifficulties: Difficulty[] = ['easy', 'medium', 'hard', 'super-hard'];
    if (!validDifficulties.includes(parsed.difficulty)) {
      parsed.difficulty = 'medium';
    }
    if (!parsed.subTopic) {
      parsed.subTopic = 'general';
    }

    parsed.question = formatMathText(parsed.question);
    parsed.explanation = formatMathText(parsed.explanation);
    parsed.answer = formatMathText(String(parsed.answer));

    return parsed;
  };

  try {
    const params = (req.body ?? {}) as GenerateQuestionParams;
    const userPrompt = buildQuestionPrompt(params);

    // Generate, then verify the answer key agrees with the worked explanation.
    // A mismatch means the model committed to a number that its own solution
    // contradicts (a wrong answer key), so regenerate rather than ship it.
    let last: GeneratedQuestion | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const q = await generateOnce(userPrompt);
      last = q;
      if (answerMatchesExplanation(q)) {
        return res.status(200).json(q);
      }
      console.warn(
        `generate-question: answer/explanation mismatch (attempt ${attempt}/${MAX_ATTEMPTS}): answer="${q.answer}", explanation concludes "${extractFinalValue(q.explanation)}"`
      );
    }

    // Persistent mismatch: the worked explanation is the derivation, so trust
    // its concluding value over the bare answer field.
    const final = extractFinalValue(last!.explanation);
    if (final) {
      last!.answer = formatMathText(final);
    }
    return res.status(200).json(last);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('generate-question error:', error);
    return res.status(502).json({ error: 'Question generation failed', detail });
  }
}
