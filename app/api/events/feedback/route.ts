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
    const feedbackLabel = typeof body.feedbackLabel === 'string' ? body.feedbackLabel : '';
    const candidateId = typeof body.candidateId === 'string' ? body.candidateId : null;
    const eventUrl = typeof body.eventUrl === 'string' ? body.eventUrl : null;

    if (!feedbackLabel || !eventUrl) {
      return NextResponse.json({ error: 'Feedback label and event URL are required.' }, { status: 400 });
    }

    let sourceDomain: string | null = null;
    try {
      sourceDomain = new URL(eventUrl).hostname;
    } catch {
      sourceDomain = null;
    }

    const insertResult = await serverSupabase
      .from('event_candidate_feedback')
      .insert({
        candidate_id: candidateId,
        source_name: typeof body.sourceName === 'string' ? body.sourceName : null,
        source_domain: sourceDomain,
        event_name: typeof body.eventName === 'string' ? body.eventName : null,
        event_url: eventUrl,
        organization_name: typeof body.organizationName === 'string' ? body.organizationName : null,
        feedback_label: feedbackLabel,
        notes: typeof body.notes === 'string' ? body.notes : null
      })
      .select()
      .single();

    if (insertResult.error) {
      return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
    }

    if (candidateId && ['competitor', 'not_event_host', 'low_value', 'bad_data'].includes(feedbackLabel)) {
      await serverSupabase
        .from('event_sourcing_candidates')
        .update({
          workflow_stage: 'disqualified',
          reviewed_at: new Date().toISOString(),
          notes: typeof body.notes === 'string' ? body.notes : null
        })
        .eq('id', candidateId);
    }

    return NextResponse.json({ feedback: insertResult.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save feedback.' },
      { status: 500 }
    );
  }
}
