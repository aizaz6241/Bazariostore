import { getAuthSession } from '@/lib/auth';
import Lead from '@/lib/models/Lead';
import Member from '@/lib/models/Member';
import { ok, fail, sid, isOid, oid } from '@/lib/utils/routeHelpers';
import { reconcileLeadConversions, STALE_DAYS } from '@/lib/utils/leads';

export const dynamic = 'force-dynamic';

const TZ = '+05:00'; // days are counted in Pakistan time
const DAY = 86400000;
const OPEN = ['new', 'contacted', 'interested'];

const cnt = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
const isStatus = (s) => ({ $eq: ['$status', s] });

/**
 * GET /api/leads/analytics?days=30&memberId=
 * Funnel, conversion per member / source, leads added vs converted per day, why leads were lost.
 * A member gets the same numbers for his own leads only.
 */
export async function GET(req) {
  try {
    const session = await getAuthSession(req);
    if (!session) return fail('Unauthorized', 401);
    const isAdmin = session.role === 'admin';

    await reconcileLeadConversions();

    const sp = new URL(req.url).searchParams;
    const days = [7, 30, 90].includes(Number(sp.get('days'))) ? Number(sp.get('days')) : 30;

    const scope = {};
    if (!isAdmin) scope.memberId = session._id;
    else if (isOid(sp.get('memberId'))) scope.memberId = oid(sp.get('memberId'));

    // the period: the last `days` days including today (Pakistan time)
    const nowPk = new Date(Date.now() + 5 * 3600000);
    const todayStartPk = Date.UTC(nowPk.getUTCFullYear(), nowPk.getUTCMonth(), nowPk.getUTCDate());
    const since = new Date(todayStartPk - (days - 1) * DAY - 5 * 3600000);
    const prevSince = new Date(since.getTime() - days * DAY);
    const staleBefore = new Date(Date.now() - STALE_DAYS * DAY);

    const assignedOnly = { ...scope, memberId: scope.memberId || { $ne: null } };

    const [totals, perDayAdded, perDayConverted, perMember, sources, lost, origins, prev] = await Promise.all([
      Lead.aggregate([
        { $match: scope },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            assigned: cnt({ $ne: ['$memberId', null] }),
            open: cnt({ $in: ['$status', OPEN] }),
            fresh: cnt(isStatus('new')),
            contacted: cnt(isStatus('contacted')),
            interested: cnt(isStatus('interested')),
            converted: cnt(isStatus('converted')),
            notConverted: cnt(isStatus('not_converted')),
            everContacted: cnt({ $and: [{ $ne: ['$memberId', null] }, { $or: ['$everContacted', isStatus('converted')] }] }),
            everInterested: cnt({ $and: [{ $ne: ['$memberId', null] }, { $or: ['$everInterested', isStatus('converted')] }] }),
            stale: cnt({ $and: [{ $ne: ['$memberId', null] }, { $in: ['$status', OPEN] }, { $lt: ['$lastActivityAt', staleBefore] }] }),
            duplicateAttempts: { $sum: { $ifNull: ['$duplicateAttempts', 0] } },
            ownerMismatch: cnt({ $and: [{ $ne: ['$ownerId', null] }, { $ne: ['$memberId', null] }, { $ne: ['$ownerId', '$memberId'] }] }),
            addedInPeriod: cnt({ $gte: ['$createdAt', since] }),
            convertedInPeriod: cnt({ $and: [isStatus('converted'), { $gte: ['$convertedAt', since] }] }),
            daysToConvertSum: {
              $sum: {
                $cond: [
                  { $and: [isStatus('converted'), { $ne: ['$convertedAt', null] }, { $ne: ['$assignedAt', null] }, { $gte: ['$convertedAt', '$assignedAt'] }] },
                  { $divide: [{ $subtract: ['$convertedAt', '$assignedAt'] }, DAY] },
                  0,
                ],
              },
            },
            daysToConvertN: cnt({ $and: [isStatus('converted'), { $ne: ['$convertedAt', null] }, { $ne: ['$assignedAt', null] }, { $gte: ['$convertedAt', '$assignedAt'] }] }),
          },
        },
      ]),
      Lead.aggregate([
        { $match: { ...scope, createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, n: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: { ...scope, status: 'converted', convertedAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$convertedAt', timezone: TZ } }, n: { $sum: 1 } } },
      ]),
      isAdmin && !scope.memberId
        ? Lead.aggregate([
            { $match: { memberId: { $ne: null } } },
            {
              $group: {
                _id: '$memberId',
                total: { $sum: 1 },
                open: cnt({ $in: ['$status', OPEN] }),
                contacted: cnt({ $or: ['$everContacted', isStatus('converted')] }),
                interested: cnt({ $or: ['$everInterested', isStatus('converted')] }),
                converted: cnt(isStatus('converted')),
                notConverted: cnt(isStatus('not_converted')),
                stale: cnt({ $and: [{ $in: ['$status', OPEN] }, { $lt: ['$lastActivityAt', staleBefore] }] }),
                selfAdded: cnt({ $eq: ['$origin', 'member'] }),
                convertedInPeriod: cnt({ $and: [isStatus('converted'), { $gte: ['$convertedAt', since] }] }),
                daysSum: {
                  $sum: {
                    $cond: [
                      { $and: [isStatus('converted'), { $ne: ['$convertedAt', null] }, { $ne: ['$assignedAt', null] }, { $gte: ['$convertedAt', '$assignedAt'] }] },
                      { $divide: [{ $subtract: ['$convertedAt', '$assignedAt'] }, DAY] },
                      0,
                    ],
                  },
                },
                daysN: cnt({ $and: [isStatus('converted'), { $ne: ['$convertedAt', null] }, { $ne: ['$assignedAt', null] }, { $gte: ['$convertedAt', '$assignedAt'] }] }),
              },
            },
          ])
        : Promise.resolve([]),
      Lead.aggregate([
        { $match: scope },
        { $group: { _id: { $ifNull: ['$source', 'other'] }, total: { $sum: 1 }, converted: cnt(isStatus('converted')) } },
        { $sort: { total: -1 } },
        { $limit: 12 },
      ]),
      Lead.aggregate([{ $match: { ...scope, status: 'not_converted' } }, { $group: { _id: { $ifNull: ['$lostReason', 'other'] }, n: { $sum: 1 } } }]),
      Lead.aggregate([{ $match: assignedOnly }, { $group: { _id: '$origin', total: { $sum: 1 }, converted: cnt(isStatus('converted')) } }]),
      Lead.aggregate([
        { $match: scope },
        {
          $group: {
            _id: null,
            added: cnt({ $and: [{ $gte: ['$createdAt', prevSince] }, { $lt: ['$createdAt', since] }] }),
            converted: cnt({ $and: [isStatus('converted'), { $gte: ['$convertedAt', prevSince] }, { $lt: ['$convertedAt', since] }] }),
          },
        },
      ]),
    ]);

    const t = totals[0] || {};
    const num = (k) => t[k] || 0;

    // one entry per day of the period
    const dayList = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(todayStartPk - (days - 1 - i) * DAY);
      dayList.push({
        key: d.toISOString().slice(0, 10),
        short: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        full: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
      });
    }
    const addedBy = new Map(perDayAdded.map((x) => [x._id, x.n]));
    const convBy = new Map(perDayConverted.map((x) => [x._id, x.n]));

    let members = [];
    if (perMember.length) {
      const people = await Member.find({ _id: { $in: perMember.map((m) => m._id) } }).select('name role active').lean();
      const who = new Map(people.map((p) => [sid(p._id), p]));
      members = perMember
        .map((m) => {
          const p = who.get(sid(m._id));
          const decided = m.converted + m.notConverted;
          return {
            id: sid(m._id),
            name: p?.name || 'Former member',
            role: p?.role || 'member',
            active: p?.active !== false,
            total: m.total,
            open: m.open,
            contacted: m.contacted,
            interested: m.interested,
            converted: m.converted,
            notConverted: m.notConverted,
            stale: m.stale,
            selfAdded: m.selfAdded,
            convertedInPeriod: m.convertedInPeriod,
            rate: m.total ? (m.converted / m.total) * 100 : 0,
            closeRate: decided ? (m.converted / decided) * 100 : null,
            avgDays: m.daysN ? m.daysSum / m.daysN : null,
          };
        })
        .sort((a, b) => b.converted - a.converted || b.rate - a.rate || b.total - a.total);
    }

    const assigned = num('assigned');
    const p = prev[0] || {};
    return ok({
      days,
      kpis: {
        total: num('total'),
        assigned,
        unassigned: num('total') - assigned,
        open: num('open'),
        fresh: num('fresh'),
        contacted: num('contacted'),
        interested: num('interested'),
        converted: num('converted'),
        notConverted: num('notConverted'),
        stale: num('stale'),
        duplicateAttempts: isAdmin ? num('duplicateAttempts') : undefined,
        ownerMismatch: isAdmin ? num('ownerMismatch') : undefined,
        conversionRate: assigned ? (num('converted') / assigned) * 100 : 0,
        avgDaysToConvert: num('daysToConvertN') ? num('daysToConvertSum') / num('daysToConvertN') : null,
        addedInPeriod: num('addedInPeriod'),
        convertedInPeriod: num('convertedInPeriod'),
        prevAdded: p.added || 0,
        prevConverted: p.converted || 0,
      },
      funnel: [
        { key: 'assigned', name: 'Given to a member', value: assigned },
        { key: 'contacted', name: 'Contacted', value: num('everContacted') },
        { key: 'interested', name: 'Interested', value: num('everInterested') },
        { key: 'converted', name: 'Store registered', value: num('converted') },
      ],
      labels: dayList.map((d) => ({ short: d.short, full: d.full })),
      added: dayList.map((d) => addedBy.get(d.key) || 0),
      converted: dayList.map((d) => convBy.get(d.key) || 0),
      members,
      sources: sources.map((s) => ({ id: s._id || 'other', name: s._id || 'other', total: s.total, converted: s.converted, rate: s.total ? (s.converted / s.total) * 100 : 0 })),
      lost: lost.map((l) => ({ id: l._id || 'other', name: l._id || 'other', value: l.n })).sort((a, b) => b.value - a.value),
      origins: origins.map((o) => ({ id: o._id || 'admin', total: o.total, converted: o.converted, rate: o.total ? (o.converted / o.total) * 100 : 0 })),
    });
  } catch (err) {
    console.error('Leads analytics error:', err);
    return fail(err.message, 500);
  }
}
