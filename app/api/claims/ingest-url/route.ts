import { NextResponse } from 'next/server';
import { extractSettlementDraft } from '../../../../lib/claimsExtraction';
import { hasServerSupabaseConfig, serverSupabase } from '../../../../lib/serverSupabase';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
    const sourceName = typeof body.sourceName === 'string' && body.sourceName.trim() ? body.sourceName.trim() : 'URL ingestion';
    const saveIngestion = Boolean(body.saveIngestion);

    if (!sourceUrl) {
      return NextResponse.json({ error: 'A source URL is required.' }, { status: 400 });
    }

    let response: Response;
    try {
      response = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ClaimsOpsBot/1.0; +https://localhost)'
        },
        redirect: 'follow'
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Unable to fetch source URL.' },
        { status: 502 }
      );
    }

    const rawContent = await response.text();
    const draft = extractSettlementDraft(rawContent, sourceUrl);
    draft.sourceName = sourceName;

    let ingestionId: string | null = null;

    if (saveIngestion && hasServerSupabaseConfig && serverSupabase) {
      const { data, error } = await serverSupabase
        .from('claim_notice_ingestions')
        .insert({
          source_name: sourceName,
          source_url: sourceUrl,
          fetch_status: response.ok ? 'fetched' : 'failed',
          http_status: response.status,
          content_type: response.headers.get('content-type'),
          raw_content: rawContent.slice(0, 200000),
          extracted_case_name: draft.caseName || null,
          extracted_deadline: draft.filingDeadline || null,
          proof_required: draft.proofRequired
        })
        .select('id')
        .single();

      if (!error) {
        ingestionId = data.id;
      }
    }

    return NextResponse.json({
      draft,
      ingestionId,
      fetched: {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type')
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to ingest source URL.' },
      { status: 500 }
    );
  }
}
