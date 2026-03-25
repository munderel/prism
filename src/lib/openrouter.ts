export class AIError extends Error {
  constructor(
    message: string,
    public code: 'RATE_LIMITED' | 'MODEL_ERROR' | 'PARSE_ERROR' | 'TIMEOUT' | 'API_KEY_INVALID',
    public retryable: boolean
  ) {
    super(message);
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(config: {
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
    maxRetries: number;
    timeoutMs: number;
  }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.defaultModel = config.defaultModel;
    this.maxRetries = config.maxRetries;
    this.timeoutMs = config.timeoutMs;
  }

  async chat(
    messages: ChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number }
  ): Promise<{ content: string; model: string; usage: any }> {
    const model = options?.model ?? this.defaultModel;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://upwhiten.com',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens ?? 4096,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (res.status === 401) throw new AIError('Invalid API key', 'API_KEY_INVALID', false);
        if (res.status === 429) throw new AIError('Rate limited', 'RATE_LIMITED', true);
        if (res.status >= 500) throw new AIError('Server error', 'MODEL_ERROR', true);
        if (!res.ok) throw new AIError(`API error: ${res.status}`, 'MODEL_ERROR', false);

        const data = await res.json();
        return {
          content: data.choices?.[0]?.message?.content ?? '',
          model: data.model ?? model,
          usage: data.usage ?? {},
        };
      } catch (err: any) {
        lastError = err;
        if (err instanceof AIError && !err.retryable) throw err;
        if (err.name === 'AbortError') throw new AIError('Request timed out', 'TIMEOUT', true);
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
      }
    }
    throw lastError ?? new AIError('Unknown error', 'MODEL_ERROR', false);
  }

  async chatJSON<T>(messages: ChatMessage[], options?: any): Promise<T> {
    const response = await this.chat(messages, options);
    try {
      // Try to extract JSON from response (may be wrapped in markdown code blocks)
      let content = response.content.trim();
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) content = jsonMatch[1].trim();
      return JSON.parse(content);
    } catch {
      throw new AIError('Failed to parse AI response as JSON', 'PARSE_ERROR', true);
    }
  }
}

export const openrouter = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3-70b-instruct',
  maxRetries: 3,
  timeoutMs: 30000,
});

export type { ChatMessage };
