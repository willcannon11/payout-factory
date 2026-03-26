import { NextResponse } from 'next/server';
import { discoverySeeds, extractLinksFromHtml, scoreDiscoveryCandidate } from '../../../../lib/claimDiscovery';
import { extractSettlementDraft } from '../../../../lib/claimsExtraction';
import { hasServerSupabaseConfig, serverSupabase } from '../../../../lib/serverSupabase';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const saveToQueue = Boolean(body.saveToQueue);
    const limitPerSeed = Math.min(Number(body.limitPerSeed || 12), 25);
    const discovered = [];

    for (const seed of discoverySeeds) {
      try {
        const response = await fetch(seed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ClaimsOpsBot/1.0; +https://localhost)'
          },
          redirect: 'follow'
        });

        const html = await response.text();
        const linkCandidates = extractLinksFromHtml(html, seed.url, seed.name).slice(0, limitPerSeed);
        const candidates = [];

        for (const candidate of linkCandidates) {
          let candidateHtml = '';
          let isDuplicate = false;
          let estimatedPayout: string | null = null;

          try {
            const candidateResponse = await fetch(candidate.url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ClaimsOpsBot/1.0; +https://localhost)'
              },
              redirect: 'follow'
            });
            candidateHtml = await candidateResponse.text();
            const extractedDraft = extractSettlementDraft(candidateHtml, candidate.url);
            estimatedPayout = extractedDraft.cashPayment || null;
          } catch {
            candidateHtml = '';
          }

          if (hasServerSupabaseConfig && serverSupabase) {
            const duplicateCheck = await serverSupabase
              .from('claim_notice_sources')
              .select('id')
              .eq('source_url', candidate.url)
              .limit(1);

            isDuplicate = (duplicateCheck.data ?? []).length > 0;
          }

          candidates.push(
            scoreDiscoveryCandidate({
              candidate,
              pageHtml: candidateHtml,
              estimatedPayout,
              isDuplicate
            })
          );
        }

        if (hasServerSupabaseConfig && serverSupabase) {
          for (const candidate of candidates) {
            const { data: savedCandidate } = await serverSupabase
              .from('claim_discovery_candidates')
              .upsert(
                {
                  seed_name: seed.name,
                  seed_url: seed.url,
                  candidate_title: candidate.title,
                  candidate_url: candidate.url,
                  discovery_status: candidate.score >= 80 ? 'approved' : 'discovered',
                  score: candidate.score,
                  estimated_payout: candidate.estimatedPayout,
                  tags: candidate.tags,
                  notes: candidate.notes,
                  is_likely_no_proof: candidate.isLikelyNoProof,
                  has_claim_form: candidate.hasClaimForm,
                  has_deadline: candidate.hasDeadline,
                  is_duplicate: candidate.isDuplicate,
                  reviewed_at: candidate.score >= 80 ? new Date().toISOString() : null
                },
                {
                  onConflict: 'candidate_url'
                }
              )
              .select('id')
              .single();

            if (saveToQueue && candidate.score >= 80 && !candidate.isDuplicate) {
              const sourceResult = await serverSupabase.from('claim_notice_sources').upsert(
                {
                  source_name: `${seed.name}: ${candidate.title}`.slice(0, 120),
                  source_url: candidate.url,
                  is_active: true,
                  fetch_frequency_label: 'Daily'
                },
                {
                  onConflict: 'source_url'
                }
              ).select('id').single();

              if (savedCandidate?.id && sourceResult.data?.id) {
                await serverSupabase
                  .from('claim_discovery_candidates')
                  .update({
                    discovery_status: 'promoted',
                    promoted_source_id: sourceResult.data.id,
                    reviewed_at: new Date().toISOString()
                  })
                  .eq('id', savedCandidate.id);
              }
            }
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

    return NextResponse.json({ discovered });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to run discovery.' },
      { status: 500 }
    );
  }
}
