// Session tokens (JWT, HS256). Edge-safe: used by middleware and route handlers.
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'cp_session';
export const SESSION_HOURS = 8;
export const ROLE_HOME = { CITIZEN: '/citizen', STAFF: '/staff', ADMIN: '/admin' };

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set in .env.local and be at least 32 characters long');
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user) {
  return new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.user_id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return { userId: Number(payload.sub), name: payload.name, role: payload.role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  };
}
