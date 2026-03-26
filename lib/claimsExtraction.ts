export type ExtractedSettlementDraft = {
  sourceName: string;
  caseName: string;
  defendant: string;
  claimFormUrl: string;
  sourceUrl: string;
  filingDeadline: string;
  purchaseStart: string;
  purchaseEnd: string;
  noticeExcerpt: string;
  classDefinition: string;
  cashPayment: string;
  jurisdictions: string;
  excludedGroups: string;
  status: 'monitoring' | 'ready_for_review' | 'collecting_consents' | 'submitting' | 'closed';
  proofRequired: boolean;
  attestationRequired: boolean;
};

const monthNames =
  'january|february|march|april|may|june|july|august|september|october|november|december';

const jurisdictionMap: Record<string, string> = {
  california: 'CA',
  illinois: 'IL',
  texas: 'TX',
  florida: 'FL',
  'new york': 'NY',
  ohio: 'OH',
  'united states': 'US',
  'u.s.': 'US',
  usa: 'US'
};

const cleanWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

export const stripHtml = (value: string) =>
  cleanWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
  );

const toIsoDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const findUrls = (text: string) => Array.from(text.matchAll(/https?:\/\/[^\s)"'>]+/gi)).map((match) => match[0]);

const findDeadline = (text: string) => {
  const patterns = [
    new RegExp(`(?:deadline|claim\\s+deadline|submit\\s+.*?by|must\\s+be\\s+submitted\\s+by)[:\\s]+(${monthNames}\\s+\\d{1,2},\\s+\\d{4})`, 'i'),
    /(?:deadline|claim deadline)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return toIsoDate(match[1]);
  }

  return '';
};

const findPurchaseRange = (text: string) => {
  const patterns = [
    new RegExp(`between\\s+(${monthNames}\\s+\\d{1,2},\\s+\\d{4})\\s+and\\s+(${monthNames}\\s+\\d{1,2},\\s+\\d{4})`, 'i'),
    /between\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+and\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
    new RegExp(`from\\s+(${monthNames}\\s+\\d{1,2},\\s+\\d{4})\\s+through\\s+(${monthNames}\\s+\\d{1,2},\\s+\\d{4})`, 'i')
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        purchaseStart: toIsoDate(match[1]),
        purchaseEnd: toIsoDate(match[2])
      };
    }
  }

  return {
    purchaseStart: '',
    purchaseEnd: ''
  };
};

const findCaseName = (text: string) => {
  const lines = text.split(/[\r\n]+/).map((line) => cleanWhitespace(line)).filter(Boolean);
  const candidate =
    lines.find((line) => /settlement|class action|litigation/i.test(line) && line.length <= 140) ||
    lines[0] ||
    '';
  return candidate.slice(0, 140);
};

const findDefendant = (text: string) => {
  const patterns = [
    /manufactured by\s+([A-Z][A-Za-z0-9&.,\- ]{2,80}?)(?:\s+between|\s+from|,|\.|;)/i,
    /made by\s+([A-Z][A-Za-z0-9&.,\- ]{2,80}?)(?:\s+between|\s+from|,|\.|;)/i,
    /against\s+([A-Z][A-Za-z0-9&.,\- ]{2,80})/i,
    /defendant[:\s]+([A-Z][A-Za-z0-9&.,\- ]{2,80})/i,
    /([A-Z][A-Za-z0-9&.,\- ]{2,80})\s+settlement/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanWhitespace(match[1]);
  }

  return '';
};

const findClassDefinition = (text: string) => {
  const patterns = [
    /(?:class members include|class means|you are included if|eligible consumers are|settlement class includes)(.*?)(?:\.|;)/i,
    /all persons who(.*?)(?:\.|;)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanWhitespace(match[0]).slice(0, 300);
  }

  return text.slice(0, 300);
};

const findPayment = (text: string) => {
  const match = text.match(/(?:up to|estimated|receive|payment of)\s+\$[0-9,.]+(?:\s*(?:to|-)\s*\$[0-9,.]+)?[^.]{0,60}/i);
  return match ? cleanWhitespace(match[0]) : '';
};

const findExcludedGroups = (text: string) => {
  const match = text.match(/(?:excluded|not included)(.*?)(?:\.|;)/i);
  return match ? cleanWhitespace(match[1]).replace(/^(are|is)\s+/i, '') : '';
};

const findJurisdictions = (text: string) => {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  Object.entries(jurisdictionMap).forEach(([needle, code]) => {
    if (lower.includes(needle)) {
      found.add(code);
    }
  });

  if (found.size === 0 && /\bus residents\b|\bunited states\b|\bu\.s\.\b/i.test(text)) {
    found.add('US');
  }

  return Array.from(found).join(', ');
};

export const extractSettlementDraft = (rawInput: string, sourceUrl?: string): ExtractedSettlementDraft => {
  const text = /<[^>]+>/.test(rawInput) ? stripHtml(rawInput) : cleanWhitespace(rawInput);
  const urls = findUrls(rawInput);
  const { purchaseStart, purchaseEnd } = findPurchaseRange(text);
  const claimFormUrl = urls.find((url) => /claim|submit|settlement/i.test(url)) || sourceUrl || urls[0] || '';
  const normalizedSourceUrl = sourceUrl || urls[0] || claimFormUrl;
  const proofRequired = /\bproof (?:of purchase )?required\b|\bmust provide receipt\b/i.test(text) && !/\bno proof (?:of purchase )?required\b/i.test(text);

  return {
    sourceName: 'Notice ingestion',
    caseName: findCaseName(text),
    defendant: findDefendant(text),
    claimFormUrl,
    sourceUrl: sourceUrl || urls.find((url) => !/claim|submit/i.test(url)) || normalizedSourceUrl,
    filingDeadline: findDeadline(text),
    purchaseStart,
    purchaseEnd,
    noticeExcerpt: text.slice(0, 320),
    classDefinition: findClassDefinition(text),
    cashPayment: findPayment(text),
    jurisdictions: findJurisdictions(text),
    excludedGroups: findExcludedGroups(text),
    status: 'ready_for_review',
    proofRequired,
    attestationRequired: true
  };
};
