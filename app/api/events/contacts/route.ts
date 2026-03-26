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
    const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';

    if (!candidateId || !contactName) {
      return NextResponse.json({ error: 'Candidate ID and contact name are required.' }, { status: 400 });
    }

    const verificationStatus =
      body.verificationStatus === 'verified' || body.verificationStatus === 'rejected'
        ? body.verificationStatus
        : 'unverified';

    const insertResult = await serverSupabase
      .from('event_sourcing_contacts')
      .insert({
        candidate_id: candidateId,
        contact_name: contactName,
        contact_role: typeof body.contactRole === 'string' ? body.contactRole : null,
        contact_email: typeof body.contactEmail === 'string' ? body.contactEmail : null,
        contact_phone: typeof body.contactPhone === 'string' ? body.contactPhone : null,
        linkedin_url: typeof body.linkedinUrl === 'string' ? body.linkedinUrl : null,
        contact_source_url: typeof body.contactSourceUrl === 'string' ? body.contactSourceUrl : null,
        verification_status: verificationStatus,
        notes: typeof body.notes === 'string' ? body.notes : null
      })
      .select()
      .single();

    if (insertResult.error) {
      return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
    }

    if (verificationStatus === 'verified') {
      await serverSupabase
        .from('event_sourcing_candidates')
        .update({
          workflow_stage: 'crm_outreach',
          planner_name: contactName,
          planner_role: typeof body.contactRole === 'string' ? body.contactRole : null,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', candidateId);
    } else {
      await serverSupabase
        .from('event_sourcing_candidates')
        .update({
          workflow_stage: 'contact_research',
          planner_name: contactName,
          planner_role: typeof body.contactRole === 'string' ? body.contactRole : null,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', candidateId);
    }

    return NextResponse.json({ contact: insertResult.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save contact.' },
      { status: 500 }
    );
  }
}
