import { NextResponse } from 'next/server';
import { hasServerSupabaseConfig, serverSupabase } from '../../../../lib/serverSupabase';

export const runtime = 'nodejs';

const splitCsv = (value: unknown) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export async function POST(request: Request) {
  if (!hasServerSupabaseConfig || !serverSupabase) {
    return NextResponse.json(
      { error: 'Server Supabase config is missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();

    if (!body.settlementId || !body.claimantId) {
      return NextResponse.json({ error: 'Settlement and claimant are required.' }, { status: 400 });
    }

    const { data, error } = await serverSupabase
      .from('settlement_matches')
      .insert({
        settlement_id: body.settlementId,
        claimant_id: body.claimantId,
        match_score: Number(body.matchScore || 0),
        match_basis: splitCsv(body.matchBasis),
        purchase_evidence_status: body.purchaseEvidenceStatus || 'missing',
        consent_status: body.consentStatus || 'missing',
        review_status: body.reviewStatus || 'queued',
        risk_flags: splitCsv(body.riskFlags),
        eligibility_notes: body.eligibilityNotes || null
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ match: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create match.' },
      { status: 500 }
    );
  }
}
