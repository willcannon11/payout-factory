'use client';

import { ClipboardEvent, useEffect, useMemo, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import { supabase } from '../../lib/supabase';
import { mapTradeRow } from '../../lib/transform';
import { AccountMetricOverrideRow, BalanceSnapshotRow, GoalRow, PayoutRow, Trade, TradeRow } from '../../lib/types';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toDateKey = (date: Date) => date.toISOString().split('T')[0];

const normalizeAccountKey = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.slice(-2);
};

const snapshotSortValue = (snapshot: BalanceSnapshotRow) =>
  new Date(snapshot.created_at || `${snapshot.snapshot_date}T23:59:59`).getTime();

const latestSnapshotPerDay = (rows: BalanceSnapshotRow[]) =>
  Array.from(
    rows
      .slice()
      .sort((left, right) => snapshotSortValue(right) - snapshotSortValue(left))
      .reduce((map, snapshot) => {
        const key = `${snapshot.account}-${snapshot.snapshot_date}`;
        if (!map.has(key)) {
          map.set(key, snapshot);
        }
        return map;
      }, new Map<string, BalanceSnapshotRow>())
      .values()
  );

const accountSeedDefaults: Record<string, { tradingDays?: number; profitableDays?: number; approvedPayouts?: number; largestSingleDay?: number }> = {
  '03': { tradingDays: 45, profitableDays: 5, approvedPayouts: 0, largestSingleDay: 891 },
  '05': { tradingDays: 1, profitableDays: 0, approvedPayouts: 1 },
  '06': { tradingDays: 21, profitableDays: 5, approvedPayouts: 0 },
  '07': { tradingDays: 18, profitableDays: 5, approvedPayouts: 0 },
  '08': { tradingDays: 18, profitableDays: 5, approvedPayouts: 0 },
  '09': { tradingDays: 11, profitableDays: 5, approvedPayouts: 0 },
  '10': { tradingDays: 11, profitableDays: 5, approvedPayouts: 0 },
  '11': { tradingDays: 11, profitableDays: 5, approvedPayouts: 0 },
  '12': { tradingDays: 11, profitableDays: 5, approvedPayouts: 0 },
  '13': { tradingDays: 11, profitableDays: 5, approvedPayouts: 0 },
  '14': { tradingDays: 10, profitableDays: 5, approvedPayouts: 0 },
  '15': { tradingDays: 10, profitableDays: 5, approvedPayouts: 0 },
  '16': { tradingDays: 10, profitableDays: 5, approvedPayouts: 0 },
  '17': { tradingDays: 10, profitableDays: 5, approvedPayouts: 0 },
  '18': { tradingDays: 10, profitableDays: 5, approvedPayouts: 0 }
};

type AccountProgress = {
  account: string;
  latestBalance: number;
  balanceDate: string;
  totalProfit: number;
  computedTradingDays: number;
  computedProfitableDays: number;
  computedLargestPositiveDay: number;
  tradingDays: number;
  profitableDays: number;
  largestPositiveDay: number;
  approvedPayouts: number;
  requestThresholdBalance: number;
  tradingDaysPass: boolean;
  profitableDaysPass: boolean;
  balanceNeededNow: number;
  ticksToRequestNow: number;
  requestableNow: number;
  totalPaidOut: number;
};

export default function GoalsPage() {
  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [snapshots, setSnapshots] = useState<BalanceSnapshotRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [accountOverrides, setAccountOverrides] = useState<AccountMetricOverrideRow[]>([]);
  const [updatingOverride, setUpdatingOverride] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [snapshotAccount, setSnapshotAccount] = useState('');
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().split('T')[0]);
  const [snapshotBalance, setSnapshotBalance] = useState('');
  const [snapshotNotes, setSnapshotNotes] = useState('');
  const [snapshotImage, setSnapshotImage] = useState<File | null>(null);
  const [bulkSnapshotDate, setBulkSnapshotDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkSnapshotImage, setBulkSnapshotImage] = useState<File | null>(null);
  const [bulkSnapshotType, setBulkSnapshotType] = useState<'intraday' | 'eod'>('intraday');
  const [bulkImporting, setBulkImporting] = useState(false);

  const [title, setTitle] = useState('$10k payout');
  const [targetAmount, setTargetAmount] = useState('10000');
  const [manualPaidOutToGoal, setManualPaidOutToGoal] = useState('0');
  const [contracts, setContracts] = useState('1');
  const [tickStep, setTickStep] = useState('1');
  const [initialBalance, setInitialBalance] = useState('50000');
  const [minBalanceAfterPayout, setMinBalanceAfterPayout] = useState('52100');
  const [minRequestAmount, setMinRequestAmount] = useState('500');
  const [maxPayoutAmount, setMaxPayoutAmount] = useState('2000');
  const [minTradingDays, setMinTradingDays] = useState('8');
  const [minProfitableDays, setMinProfitableDays] = useState('5');
  const [profitableDayThreshold, setProfitableDayThreshold] = useState('50');
  const [consistencyLimitPct, setConsistencyLimitPct] = useState('30');
  const [tickValuePerContract, setTickValuePerContract] = useState('12.5');
  const [linkedAccountsCount, setLinkedAccountsCount] = useState('');

  const loadData = async () => {
    setLoading(true);
    const [goalResponse, tradeResponse, snapshotResponse, payoutResponse, overrideResponse] = await Promise.all([
      supabase
        .from('goals')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('trades').select('*').order('exit_time', { ascending: true }),
      supabase.from('balance_snapshots').select('*').order('snapshot_date', { ascending: false }),
      supabase.from('payouts').select('*').order('request_date', { ascending: false }),
      supabase.from('account_metric_overrides').select('*').order('account', { ascending: true })
    ]);

    if (goalResponse.error) {
      setMessage(goalResponse.error.message);
    }

    if (tradeResponse.error) {
      setMessage(tradeResponse.error.message);
    }

    if (snapshotResponse.error) {
      setMessage(snapshotResponse.error.message);
    }

    if (payoutResponse.error) {
      setMessage(payoutResponse.error.message);
    }

    if (overrideResponse.error) {
      setMessage(overrideResponse.error.message);
    }

    if (goalResponse.data) {
      const loaded = goalResponse.data as GoalRow;
      setGoal(loaded);
      setTitle(loaded.goal_title);
      setTargetAmount(loaded.target_amount?.toString() ?? '10000');
      setManualPaidOutToGoal((loaded.manual_paid_out_to_goal ?? 0).toString());
      setContracts((loaded.contracts ?? 1).toString());
      setTickStep((loaded.tick_step ?? 1).toString());
      setInitialBalance((loaded.initial_balance ?? 50000).toString());
      setMinBalanceAfterPayout((loaded.min_balance_after_payout ?? 52100).toString());
      setMinRequestAmount((loaded.min_request_amount ?? 500).toString());
      setMaxPayoutAmount((loaded.max_payout_amount ?? 2000).toString());
      setMinTradingDays((loaded.min_trading_days ?? 8).toString());
      setMinProfitableDays((loaded.min_profitable_days ?? 5).toString());
      setProfitableDayThreshold((loaded.profitable_day_threshold ?? 50).toString());
      setConsistencyLimitPct((loaded.consistency_limit_pct ?? 30).toString());
      setTickValuePerContract((loaded.tick_value_per_contract ?? 12.5).toString());
      setLinkedAccountsCount(loaded.linked_accounts_count?.toString() ?? '');
    }

    setTrades(((tradeResponse.data ?? []) as TradeRow[]).map(mapTradeRow));
    setSnapshots((snapshotResponse.data ?? []) as BalanceSnapshotRow[]);
    setPayouts((payoutResponse.data ?? []) as PayoutRow[]);
    setAccountOverrides((overrideResponse.data ?? []) as AccountMetricOverrideRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const addSnapshot = async () => {
    if (!snapshotAccount || !snapshotDate || !snapshotBalance) {
      setMessage('Account, snapshot date, and balance are required.');
      return;
    }

    let imageUrl: string | null = null;
    if (snapshotImage) {
      const filePath = `${snapshotAccount}/${snapshotDate}-${snapshotImage.name}`;
      const { data, error } = await supabase.storage.from('balances').upload(filePath, snapshotImage, {
        upsert: true
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data) {
        const { data: publicUrl } = supabase.storage.from('balances').getPublicUrl(data.path);
        imageUrl = publicUrl.publicUrl;
      }
    }

    const { error } = await supabase.from('balance_snapshots').insert({
      account: snapshotAccount,
      snapshot_date: snapshotDate,
      balance: Number(snapshotBalance),
      realized_pnl: null,
      snapshot_type: 'eod',
      notes: snapshotNotes || null,
      image_url: imageUrl
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setSnapshotAccount('');
    setSnapshotDate(new Date().toISOString().split('T')[0]);
    setSnapshotBalance('');
    setSnapshotNotes('');
    setSnapshotImage(null);
    setMessage('Balance snapshot saved. Goals updated with the latest balances.');
    loadData();
  };

  const importSnapshotScreenshot = async () => {
    if (!bulkSnapshotImage || !bulkSnapshotDate) {
      setMessage('Screenshot file and snapshot date are required.');
      return;
    }

    setBulkImporting(true);
    setMessage('');

    const formData = new FormData();
    formData.append('image', bulkSnapshotImage);

    try {
      const response = await fetch('/api/balance-screenshot', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error || 'Unable to read the screenshot.');
        setBulkImporting(false);
        return;
      }

      const accounts = Array.isArray(result.accounts) ? result.accounts : [];
      if (accounts.length === 0) {
        setMessage('No account balances were detected from that screenshot.');
        setBulkImporting(false);
        return;
      }

      const previousSnapshotByAccount = snapshots
        .filter((snapshot) => snapshot.snapshot_date < bulkSnapshotDate && snapshot.balance >= 10000)
        .slice()
        .sort((left, right) => snapshotSortValue(right) - snapshotSortValue(left))
        .reduce((map, snapshot) => {
          if (!map.has(snapshot.account)) {
            map.set(snapshot.account, snapshot);
          }
          return map;
        }, new Map<string, BalanceSnapshotRow>());

      const rows = accounts.map((entry: { account: string; balance: number; realizedPnl?: number | null }) => {
        const previousSnapshot = previousSnapshotByAccount.get(entry.account);
        const inferredRealizedPnl =
          entry.realizedPnl ?? (entry.balance < 10000 ? entry.balance : null);
        const repairedBalance =
          entry.balance < 10000 && inferredRealizedPnl !== null && previousSnapshot
            ? previousSnapshot.balance + inferredRealizedPnl
            : entry.balance;

        return {
          account: entry.account,
          snapshot_date: bulkSnapshotDate,
          balance: repairedBalance,
          realized_pnl: inferredRealizedPnl,
          snapshot_type: bulkSnapshotType,
          notes: `Imported from ${bulkSnapshotType === 'eod' ? 'EOD' : 'intraday'} screenshot`,
          image_url: null
        };
      });

      const { error } = await supabase.from('balance_snapshots').insert(rows);
      if (error) {
        setMessage(error.message);
        setBulkImporting(false);
        return;
      }

      setBulkSnapshotImage(null);
      setMessage(`Imported ${rows.length} account balances from one screenshot.`);
      loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to import screenshot.');
    } finally {
      setBulkImporting(false);
    }
  };

  const onPasteScreenshot = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith('image/'));

    if (!imageItem) {
      setMessage('Clipboard does not contain an image yet. Take the screenshot, then click here and paste.');
      return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
      setMessage('Could not read image from clipboard.');
      return;
    }

    const extension = file.type.split('/')[1] || 'png';
    const pastedFile = new File([file], `pasted-screenshot-${Date.now()}.${extension}`, { type: file.type });
    setBulkSnapshotImage(pastedFile);
    setMessage('Screenshot pasted. Ready to import.');
  };

  const saveGoal = async () => {
    const payload = {
      goal_title: title || 'Payout goal',
      target_amount: targetAmount ? Number(targetAmount) : null,
      manual_paid_out_to_goal: Number(manualPaidOutToGoal) || 0,
      total_ticks: 0,
      ticks_remaining: 0,
      contracts: Number(contracts) || 1,
      tick_step: Number(tickStep) || 1,
      initial_balance: Number(initialBalance) || 50000,
      min_balance_after_payout: Number(minBalanceAfterPayout) || 52100,
      min_request_amount: Number(minRequestAmount) || 500,
      max_payout_amount: Number(maxPayoutAmount) || 2000,
      min_trading_days: Number(minTradingDays) || 8,
      min_profitable_days: Number(minProfitableDays) || 5,
      profitable_day_threshold: Number(profitableDayThreshold) || 50,
      consistency_limit_pct: Number(consistencyLimitPct) || 30,
      tick_value_per_contract: Number(tickValuePerContract) || 12.5,
      linked_accounts_count: linkedAccountsCount ? Number(linkedAccountsCount) : null,
      is_active: true
    };

    let errorMessage = '';

    if (goal?.id) {
      const { error } = await supabase.from('goals').update(payload).eq('id', goal.id);
      errorMessage = error?.message ?? '';
    } else {
      const { data, error } = await supabase.from('goals').insert(payload).select('*').single();
      errorMessage = error?.message ?? '';
      if (data) {
        setGoal(data as GoalRow);
      }
    }

    if (errorMessage) {
      setMessage(errorMessage);
      return;
    }

    setMessage('Goal settings saved.');
    loadData();
  };

  const latestSnapshotsByAccount = Array.from(
    snapshots
      .slice()
      .sort((left, right) => snapshotSortValue(right) - snapshotSortValue(left))
      .reduce((map, snapshot) => {
      if (!map.has(snapshot.account)) {
        map.set(snapshot.account, snapshot);
      }
      return map;
      }, new Map<string, BalanceSnapshotRow>())
      .values()
  );

  const accountOverridesByKey = useMemo(
    () =>
      accountOverrides.reduce((map, override) => {
        map.set(normalizeAccountKey(override.account), override);
        return map;
      }, new Map<string, AccountMetricOverrideRow>()),
    [accountOverrides]
  );

  const tickDollarValuePerAccount = Number(tickValuePerContract || 0) * Number(contracts || 0);
  const accountCount = linkedAccountsCount ? Number(linkedAccountsCount) : latestSnapshotsByAccount.length;
  const aggregateDollarPerTick = tickDollarValuePerAccount * Math.max(accountCount, 1);

  const currentInitialBalance = Number(initialBalance || 50000);
  const currentMinBalance = Number(minBalanceAfterPayout || 52100);
  const currentMinRequest = Number(minRequestAmount || 500);
  const currentMaxPayout = Number(maxPayoutAmount || 2000);
  const currentMinDays = Number(minTradingDays || 8);
  const currentMinProfitDays = Number(minProfitableDays || 5);
  const currentProfitDayThreshold = Number(profitableDayThreshold || 50);
  const currentConsistencyPct = Number(consistencyLimitPct || 30) / 100;

  const calculateConsistencyRequiredBalance = (largestPositiveDay: number) => {
    const minimumRequiredBalance = currentMinBalance + currentMinRequest;
    const maximumRequiredBalance = currentMinBalance + currentMaxPayout;

    if (largestPositiveDay <= 0 || currentConsistencyPct <= 0) {
      return minimumRequiredBalance;
    }

    const consistencyDrivenBalance = currentInitialBalance + largestPositiveDay / currentConsistencyPct;
    return clamp(consistencyDrivenBalance, minimumRequiredBalance, maximumRequiredBalance);
  };

  const calculateRequestableAmount = (balance: number, minimumBalanceAfterPayoutValue: number) => {
    const rawCapacity = balance - minimumBalanceAfterPayoutValue;
    if (rawCapacity < currentMinRequest) {
      return 0;
    }
    return Math.min(rawCapacity, currentMaxPayout);
  };

  const accountProgress: AccountProgress[] = useMemo(
    () =>
      latestSnapshotsByAccount
        .map((snapshot) => {
          const accountKey = normalizeAccountKey(snapshot.account);
          const seed = accountSeedDefaults[accountKey] ?? {};
          const override = accountOverridesByKey.get(accountKey);
          const accountTrades = trades.filter((trade) => normalizeAccountKey(trade.account) === accountKey);
          const accountSnapshots = latestSnapshotPerDay(
            snapshots
            .filter((row) => normalizeAccountKey(row.account) === accountKey)
          )
            .slice()
            .sort((left, right) => {
              const byDate = left.snapshot_date.localeCompare(right.snapshot_date);
              if (byDate !== 0) {
                return byDate;
              }
              return snapshotSortValue(left) - snapshotSortValue(right);
            });
          const eodSnapshots = accountSnapshots.filter((row) => !row.snapshot_type || row.snapshot_type === 'eod');
          const dailyMap = accountTrades.reduce((map, trade) => {
            const key = toDateKey(trade.exitTime);
            map.set(key, (map.get(key) ?? 0) + trade.netPnl);
            return map;
          }, new Map<string, number>());

          for (let index = 1; index < eodSnapshots.length; index += 1) {
            const previous = eodSnapshots[index - 1];
            const current = eodSnapshots[index];
            const inferredKey = current.snapshot_date;
            const inferredPnl = current.realized_pnl ?? (current.balance - previous.balance);

            // If we do not have imported trade history for that day, infer the day's result
            // from the change between consecutive balance snapshots.
            if (!dailyMap.has(inferredKey)) {
              dailyMap.set(inferredKey, inferredPnl);
            }
          }

          const dailyProfits = Array.from(dailyMap.values());
          const latestBalance = snapshot.balance;
          const totalProfit = latestBalance - currentInitialBalance;
          const computedTradingDays = Math.max(dailyProfits.length, seed.tradingDays ?? 0);
          const computedProfitableDays = Math.max(
            dailyProfits.filter((profit) => profit >= currentProfitDayThreshold).length,
            seed.profitableDays ?? 0
          );
          const computedLargestPositiveDay = Math.max(
            dailyProfits.length ? Math.max(...dailyProfits, 0) : 0,
            seed.largestSingleDay ?? 0
          );
          const tradingDays = Math.max(0, computedTradingDays + (override?.trading_days_adjustment ?? 0));
          const profitableDays = Math.max(0, computedProfitableDays + (override?.profitable_days_adjustment ?? 0));
          const largestPositiveDay = Math.max(
            computedLargestPositiveDay,
            override?.largest_single_day_override ?? 0
          );
          const requestThresholdBalance = calculateConsistencyRequiredBalance(largestPositiveDay);
          const tradingDaysPass = tradingDays >= currentMinDays;
          const profitableDaysPass = profitableDays >= currentMinProfitDays;
          const balanceNeededNow = Math.max(0, requestThresholdBalance - latestBalance);
          const ticksToRequestNow =
            tickDollarValuePerAccount > 0 ? Math.ceil(balanceNeededNow / tickDollarValuePerAccount) : 0;
          const requirementPass = tradingDaysPass && profitableDaysPass;
          const requestableNow =
            requirementPass && latestBalance >= requestThresholdBalance
              ? calculateRequestableAmount(
                  latestBalance,
                  clamp(requestThresholdBalance - currentMinRequest, currentMinBalance, currentMinBalance + currentMaxPayout)
                )
              : 0;
          const approvedPayouts = Math.max(
            payouts.filter(
              (payout) =>
                normalizeAccountKey(payout.account) === accountKey &&
                (payout.status === 'paid' || payout.approved_date)
            ).length,
            seed.approvedPayouts ?? 0
          );
          const totalPaidOut = payouts
            .filter(
              (payout) =>
                normalizeAccountKey(payout.account) === accountKey &&
                (payout.status === 'paid' || Boolean(payout.received_date) || Boolean(payout.approved_date))
            )
            .reduce((sum, payout) => sum + payout.amount, 0);

          return {
            account: snapshot.account,
            latestBalance,
            balanceDate: snapshot.snapshot_date,
            totalProfit,
            computedTradingDays,
            computedProfitableDays,
            computedLargestPositiveDay,
            tradingDays,
            profitableDays,
            largestPositiveDay,
            approvedPayouts,
            requestThresholdBalance,
            tradingDaysPass,
            profitableDaysPass,
            balanceNeededNow,
            ticksToRequestNow,
            requestableNow,
            totalPaidOut
          };
        })
        .sort((left, right) => left.account.localeCompare(right.account)),
    [latestSnapshotsByAccount, trades, payouts, currentInitialBalance, currentProfitDayThreshold, currentMinDays, currentMinProfitDays, currentMinBalance, currentMinRequest, currentMaxPayout, currentConsistencyPct, tickDollarValuePerAccount, accountOverridesByKey]
  );

  const upsertAccountOverride = async (
    account: string,
    updates: Partial<Pick<AccountMetricOverrideRow, 'trading_days_adjustment' | 'profitable_days_adjustment' | 'largest_single_day_override'>>
  ) => {
    const existing = accountOverrides.find((override) => normalizeAccountKey(override.account) === normalizeAccountKey(account));
    const payload = {
      account,
      trading_days_adjustment: existing?.trading_days_adjustment ?? 0,
      profitable_days_adjustment: existing?.profitable_days_adjustment ?? 0,
      largest_single_day_override: existing?.largest_single_day_override ?? null,
      ...updates
    };

    setUpdatingOverride(account);
    const { error } = await supabase.from('account_metric_overrides').upsert(payload, { onConflict: 'account' });
    setUpdatingOverride(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(`Updated manual overrides for ${account}.`);
    loadData();
  };

  const adjustAccountCounter = async (
    account: AccountProgress,
    field: 'trading_days_adjustment' | 'profitable_days_adjustment',
    delta: number
  ) => {
    const existing = accountOverridesByKey.get(normalizeAccountKey(account.account));
    const currentValue = existing?.[field] ?? 0;
    const floor = field === 'trading_days_adjustment' ? -account.computedTradingDays : -account.computedProfitableDays;
    await upsertAccountOverride(account.account, {
      [field]: Math.max(floor, currentValue + delta)
    });
  };

  const saveLargestSingleDayOverride = async (account: AccountProgress, value: string) => {
    const parsed = Number(value);
    await upsertAccountOverride(account.account, {
      largest_single_day_override: Number.isFinite(parsed) ? Math.max(0, parsed) : null
    });
  };

  const totalAvailableNow = accountProgress.reduce((sum, account) => sum + account.requestableNow, 0);
  const manualPaidOutAmount = Number(manualPaidOutToGoal || 0);
  const totalTargetAmount = Number(targetAmount || 0);
  const achievedTowardGoal = totalAvailableNow + manualPaidOutAmount;
  const remainingToGoal = Math.max(0, totalTargetAmount - achievedTowardGoal);

  const totalRequestableAtTicks = (tickCount: number) =>
    accountProgress.reduce((sum, account) => {
      const futureDayPnl = tickCount * tickDollarValuePerAccount;
      const projectedTradingDays = account.tradingDays + (tickCount > 0 ? 1 : 0);
      const projectedProfitableDays =
        account.profitableDays + (futureDayPnl >= currentProfitDayThreshold ? 1 : 0);
      const projectedRequirementsPass =
        projectedTradingDays >= currentMinDays && projectedProfitableDays >= currentMinProfitDays;

      if (!projectedRequirementsPass) {
        return sum;
      }

      const futureBalance = account.latestBalance + tickCount * tickDollarValuePerAccount;
      if (futureBalance < account.requestThresholdBalance) {
        return sum;
      }

      return sum +
        calculateRequestableAmount(
          futureBalance,
          clamp(account.requestThresholdBalance - currentMinRequest, currentMinBalance, currentMinBalance + currentMaxPayout)
        );
    }, 0);

  const computedTicksToGoal = (() => {
    if (remainingToGoal <= 0 || tickDollarValuePerAccount <= 0) {
      return 0;
    }
    if (totalRequestableAtTicks(0) >= remainingToGoal) {
      return 0;
    }
    let ticks = 0;
    const maxTicksToTry = 10000;
    while (ticks <= maxTicksToTry) {
      if (totalRequestableAtTicks(ticks) >= remainingToGoal) {
        return ticks;
      }
      ticks += 1;
    }
    return maxTicksToTry;
  })();
  const baselineTicksToGoal = goal?.total_ticks && goal.total_ticks > 0 ? goal.total_ticks : computedTicksToGoal;
  const manualProgressRatio = totalTargetAmount > 0 ? manualPaidOutAmount / totalTargetAmount : 0;
  const remainingGoalRatio = Math.max(0, 1 - manualProgressRatio);
  const tickProgressRatio =
    baselineTicksToGoal > 0
      ? Math.max(0, Math.min(1, (baselineTicksToGoal - computedTicksToGoal) / baselineTicksToGoal))
      : 0;
  const progressPercent = Math.min(100, Math.max(0, (manualProgressRatio + tickProgressRatio * remainingGoalRatio) * 100));

  useEffect(() => {
    if (!goal?.id || goal.total_ticks > 0 || computedTicksToGoal <= 0) {
      return;
    }

    const initializeBaseline = async () => {
      const { error } = await supabase
        .from('goals')
        .update({ total_ticks: computedTicksToGoal, ticks_remaining: computedTicksToGoal })
        .eq('id', goal.id);

      if (!error) {
        setGoal((current) =>
          current ? { ...current, total_ticks: computedTicksToGoal, ticks_remaining: computedTicksToGoal } : current
        );
      }
    };

    initializeBaseline();
  }, [goal, computedTicksToGoal]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">Goals</div>
            <div className="hero-subtitle">Account-level payout eligibility, what is left, and aggregate ticks to your payout target.</div>
          </div>
        </div>

        <div className="callout" style={{ marginBottom: '16px' }}>
          This page reads your latest balance snapshot for each account and compares it against the payout rules you set below.
        </div>

        {message ? <div className="callout" style={{ marginBottom: '16px' }}>{message}</div> : null}

        <section className="card" style={{ marginBottom: '24px' }}>
          <div className="section-header">
            <div>
              <div className="section-title">Screenshot Snapshot Import</div>
              <div className="sub">Use `Intraday` for live progress without affecting day counts. Use `EOD` when you want the snapshot to count toward trading days and $50+ days.</div>
            </div>
          </div>
          <div className="form-row">
            <div>
              <div className="field-label">Snapshot Date</div>
              <input className="input" type="date" value={bulkSnapshotDate} onChange={(event) => setBulkSnapshotDate(event.target.value)} />
            </div>
            <div>
              <div className="field-label">Snapshot Type</div>
              <select className="select" value={bulkSnapshotType} onChange={(event) => setBulkSnapshotType(event.target.value as 'intraday' | 'eod')}>
                <option value="intraday">Intraday</option>
                <option value="eod">EOD</option>
              </select>
            </div>
            <div>
              <div className="field-label">Balances Screenshot</div>
              <input className="input" type="file" accept="image/*" onChange={(event) => setBulkSnapshotImage(event.target.files?.[0] ?? null)} />
            </div>
          </div>
          <div
            className="callout"
            style={{ marginBottom: '12px', cursor: 'text' }}
            tabIndex={0}
            onPaste={onPasteScreenshot}
          >
            Click here and press <code>Cmd + V</code> to paste a screenshot from your clipboard.
            {bulkSnapshotImage ? (
              <div className="sub" style={{ marginTop: '8px' }}>
                Ready: <strong>{bulkSnapshotImage.name}</strong>
              </div>
            ) : null}
          </div>
          <button className="btn" onClick={importSnapshotScreenshot} disabled={bulkImporting}>
            {bulkImporting ? 'Importing screenshot...' : 'Import screenshot balances'}
          </button>
        </section>

        <section className="card" style={{ marginBottom: '24px' }}>
          <div className="section-header">
            <div>
              <div className="section-title">Manual EOD Snapshot</div>
              <div className="sub">Fallback only. Most days, the screenshot importer above should be all you need.</div>
            </div>
          </div>
          <div className="form-row">
            <div>
              <div className="field-label">Account</div>
              <input className="input" placeholder="PAAPEX44153-03" value={snapshotAccount} onChange={(event) => setSnapshotAccount(event.target.value)} />
            </div>
            <div>
              <div className="field-label">Snapshot Date</div>
              <input className="input" type="date" value={snapshotDate} onChange={(event) => setSnapshotDate(event.target.value)} />
            </div>
            <div>
              <div className="field-label">Balance</div>
              <input className="input" type="number" placeholder="51937.60" value={snapshotBalance} onChange={(event) => setSnapshotBalance(event.target.value)} />
            </div>
            <div>
              <div className="field-label">Notes</div>
              <input className="input" placeholder="Optional notes" value={snapshotNotes} onChange={(event) => setSnapshotNotes(event.target.value)} />
            </div>
            <div>
              <div className="field-label">Screenshot</div>
              <input className="input" type="file" accept="image/*" onChange={(event) => setSnapshotImage(event.target.files?.[0] ?? null)} />
            </div>
          </div>
          <button className="btn" onClick={addSnapshot}>Save snapshot</button>
        </section>

        <div className="goals-layout">
          <section className="card">
            <div className="section-title">Goal + Rule Settings</div>
            <div className="form-row">
              <div>
                <div className="field-label">Goal Title</div>
                <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Target Payout Goal</div>
                <input className="input" type="number" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Initial Balance</div>
                <input className="input" type="number" value={initialBalance} onChange={(event) => setInitialBalance(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Min Balance After Payout</div>
                <input className="input" type="number" value={minBalanceAfterPayout} onChange={(event) => setMinBalanceAfterPayout(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Min Payout Request</div>
                <input className="input" type="number" value={minRequestAmount} onChange={(event) => setMinRequestAmount(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Max Payout Amount</div>
                <input className="input" type="number" value={maxPayoutAmount} onChange={(event) => setMaxPayoutAmount(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Minimum Trading Days</div>
                <input className="input" type="number" value={minTradingDays} onChange={(event) => setMinTradingDays(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Days &gt;= Profit Threshold</div>
                <input className="input" type="number" value={minProfitableDays} onChange={(event) => setMinProfitableDays(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Profit Threshold Per Day</div>
                <input className="input" type="number" value={profitableDayThreshold} onChange={(event) => setProfitableDayThreshold(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Consistency Limit %</div>
                <input className="input" type="number" value={consistencyLimitPct} onChange={(event) => setConsistencyLimitPct(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Contracts Per Account</div>
                <input className="input" type="number" value={contracts} onChange={(event) => setContracts(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Tick Value Per Contract</div>
                <input className="input" type="number" step="0.01" value={tickValuePerContract} onChange={(event) => setTickValuePerContract(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Accounts Traded Together</div>
                <input className="input" type="number" placeholder={`Auto: ${latestSnapshotsByAccount.length}`} value={linkedAccountsCount} onChange={(event) => setLinkedAccountsCount(event.target.value)} />
              </div>
              <div>
                <div className="field-label">Manual Tick Button Step</div>
                <input className="input" type="number" value={tickStep} onChange={(event) => setTickStep(event.target.value)} />
              </div>
            </div>
            <button className="btn" onClick={saveGoal}>Save settings</button>
            {loading ? <div className="sub" style={{ marginTop: '12px' }}>Refreshing goal data...</div> : null}
          </section>

          <section className="card goal-card">
            <div className="goal-header">
              <div>
                <div className="section-title">{title || 'Payout goal'}</div>
                <div className="sub">
                  Available now: {formatCurrency(totalAvailableNow)} plus manually applied payouts: {formatCurrency(manualPaidOutAmount)}
                </div>
              </div>
              <div className="goal-percent">{progressPercent.toFixed(0)}%</div>
            </div>

            <div className="goal-thermometer">
              <div className="thermometer-shell">
                <div className="thermometer-fill" style={{ height: `${Math.min(progressPercent, 100)}%` }} />
              </div>
              <div className="goal-stats">
                <div className="goal-stat">
                  <span>Ticks to goal</span>
                  <strong>{computedTicksToGoal}</strong>
                </div>
                <div className="goal-stat">
                  <span>Remaining payout dollars</span>
                  <strong>{formatCurrency(remainingToGoal)}</strong>
                </div>
              </div>
            </div>

            <div className="form-row" style={{ marginTop: '16px' }}>
              <div>
                <div className="field-label">Already Paid Out Toward This Goal</div>
                <input
                  className="input"
                  type="number"
                  placeholder="0"
                  value={manualPaidOutToGoal}
                  onChange={(event) => setManualPaidOutToGoal(event.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button className="btn" onClick={saveGoal}>Save goal amount</button>
              </div>
            </div>

            <div className="mini-callout">
              Automatic goal math assumes `1 contract per account`. If you trade 2 contracts and make 5 ticks, subtract 10 ticks manually from your progress tracker.
            </div>
          </section>
        </div>

        <section className="card" style={{ marginTop: '24px' }}>
          <div className="section-header">
            <div className="section-title">Account Eligibility Progress</div>
            <div className="sub">{accountProgress.length} accounts with balance snapshots</div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Balance</th>
                <th>Required Balance</th>
                <th>Balance Needed</th>
                <th>Ticks to Request</th>
                <th>Days Traded</th>
                <th>$50+ Days</th>
                <th>Largest Single Day</th>
                <th>Approved Payouts</th>
                <th>Total Paid Out</th>
                <th>Requestable Now</th>
              </tr>
            </thead>
            <tbody>
              {accountProgress.map((account) => (
                <tr key={account.account}>
                  <td>
                    <div>{account.account}</div>
                    <div className="sub">{account.balanceDate}</div>
                  </td>
                  <td>{formatCurrency(account.latestBalance)}</td>
                  <td>{formatCurrency(account.requestThresholdBalance)}</td>
                  <td className={account.balanceNeededNow === 0 ? 'pnl-positive' : 'pnl-negative'}>
                    {formatCurrency(account.balanceNeededNow)}
                  </td>
                  <td>{account.ticksToRequestNow}</td>
                  <td className={account.tradingDaysPass ? 'pnl-positive' : 'pnl-negative'}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, lineHeight: 1.1 }}>{account.tradingDays} / {minTradingDays}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => adjustAccountCounter(account, 'trading_days_adjustment', -1)}
                        disabled={updatingOverride === account.account}
                        style={{ minWidth: '28px', height: '28px', padding: '0 8px', fontSize: '0.95rem', lineHeight: 1 }}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => adjustAccountCounter(account, 'trading_days_adjustment', 1)}
                        disabled={updatingOverride === account.account}
                        style={{ minWidth: '28px', height: '28px', padding: '0 8px', fontSize: '0.95rem', lineHeight: 1 }}
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className={account.profitableDaysPass ? 'pnl-positive' : 'pnl-negative'}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, lineHeight: 1.1 }}>{account.profitableDays} / {minProfitableDays}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => adjustAccountCounter(account, 'profitable_days_adjustment', -1)}
                        disabled={updatingOverride === account.account}
                        style={{ minWidth: '28px', height: '28px', padding: '0 8px', fontSize: '0.95rem', lineHeight: 1 }}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => adjustAccountCounter(account, 'profitable_days_adjustment', 1)}
                        disabled={updatingOverride === account.account}
                        style={{ minWidth: '28px', height: '28px', padding: '0 8px', fontSize: '0.95rem', lineHeight: 1 }}
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className={account.largestPositiveDay <= 780 ? 'pnl-positive' : 'pnl-negative'}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, lineHeight: 1.1 }}>{formatCurrency(account.largestPositiveDay)}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={account.largestPositiveDay.toFixed(2)}
                        onBlur={(event) => void saveLargestSingleDayOverride(account, event.target.value)}
                        style={{ minWidth: '92px', height: '30px', fontSize: '0.9rem', padding: '4px 8px' }}
                      />
                    </div>
                  </td>
                  <td>{account.approvedPayouts}</td>
                  <td className={account.totalPaidOut > 0 ? 'pnl-positive' : 'pnl-negative'}>
                    {formatCurrency(account.totalPaidOut)}
                  </td>
                  <td className={account.requestableNow > 0 ? 'pnl-positive' : 'pnl-negative'}>
                    {formatCurrency(account.requestableNow)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
