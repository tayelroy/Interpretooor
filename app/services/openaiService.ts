import type { InterpretationResult } from '@/lib/ai/openai-interpreter';

export type { InterpretationResult };

export async function interpretText(text: string, targetLang: string = 'English'): Promise<InterpretationResult> {
  const response = await fetch('/api/interpret', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, targetLang }),
  });

  if (!response.ok) {
    throw new Error('Failed to interpret text');
  }

  return (await response.json()) as InterpretationResult;
}
