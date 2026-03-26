import { extractSettlementDraft } from './claimsExtraction';

type SupabaseLike = {
  from: (table: string) => {
    insert: (value: unknown) => Promise<{ data?: unknown; error?: { message: string } | null }>;
    update: (value: unknown) => { eq: (column: string, value: string) => Promise<{ data?: unknown; error?: { message: string } | null }> };
    select: (columns?: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => { limit: (count: number) => Promise<{ data?: unknown[]; error?: { message: string } | null }> };
        limit: (count: number) => Promise<{ data?: unknown[]; error?: { message: string } | null }>;
      };
      single: () => Promise<{ data?: Record<string, unknown>; error?: { message: string } | null }>;
    };
  };
};

type SourceRecord = {
  id: string;
  source_name: string;
  source_url: string;
};

const splitCsv = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const missingClaimsSchemaMessage =
  "Your Supabase schema is missing newer claims tables. Run the latest SQL from supabase/schema.sql, especially claim_discovery_candidates.";

export const normalizeClaimsTableError = (message: string) =>
  /claim_discovery_candidates|claim_notice_sources|claim_notice_ingestions/i.test(message)
    ? missingClaimsSchemaMessage
    : message;

export const ingestSourceRecord = async (supabase: SupabaseLike, source: SourceRecord) => {
  let fetchStatus = 'fetched';
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  let rawContent = '';
  let lastError: string | null = null;
  let settlementCreated = false;

  try {
    const response = await fetch(source.source_url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClaimsOpsBot/1.0; +https://localhost)'
      },
      redirect: 'follow'
    });

    httpStatus = response.status;
    contentType = response.headers.get('content-type');
    rawContent = await response.text();
    fetchStatus = response.ok ? 'fetched' : 'failed';

    const draft = extractSettlementDraft(rawContent, source.source_url);
    draft.sourceName = source.source_name;

    await supabase.from('claim_notice_ingestions').insert({
      source_name: source.source_name,
      source_url: source.source_url,
      fetch_status: fetchStatus,
      http_status: httpStatus,
      content_type: contentType,
      raw_content: rawContent.slice(0, 200000),
      extracted_case_name: draft.caseName || null,
      extracted_deadline: draft.filingDeadline || null,
      proof_required: draft.proofRequired
    });

    if (response.ok && draft.caseName && draft.claimFormUrl && draft.classDefinition && draft.filingDeadline) {
      const existing = await supabase
        .from('settlements')
        .select('id')
        .eq('source_url', source.source_url)
        .eq('case_name', draft.caseName)
        .limit(1);

      if ((existing.data ?? []).length === 0) {
        await supabase.from('settlements').insert({
          source_name: draft.sourceName,
          case_name: draft.caseName,
          defendant: draft.defendant || 'Needs review',
          claim_form_url: draft.claimFormUrl,
          source_url: draft.sourceUrl,
          notice_excerpt: draft.noticeExcerpt || null,
          filing_deadline: draft.filingDeadline,
          purchase_start: draft.purchaseStart || null,
          purchase_end: draft.purchaseEnd || null,
          proof_required: draft.proofRequired,
          cash_payment: draft.cashPayment || null,
          status: draft.status,
          class_definition: draft.classDefinition,
          attestation_required: draft.attestationRequired,
          jurisdictions: splitCsv(draft.jurisdictions),
          excluded_groups: splitCsv(draft.excludedGroups)
        });
        settlementCreated = true;
      }
    }
  } catch (error) {
    fetchStatus = 'failed';
    lastError = error instanceof Error ? error.message : 'Unknown fetch error.';

    await supabase.from('claim_notice_ingestions').insert({
      source_name: source.source_name,
      source_url: source.source_url,
      fetch_status: fetchStatus,
      http_status: httpStatus,
      content_type: contentType,
      raw_content: rawContent.slice(0, 200000),
      extracted_case_name: null,
      extracted_deadline: null,
      proof_required: null
    });
  }

  await supabase
    .from('claim_notice_sources')
    .update({
      last_checked_at: new Date().toISOString(),
      last_http_status: httpStatus,
      last_error: lastError
    })
    .eq('id', source.id);

  return {
    sourceName: source.source_name,
    sourceUrl: source.source_url,
    fetchStatus,
    httpStatus,
    lastError,
    settlementCreated
  };
};
