'use client';

import { useEffect, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import { supabase } from '../../lib/supabase';
import { BalanceSnapshotRow, PayoutRow } from '../../lib/types';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

export default function PayoutsPage() {
  const [account, setAccount] = useState('');
  const [requestDate, setRequestDate] = useState('');
  const [approvedDate, setApprovedDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'pending' | 'paid' | 'denied'>('pending');
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);

  const [snapshotAccount, setSnapshotAccount] = useState('');
  const [snapshotDate, setSnapshotDate] = useState('');
  const [snapshotBalance, setSnapshotBalance] = useState('');
  const [snapshotNotes, setSnapshotNotes] = useState('');
  const [snapshotImage, setSnapshotImage] = useState<File | null>(null);
  const [snapshots, setSnapshots] = useState<BalanceSnapshotRow[]>([]);

  const [message, setMessage] = useState('');

  const load = async () => {
    const { data } = await supabase.from('payouts').select('*').order('request_date', { ascending: false });
    const { data: snapshotRows } = await supabase
      .from('balance_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false });
    setPayouts((data ?? []) as PayoutRow[]);
    setSnapshots((snapshotRows ?? []) as BalanceSnapshotRow[]);
  };

  useEffect(() => {
    load();
  }, []);

  const addPayout = async () => {
    if (!account || !requestDate || !amount) {
      setMessage('Account, payout request date, and amount are required.');
      return;
    }

    let { error } = await supabase.from('payouts').insert({
      account,
      request_date: requestDate,
      approved_date: approvedDate || null,
      received_date: receivedDate || null,
      amount: Number(amount),
      status
    });

    if (error && error.message.includes('approved_date')) {
      const fallback = await supabase.from('payouts').insert({
        account,
        request_date: requestDate,
        paid_date: receivedDate || null,
        amount: Number(amount),
        status
      });
      error = fallback.error;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setAccount('');
    setRequestDate('');
    setApprovedDate('');
    setReceivedDate('');
    setAmount('');
    setStatus('pending');
    setMessage('Payout logged.');
    load();
  };

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
      notes: snapshotNotes || null,
      image_url: imageUrl
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setSnapshotAccount('');
    setSnapshotDate('');
    setSnapshotBalance('');
    setSnapshotNotes('');
    setSnapshotImage(null);
    setMessage('Balance snapshot saved.');
    load();
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <div className="header-row">
          <div>
            <div className="h1">Payouts</div>
            <div style={{ color: 'var(--ink-dim)' }}>Track payout requests, approvals, and when cash actually lands.</div>
          </div>
        </div>

        <div className="callout" style={{ marginBottom: '16px' }}>
          If saves fail after this update, run the payout `alter table` snippet in the README once so your existing Supabase table gets the new approval and received date columns.
        </div>

        <div className="card">
          <div className="section-title">Log Payout Request</div>
          <div className="form-row payout-form-grid">
            <div>
              <div className="field-label">Account</div>
              <input className="input" placeholder="Account" value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
            <div>
              <div className="field-label">Payout Request Date</div>
              <input className="input" type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
            </div>
            <div>
              <div className="field-label">Payout Approved Date</div>
              <input className="input" type="date" value={approvedDate} onChange={(e) => setApprovedDate(e.target.value)} />
            </div>
            <div>
              <div className="field-label">Payout Received Date</div>
              <input className="input" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
            <div>
              <div className="field-label">Amount</div>
              <input className="input" type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <div className="field-label">Status</div>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value as 'pending' | 'paid' | 'denied')}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="denied">Denied</option>
              </select>
            </div>
          </div>
          <button className="btn" onClick={addPayout}>Add payout</button>
        </div>

        <div style={{ marginTop: '24px' }} className="card">
          <div className="section-title">Balance Snapshot</div>
          <div className="form-row">
            <input
              className="input"
              placeholder="Account"
              value={snapshotAccount}
              onChange={(e) => setSnapshotAccount(e.target.value)}
            />
            <input
              className="input"
              type="date"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
            />
            <input
              className="input"
              type="number"
              placeholder="Balance"
              value={snapshotBalance}
              onChange={(e) => setSnapshotBalance(e.target.value)}
            />
            <input
              className="input"
              placeholder="Notes (optional)"
              value={snapshotNotes}
              onChange={(e) => setSnapshotNotes(e.target.value)}
            />
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => setSnapshotImage(e.target.files?.[0] ?? null)}
            />
          </div>
          <button className="btn" onClick={addSnapshot}>Save snapshot</button>
          <div className="sub" style={{ marginTop: '8px' }}>
            Uploads use the Supabase Storage bucket named <code>balances</code>.
          </div>
        </div>

        {message && <div style={{ marginTop: '16px' }} className="callout">{message}</div>}

        <div style={{ marginTop: '24px' }} className="card">
          <div className="section-title">Recent Payouts</div>
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Payout Request Date</th>
                <th>Payout Approved Date</th>
                <th>Payout Received Date</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id}>
                  <td>{payout.account}</td>
                  <td>{payout.request_date}</td>
                  <td>{payout.approved_date || '—'}</td>
                  <td>{payout.received_date || '—'}</td>
                  <td>{payout.status}</td>
                  <td>{formatCurrency(payout.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '24px' }} className="card">
          <div className="section-title">Balance Snapshots</div>
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Date</th>
                <th>Balance</th>
                <th>Notes</th>
                <th>Image</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td>{snapshot.account}</td>
                  <td>{snapshot.snapshot_date}</td>
                  <td>{formatCurrency(snapshot.balance)}</td>
                  <td>{snapshot.notes || '—'}</td>
                  <td>
                    {snapshot.image_url ? (
                      <a href={snapshot.image_url} target="_blank" rel="noreferrer">View</a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
