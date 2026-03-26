#!/usr/bin/env node

const https = require('https');

const seeds = [
  {
    name: 'ClassAction.org Settlements',
    url: 'https://www.classaction.org/settlements'
  },
  {
    name: 'Top Class Actions Open Settlements',
    url: 'https://topclassactions.com/category/lawsuit-settlements/open-lawsuit-settlements/'
  }
];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ClaimsOpsBot/1.0; +https://localhost)'
          }
        },
        (response) => {
          let body = '';
          response.on('data', (chunk) => {
            body += chunk;
          });
          response.on('end', () => {
            resolve({ status: response.statusCode || 0, body });
          });
        }
      )
      .on('error', reject);
  });
}

function cleanWhitespace(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function extractLinks(html, baseUrl) {
  const keywords = ['settlement', 'claim', 'class action', 'proof', 'purchase', 'notice'];
  const matches = Array.from(html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const seen = new Set();
  const results = [];

  for (const match of matches) {
    const href = match[1];
    const title = cleanWhitespace(match[2]);
    if (!href || !title || title.length < 12) continue;

    let resolved;
    try {
      resolved = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    if (seen.has(resolved) || !/^https?:/i.test(resolved)) continue;
    const haystack = `${title} ${resolved}`.toLowerCase();
    const hits = keywords.filter((keyword) => haystack.includes(keyword)).length;
    if (hits < 2) continue;

    seen.add(resolved);
    results.push({ title: title.slice(0, 180), url: resolved });
  }

  return results.slice(0, 8);
}

(async () => {
  for (const seed of seeds) {
    try {
      const response = await fetchText(seed.url);
      const candidates = extractLinks(response.body, seed.url);
      console.log(`\n${seed.name} (${response.status})`);
      candidates.forEach((candidate) => {
        console.log(`- ${candidate.title}`);
        console.log(`  ${candidate.url}`);
      });
    } catch (error) {
      console.log(`\n${seed.name}`);
      console.log(`- ERROR: ${error.message}`);
    }
  }
})();
