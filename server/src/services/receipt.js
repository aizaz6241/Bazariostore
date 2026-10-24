import PDFDocument from 'pdfkit';

/**
 * BAZARIO RECEIPT (PDF) for an approved deposit or withdrawal of a store.
 * Shown to the seller only: no helping amount, no rates, no admin names, no internal notes.
 * Used by the wallet screen ("Receipt" button) and attached to the approval email.
 */

const METHOD = { upi: 'UPI', bank: 'Bank transfer', paytm: 'Paytm', gpay: 'Google Pay', phonepe: 'PhonePe', usdt: 'USDT', other: 'Other' };
export const methodLabel = (m) => METHOD[m] || (m ? String(m).toUpperCase() : '—');

/** A line can have a receipt when it is a store deposit / withdrawal that went through. */
export const hasReceipt = (r) =>
  r && (r.type === 'deposit' || r.type === 'withdrawal') && r.purpose !== 'diamond_fee' && (r.status === 'approved' || r.status === 'completed');

const pad = (n) => String(n).padStart(2, '0');
export function receiptNumber(r) {
  // the date part is the India date (sellers are in India)
  const d = new Date(new Date(r.processedAt || r.updatedAt || r.createdAt || Date.now()).getTime() + 5.5 * 3600000);
  const id = String(r._id || '').slice(-6).toUpperCase();
  return `BZ-${r.type === 'deposit' ? 'DEP' : 'WD'}-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${id}`;
}

const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const dt = (d) =>
  d
    ? `${new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} IST`
    : '—';
// the built-in PDF font has Latin letters only: anything else would print as garbage
const latin = (v) => String(v ?? '').replace(/[^\x20-\x7E -ÿ]/g, '').replace(/\s+/g, ' ').trim();

/** Where a payout went, partly hidden (enough for the seller to recognise it). */
export function payoutTo(r) {
  const tail = (s, n = 4) => (s && s.length > n ? `•••• ${s.slice(-n)}` : s || '');
  if (r.method === 'bank' || r.accountNumber) {
    return [latin(r.bankName), r.accountNumber ? `A/c ${tail(latin(r.accountNumber))}` : '', r.ifscCode ? `IFSC ${latin(r.ifscCode)}` : ''].filter(Boolean).join(' · ');
  }
  if (r.upiId) {
    const [u, host] = latin(r.upiId).split('@');
    return `${u.slice(0, 3)}•••${host ? `@${host}` : ''}`;
  }
  if (r.walletAddress) {
    const a = latin(r.walletAddress);
    return `${a.slice(0, 6)}…${a.slice(-4)}${r.network ? ` (${latin(r.network)})` : ''}`;
  }
  if (r.phone) return tail(latin(r.phone), 4);
  return '';
}

/**
 * @param r      the Withdrawal line (deposit / withdrawal)
 * @param seller { storeName, ownerName, email }
 * @returns Promise<Buffer>
 */
export function buildReceiptPdf(r, seller = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Bazario Receipt ${receiptNumber(r)}`, Author: 'Bazario' } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width; // 595
      const M = 48;
      const isDep = r.type === 'deposit';
      const requested = Math.abs(Number(r.amount) || 0);
      const final = Math.abs(Number(r.approvedAmount != null ? r.approvedAmount : r.amount) || 0);
      const green = '#16a34a';
      const ink = '#0f172a';
      const muted = '#64748b';
      const line = '#e2e8f0';

      // header band
      doc.rect(0, 0, W, 110).fill(ink);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26).text('BAZARIO', M, 38, { continued: true }).fillColor('#f59e0b').text('.');
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(9.5).text('E-COMMERCE ECOSYSTEM', M, 72, { characterSpacing: 1 });
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text(isDep ? 'DEPOSIT RECEIPT' : 'WITHDRAWAL RECEIPT', M, 40, { width: W - 2 * M, align: 'right' });
      doc.fillColor('#cbd5e1').font('Helvetica').fontSize(9.5).text(`Receipt No. ${receiptNumber(r)}`, M, 62, { width: W - 2 * M, align: 'right' });
      doc.text(`Issued ${dt(r.processedAt || r.updatedAt || r.createdAt)}`, M, 76, { width: W - 2 * M, align: 'right' });

      // amount card
      let y = 140;
      doc.roundedRect(M, y, W - 2 * M, 96, 10).fillAndStroke('#f0fdf4', '#bbf7d0');
      doc.fillColor(muted).font('Helvetica-Bold').fontSize(9).text(isDep ? 'AMOUNT CREDITED TO YOUR WALLET' : 'AMOUNT PAID OUT', M + 20, y + 20, { characterSpacing: 0.6 });
      doc.fillColor(green).font('Helvetica-Bold').fontSize(30).text(money(final), M + 20, y + 38);
      // status stamp
      doc.roundedRect(W - M - 130, y + 32, 110, 32, 16).lineWidth(1.5).stroke(green);
      doc.fillColor(green).font('Helvetica-Bold').fontSize(12).text('APPROVED', W - M - 130, y + 42, { width: 110, align: 'center', characterSpacing: 1 });

      // billed to
      y += 124;
      doc.fillColor(muted).font('Helvetica-Bold').fontSize(9).text('ISSUED TO', M, y, { characterSpacing: 0.6 });
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text(latin(seller.storeName) || 'Seller', M, y + 15);
      doc.fillColor(muted).font('Helvetica').fontSize(10.5);
      const who = [latin(seller.ownerName), latin(seller.email)].filter(Boolean).join('  ·  ');
      if (who) doc.text(who, M, y + 33);

      // details table
      y += 70;
      const rows = [
        ['Transaction', isDep ? 'Wallet deposit' : 'Wallet withdrawal (payout)'],
        ['Requested amount', money(requested)],
        [isDep ? 'Credited amount' : 'Paid amount', money(final)],
        !isDep && final < requested ? ['Returned to your balance', money(requested - final)] : null,
        ['Payment method', methodLabel(r.method)],
        !isDep && payoutTo(r) ? ['Paid to', payoutTo(r)] : null,
        isDep && r.depositRef ? ['Your payment reference (UTR)', latin(r.depositRef)] : null,
        !isDep && r.transactionRef ? ['Payout reference (UTR)', latin(r.transactionRef)] : null,
        ['Requested on', dt(r.createdAt)],
        ['Approved on', dt(r.processedAt || r.updatedAt)],
        r.balanceAfter != null ? ['Wallet balance after', money(r.balanceAfter)] : null,
        ['Status', 'Approved'],
      ].filter(Boolean);
      doc.fillColor(muted).font('Helvetica-Bold').fontSize(9).text('DETAILS', M, y, { characterSpacing: 0.6 });
      y += 18;
      for (const [k, v] of rows) {
        doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.7).stroke(line);
        doc.fillColor(muted).font('Helvetica').fontSize(10.5).text(k, M, y + 9, { width: 220 });
        doc.fillColor(ink).font('Helvetica-Bold').fontSize(10.5).text(v, M + 220, y + 9, { width: W - 2 * M - 220, align: 'right' });
        y += 30;
      }
      doc.moveTo(M, y).lineTo(W - M, y).lineWidth(0.7).stroke(line);

      // footer
      y += 26;
      doc.fillColor(muted).font('Helvetica').fontSize(9.5).text(
        'This receipt was generated electronically by Bazario and is valid without a signature. Keep it for your records. For any question about this transaction, use Support chat in Seller Central.',
        M,
        y,
        { width: W - 2 * M, align: 'center', lineGap: 2 }
      );
      doc.fillColor('#94a3b8').fontSize(8.5).text(`© ${new Date().getFullYear()} Bazario Global Commerce`, M, doc.page.height - 50, { width: W - 2 * M, align: 'center' });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
