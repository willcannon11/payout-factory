import { NextResponse } from 'next/server';
import { buildOutreachDraft, mapEventSourcingCandidateRow, mapEventSourcingContactRow } from '../../../../lib/events';
import { hasServerSupabaseConfig, serverSupabase } from '../../../../lib/serverSupabase';
import { EventSourcingCandidateRow, EventSourcingContactRow } from '../../../../lib/types';

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
    const contactId = typeof body.contactId === 'string' ? body.contactId : '';

    if (!candidateId) {
      return NextResponse.json({ error: 'Candidate ID is required.' }, { status: 400 });
    }

    const candidateResult = await serverSupabase
      .from('event_sourcing_candidates')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (candidateResult.error || !candidateResult.data) {
      return NextResponse.json({ error: candidateResult.error?.message || 'Candidate not found.' }, { status: 404 });
    }

    const candidate = mapEventSourcingCandidateRow(candidateResult.data as EventSourcingCandidateRow);

    let contact = null;
    if (contactId) {
      const contactResult = await serverSupabase
        .from('event_sourcing_contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (contactResult.data) {
        contact = mapEventSourcingContactRow(contactResult.data as EventSourcingContactRow);
      }
    }

    const draft = buildOutreachDraft(candidate, contact);

    const insertResult = await serverSupabase
      .from('event_outreach_drafts')
      .insert({
        candidate_id: candidateId,
        contact_id: contact?.id || null,
        channel: 'email',
        subject_line: draft.subjectLine,
        message_body: draft.messageBody,
        personalization_points: draft.personalizationPoints,
        approval_status: 'draft'
      })
      .select()
      .single();

    if (insertResult.error) {
      return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ draft: insertResult.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to generate outreach draft.' },
      { status: 500 }
    );
  }
}
