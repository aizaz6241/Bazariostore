import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';

/**
 * LiveKit (the video / audio engine behind team meetings).
 * Set in the hosting dashboard (Vercel → Settings → Environment Variables), never in the code:
 *   LIVEKIT_URL         wss://<project>.livekit.cloud
 *   LIVEKIT_API_KEY     from LiveKit Cloud → Settings → Keys
 *   LIVEKIT_API_SECRET  (kept only on the server; the phone only ever gets a short-lived ticket)
 */
export function livekitConfig() {
  const url = (process.env.LIVEKIT_URL || '').trim();
  const apiKey = (process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret, httpUrl: url.replace(/^ws(s?):\/\//, 'http$1://') };
}

export function roomService(cfg = livekitConfig()) {
  if (!cfg) return null;
  return new RoomServiceClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
}

/**
 * A ticket that lets ONE person into ONE meeting room, for a short time. The server keeps the
 * ticket fresh for people who stay connected, so a short life is enough; a copied ticket is
 * useless after it runs out.
 */
export async function joinTicket({ cfg = livekitConfig(), roomName, member, kind }) {
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: String(member._id),
    name: member.name || 'Member',
    ttl: '15m',
    metadata: JSON.stringify({ role: member.role === 'admin' ? 'admin' : 'member' }),
  });
  const sources = [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO];
  if (kind === 'video') sources.unshift(TrackSource.CAMERA);
  at.addGrant({
    room: roomName,
    roomJoin: true,
    roomCreate: false,
    roomAdmin: false,
    roomList: false,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true, // the chat inside the meeting
    canPublishSources: sources,
    canUpdateOwnMetadata: false,
  });
  return at.toJwt();
}
