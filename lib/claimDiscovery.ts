export type DiscoverySeed = {
  name: string;
  url: string;
};

export type DiscoveryCandidate = {
  title: string;
  url: string;
  sourceName: string;
};

export type ScoredDiscoveryCandidate = DiscoveryCandidate & {
  score: number;
  estimatedPayout: string | null;
  tags: string[];
  notes: string;
  isLikelyNoProof: boolean;
  hasClaimForm: boolean;
  hasDeadline: boolean;
  isDuplicate: boolean;
};

export const discoverySeeds: DiscoverySeed[] = [
  {
    name: 'ClassAction.org Settlements',
    url: 'https://www.classaction.org/settlements'
  },
  {
    name: 'Top Class Actions Open Settlements',
    url: 'https://topclassactions.com/category/lawsuit-settlements/open-lawsuit-settlements/'
  }
];

const discoveryKeywords = [
  'settlement',
  'claim',
  'class action',
  'proof',
  'purchase',
  'notice'
];

const cleanWhitespace = (value: string) =>
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

export const extractLinksFromHtml = (html: string, baseUrl: string, sourceName: string): DiscoveryCandidate[] => {
  const matches = Array.from(
    html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)
  );
  const seen = new Set<string>();
  const candidates: DiscoveryCandidate[] = [];

  for (const match of matches) {
    const href = match[1];
    const title = cleanWhitespace(match[2]);

    if (!href || !title || title.length < 12) {
      continue;
    }

    let resolvedUrl = '';
    try {
      resolvedUrl = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    if (!/^https?:/i.test(resolvedUrl) || seen.has(resolvedUrl)) {
      continue;
    }

    const haystack = `${title} ${resolvedUrl}`.toLowerCase();
    const keywordHits = discoveryKeywords.filter((keyword) => haystack.includes(keyword)).length;

    if (keywordHits < 2) {
      continue;
    }

    seen.add(resolvedUrl);
    candidates.push({
      title: title.slice(0, 180),
      url: resolvedUrl,
      sourceName
    });
  }

  return candidates;
};

export const scoreDiscoveryCandidate = ({
  candidate,
  pageHtml,
  estimatedPayout,
  isDuplicate
}: {
  candidate: DiscoveryCandidate;
  pageHtml: string;
  estimatedPayout: string | null;
  isDuplicate: boolean;
}): ScoredDiscoveryCandidate => {
  const text = cleanWhitespace(pageHtml).toLowerCase();
  let score = 0;
  const tags: string[] = [];

  const hasClaimForm = /claim form|submit a claim|file a claim|submit claim/i.test(text);
  const hasDeadline = /claim deadline|deadline|must be submitted by|submit.*by/i.test(text);
  const likelyNoProof = /no proof of purchase required|without proof|no receipts required/i.test(text);
  const proofRequired = /proof of purchase required|must provide receipt|receipt required/i.test(text);
  const officialDomain = /\.(com|org)\b/i.test(candidate.url) && !/classaction\.org|topclassactions\.com/i.test(candidate.url);
  const expired = /deadline.*(202[0-5])/i.test(text);

  if (hasClaimForm) {
    score += 30;
    tags.push('claim_form_found');
  }
  if (hasDeadline) {
    score += 20;
    tags.push('deadline_found');
  }
  if (/class action settlement|settlement website|settlement administrator/i.test(text)) {
    score += 20;
    tags.push('settlement_language');
  }
  if (likelyNoProof) {
    score += 15;
    tags.push('likely_no_proof');
  }
  if (proofRequired) {
    score += 5;
    tags.push('proof_required');
  }
  if (officialDomain) {
    score += 10;
    tags.push('official_domain');
  }
  if (expired) {
    score -= 25;
    tags.push('expired');
  }
  if (isDuplicate) {
    score -= 20;
    tags.push('duplicate');
  }
  if (text.length < 800) {
    score -= 10;
    tags.push('thin_page');
  }

  score = Math.max(0, Math.min(100, score));

  const notes = likelyNoProof
    ? 'Likely viable and mentions a no-proof path.'
    : hasClaimForm && hasDeadline
      ? 'Viable candidate with claim workflow signals.'
      : 'Needs manual review before promotion.';

  return {
    ...candidate,
    score,
    estimatedPayout,
    tags,
    notes,
    isLikelyNoProof: likelyNoProof,
    hasClaimForm,
    hasDeadline,
    isDuplicate
  };
};
