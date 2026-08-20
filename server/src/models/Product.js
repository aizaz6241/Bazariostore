import mongoose from 'mongoose';

export const LABELS = ['new', 'hot', 'best', 'featured', 'sale', 'limited', 'out'];

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    brand: String,
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
    sellerName: { type: String, default: 'Amazon Global Official' },
    sellerSlug: { type: String, default: 'official' },
    price: { type: Number, required: true },
    oldPrice: Number,
    costs: {
      purchase: { type: Number, default: 0 },
      delivery: { type: Number, default: 0 },
      packaging: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    stock: { type: Number, default: 0 },
    reservedStock: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    sku: String,
    weight: String,
    dimensions: String,
    labels: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    seoTitle: String,
    seoDescription: String,
    active: { type: Boolean, default: true },
    image: String, // primary image url (synced from images[0])
    images: [{ url: String, key: { type: String, default: null } }],
    gallery: [String], // legacy
    rating: { type: Number, default: 4.5 },
    numReviews: { type: Number, default: 0 },
    sold: { type: Number, default: 0 },
    shortDescription: String,
    description: String,
    bullets: [String],
    highlights: [{ icon: String, label: String }],
    specifications: [{ key: String, value: String }],
    variants: [{ name: String, options: [String] }],
    howToUse: String,
    ingredients: String,
    sizes: [{ label: String, price: Number }],
    primeEligible: { type: Boolean, default: true },
    freeDelivery: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.pre('save', function (next) {
  if (this.images?.length) this.image = this.images[0].url;
  next();
});

export default mongoose.model('Product', productSchema);
