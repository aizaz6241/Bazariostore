import mongoose from 'mongoose';

const treasuryProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    brand: { type: String, default: '', trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true },
    price: { type: Number, required: true, min: 0 }, // Recommended selling price
    costPrice: { type: Number, default: 0, min: 0 }, // Wholesale / cost price for sellers
    oldPrice: { type: Number, default: null },
    stock: { type: Number, default: 0, min: 0 }, // Central inventory quantity
    reservedStock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 10, min: 0 },
    sku: { type: String, default: '', trim: true },
    barcode: { type: String, default: '', trim: true },
    weight: { type: String, default: '' },
    dimensions: { type: String, default: '' },
    image: { type: String, default: '' }, // primary image URL
    images: [{ url: { type: String, required: true }, key: { type: String, default: null } }],
    shortDescription: { type: String, default: '' },
    description: { type: String, default: '' },
    bullets: { type: [String], default: [] },
    highlights: [{ icon: String, label: String }],
    specifications: [{ key: String, value: String }],
    variants: [{ name: String, options: [String] }],
    sizes: [{ label: String, price: Number }],
    labels: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    rating: { type: Number, default: 4.8 },
    numReviews: { type: Number, default: 24 },
    sold: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
    primeEligible: { type: Boolean, default: true },
    freeDelivery: { type: Boolean, default: true },
  },
  { timestamps: true }
);

treasuryProductSchema.pre('save', function (next) {
  if (this.images?.length && (!this.image || !this.images.some((img) => img.url === this.image))) {
    this.image = this.images[0].url;
  }
  next();
});

export default mongoose.model('TreasuryProduct', treasuryProductSchema);
