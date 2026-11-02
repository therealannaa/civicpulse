// Page-level access control. Every API route also checks the role itself.
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, ROLE_HOME, verifySession } from './lib/auth';

const RULES = [
  { prefix: '/citizen', roles: ['CITIZEN'] },
  { prefix: '/staff', roles: ['STAFF'] },
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/search', roles: ['STAFF', 'ADMIN'] },
  { prefix: '/complaints', roles: ['CITIZEN', 'STAFF', 'ADMIN'] },
];

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/login' || pathname === '/register') {
    if (session && ROLE_HOME[session.role]) {
      return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
    }
    return NextResponse.next();
  }

  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  if (!session) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (!rule.roles.includes(session.role)) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role] || '/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/citizen/:path*',
    '/staff/:path*',
    '/admin/:path*',
    '/search/:path*',
    '/complaints/:path*',
    '/login',
    '/register',
  ],
};
