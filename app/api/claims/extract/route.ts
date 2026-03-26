import { NextResponse } from 'next/server';
import { extractSettlementDraft } from '../../../../lib/claimsExtraction';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawInput = typeof body.rawInput === 'string' ? body.rawInput : '';
    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : '';

    if (!rawInput.trim()) {
      return NextResponse.json({ error: 'Raw notice text or HTML is required.' }, { status: 400 });
    }

    return NextResponse.json({ draft: extractSettlementDraft(rawInput, sourceUrl) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to extract settlement draft.' },
      { status: 500 }
    );
  }
}
