import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth/session';
import { storageDriver, writeLocalObject } from '@/server/textbook-storage';

/**
 * Development stand-in for R2's presigned PUT.
 *
 * Exists only so the upload-and-read loop works on a machine with no Cloudflare keys. It
 * answers 404 whenever the local driver is not the one in use — which is always, in
 * production — and even then only to a signed-in admin.
 */
export async function PUT(request: Request) {
  if (storageDriver() !== 'local') return new NextResponse('Not found', { status: 404 });

  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return new NextResponse('Not found', { status: 404 });

  const key = new URL(request.url).searchParams.get('key');
  if (!key || !request.body) return new NextResponse('Bad request', { status: 400 });

  await writeLocalObject(key, request.body);
  return new NextResponse(null, { status: 200 });
}
