'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  aliases?: string[];
};

type NavSection = {
  heading: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    heading: 'Trading',
    items: [
      { href: '/ai-apprentice', label: 'AI Apprentice' },
      { href: '/', label: 'Dashboard' },
      { href: '/calendar', label: 'Calendar' },
      { href: '/reports', label: 'Reports' },
      { href: '/trades', label: 'Trades' },
      { href: '/goals', label: 'Goals' },
      { href: '/import', label: 'Import Trades' }
    ]
  },
  {
    heading: 'HelmsBriscoe',
    items: [
      { href: '/prospects', label: 'Prospects', aliases: ['/events'] },
      { href: '/crm', label: 'CRM' }
    ]
  },
  {
    heading: 'Taxes',
    items: [
      { href: '/bookkeeping', label: 'Bookkeeping' },
      { href: '/tax-prep', label: 'Tax Prep' }
    ]
  }
];

const isItemActive = (pathname: string, item: NavItem) => {
  if (item.href === '/') {
    return pathname === '/';
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.aliases ?? []).some((alias) => pathname === alias || pathname.startsWith(`${alias}/`));
};

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">Payout Factory</div>
      <nav className="nav nav-sections">
        {sections.map((section) => (
          <div key={section.heading} className="nav-section">
            <div className="nav-section-heading">{section.heading}</div>
            <div className="nav-section-links">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isItemActive(pathname, item) ? 'active nav-link-child' : 'nav-link-child'}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div style={{ marginTop: '32px' }} className="callout">
        One operating system for trading, HelmsBriscoe pipeline, and tax prep workflows.
      </div>
    </aside>
  );
}
