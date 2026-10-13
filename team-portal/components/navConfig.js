import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Image as ImageIcon,
  Award,
  UserCheck,
  Wallet,
  Landmark,
  BarChart3,
  UserPlus,
  Target,
  Smartphone,
  Briefcase,
  PieChart,
} from 'lucide-react';

/**
 * One place for the portal navigation (top bar on desktop, bottom bar on phones).
 *
 *   primary  always visible (desktop: as links, phone: as the bottom bar)
 *   groups   the rest, by topic (desktop: a dropdown each, phone: the "More" sheet)
 *
 * Who sees what is decided here once, so both bars always show the same thing.
 */
export function buildNav(user) {
  if (!user) return { primary: [], groups: [] };
  const isAdmin = user.role === 'admin';

  const primary = [
    { href: '/dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
    { href: '/chat', label: 'Chats', icon: MessageSquare },
    { href: '/sellers', label: 'Sellers', icon: Users },
    { href: '/leads', label: 'Leads', icon: Target },
  ];

  const groups = [
    {
      key: 'team',
      label: 'Team',
      icon: Briefcase,
      items: [
        ...(isAdmin ? [{ href: '/members', label: 'Members', icon: UserCheck }] : []),
        // "My Members": ONLY a member who has brought at least one member sees it (his own
        // referral commission). Partners never bring members: they see who brought whom on Members.
        ...(!isAdmin && user.hasReferrals ? [{ href: '/my-members', label: 'My Members', icon: UserPlus }] : []),
        ...(isAdmin ? [{ href: '/numbers', label: 'WhatsApp Numbers', icon: Smartphone }] : []),
        { href: '/models', label: 'Models', icon: ImageIcon },
      ],
    },
    {
      key: 'money',
      label: 'Money',
      icon: Wallet,
      items: [
        { href: '/wallet', label: 'Wallet', icon: Wallet },
        ...(isAdmin ? [{ href: '/finance', label: 'Finance', icon: Landmark }] : []),
        { href: '/rewards', label: 'Rewards', icon: Award },
      ],
    },
    {
      key: 'insights',
      label: 'Insights',
      icon: PieChart,
      items: [{ href: '/analytics', label: 'Analytics', icon: BarChart3 }],
    },
  ].filter((g) => g.items.length);

  return { primary, groups };
}

/** Is this link the page we are on (also for pages below it, e.g. /leads/123)? */
export function isActivePath(pathname, href) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
