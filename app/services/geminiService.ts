export interface TranslationResult {
  translatedText: string;
  reasoning: {
    tag: string;
    source: string;
    concept?: string;
    decision: string;
  }[];
}

export async function interpretText(text: string, targetLang: string = 'English'): Promise<TranslationResult> {
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

  return (await response.json()) as TranslationResult;
}