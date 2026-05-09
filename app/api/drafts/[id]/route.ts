import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');

  if (!wallet) {
    return NextResponse.json({ error: 'wallet query param is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('id', id)
    .eq('wallet', wallet)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { wallet, title, content, source_lang } = body;

  if (!wallet) {
    return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
  };
  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = content;
  if (source_lang !== undefined) updateData.source_lang = source_lang;

  const { data, error } = await supabase
    .from('drafts')
    .update(updateData)
    .eq('id', id)
    .eq('wallet', wallet)
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { wallet } = body;

  if (!wallet) {
    return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('drafts')
    .delete()
    .eq('id', id)
    .eq('wallet', wallet)
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
