import mongoose from 'mongoose';

/**
 * PAYMENT PROOF — one card per real seller deposit, shown in the "Payment Proofs" group of the
 * team chat (partners only).
 *
 * A card is made by itself, as a DRAFT, the moment a deposit of a client seller shows up in the
 * finance ledger: seller, member (owner) and date / time are filled in from the deposit. It becomes
 * COMPLETE only when a partner adds the two things that cannot be taken from the system:
 * the real USDT received on Binance (typed, plus its Binance screenshot) and the screenshot of
 * the INR payment.
 *
 * So later, if the accounts are ever in doubt, every deposit has its proof next to it.
 */
const personSchema = new mongoose.Schema({ id: { type: String, default: '' }, name: { type: String, default: '' } }, { _id: false });

const paymentProofSchema = new mongoose.Schema(
  {
    // the deposit this proof belongs to (the store wallet transaction, or a manual finance entry)
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    storeName: { type: String, default: '' },
    ownerId: { type: String, default: '' }, // the member / partner the seller belongs to
    ownerName: { type: String, default: '' },
    ownerRole: { type: String, default: '' },
    depositAt: { type: Date, required: true }, // date and time of the deposit
    walletAmount: { type: Number, default: 0 }, // what was added to the seller's store wallet ($)
    helping: { type: Number, default: 0 },

    status: { type: String, enum: ['draft', 'complete', 'cancelled'], default: 'draft', index: true },

    // filled in by a partner
    usdt: { type: Number, default: 0 }, // real USDT received on Binance
    inr: { type: Number, default: 0 }, // INR the seller paid
    screenshot: {
      url: { type: String, default: '' }, // on the file storage
      key: { type: String, default: '' },
      data: { type: String, default: '' }, // kept here only when the file storage is not available
    },
    // screenshot of the USDT received on Binance
    usdtScreenshot: {
      url: { type: String, default: '' },
      key: { type: String, default: '' },
      data: { type: String, default: '' },
    },
    note: { type: String, default: '' },
    completedBy: { type: personSchema, default: () => ({}) },
    completedAt: { type: Date, default: null },
    // the owner (member / partner the seller belongs to) sees a complete proof in his own group:
    // false = he has not looked at it yet
    seenByOwner: { type: Boolean, default: false },

    // every time the proof is filled in or changed (old screenshots are never deleted)
    history: [
      {
        _id: false,
        at: { type: Date, default: Date.now },
        by: { type: personSchema, default: () => ({}) },
        action: { type: String, default: '' },
        usdt: { type: Number, default: 0 },
        inr: { type: Number, default: 0 },
        screenshotUrl: { type: String, default: '' },
        usdtScreenshotUrl: { type: String, default: '' },
        note: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true, collection: 'portalpaymentproofs' }
);

paymentProofSchema.index({ depositAt: -1 });

export default mongoose.models.PortalPaymentProof || mongoose.model('PortalPaymentProof', paymentProofSchema);
