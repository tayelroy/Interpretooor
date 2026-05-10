import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { interpretText } from '@/lib/ai/gemini-interpreter';

const API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { translatedText: 'Interpretation failed. OPENAI_API_KEY is not defined.', reasoning: [] },
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

  try {
    const client = new OpenAI({ apiKey: API_KEY });
    const result = await interpretText(text, targetLang ?? 'English', client);
    return NextResponse.json(result);
  } catch (error) {
    console.error('OpenAI Interpretation Error:', error);
    return NextResponse.json(
      { translatedText: 'Interpretation failed. Please check connection and try again.', reasoning: [] },
      { status: 500 }
    );
  }
}
