import OpenAI from 'openai';

export interface InterpretationResult {
  translatedText: string;
  reasoning: {
    tag: string;
    source: string;
    concept?: string;
    decision: string;
  }[];
}

export async function interpretText(
  text: string,
  targetLang: string,
  client: OpenAI
): Promise<InterpretationResult> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a cultural translation expert. Interpret text with semantic accuracy, preserving cultural nuances and idiomatic expressions. Identify specific phrases that require interpretation rather than literal translation.',
      },
      {
        role: 'user',
        content: `Interpret the following text into ${targetLang}.\n\nOriginal Text: "${text}"`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'interpretation_result',
        strict: true,
        schema: {
          type: 'object',
          required: ['translatedText', 'reasoning'],
          additionalProperties: false,
          properties: {
            translatedText: { type: 'string' },
            reasoning: {
              type: 'array',
              items: {
                type: 'object',
                required: ['tag', 'source', 'concept', 'decision'],
                additionalProperties: false,
                properties: {
                  tag: { type: 'string' },
                  source: { type: 'string' },
                  concept: { type: ['string', 'null'] },
                  decision: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  });

  const resultString = response.choices[0]?.message?.content;
  if (!resultString) throw new Error('Empty response from AI');
  return JSON.parse(resultString) as InterpretationResult;
}
