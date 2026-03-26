const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

export type EventDiscoverySeed = {
  name: string;
  url: string;
};

export type EventDiscoveryCandidate = {
  eventName: string;
  organizationName: string;
  eventUrl: string;
  moreInfoUrl: string;
  sourceName: string;
  sourceUrl: string;
  city: string | null;
  country: string | null;
  eventStartDate: string | null;
  eventEndDate: string | null;
  audienceSizeText: string | null;
  industryTags: string[];
  score: number;
  whyFit: string;
  aiSummary: string;
  notes: string;
};

export type EventDiscoveryFeedback = {
  sourceName?: string | null;
  sourceDomain?: string | null;
  eventName?: string | null;
  eventUrl?: string | null;
  organizationName?: string | null;
  feedbackLabel: 'good_fit' | 'competitor' | 'not_event_host' | 'low_value' | 'bad_data';
  notes?: string | null;
};

export const eventDiscoverySeeds: EventDiscoverySeed[] = [
  { name: 'Smithbucklin', url: 'https://smithbucklin.com/Home/page_id/32' },
  { name: 'Bostrom', url: 'https://www.bostrom.com/' },
  { name: 'Raybourn Group International', url: 'https://raybourn.com/' },
  { name: 'Partners in Association Management', url: 'https://yoursearchisdone.com/' },
  { name: 'Capitol Hill Management Services', url: 'https://www.caphill.com/' },
  { name: 'IMN Solutions', url: 'https://www.imnsolutions.com/services/' },
  { name: 'Association Management Solutions', url: 'https://www.amsl.com/' }
];

const eventKeywords = [
  'annual meeting',
  'conference',
  'summit',
  'symposium',
  'convention',
  'expo',
  'forum',
  'retreat',
  'meeting',
  'trade show',
  'event'
];

const negativeKeywords = [
  'webinar',
  'podcast',
  'news',
  'press release',
  'career',
  'about',
  'service',
  'solution',
  'staff',
  'recap video',
  'recap',
  'blog'
];

const competitorKeywords = [
  'association management',
  'association management company',
  'amc',
  'event planning services',
  'strategic sourcing solutions',
  'meeting planning services',
  'full-service association management'
];

const stateMap: Record<string, string> = {
  alabama: 'United States',
  arizona: 'United States',
  california: 'United States',
  colorado: 'United States',
  florida: 'United States',
  georgia: 'United States',
  illinois: 'United States',
  indiana: 'United States',
  nevada: 'United States',
  newyork: 'United States',
  ohio: 'United States',
  texas: 'United States'
};

export const cleanWhitespace = (value: string) =>
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

export const stripHtml = (value: string) => cleanWhitespace(value);

const normalizeTitle = (value: string) =>
  cleanWhitespace(value)
    .replace(/\s+\|\s+.*$/, '')
    .replace(/\s+-\s+.*$/, '')
    .trim();

const inferOrganizationName = (title: string, sourceName: string) => {
  const lower = title.toLowerCase();
  for (const keyword of eventKeywords) {
    const index = lower.indexOf(keyword);
    if (index > 2) {
      return title.slice(0, index).replace(/[:\-–|]\s*$/, '').trim();
    }
  }
  return sourceName;
};

const inferIndustryTags = (sourceName: string, text: string) => {
  const tags = ['association-management'];
  const haystack = `${sourceName} ${text}`.toLowerCase();
  if (/association|society/.test(haystack)) tags.push('association');
  if (/nonprofit|foundation/.test(haystack)) tags.push('nonprofit');
  if (/real estate|housing|property/.test(haystack)) tags.push('real-estate');
  if (/health|medical|clinical/.test(haystack)) tags.push('healthcare');
  if (/education|learning|professional development/.test(haystack)) tags.push('education');
  return Array.from(new Set(tags));
};

const extractAudienceSizeText = (text: string) => {
  const match = text.match(/([0-9]{2,3}(?:,[0-9]{3})?\+?)\s+(?:attendees|participants|members|registrants)/i);
  return match ? match[0] : null;
};

const extractCityCountry = (text: string) => {
  const match = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*(Alabama|Arizona|California|Colorado|Florida|Georgia|Illinois|Indiana|Nevada|New York|Ohio|Texas|USA|United States)\b/);
  if (!match) {
    return { city: null, country: null };
  }
  return {
    city: match[1],
    country: stateMap[match[2].toLowerCase().replace(/\s+/g, '')] || match[2]
  };
};

const extractIsoDateRange = (text: string) => {
  const matches = Array.from(text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)).map((match) => match[1]);
  if (matches.length >= 2) {
    return { eventStartDate: matches[0], eventEndDate: matches[1] };
  }
  if (matches.length === 1) {
    return { eventStartDate: matches[0], eventEndDate: matches[0] };
  }
  return { eventStartDate: null, eventEndDate: null };
};

export const extractEventLinksFromHtml = (html: string, baseUrl: string, sourceName: string) => {
  const matches = Array.from(html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const seen = new Set<string>();
  const results: Array<{ title: string; url: string; sourceName: string }> = [];

  for (const match of matches) {
    const href = match[1];
    const title = normalizeTitle(match[2]);
    if (!href || !title || title.length < 8) continue;

    let resolvedUrl = '';
    try {
      resolvedUrl = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    if (!/^https?:/i.test(resolvedUrl) || seen.has(resolvedUrl)) continue;

    const haystack = `${title} ${resolvedUrl}`.toLowerCase();
    const keywordHits = eventKeywords.filter((keyword) => haystack.includes(keyword)).length;
    const negativeHits = negativeKeywords.filter((keyword) => haystack.includes(keyword)).length;
    const sameDomain = new URL(resolvedUrl).hostname === new URL(baseUrl).hostname;

    if (!sameDomain || keywordHits === 0 || negativeHits > keywordHits) continue;

    seen.add(resolvedUrl);
    results.push({
      title: title.slice(0, 180),
      url: resolvedUrl,
      sourceName
    });
  }

  return results;
};

const buildFallbackSummary = ({
  title,
  sourceName,
  city,
  country,
  startDate,
  endDate,
  audienceSizeText,
  whyFit
}: {
  title: string;
  sourceName: string;
  city: string | null;
  country: string | null;
  startDate: string | null;
  endDate: string | null;
  audienceSizeText: string | null;
  whyFit: string;
}) => {
  const locationLine = [city, country].filter(Boolean).join(', ') || 'location not confidently extracted';
  const dateLine = startDate ? (endDate && endDate !== startDate ? `${startDate} to ${endDate}` : startDate) : 'dates not confidently extracted';
  const audienceLine = audienceSizeText || 'audience size not clearly stated';

  return `${title} surfaced from ${sourceName}. The event appears tied to an association or membership-based organization. Current extraction suggests ${locationLine}, ${dateLine}, and ${audienceLine}. ${whyFit}`;
};

export const summarizeEventCandidate = async ({
  title,
  sourceName,
  url,
  pageText,
  city,
  country,
  startDate,
  endDate,
  audienceSizeText,
  whyFit
}: {
  title: string;
  sourceName: string;
  url: string;
  pageText: string;
  city: string | null;
  country: string | null;
  startDate: string | null;
  endDate: string | null;
  audienceSizeText: string | null;
  whyFit: string;
}) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return buildFallbackSummary({ title, sourceName, city, country, startDate, endDate, audienceSizeText, whyFit });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_OCR_MODEL || 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text:
                  `Summarize this event candidate in one paragraph for a meetings sales operator. ` +
                  `Include what the event appears to be, where it happens if visible, how long it runs if visible, audience size if visible, and why it could be a fit for outsourced venue sourcing and hotel contract negotiation. ` +
                  `If anything is unclear, say so. Title: ${title}. Source firm: ${sourceName}. URL: ${url}. Extracted facts: ` +
                  JSON.stringify({ city, country, startDate, endDate, audienceSizeText, whyFit }) +
                  `. Page text: ${pageText.slice(0, 12000)}`
              }
            ]
          }
        ]
      })
    });

    const result = await response.json();
    if (!response.ok) {
      return buildFallbackSummary({ title, sourceName, city, country, startDate, endDate, audienceSizeText, whyFit });
    }

    const summary =
      result.output_text ||
      result.output
        ?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
        ?.map((item: { text?: string }) => item.text ?? '')
        ?.join('\n') ||
      '';

    return summary.trim() || buildFallbackSummary({ title, sourceName, city, country, startDate, endDate, audienceSizeText, whyFit });
  } catch {
    return buildFallbackSummary({ title, sourceName, city, country, startDate, endDate, audienceSizeText, whyFit });
  }
};

export const scoreEventCandidate = async ({
  title,
  url,
  sourceName,
  sourceUrl,
  pageHtml,
  isDuplicate,
  feedback = []
}: {
  title: string;
  url: string;
  sourceName: string;
  sourceUrl: string;
  pageHtml: string;
  isDuplicate: boolean;
  feedback?: EventDiscoveryFeedback[];
}): Promise<EventDiscoveryCandidate> => {
  const text = stripHtml(pageHtml);
  const lower = text.toLowerCase();
  let score = 0;
  const urlHost = new URL(url).hostname.replace(/^www\./, '');
  const titleLower = title.toLowerCase();

  const matchingFeedback = feedback.filter((item) => {
    const sourceMatch = item.sourceName && item.sourceName.toLowerCase() === sourceName.toLowerCase();
    const domainMatch = item.sourceDomain && item.sourceDomain.replace(/^www\./, '') === urlHost;
    const titleMatch = item.eventName && titleLower.includes(item.eventName.toLowerCase());
    const orgMatch = item.organizationName && lower.includes(item.organizationName.toLowerCase());
    return Boolean(sourceMatch || domainMatch || titleMatch || orgMatch);
  });

  if (eventKeywords.some((keyword) => titleLower.includes(keyword))) score += 30;
  if (/register|agenda|hotel|venue|meeting|event|conference/i.test(lower)) score += 20;
  if (/annual|national|international|expo|summit|convention|symposium/i.test(lower)) score += 15;
  if (/sponsor|exhibitor|trade show|room block|hotel/i.test(lower)) score += 15;
  if (/recap|recording|podcast|webinar/i.test(lower)) score -= 20;
  if (competitorKeywords.some((keyword) => lower.includes(keyword) || titleLower.includes(keyword))) score -= 35;
  if (isDuplicate) score -= 30;
  if (text.length < 500) score -= 10;

  for (const item of matchingFeedback) {
    if (item.feedbackLabel === 'good_fit') score += 20;
    if (item.feedbackLabel === 'competitor') score -= 45;
    if (item.feedbackLabel === 'not_event_host') score -= 40;
    if (item.feedbackLabel === 'low_value') score -= 20;
    if (item.feedbackLabel === 'bad_data') score -= 15;
  }

  score = Math.max(0, Math.min(100, score));

  const { city, country } = extractCityCountry(text);
  const { eventStartDate, eventEndDate } = extractIsoDateRange(text);
  const audienceSizeText = extractAudienceSizeText(text);
  const organizationName = inferOrganizationName(title, sourceName);
  const industryTags = inferIndustryTags(sourceName, text);
  const whyFit = competitorKeywords.some((keyword) => lower.includes(keyword))
    ? 'This may actually be a service-provider or competitor page rather than a hosted event, so it should be reviewed carefully before keeping it.'
    : /hotel|venue|site selection|contract negotiation|housing/i.test(lower)
    ? 'The page mentions event logistics or lodging signals that suggest venue sourcing and hotel negotiation could add value.'
    : 'This appears to be a meaningful association or member event that may involve venue sourcing, room blocks, and contract leverage.';
  const aiSummary = await summarizeEventCandidate({
    title,
    sourceName,
    url,
    pageText: text,
    city,
    country,
    startDate: eventStartDate,
    endDate: eventEndDate,
    audienceSizeText,
    whyFit
  });

  return {
    eventName: title,
    organizationName,
    eventUrl: url,
    moreInfoUrl: url,
    sourceName,
    sourceUrl,
    city,
    country,
    eventStartDate,
    eventEndDate,
    audienceSizeText,
    industryTags,
    score,
    whyFit,
    aiSummary,
    notes: matchingFeedback.length
      ? `Feedback-adjusted candidate. Latest signals: ${matchingFeedback.map((item) => item.feedbackLabel).join(', ')}.`
      : isDuplicate
        ? 'Possible duplicate of an existing event candidate.'
        : 'Discovered from a public association management site.',
  };
};
