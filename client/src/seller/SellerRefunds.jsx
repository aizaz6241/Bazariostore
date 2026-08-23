import { useEffect, useState } from 'react';
import { sapi, money, fmtDate } from '../api.js';
import Ic from '../components/Icons.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';

export default function SellerRefunds() {
  const { formatMoney } = useCurrency();
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRefunds = () => {
    setLoading(true);
    sapi('/sellers/refunds')
      .then(setRefunds)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRefunds();
  }, []);

  const handleAction = async (id, action) => {
    const reason = prompt(`Please enter any notes for ${action}ing this refund request:`, action === 'approve' ? 'Approved by seller' : 'Rejected - Product condition does not match policy');
    if (reason === null) return;

    try {
      await sapi(`/sellers/refunds/${id}/action`, {
        method: 'POST',
        body: { action, reason },
      });
      loadRefunds();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="seller-refunds-page">
      <div className="seller-page-header">
        <div>
          <h2>🔄 Returns & Refund Management</h2>
          <p>Review customer return requests, inspect reasons, and approve or reject claims.</p>
        </div>
      </div>

      <div className="seller-card">
        <div className="seller-table-wrap">
          <table className="seller-table">
            <thead>
              <tr>
                <th>Refund ID</th>
                <th>Date Requested</th>
                <th>Order #</th>
                <th>Customer</th>
                <th>Reason & Notes</th>
                <th>Refund Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="8" className="text-center py-8 muted">Loading refunds...</td>
                </tr>
              )}
              {!loading && refunds.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center py-8 muted">No refund requests found. Your store has a 0% dispute rate! 🎉</td>
                </tr>
              )}
              {refunds.map((ref) => (
                <tr key={ref._id}>
                  <td><b>{ref.refundNumber || ref._id.slice(-6).toUpperCase()}</b></td>
                  <td>{fmtDate(ref.createdAt)}</td>
                  <td><b>{ref.order?.orderNumber || 'N/A'}</b></td>
                  <td>
                    <span>{ref.user?.name || 'Customer'}</span>
                    <small className="muted block">{ref.user?.phone || ''}</small>
                  </td>
                  <td>
                    <b>{ref.reason}</b>
                    {ref.notes && <small className="muted block">{ref.notes}</small>}
                  </td>
                  <td><b className="text-red">{formatMoney(ref.amount)}</b></td>
                  <td>
                    <span className={`status-tag status-${ref.status}`}>
                      {ref.status}
                    </span>
                  </td>
                  <td>
                    {ref.status === 'requested' || ref.status === 'under_review' ? (
                      <div className="row-actions">
                        <button onClick={() => handleAction(ref._id, 'approve')} className="btn-approve">Approve</button>
                        <button onClick={() => handleAction(ref._id, 'reject')} className="btn-reject">Reject</button>
                      </div>
                    ) : (
                      <span className="muted-sm">Processed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
