import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json({ error: 'wallet query param is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('drafts')
    .select('id, title, source_lang, updated_at')
    .eq('wallet', wallet)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { wallet, title, content, source_lang } = body;

  if (!wallet) {
    return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('drafts')
    .insert([{ 
      wallet, 
      title: title || 'Untitled Draft', 
      content: content || null, 
      source_lang: source_lang || 'English' 
    }])
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
