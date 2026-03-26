import { NextResponse } from 'next/server';
import { hasServerSupabaseConfig, serverSupabase } from '../../../../lib/serverSupabase';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasServerSupabaseConfig || !serverSupabase) {
    return NextResponse.json(
      { error: 'Server Supabase config is missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const sourceName = typeof body.sourceName === 'string' ? body.sourceName.trim() : '';
    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
    const fetchFrequencyLabel = typeof body.fetchFrequencyLabel === 'string' ? body.fetchFrequencyLabel.trim() : '';

    if (!sourceName || !sourceUrl) {
      return NextResponse.json({ error: 'Source name and URL are required.' }, { status: 400 });
    }

    const { data, error } = await serverSupabase
      .from('claim_notice_sources')
      .upsert(
        {
          source_name: sourceName,
          source_url: sourceUrl,
          is_active: body.isActive ?? true,
          fetch_frequency_label: fetchFrequencyLabel || null
        },
        {
          onConflict: 'source_url'
        }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ source: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save source.' },
      { status: 500 }
    );
  }
}

