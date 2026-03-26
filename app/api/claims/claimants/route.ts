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

    if (!body.fullName || !body.email) {
      return NextResponse.json({ error: 'Missing required claimant fields.' }, { status: 400 });
    }

    const { data, error } = await serverSupabase
      .from('claimant_profiles')
      .insert({
        full_name: body.fullName,
        email: body.email,
        states_of_residence: splitCsv(body.statesOfResidence),
        merchants: splitCsv(body.merchants),
        brands_used: splitCsv(body.brandsUsed),
        notes: body.notes || null,
        consent_on_file: Boolean(body.consentOnFile),
        consent_scope: body.consentScope || 'notification_only'
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ claimant: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create claimant.' },
      { status: 500 }
    );
  }
}

