import { NextResponse } from 'next/server';
import { extractSettlementDraft, stripHtml } from '../../../../lib/claimsExtraction';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

export const runtime = 'nodejs';

const buildFallbackSummary = ({
  title,
  url,
  rawHtml
}: {
  title: string;
  url: string;
  rawHtml: string;
}) => {
  const draft = extractSettlementDraft(rawHtml, url);
  const proofLine = draft.proofRequired
    ? 'Proof of purchase appears to be required.'
    : 'A no-proof or self-attested path may be available, but this should be verified on the settlement site.';
  const payoutLine = draft.cashPayment
    ? `The page suggests a payout of ${draft.cashPayment}.`
    : 'The page does not clearly expose an estimated payout in the scraped text.';
  const classLine = draft.classDefinition
    ? `Likely eligible claimants are ${draft.classDefinition.replace(/^settlement class includes\s*/i, '').trim()}`
    : 'The class definition is not clearly exposed in the scraped text.';
  const deadlineLine = draft.filingDeadline
    ? `The apparent filing deadline is ${draft.filingDeadline}.`
    : 'A filing deadline was not confidently extracted.';

  return `${title} appears to be a settlement-related candidate page. ${classLine}. ${payoutLine} ${proofLine} ${deadlineLine} Review the official notice and claim form before taking action.`;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const candidateUrl = typeof body.candidateUrl === 'string' ? body.candidateUrl.trim() : '';
    const candidateTitle = typeof body.candidateTitle === 'string' ? body.candidateTitle.trim() : 'Settlement candidate';

    if (!candidateUrl) {
      return NextResponse.json({ error: 'Candidate URL is required.' }, { status: 400 });
    }

    const response = await fetch(candidateUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClaimsOpsBot/1.0; +https://localhost)'
      },
      redirect: 'follow'
    });

    const rawHtml = await response.text();
    const draft = extractSettlementDraft(rawHtml, candidateUrl);
    const text = stripHtml(rawHtml).slice(0, 12000);
    const openAiKey = process.env.OPENAI_API_KEY;

    if (openAiKey) {
      const aiResponse = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`
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
                    `Summarize this settlement candidate in one paragraph for an operator reviewing whether it is claim-worthy. ` +
                    `State what the claim is about, who is likely eligible, any payout estimate, whether proof appears required, and any deadline if visible. ` +
                    `If something is unclear, say so. Candidate title: ${candidateTitle}. Extracted draft: ${JSON.stringify(draft)}. Page text: ${text}`
                }
              ]
            }
          ]
        })
      });

      const result = await aiResponse.json();
      if (aiResponse.ok) {
        const summary =
          result.output_text ||
          result.output
            ?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
            ?.map((item: { text?: string }) => item.text ?? '')
            ?.join('\n') ||
          '';

        if (summary.trim()) {
          return NextResponse.json({ summary: summary.trim(), draft });
        }
      }
    }

    return NextResponse.json({
      summary: buildFallbackSummary({
        title: candidateTitle,
        url: candidateUrl,
        rawHtml
      }),
      draft
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to summarize candidate.' },
      { status: 500 }
    );
  }
}
