import bcrypt from 'bcryptjs';
import { withTransaction } from '@/lib/db';
import { route, json, readJson, HttpError, optionalInt } from '@/lib/http';
import { signSession, sessionCookieOptions, SESSION_COOKIE, ROLE_HOME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Citizen self-registration. users + user_phone rows are written in ONE transaction:
// if any phone number violates its CHECK constraint, the user row is rolled back too.
export const POST = route(async (request) => {
  const body = await readJson(request);
  const password = String(body.password ?? '');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');

  const phones = (Array.isArray(body.phones) ? body.phones : [body.phones])
    .map((p) => String(p ?? '').replace(/\s+/g, ''))
    .filter(Boolean);
  if (phones.length === 0) throw new HttpError(400, 'Add at least one phone number.');

  const wardId = optionalInt(body.ward_id);
  if (!wardId) throw new HttpError(400, 'Choose the ward you live in.');

  const hash = await bcrypt.hash(password, 10);

  const user = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, ward_id)
       VALUES ($1, $2, $3, 'CITIZEN', $4)
       RETURNING user_id, name, role`,
      [String(body.name ?? '').trim(), String(body.email ?? '').trim().toLowerCase(), hash, wardId]
    );
    for (const phone of phones) {
      await client.query('INSERT INTO user_phone (user_id, phone) VALUES ($1, $2)', [rows[0].user_id, phone]);
    }
    return rows[0];
  });

  const token = await signSession(user);
  const response = json({ user: { userId: user.user_id, name: user.name, role: user.role }, home: ROLE_HOME[user.role] }, 201);
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
});
