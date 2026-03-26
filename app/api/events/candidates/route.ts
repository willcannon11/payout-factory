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
    const organizationName = typeof body.organizationName === 'string' ? body.organizationName.trim() : '';
    const eventName = typeof body.eventName === 'string' ? body.eventName.trim() : '';
    const eventUrl = typeof body.eventUrl === 'string' ? body.eventUrl.trim() : '';

    if (!organizationName || !eventName || !eventUrl) {
      return NextResponse.json({ error: 'Organization name, event name, and event URL are required.' }, { status: 400 });
    }

    const startAtTask3 = Boolean(body.startAtTask3);

    const insertResult = await serverSupabase
      .from('event_sourcing_candidates')
      .insert({
        organization_name: organizationName,
        event_name: eventName,
        event_url: eventUrl,
        more_info_url: typeof body.moreInfoUrl === 'string' ? body.moreInfoUrl : null,
        source_name: body.sourceName || 'Manual entry',
        source_url: body.sourceUrl || 'manual://entry',
        intake_source: startAtTask3 ? 'manual' : 'discovery',
        city: typeof body.city === 'string' ? body.city : null,
        country: typeof body.country === 'string' ? body.country : null,
        event_start_date: typeof body.eventStartDate === 'string' ? body.eventStartDate : null,
        event_end_date: typeof body.eventEndDate === 'string' ? body.eventEndDate : null,
        audience_size_text: typeof body.audienceSizeText === 'string' ? body.audienceSizeText : null,
        industry_tags: Array.isArray(body.industryTags) ? body.industryTags : [],
        score: Number(body.score || 0),
        workflow_stage: startAtTask3 ? 'contact_research' : 'event_candidates',
        hb_status: startAtTask3 ? 'unknown' : 'pending_review',
        crm_status: 'not_added',
        why_fit: typeof body.whyFit === 'string' ? body.whyFit : null,
        ai_summary: typeof body.aiSummary === 'string' ? body.aiSummary : null,
        notes: typeof body.notes === 'string' ? body.notes : null,
        reviewed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertResult.error) {
      return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ candidate: insertResult.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create candidate.' },
      { status: 500 }
    );
  }
}
