import OpenAI from 'openai';
import type { ParsedMdh } from '@/lib/mdh-utils';

export interface ReasoningItem {
  tagKey: string;
  tagValue: string;
  phrase: string;
  explanation: string;
}

export interface InterpretationResult {
  translatedText: string;
  reasoning: ReasoningItem[];
}

function buildSemanticContext(parsed: ParsedMdh): string {
  if (parsed.tags.length === 0) return '';
  const lines = parsed.tags.map(
    (t) => `- "${t.phrase}" → ${t.key}=${t.value}`
  );
  return `\nPhrase-level semantic context:\n${lines.join('\n')}\n`;
}

export async function interpretMdh(
  parsed: ParsedMdh,
  targetLang: string,
  client: OpenAI
): Promise<InterpretationResult> {
  const semanticContext = buildSemanticContext(parsed);

  const systemPrompt = [
    'You are a cultural translation expert.',
    'Translate with semantic accuracy, preserving cultural nuances and idiomatic expressions.',
    'When translating annotated phrases, respect their semantic tags — never translate a sarcastic tone as genuinely positive, never translate idioms literally, preserve persuasive intent.',
  ].join(' ');

  const userPrompt = [
    `Translate the following text into ${targetLang}.`,
    semanticContext,
    `Source text:\n${parsed.plainText}`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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
                required: ['tagKey', 'tagValue', 'phrase', 'explanation'],
                additionalProperties: false,
                properties: {
                  tagKey:      { type: 'string' },
                  tagValue:    { type: 'string' },
                  phrase:      { type: 'string' },
                  explanation: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from AI');
  return JSON.parse(raw) as InterpretationResult;
}
