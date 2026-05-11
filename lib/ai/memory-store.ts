import { supabase } from '@/lib/supabase-server';

export interface Correction {
  id: string;
  sourceLang?: string;
  targetLang: string;
  originalPhrase: string;
  aiTranslation: string;
  validatorCorrection: string;
  reasoning: string;
  semanticTags?: { key: string; value: string }[];
  timestamp: string;
}

export async function saveCorrection(correction: Omit<Correction, 'id' | 'timestamp'>): Promise<Correction> {
  const { data, error } = await supabase
    .from('ai_translation_memory')
    .insert([
      {
        source_lang: correction.sourceLang,
        target_lang: correction.targetLang,
        original_phrase: correction.originalPhrase,
        ai_translation: correction.aiTranslation,
        validator_correction: correction.validatorCorrection,
        reasoning: correction.reasoning,
        semantic_tags: correction.semanticTags,
      }
    ])
    .select()
    .single();

  if (error) {
    console.error('Failed to save correction to Supabase:', error);
    throw new Error(`Failed to save correction: ${error.message}`);
  }

  // Map the snake_case database response back to camelCase for our application
  return {
    id: data.id,
    sourceLang: data.source_lang,
    targetLang: data.target_lang,
    originalPhrase: data.original_phrase,
    aiTranslation: data.ai_translation,
    validatorCorrection: data.validator_correction,
    reasoning: data.reasoning,
    semanticTags: data.semantic_tags,
    timestamp: data.created_at,
  };
}

export async function getRelevantCorrections(targetLang: string): Promise<Correction[]> {
  const { data, error } = await supabase
    .from('ai_translation_memory')
    .select('*')
    .ilike('target_lang', targetLang)
    .order('created_at', { ascending: false })
    .limit(50); // Get the 50 most recent relevant corrections

  if (error) {
    console.error('Failed to fetch relevant corrections from Supabase:', error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    sourceLang: row.source_lang ? String(row.source_lang) : undefined,
    targetLang: String(row.target_lang),
    originalPhrase: String(row.original_phrase),
    aiTranslation: String(row.ai_translation),
    validatorCorrection: String(row.validator_correction),
    reasoning: String(row.reasoning),
    semanticTags: row.semantic_tags as { key: string; value: string }[] | undefined,
    timestamp: String(row.created_at),
  }));
}

