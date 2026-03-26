import { NextResponse } from 'next/server';
import { ingestSourceRecord, normalizeClaimsTableError } from '../../../../lib/serverClaims';
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
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId : '';
    const action = typeof body.action === 'string' ? body.action : '';

    if (!candidateId || !action) {
      return NextResponse.json({ error: 'Candidate ID and action are required.' }, { status: 400 });
    }

    const candidateResponse = await serverSupabase
      .from('claim_discovery_candidates')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (candidateResponse.error || !candidateResponse.data) {
      return NextResponse.json(
        { error: normalizeClaimsTableError(candidateResponse.error?.message || 'Candidate not found.') },
        { status: 404 }
      );
    }

    if (action === 'reject') {
      const result = await serverSupabase
        .from('claim_discovery_candidates')
        .update({
          discovery_status: 'rejected',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', candidateId)
        .select()
        .single();

      return NextResponse.json({ candidate: result.data });
    }

    if (action === 'approve' || action === 'claim') {
      const sourceResult = await serverSupabase
        .from('claim_notice_sources')
        .upsert(
          {
            source_name: candidateResponse.data.candidate_title.slice(0, 120),
            source_url: candidateResponse.data.candidate_url,
            is_active: true,
            fetch_frequency_label: 'Daily'
          },
          {
            onConflict: 'source_url'
          }
        )
        .select('id')
        .single();

      if (sourceResult.error) {
        return NextResponse.json({ error: normalizeClaimsTableError(sourceResult.error.message) }, { status: 500 });
      }

      const result = await serverSupabase
        .from('claim_discovery_candidates')
        .update({
          discovery_status: 'promoted',
          promoted_source_id: sourceResult.data.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', candidateId)
        .select()
        .single();

      let ingestionResult = null;

      if (action === 'claim') {
        ingestionResult = await ingestSourceRecord(serverSupabase as never, {
          id: sourceResult.data.id,
          source_name: candidateResponse.data.candidate_title.slice(0, 120),
          source_url: candidateResponse.data.candidate_url
        });
      }

      return NextResponse.json({ candidate: result.data, sourceId: sourceResult.data.id, ingestionResult });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: normalizeClaimsTableError(error instanceof Error ? error.message : 'Unable to review candidate.') },
      { status: 500 }
    );
  }
}
