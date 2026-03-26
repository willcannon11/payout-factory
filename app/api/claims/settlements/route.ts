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

    if (!body.caseName || !body.defendant || !body.claimFormUrl || !body.sourceUrl || !body.filingDeadline || !body.classDefinition) {
      return NextResponse.json({ error: 'Missing required settlement fields.' }, { status: 400 });
    }

    const { data, error } = await serverSupabase
      .from('settlements')
      .insert({
        source_name: body.sourceName || 'Manual intake',
        case_name: body.caseName,
        defendant: body.defendant,
        claim_form_url: body.claimFormUrl,
        source_url: body.sourceUrl,
        notice_excerpt: body.noticeExcerpt || null,
        filing_deadline: body.filingDeadline,
        purchase_start: body.purchaseStart || null,
        purchase_end: body.purchaseEnd || null,
        proof_required: Boolean(body.proofRequired),
        cash_payment: body.cashPayment || null,
        status: body.status || 'monitoring',
        class_definition: body.classDefinition,
        attestation_required: body.attestationRequired ?? true,
        jurisdictions: splitCsv(body.jurisdictions),
        excluded_groups: splitCsv(body.excludedGroups)
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ settlement: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create settlement.' },
      { status: 500 }
    );
  }
}

