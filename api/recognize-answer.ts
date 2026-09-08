import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOpenAI, OpenAIError } from './_openai';

interface RecognizeAnswerRequest {
  imageDataUrl: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageDataUrl } = req.body as RecognizeAnswerRequest;
    if (!imageDataUrl) {
      return res.status(400).json({ error: 'Missing image' });
    }

    const content = await callOpenAI({
      messages: [
        {
          role: 'system',
          content:
            'You read a single handwritten math answer from an image. Respond with ONLY the value the student wrote - digits, an optional leading minus sign, a decimal point, or a fraction like "3/4" (or a mixed number like "1 1/2"). Do not include words, units, or explanation. If nothing is legible, respond with an empty string.',
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

    const raw = (content || '').trim();
    // Safety net: if stray words slipped in, pull out the numeric/fraction value.
    const match = raw.match(/-?\d+\s+\d+\/\d+|-?\d+\/\d+|-?\d*\.?\d+/);
    return res.status(200).json({ value: match ? match[0] : raw });
  } catch (error) {
    if (error instanceof OpenAIError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error recognizing handwritten answer:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
