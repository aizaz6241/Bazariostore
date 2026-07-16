import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = mongoose.model('Counter', counterSchema);

export async function nextSeq(name) {
  const c = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return c.seq;
}

const settingSchema = new mongoose.Schema(
  { key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed },
  { timestamps: true, minimize: false }
);
export const Setting = mongoose.model('Setting', settingSchema);

export async function getSetting(key, fallback = null) {
  const doc = await Setting.findOne({ key });
  return doc ? doc.value : fallback;
}
export async function setSetting(key, value) {
  await Setting.updateOne({ key }, { $set: { value } }, { upsert: true });
  return value;
}
