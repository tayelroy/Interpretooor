import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { interpretMdh } from '@/lib/ai/openai-interpreter';
import type { ParsedMdh } from '@/lib/mdh-utils';

const API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: Request) {
  if (!API_KEY) {
    return NextResponse.json(
      { translatedText: 'Interpretation failed. OPENAI_API_KEY is not defined.', reasoning: [] },
      { status: 500 }
    );
  }

  const body = (await request.json()) as { parsedMdh?: ParsedMdh; targetLang?: string };

  if (!body.parsedMdh?.plainText) {
    return NextResponse.json(
      { translatedText: 'Interpretation failed. Please provide parsedMdh with content.', reasoning: [] },
      { status: 400 }
    );
  }

  try {
    const client = new OpenAI({ apiKey: API_KEY });
    const result = await interpretMdh(body.parsedMdh, body.targetLang ?? 'English', client);
    return NextResponse.json(result);
  } catch (error) {
    console.error('OpenAI Interpretation Error:', error);
    return NextResponse.json(
      { translatedText: 'Interpretation failed. Please check connection and try again.', reasoning: [] },
      { status: 500 }
    );
  }
}
