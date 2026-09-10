import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;

// Overridable without a code change (set OPENAI_MODEL in Vercel).
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.2';

const SYSTEM_PROMPT =
  'You read a single handwritten math answer from an image. Respond with ONLY the value the student wrote — digits, an optional leading minus sign, a decimal point, or a fraction like "3/4" (or a mixed number like "1 1/2"). Do not include words, units, or explanation. If nothing is legible, respond with an empty string.';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing OPENAI_API_KEY' });
  }

  const openai = new OpenAI({ apiKey });

  try {
    const { imageDataUrl } = (req.body ?? {}) as { imageDataUrl?: string };
    if (!imageDataUrl) {
      return res.status(400).json({ error: 'Missing imageDataUrl' });
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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
    return res.status(200).json({ value: match ? match[0] : raw });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('recognize-answer error:', error);
    return res.status(502).json({ error: 'Recognition failed', detail });
  }
}
