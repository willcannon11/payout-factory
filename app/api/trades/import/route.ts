import { NextRequest, NextResponse } from 'next/server';
import { parseNinjaCsv } from '../../../../lib/csv';
import { buildTradeFingerprint } from '../../../../lib/tradeFingerprint';
import { serverSupabase } from '../../../../lib/serverSupabase';
import { matchTrades } from '../../../../lib/trades';

export async function POST(request: NextRequest) {
  if (!serverSupabase) {
    return NextResponse.json({ error: 'Server-side Supabase is not configured.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const sources = Array.isArray(body?.sources) ? body.sources : [];
  const defaultTags = Array.isArray(body?.defaultTags)
    ? body.defaultTags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : [];
  const timeZone = typeof body?.timeZone === 'string' && body.timeZone.trim() ? body.timeZone : 'America/Chicago';

  if (sources.length === 0) {
    return NextResponse.json({ error: 'No CSV sources were provided.' }, { status: 400 });
  }

  let totalTrades = 0;
  let totalNet = 0;
  let attemptedTrades = 0;
  let insertedTrades = 0;

  for (const source of sources) {
    const name = String(source?.name ?? 'uploaded-trades.csv');
    const text = String(source?.text ?? '');
    const rows = parseNinjaCsv(text, timeZone);
    const trades = matchTrades(rows, name);
    totalTrades += trades.length;
    attemptedTrades += trades.length;
    totalNet += trades.reduce((sum, trade) => sum + trade.netPnl, 0);

    if (trades.length === 0) {
      continue;
    }

    const payload = trades.map((trade) => ({
      account: trade.account,
      instrument: trade.instrument,
      side: trade.side,
      quantity: trade.quantity,
      entry_time: trade.entryTime.toISOString(),
      exit_time: trade.exitTime.toISOString(),
      entry_price: trade.entryPrice,
      exit_price: trade.exitPrice,
      gross_pnl: trade.grossPnl,
      commission: trade.commission,
      net_pnl: trade.netPnl,
      trade_tags: defaultTags,
      trade_fingerprint: buildTradeFingerprint(trade),
      source_file: trade.sourceFile
    }));

    let result = await serverSupabase
      .from('trades')
      .upsert(payload, {
        onConflict: 'trade_fingerprint',
        ignoreDuplicates: true
      })
      .select('id');

    let error = result.error;
    insertedTrades += result.data?.length ?? 0;

    if (error && error.message.includes('trade_tags')) {
      const fallbackPayload = payload.map(({ trade_tags, ...rest }) => rest);
      const fallback = await serverSupabase
        .from('trades')
        .upsert(fallbackPayload, {
          onConflict: 'trade_fingerprint',
          ignoreDuplicates: true
        })
        .select('id');
      error = fallback.error;
      insertedTrades += fallback.data?.length ?? 0;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { count, error: countError } = await serverSupabase
    .from('trades')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    return NextResponse.json({
      status: `Import complete, but row-count check failed: ${countError.message}`,
      summary: {
        files: sources.length,
        trades: totalTrades,
        net: totalNet,
        attempted: attemptedTrades,
        inserted: insertedTrades,
        tableCount: null,
        projectHost: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname || 'unknown'
      }
    });
  }

  return NextResponse.json({
    status: 'Import complete.',
    summary: {
      files: sources.length,
      trades: totalTrades,
      net: totalNet,
      attempted: attemptedTrades,
      inserted: insertedTrades,
      tableCount: count ?? 0,
      projectHost: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname || 'unknown'
    }
  });
}
