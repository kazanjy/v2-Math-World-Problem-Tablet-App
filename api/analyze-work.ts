import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOpenAI, parseJsonContent, OpenAIError } from './_openai';

interface AnalyzeWorkRequest {
  questionText: string;
  correctAnswer: string;
  userAnswer: string;
  explanation?: string;
  genre?: string;
  subTopic?: string;
  gradeLevel?: string;
  scratchpadImage: string; // base64 data URL of the scratch pad canvas
}

export interface WorkAnalysis {
  whatYouDidWell: string;
  whereYouWentWrong: string;
  howToFixIt: string;
}

function describeGrade(gradeLevel?: string): string {
  if (!gradeLevel) return 'elementary school';
  if (gradeLevel === 'K') return 'Kindergarten';
  return `grade ${gradeLevel}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      questionText,
      correctAnswer,
      userAnswer,
      explanation,
      genre,
      subTopic,
      gradeLevel,
      scratchpadImage,
    } = req.body as AnalyzeWorkRequest;

    if (!scratchpadImage || !questionText) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const gradeDesc = describeGrade(gradeLevel);

    const content = await callOpenAI({
      temperature: 0.3,
      maxTokens: 400,
      messages: [
        {
          role: 'system',
          content: `You are a kind, encouraging math tutor analyzing a ${gradeDesc} student's scratch work on a math word problem. The student got the answer WRONG. Your job is to look at their handwritten work in the image and figure out exactly where they went off track.

Be specific about what you see in their work. Point out:
1. What they did right (always start positive)
2. The specific step or calculation where the mistake happened
3. A gentle explanation of what they should have done differently

Keep your tone warm and encouraging - this is a kid. Use simple language appropriate for their grade level. Be concise (3-5 sentences max).

Write in plain text with NO LaTeX or markdown - express fractions as "3/4", never as \\frac{3}{4}.

If the scratch pad is blank or you cannot read the work, say so in "whereYouWentWrong" and use "howToFixIt" to explain the correct approach instead.

Respond with valid JSON only: {"whatYouDidWell": "...", "whereYouWentWrong": "...", "howToFixIt": "..."}`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `Question: ${questionText}`,
                `Correct answer: ${correctAnswer}`,
                `Student's answer: ${userAnswer}`,
                explanation ? `Worked solution: ${explanation}` : null,
                genre ? `Math concept: ${genre}${subTopic ? ` (${subTopic})` : ''}` : null,
              ]
                .filter(Boolean)
                .join('\n'),
            },
            {
              type: 'image_url',
              image_url: { url: scratchpadImage, detail: 'low' },
            },
          ],
        },
      ],
    });

    let parsed: WorkAnalysis;
    try {
      parsed = parseJsonContent<WorkAnalysis>(content);
    } catch {
      console.error('Failed to parse analysis response:', content);
      return res.status(502).json({ error: 'Failed to parse analysis' });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    if (error instanceof OpenAIError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error analyzing work:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
