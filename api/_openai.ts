// Shared server-side OpenAI access. Files prefixed with "_" are not routed by
// Vercel, so this stays a helper rather than a public endpoint.
//
// The API key lives in OPENAI_API_KEY (server-only). It must never be exposed
// as VITE_OPENAI_API_KEY: Vite inlines every VITE_-prefixed variable into the
// client bundle, which ships the secret to the browser.

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

export interface CallOptions {
  model?: string;
  messages: OpenAIMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonObject?: boolean;
}

export class OpenAIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function requireApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAIError('OpenAI API key not configured', 500);
  }
  return apiKey;
}

export async function callOpenAI(options: CallOptions): Promise<string> {
  const apiKey = requireApiKey();
  const { model = 'gpt-5.2', messages, temperature, maxTokens, jsonObject } = options;

  const body: Record<string, unknown> = { model, messages };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;
  if (jsonObject) body.response_format = { type: 'json_object' };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('OpenAI API error:', response.status, detail);
    throw new OpenAIError('OpenAI request failed', response.status);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new OpenAIError('No content in OpenAI response', 502);
  }
  return content as string;
}

// The model occasionally wraps JSON in a markdown fence despite instructions.
export function parseJsonContent<T>(content: string): T {
  const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean) as T;
}
