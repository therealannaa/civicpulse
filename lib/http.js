import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from './auth';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

// Friendly messages for database constraint violations. The constraint name is
// still returned so the demo can show that validation happened in PostgreSQL.
const CONSTRAINT_MESSAGES = {
  chk_users_email: 'Enter a valid email address.',
  chk_users_name: 'Name must have at least 2 characters.',
  uq_users_email_lower: 'An account with this email already exists.',
  chk_user_phone_format: 'Phone numbers must be 10-digit Indian mobile numbers starting with 6, 7, 8 or 9.',
  pk_user_phone: 'The same phone number was entered twice.',
  chk_complaints_title: 'Title must be between 5 and 150 characters.',
  chk_complaints_description: 'Description must be between 10 and 2000 characters.',
  chk_complaints_location: 'Location must have at least 3 characters.',
  chk_complaints_latitude: 'Latitude must be between -90 and 90.',
  chk_complaints_longitude: 'Longitude must be between -180 and 180.',
  chk_complaints_coords_pair: 'Give both latitude and longitude, or neither.',
  chk_complaints_priority: 'Priority must be LOW, MEDIUM, HIGH or CRITICAL.',
  chk_feedback_rating: 'Rating must be between 1 and 5.',
  chk_feedback_comment: 'Comment can be at most 1000 characters.',
  uq_feedback_complaint: 'Feedback has already been given for this complaint.',
  chk_staff_designation: 'Designation must have at least 2 characters.',
  fk_complaints_category: 'Choose a valid category.',
  fk_complaints_ward: 'Choose a valid ward.',
  fk_users_ward: 'Choose a valid ward.',
  fk_staff_dept: 'Choose a valid department.',
  chk_images_mime: 'Photos must be JPEG, PNG or WebP images.',
  chk_images_size: 'Each photo can be at most 2 MB.',
};

function errorResponse(err) {
  if (err instanceof HttpError) {
    return json({ error: err.message }, err.status);
  }
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code.startsWith('23') || code === 'P0001' || code === 'P0002' || code.startsWith('22')) {
    const friendly = err.constraint && CONSTRAINT_MESSAGES[err.constraint];
    const status = code === '23505' ? 409 : 400;
    return json(
      {
        error: friendly || err.message,
        dbConstraint: err.constraint || null,
        dbCode: code,
      },
      status
    );
  }
  console.error(err);
  return json({ error: 'Something went wrong on the server. Check the terminal running "npm run dev".' }, 500);
}

// Wraps a route handler so thrown errors become JSON responses.
export function route(handler) {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function getSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

// Backend authorization check used by every protected API route.
export async function requireUser(roles) {
  const session = await getSession();
  if (!session) throw new HttpError(401, 'Please log in to continue.');
  if (roles && !roles.includes(session.role)) {
    throw new HttpError(403, 'Your role is not allowed to do this.');
  }
  return session;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

export function toInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${name} must be a positive whole number.`);
  return n;
}

export function optionalInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
