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
    const action = typeof body.action === 'string' ? body.action : '';

    if (!candidateId || !action) {
      return NextResponse.json({ error: 'Candidate ID and action are required.' }, { status: 400 });
    }

    const actionToUpdate = {
      move_to_hb_review: { workflow_stage: 'hb_review' },
      mark_claimed_in_hb: { workflow_stage: 'disqualified', hb_status: 'claimed_in_hb' },
      mark_unclaimed_in_hb: { workflow_stage: 'contact_research', hb_status: 'unclaimed_in_hb' },
      mark_not_in_hb: { workflow_stage: 'contact_research', hb_status: 'not_in_hb' },
      move_to_crm_outreach: { workflow_stage: 'crm_outreach' },
      reject: { workflow_stage: 'disqualified' }
    } as const;

    const nextUpdate = actionToUpdate[action as keyof typeof actionToUpdate];

    if (!nextUpdate) {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }

    const result = await serverSupabase
      .from('event_sourcing_candidates')
      .update({
        ...nextUpdate,
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
      { error: error instanceof Error ? error.message : 'Unable to review candidate.' },
      { status: 500 }
    );
  }
}
