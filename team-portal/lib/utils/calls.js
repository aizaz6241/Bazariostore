import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import Call from '@/lib/models/Call';
import ChatMessage from '@/lib/models/ChatMessage';
import { roomService } from '@/lib/utils/livekit';
import { sid } from '@/lib/utils/routeHelpers';

const minutes = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000));

/** Mark a meeting ended (once), close its room so everybody is disconnected, update the chat card. */
export async function endCall(call, { byName = '', reason = 'ended' } = {}) {
  await connectDB();
  const now = new Date();
  const res = await Call.updateOne({ _id: call._id, status: 'live' }, { $set: { status: 'ended', endedAt: now, endedByName: byName, endReason: reason } });
  if (!res.modifiedCount) return false; // already ended by someone else
  try {
    await roomService()?.deleteRoom(call.roomName);
  } catch {}
  if (call.chatMessageId) {
    const joined = (call.joined || []).length;
    const text = `${call.kind === 'audio' ? '📞' : '📹'} ${call.title || 'Team meeting'} ended · ${minutes(call.startedAt, now)} min · ${joined} joined${
      byName ? ` · ended by ${byName}` : ''
    }`;
    await ChatMessage.updateOne({ _id: call.chatMessageId }, { $set: { text, updatedAt: now } }).catch(() => {});
  }
  return true;
}

/**
 * Who is in the meeting right now (straight from LiveKit). Remembered for a few seconds per
 * server, so many people refreshing at once do not each ask LiveKit.
 */
export async function liveParticipants(call) {
  const g = global;
  if (!g.__callPeople) g.__callPeople = new Map();
  const hit = g.__callPeople.get(call.roomName);
  if (hit && Date.now() - hit.at < 8000) return hit.value;
  let value = null;
  try {
    const svc = roomService();
    if (svc) {
      const list = await svc.listParticipants(call.roomName);
      value = list.map((p) => ({ id: p.identity, name: p.name }));
    }
  } catch (e) {
    // the room is gone (everyone left long enough ago for LiveKit to close it)
    value = /not.?found|does not exist/i.test(String(e?.message || '')) ? [] : null;
  }
  g.__callPeople.set(call.roomName, { at: Date.now(), value });
  return value;
}

/** The live meeting, if any. A meeting nobody has been in for 10 minutes is closed by itself. */
export async function activeCall() {
  await connectDB();
  const call = await Call.findOne({ status: 'live' }).sort({ startedAt: -1 }).lean();
  if (!call) return null;
  const people = await liveParticipants(call);
  const age = Date.now() - new Date(call.startedAt).getTime();
  if (people && people.length === 0 && age > 10 * 60 * 1000) {
    const lastSeen = call.lastSeenAt ? Date.now() - new Date(call.lastSeenAt).getTime() : age;
    if (lastSeen > 10 * 60 * 1000) {
      await endCall(call, { reason: 'empty' });
      return null;
    }
  }
  if (people && people.length) await Call.updateOne({ _id: call._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {});
  return { call, people };
}

export function callView(call, people, viewer) {
  return {
    id: sid(call._id),
    kind: call.kind,
    title: call.title,
    status: call.status,
    startedByName: call.startedByName,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    inCall: people ? people.length : null,
    people: people ? people.map((p) => p.name).slice(0, 30) : [],
    joinedCount: (call.joined || []).length,
    canEnd: viewer?.role === 'admin',
  };
}

export const isOidStr = (v) => !!v && mongoose.Types.ObjectId.isValid(String(v));
