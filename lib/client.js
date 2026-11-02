'use client';

// Browser-side helper for calling the API routes.
export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.constraint = data?.dbConstraint || null;
    throw error;
  }
  return data;
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// "due in 5 h", "3 h overdue"
export function slaText(dueAt, status) {
  if (!dueAt) return '—';
  if (['RESOLVED', 'CLOSED', 'REJECTED'].includes(status)) return formatDateTime(dueAt);
  const diffHours = Math.round((new Date(dueAt).getTime() - Date.now()) / 36e5);
  if (diffHours >= 48) return `due in ${Math.round(diffHours / 24)} days`;
  if (diffHours >= 0) return `due in ${diffHours} h`;
  if (diffHours > -48) return `${-diffHours} h overdue`;
  return `${Math.round(-diffHours / 24)} days overdue`;
}

export function plate(id) {
  return `CP-${String(id).padStart(4, '0')}`;
}

// ---------- Complaint photos ----------
export const MAX_PHOTOS = 3;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Large phone photos are scaled down to 1600 px and re-saved as JPEG before upload,
// so they fit comfortably under the 2 MB limit checked by the server and the database.
export async function shrinkImage(file, maxSide = 1600, maxBytes = 1.5 * 1024 * 1024) {
  if (file.size <= maxBytes && PHOTO_TYPES.includes(file.type)) return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`"${file.name}" could not be read. Use a JPEG, PNG or WebP photo.`);
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
}

// Sends the photos as multipart/form-data (JSON cannot carry binary files)
export async function uploadImages(complaintId, files) {
  const body = new FormData();
  for (const file of files) body.append('images', file);
  const response = await fetch(`/api/complaints/${complaintId}/images`, { method: 'POST', body });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || `Upload failed (${response.status})`);
    error.constraint = data?.dbConstraint || null;
    throw error;
  }
  return data;
}

export function imageUrl(complaintId, imageId) {
  return `/api/complaints/${complaintId}/images/${imageId}`;
}
