import { NextResponse } from 'next/server';
import { ingestSourceRecord, normalizeClaimsTableError } from '../../../../lib/serverClaims';
import { hasServerSupabaseConfig, serverSupabase } from '../../../../lib/serverSupabase';

export const runtime = 'nodejs';

type SourceRow = { id: string; source_name: string; source_url: string };

export async function POST(request: Request) {
  if (!hasServerSupabaseConfig || !serverSupabase) {
    return NextResponse.json(
      { error: 'Server Supabase config is missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId : '';
  let query = serverSupabase
    .from('claim_notice_sources')
    .select('id, source_name, source_url')
    .eq('is_active', true);

  if (sourceId) {
    query = query.eq('id', sourceId);
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data: sources, error: sourceError } = await query;

  if (sourceError) {
    return NextResponse.json({ error: normalizeClaimsTableError(sourceError.message) }, { status: 500 });
  }

  const results = [];

  for (const source of (sources ?? []) as SourceRow[]) {
    results.push(await ingestSourceRecord(serverSupabase as never, source));
  }

  return NextResponse.json({ processed: results, count: results.length });
}
