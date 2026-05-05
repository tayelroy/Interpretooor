import { GoogleGenAI, Type } from '@google/genai';
import { NextResponse } from 'next/server';

const API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { translatedText: 'Interpretation failed. GEMINI_API_KEY is not defined.', reasoning: [] },
      { status: 500 }
    );
  }

  const { text, targetLang } = (await request.json()) as { text?: string; targetLang?: string };

  if (!text) {
    return NextResponse.json(
      { translatedText: 'Interpretation failed. Please provide text to interpret.', reasoning: [] },
      { status: 400 }
    );
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  const prompt = `Interpret the following text from its native language into ${targetLang ?? 'English'}.
Focus on semantic accuracy, cultural nuances, and idiomatic expressions.
Identify specific parts that require "interpretation" rather than just translation.

Original Text: "${text}"`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['translatedText', 'reasoning'],
          properties: {
            translatedText: {
              type: Type.STRING,
            },
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
    if (!resultString) {
      throw new Error('Empty response from AI');
    }

    return NextResponse.json(JSON.parse(resultString));
  } catch (error) {
    console.error('Gemini Interpretation Error:', error);
    return NextResponse.json(
      {
        translatedText: 'Interpretation failed. Please check connection and try again.',
        reasoning: [],
      },
      { status: 500 }
    );
  }
}