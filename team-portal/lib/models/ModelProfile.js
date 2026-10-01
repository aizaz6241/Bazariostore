import mongoose from 'mongoose';

const modelProfileSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    age: {
      type: Number,
      default: null,
    },
    dob: {
      type: String,
      default: '',
    },
    location: {
      type: String,
      default: '',
    },
    familyDetails: {
      type: String,
      default: '',
    },
    occupation: {
      type: String,
      default: '',
    },
    moreDetails: {
      type: String,
      default: '',
    },
    avatar: {
      type: String,
      default: '',
    },
    photos: [
      {
        url: { type: String, required: true },
        title: { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PortalMember',
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.models.PortalModelProfile || mongoose.model('PortalModelProfile', modelProfileSchema);
