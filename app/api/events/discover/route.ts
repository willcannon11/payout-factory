import { NextResponse } from 'next/server';
import { demoEventCandidates } from '../../../../lib/events';
import { EventDiscoveryFeedback, eventDiscoverySeeds, extractEventLinksFromHtml, scoreEventCandidate } from '../../../../lib/eventDiscovery';
import { hasServerSupabaseConfig, serverSupabase } from '../../../../lib/serverSupabase';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const discovered = [];
    let feedback: EventDiscoveryFeedback[] = [];

    if (hasServerSupabaseConfig && serverSupabase) {
      const feedbackResponse = await serverSupabase
        .from('event_candidate_feedback')
        .select('*')
        .order('created_at', { ascending: false });

      feedback = (feedbackResponse.data ?? []).map((item: Record<string, unknown>) => ({
        sourceName: typeof item.source_name === 'string' ? item.source_name : null,
        sourceDomain: typeof item.source_domain === 'string' ? item.source_domain : null,
        eventName: typeof item.event_name === 'string' ? item.event_name : null,
        eventUrl: typeof item.event_url === 'string' ? item.event_url : null,
        organizationName: typeof item.organization_name === 'string' ? item.organization_name : null,
        feedbackLabel: (typeof item.feedback_label === 'string' ? item.feedback_label : 'bad_data') as EventDiscoveryFeedback['feedbackLabel'],
        notes: typeof item.notes === 'string' ? item.notes : null
      }));
    }

    for (const seed of eventDiscoverySeeds) {
      try {
        const response = await fetch(seed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; EventSourcingBot/1.0; +https://localhost)'
          },
          redirect: 'follow'
        });
        const html = await response.text();
        const linkCandidates = extractEventLinksFromHtml(html, seed.url, seed.name).slice(0, 10);
        const candidates = [];

        for (const linkCandidate of linkCandidates) {
          let candidateHtml = '';
          let isDuplicate = false;

          try {
            const candidateResponse = await fetch(linkCandidate.url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; EventSourcingBot/1.0; +https://localhost)'
              },
              redirect: 'follow'
            });
            candidateHtml = await candidateResponse.text();
          } catch {
            candidateHtml = '';
          }

          if (hasServerSupabaseConfig && serverSupabase) {
            const duplicateCheck = await serverSupabase
              .from('event_sourcing_candidates')
              .select('id')
              .eq('event_url', linkCandidate.url)
              .limit(1);

            isDuplicate = (duplicateCheck.data ?? []).length > 0;
          }

          const scoredCandidate = await scoreEventCandidate({
            title: linkCandidate.title,
            url: linkCandidate.url,
            sourceName: seed.name,
            sourceUrl: seed.url,
            pageHtml: candidateHtml || html,
            isDuplicate,
            feedback
          });

          candidates.push(scoredCandidate);

          if (hasServerSupabaseConfig && serverSupabase && scoredCandidate.score >= 45) {
            await serverSupabase.from('event_sourcing_candidates').upsert(
              {
                organization_name: scoredCandidate.organizationName,
                event_name: scoredCandidate.eventName,
                event_url: scoredCandidate.eventUrl,
                more_info_url: scoredCandidate.moreInfoUrl,
                source_name: scoredCandidate.sourceName,
                source_url: scoredCandidate.sourceUrl,
                intake_source: 'discovery',
                city: scoredCandidate.city,
                country: scoredCandidate.country,
                event_start_date: scoredCandidate.eventStartDate,
                event_end_date: scoredCandidate.eventEndDate,
                audience_size_text: scoredCandidate.audienceSizeText,
                industry_tags: scoredCandidate.industryTags,
                score: scoredCandidate.score,
                workflow_stage: 'event_candidates',
                hb_status: 'pending_review',
                crm_status: 'not_added',
                why_fit: scoredCandidate.whyFit,
                ai_summary: scoredCandidate.aiSummary,
                notes: scoredCandidate.notes,
                reviewed_at: new Date().toISOString()
              },
              {
                onConflict: 'event_url'
              }
            );
          }
        }

        discovered.push({
          seedName: seed.name,
          seedUrl: seed.url,
          fetched: response.ok,
          status: response.status,
          candidates
        });
      } catch (error) {
        discovered.push({
          seedName: seed.name,
          seedUrl: seed.url,
          fetched: false,
          status: null,
          error: error instanceof Error ? error.message : 'Discovery fetch failed.',
          candidates: []
        });
      }
    }

    if (!hasServerSupabaseConfig || !serverSupabase) {
      return NextResponse.json({
        discovered: discovered.length ? discovered : [{ seedName: 'Demo', seedUrl: '', fetched: true, status: 200, candidates: demoEventCandidates }],
        saved: false,
        message: 'Discovery ran without persistence because server Supabase config is missing.'
      });
    }

    const savedCount = discovered.reduce((sum, seed) => sum + (seed.candidates?.filter((candidate: { score: number }) => candidate.score >= 45).length || 0), 0);

    return NextResponse.json({
      discovered,
      saved: true,
      message: `Discovery processed ${eventDiscoverySeeds.length} source sites and queued ${savedCount} event candidates.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to run discovery.' },
      { status: 500 }
    );
  }
}
