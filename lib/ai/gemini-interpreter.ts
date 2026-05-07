import { GoogleGenAI, Type } from '@google/genai';

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
  client: GoogleGenAI
): Promise<InterpretationResult> {
  const prompt = `Interpret the following text from its native language into ${targetLang}.
Focus on semantic accuracy, cultural nuances, and idiomatic expressions.
Identify specific parts that require "interpretation" rather than just translation.

Original Text: "${text}"`;

  const response = await client.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        required: ['translatedText', 'reasoning'],
        properties: {
          translatedText: { type: Type.STRING },
          reasoning: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['tag', 'source', 'decision'],
              properties: {
                tag: { type: Type.STRING },
                source: { type: Type.STRING },
                concept: { type: Type.STRING },
                decision: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });

  const resultString = response.text;
  if (!resultString) throw new Error('Empty response from AI');
  return JSON.parse(resultString) as InterpretationResult;
}
