import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { route, json, readJson, HttpError } from '@/lib/http';
import { signSession, sessionCookieOptions, SESSION_COOKIE, ROLE_HOME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  const { email, password } = await readJson(request);
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.');

  const { rows } = await query(
    'SELECT user_id, name, role, password_hash FROM users WHERE lower(email) = lower($1)',
    [String(email).trim()]
  );
  const user = rows[0];
  const ok = user ? await bcrypt.compare(String(password), user.password_hash) : false;
  if (!ok) throw new HttpError(401, 'Email or password is incorrect.');

  const token = await signSession(user);
  const response = json({
    user: { userId: user.user_id, name: user.name, role: user.role },
    home: ROLE_HOME[user.role],
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
});
