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
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId : '';
    const crmStatus = typeof body.crmStatus === 'string' ? body.crmStatus : '';

    if (!candidateId || !crmStatus) {
      return NextResponse.json({ error: 'Candidate ID and CRM status are required.' }, { status: 400 });
    }

    const result = await serverSupabase
      .from('event_sourcing_candidates')
      .update({
        crm_status: crmStatus,
        workflow_stage: 'crm_outreach',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', candidateId)
      .select()
      .single();

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ candidate: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update CRM status.' },
      { status: 500 }
    );
  }
}
