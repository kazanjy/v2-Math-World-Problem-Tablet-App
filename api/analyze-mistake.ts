import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Self-contained (no ../src imports): the Vercel Node runtime cannot resolve
// TypeScript modules outside the api/ folder.

const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.2';

const SYSTEM_PROMPT =
  'You are a warm, encouraging math tutor for a child. Given a word problem, the student\'s WRONG answer, and the correct answer, explain in 2-3 short sentences what most likely went wrong (the specific slip, e.g. a place-value error, wrong operation, or arithmetic mistake) and give ONE concrete tip to get it right next time. Be kind and specific. Use plain language and plain numbers/fractions (like 3/4) — NO LaTeX or markdown.';

// Convert any LaTeX to plain text.
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

interface AnalyzeRequest {
  question?: string;
  userAnswer?: string;
  correctAnswer?: string;
  explanation?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
  }

  const { question, userAnswer, correctAnswer, explanation } = (req.body ?? {}) as AnalyzeRequest;
  if (!question || !correctAnswer) {
    return res.status(400).json({ error: 'Missing question or correctAnswer' });
  }

  const openai = new OpenAI({ apiKey });

  try {
    const userPrompt = `Problem: ${question}
The student's answer: ${userAnswer || '(no answer)'}
The correct answer: ${correctAnswer}
${explanation ? `How to solve it: ${explanation}` : ''}

Explain what most likely went wrong and give one tip.`;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const analysis = formatMathText((response.choices[0]?.message?.content || '').trim());
    return res.status(200).json({ analysis });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('analyze-mistake error:', error);
    return res.status(502).json({ error: 'Analysis failed', detail });
  }
}
