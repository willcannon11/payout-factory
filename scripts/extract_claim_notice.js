#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function cleanWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripHtml(value) {
  return cleanWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
  );
}

function toIsoDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function findUrls(text) {
  return Array.from(text.matchAll(/https?:\/\/[^\s)"'>]+/gi)).map((match) => match[0]);
}

function extract(rawInput, sourceUrl = '') {
  const text = /<[^>]+>/.test(rawInput) ? stripHtml(rawInput) : cleanWhitespace(rawInput);
  const urls = findUrls(rawInput);
  const deadlineMatch =
    text.match(/(?:deadline|claim\s+deadline|submit\s+.*?by|must\s+be\s+submitted\s+by)[:\s]+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i) ||
    text.match(/(?:deadline|claim deadline)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const rangeMatch =
    text.match(/between\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+and\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i) ||
    text.match(/between\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+and\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const lines = rawInput.split(/[\r\n]+/).map((line) => cleanWhitespace(line)).filter(Boolean);

  return {
    sourceName: 'Notice ingestion',
    caseName: (lines.find((line) => /settlement|class action|litigation/i.test(line) && line.length <= 140) || lines[0] || '').slice(0, 140),
    defendant:
      (
        text.match(/manufactured by\s+([A-Z][A-Za-z0-9&.,\- ]{2,80}?)(?:\s+between|\s+from|,|\.|;)/i) ||
        text.match(/made by\s+([A-Z][A-Za-z0-9&.,\- ]{2,80}?)(?:\s+between|\s+from|,|\.|;)/i) ||
        text.match(/against\s+([A-Z][A-Za-z0-9&.,\- ]{2,80})/i) ||
        text.match(/([A-Z][A-Za-z0-9&.,\- ]{2,80})\s+settlement/i) ||
        []
      )[1] || '',
    claimFormUrl: urls.find((url) => /claim|submit|settlement/i.test(url)) || sourceUrl || urls[0] || '',
    sourceUrl: sourceUrl || urls.find((url) => !/claim|submit/i.test(url)) || urls[0] || '',
    filingDeadline: deadlineMatch ? toIsoDate(deadlineMatch[1]) : '',
    purchaseStart: rangeMatch ? toIsoDate(rangeMatch[1]) : '',
    purchaseEnd: rangeMatch ? toIsoDate(rangeMatch[2]) : '',
    noticeExcerpt: text.slice(0, 320),
    classDefinition: (text.match(/(?:class members include|class means|you are included if|eligible consumers are|settlement class includes)(.*?)(?:\.|;)/i) || [text.slice(0, 300)])[0],
    cashPayment: (text.match(/(?:up to|estimated|receive|payment of)\s+\$[0-9,.]+(?:\s*(?:to|-)\s*\$[0-9,.]+)?[^.]{0,60}/i) || [''])[0],
    jurisdictions: /\bcalifornia\b/i.test(text) ? 'CA' : /\billinois\b/i.test(text) ? 'IL' : /\bunited states\b|\bus residents\b/i.test(text) ? 'US' : '',
    excludedGroups: ((text.match(/(?:excluded|not included)(.*?)(?:\.|;)/i) || [])[1] || '').trim(),
    status: 'ready_for_review',
    proofRequired: /\bproof (?:of purchase )?required\b|\bmust provide receipt\b/i.test(text) && !/\bno proof (?:of purchase )?required\b/i.test(text),
    attestationRequired: true
  };
}

const filePath = process.argv[2];
const sourceUrl = process.argv[3] || '';

if (!filePath) {
  console.error('Usage: node scripts/extract_claim_notice.js <file> [source_url]');
  process.exit(1);
}

const resolved = path.resolve(process.cwd(), filePath);
const rawInput = fs.readFileSync(resolved, 'utf8');
console.log(JSON.stringify(extract(rawInput, sourceUrl), null, 2));
