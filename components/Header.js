'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

const LINKS = {
  CITIZEN: [
    { href: '/citizen', label: 'My complaints' },
    { href: '/citizen/new', label: 'Report an issue' },
  ],
  STAFF: [
    { href: '/staff', label: 'My work' },
    { href: '/search', label: 'Search' },
  ],
  ADMIN: [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/complaints', label: 'Complaints' },
    { href: '/admin/staff', label: 'Staff' },
    { href: '/search', label: 'Search' },
  ],
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;
    api('/api/auth/me')
      .then((d) => active && setUser(d.user))
      .catch(() => active && setUser(null));
    return () => {
      active = false;
    };
  }, [pathname]);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    router.push('/login');
    router.refresh();
  }

  const links = user ? LINKS[user.role] || [] : [];
  const isActive = (href) =>
    pathname === href || (href !== '/admin' && href !== '/citizen' && pathname.startsWith(`${href}/`));

  return (
    <header className="site-header">
      <div className="inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          CivicPulse
        </Link>
        <nav className="nav" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={isActive(l.href) ? 'active' : ''}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="header-user">
          {user ? (
            <>
              <span>
                <strong>{user.name}</strong> <span className="role-tag">{user.role.toLowerCase()}</span>
              </span>
              <button className="btn small secondary" onClick={logout}>Log out</button>
            </>
          ) : (
            <>
              <Link href="/login" style={{ color: '#fff' }}>Log in</Link>
              <Link href="/register" className="btn small">Register</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
