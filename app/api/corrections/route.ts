import { NextResponse } from 'next/server';
import { saveCorrection } from '@/lib/ai/memory-store';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Basic validation
    const { targetLang, originalPhrase, aiTranslation, validatorCorrection, reasoning } = body;
    
    if (!targetLang || !originalPhrase || !aiTranslation || !validatorCorrection || !reasoning) {
      return NextResponse.json(
        { error: 'Missing required correction fields' },
        { status: 400 }
      );
    }

    const newCorrection = await saveCorrection({
      sourceLang: body.sourceLang,
      targetLang,
      originalPhrase,
      aiTranslation,
      validatorCorrection,
      reasoning,
      semanticTags: body.semanticTags,
    });

    return NextResponse.json({ success: true, correction: newCorrection });
  } catch (error: unknown) {
    console.error('Error saving correction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
