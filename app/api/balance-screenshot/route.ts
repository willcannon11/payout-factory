import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

export const runtime = 'nodejs';

const normalizeImportedAccount = (value: string) => {
  const trimmed = value.replace(/[^A-Z0-9]/gi, '').toUpperCase().replace(/^PAA?PEX/, 'PAAPEX');
  const match = trimmed.match(/^(PAAPEX\d{6,})$/);
  if (!match) {
    return trimmed;
  }
  const digits = match[1].replace(/\D/g, '');
  return `PAAPEX${digits.slice(0, 5)}-${digits.slice(-2).padStart(2, '0')}`;
};

const parseBalance = (value: string) => {
  const normalized = value.replace(/[^0-9.]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
};

const normalizeSnapshotValues = (amounts: number[]) => {
  const validAmounts = amounts.filter((amount) => Number.isFinite(amount));
  if (validAmounts.length === 0) {
    return { balance: null, realizedPnl: null };
  }

  // In these screenshots the cash value is the large 50k+ number and
  // realized PnL is the smaller daily value shown in green/red.
  const balance = Math.max(...validAmounts);
  const remaining = validAmounts.filter((amount) => amount !== balance);
  const realizedPnl = remaining.length > 0 ? remaining[remaining.length - 1] : null;

  return { balance, realizedPnl };
};

const extractAccounts = (text: string) => {
  const matches = new Map<string, { balance: number; realizedPnl: number | null }>();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  let pendingAccount: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ');
    const accountMatch = line.match(/(PAA?PEX[0-9O\s-]{6,})/i);
    const moneyMatches = line.match(/\$?\s*([0-9,]+\.\d{2})/g) ?? [];

    if (accountMatch) {
      const rawAccount = accountMatch[1].replace(/O/g, '0').toUpperCase();
      const normalized = normalizeImportedAccount(rawAccount);
      if (normalized) {
        pendingAccount = normalized;
      }
    }

    if (pendingAccount && moneyMatches.length > 0) {
      const parsedAmounts = moneyMatches
        .map((money) => parseBalance(money))
        .filter((amount): amount is number => amount !== null);
      const { balance, realizedPnl } = normalizeSnapshotValues(parsedAmounts);
      if (balance !== null) {
        matches.set(pendingAccount, { balance, realizedPnl });
        pendingAccount = null;
      }
    }
  }

  return Array.from(matches.entries()).map(([account, values]) => ({
    account,
    balance: values.balance,
    realizedPnl: values.realizedPnl
  }));
};

const parseOpenAiJson = (text: string) => {
  const cleaned = text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((entry) => {
      const parsedAmounts = [
        typeof entry.balance === 'number'
          ? entry.balance
          : typeof entry.balance === 'string'
            ? parseBalance(entry.balance)
            : null,
        typeof entry.realizedPnl === 'number'
          ? entry.realizedPnl
          : typeof entry.realizedPnl === 'string'
            ? parseBalance(entry.realizedPnl)
            : null
      ].filter((amount): amount is number => amount !== null);
      const { balance, realizedPnl } = normalizeSnapshotValues(parsedAmounts);

      return {
        account: typeof entry.account === 'string' ? normalizeImportedAccount(entry.account) : '',
        balance,
        realizedPnl
      };
    })
    .filter((entry) => entry.account && entry.balance !== null) as Array<{ account: string; balance: number; realizedPnl: number | null }>;
};

export async function POST(request: Request) {
  let tempPath = '';

  try {
    const formData = await request.formData();
    const image = formData.get('image');

    if (!(image instanceof File)) {
      return NextResponse.json({ error: 'Image upload is required.' }, { status: 400 });
    }

    const bytes = Buffer.from(await image.arrayBuffer());
    const openAiKey = process.env.OPENAI_API_KEY;

    if (openAiKey) {
      const base64Image = bytes.toString('base64');
      const model = process.env.OPENAI_OCR_MODEL || 'gpt-4.1-mini';

      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text:
                    'Extract the account display names, cash values, and realized PnL values from this trading balances screenshot. Return only valid JSON as an array of objects with keys "account", "balance", and "realizedPnl". Example: [{"account":"PAAPEX44153-03","balance":52037.7,"realizedPnl":465.7}]'
                },
                {
                  type: 'input_image',
                  image_url: `data:${image.type || 'image/png'};base64,${base64Image}`
                }
              ]
            }
          ]
        })
      });

      const result = await response.json();
      if (!response.ok) {
        return NextResponse.json(
          { error: result?.error?.message || 'Hosted OCR request failed.' },
          { status: response.status }
        );
      }

      const outputText =
        result.output_text ||
        result.output
          ?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
          ?.map((item: { text?: string }) => item.text ?? '')
          ?.join('\n') ||
        '';

      const accounts = parseOpenAiJson(outputText);
      return NextResponse.json({ accounts, rawText: outputText, provider: 'openai' });
    }

    tempPath = path.join(os.tmpdir(), `balance-shot-${Date.now()}-${image.name}`);
    await fs.writeFile(tempPath, bytes);

    try {
      const { stdout, stderr } = await execFileAsync('tesseract', [tempPath, 'stdout', '--psm', '6']);
      const accounts = extractAccounts(stdout);

      return NextResponse.json({
        accounts,
        rawText: stdout,
        provider: 'tesseract',
        stderr: stderr || null
      });
    } catch (ocrError) {
      const message = ocrError instanceof Error ? ocrError.message : 'Unable to process screenshot with local OCR.';
      const stderr =
        typeof ocrError === 'object' && ocrError !== null && 'stderr' in ocrError
          ? String((ocrError as { stderr?: string }).stderr || '')
          : '';

      return NextResponse.json(
        {
          error: stderr ? `${message}\n${stderr}` : message
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to process screenshot.' },
      { status: 500 }
    );
  } finally {
    if (tempPath) {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}
