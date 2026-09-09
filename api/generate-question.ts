import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { buildQuestionPrompt, QUESTION_SYSTEM_PROMPT } from '../src/lib/questionPrompt';
import type { GenerateQuestionParams } from '../src/lib/questionPrompt';
import { formatMathText } from '../src/lib/mathText';
import type { GeneratedQuestion, Difficulty } from '../src/types';

// Prefer a dedicated server-only key; fall back to the existing VITE_ var so
// the function works without renaming env vars (Vercel exposes all project env
// vars to serverless functions regardless of prefix).
const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;

// Overridable without a code change (set OPENAI_MODEL in Vercel) so a model
// deprecation can be fixed by pointing at a current model.
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.2';

const openai = new OpenAI({ apiKey });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
  }

  try {
    const params = (req.body ?? {}) as GenerateQuestionParams;
    const userPrompt = buildQuestionPrompt(params);

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: QUESTION_SYSTEM_PROMPT },
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
    parsed.answer = formatMathText(parsed.answer);

    return res.status(200).json(parsed);
  } catch (error) {
    console.error('generate-question error:', error);
    return res.status(502).json({ error: 'Question generation failed' });
  }
}
