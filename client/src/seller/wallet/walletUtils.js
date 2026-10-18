// Shared helpers for the seller wallet screens.

export const usd = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const DEFAULT_LIMIT = {
  maxAmount: 500,
  minAmount: 10,
  requiredWithdrawalsForIncrease: 10,
  successfulWithdrawalCount: 0,
  upgradeFee: 50,
  currentTierName: 'Tier 1 - Standard',
  pendingIncreaseRequest: { status: 'none' },
};

// how a wallet line is shown: label, icon, tone and direction of the money
export function describeLine(r) {
  const amount = Number(r.amount) || 0;
  const final = r.approvedAmount != null ? Number(r.approvedAmount) : amount;
  switch (r.type) {
    case 'deposit':
      return { label: 'Deposit', icon: 'plus', tone: 'blue', sign: '+', value: r.status === 'approved' || r.status === 'completed' ? final : amount };
    case 'withdrawal':
      return { label: 'Payout', icon: 'send', tone: 'violet', sign: '−', value: r.status === 'approved' || r.status === 'completed' ? Math.abs(final) : Math.abs(amount) };
    case 'order_processing_lock':
      return { label: 'Order locked', icon: 'lock', tone: 'amber', sign: '−', value: Math.abs(amount) };
    case 'order_delivered_release':
      return { label: 'Order payout', icon: 'checkCircle', tone: 'green', sign: '+', value: Math.abs(amount) };
    case 'order_cancelled_release':
      return { label: 'Cancelled order refund', icon: 'refresh', tone: 'slate', sign: '+', value: Math.abs(amount) };
    case 'diamond_fee':
      return { label: 'Diamond upgrade fee', icon: 'star', tone: 'cyan', sign: '', value: Math.abs(amount), note: 'Paid to the platform — not from your wallet' };
    case 'frozen_release':
      return { label: 'Frozen amount released', icon: 'lock', tone: 'blue', sign: '+', value: Math.abs(amount) };
    case 'adjustment':
      return amount < 0
        ? { label: 'Admin charge', icon: 'gear', tone: 'red', sign: '−', value: Math.abs(amount) }
        : { label: 'Admin credit', icon: 'gear', tone: 'green', sign: '+', value: amount };
    default:
      return { label: String(r.type || 'Wallet').replace(/_/g, ' '), icon: 'fileText', tone: 'slate', sign: amount < 0 ? '−' : '+', value: Math.abs(amount) };
  }
}

export const STATUS_LABEL = {
  pending: { label: 'Pending', tone: 'amber' },
  processing: { label: 'Processing', tone: 'blue' },
  approved: { label: 'Approved', tone: 'green' },
  completed: { label: 'Completed', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
};

export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const monthKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};
