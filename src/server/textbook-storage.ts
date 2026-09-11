import 'server-only';

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { AwsClient } from 'aws4fetch';

import { parseByteRange } from '@/lib/domain/byte-range';

/**
 * Where hosted textbooks live.
 *
 * In production that is a Cloudflare R2 bucket with public access switched off. Nothing in
 * it has a URL anyone can open: an upload is a short-lived signed PUT issued to an admin,
 * and a read goes through `/api/textbooks/[materialId]`, which checks membership first and
 * then asks R2 for exactly the bytes the reader wants.
 *
 * Without R2 credentials, development falls back to files under `.data/textbooks` — the
 * same zero-setup bargain the embedded database makes — so the whole upload-and-read loop
 * can be exercised locally. That fallback refuses to run in production; a deployment that
 * forgot its keys says so instead of writing books to a serverless function's scratch disk.
 */

/** Presigned upload URLs are checked when the PUT *starts*, so this bounds only the wait. */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/** The largest file an admin may upload. R2 takes 5 GB in one PUT; this is the product limit. */
export const MAX_TEXTBOOK_BYTES = 500 * 1024 * 1024;

type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { accountId, bucket, accessKeyId, secretAccessKey };
}

export type StorageDriver = 'r2' | 'local' | 'none';

export function storageDriver(): StorageDriver {
  if (r2Config()) return 'r2';
  return process.env.NODE_ENV === 'production' ? 'none' : 'local';
}

let client: AwsClient | null = null;
function r2(): { client: AwsClient; config: R2Config } {
  const config = r2Config();
  if (!config) throw new Error('R2 is not configured.');
  client ??= new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  return { client, config };
}

function objectUrl(config: R2Config, key: string): string {
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${path}`;
}

const LOCAL_ROOT = resolve(process.cwd(), '.data', 'textbooks');

/** Resolves a key under the local root, refusing anything that would climb out of it. */
export function localPath(key: string): string {
  const path = resolve(LOCAL_ROOT, key);
  if (!path.startsWith(LOCAL_ROOT + sep)) {
    throw new Error('Invalid storage key.');
  }
  return path;
}

/**
 * The object name for a new upload.
 *
 * Generated here, never taken from the file the admin picked: a filename is user input, and
 * the key is the only handle on the bytes. Prefixed by cohort so a key handed back by the
 * browser can be checked against the cohort it claims to belong to.
 */
export function newTextbookKey(cohortId: string): string {
  return `textbooks/${cohortId}/${crypto.randomUUID()}.pdf`;
}

export function keyBelongsToCohort(key: string, cohortId: string): boolean {
  return (
    /^textbooks\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/.test(key) &&
    key.startsWith(`textbooks/${cohortId}/`)
  );
}

/* ------------------------------------------------------------------ covers */

/** A cover is a thumbnail on a shelf, not a plate in an atlas. Anything larger is a mistake. */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

/**
 * The image types a cover may be, and the first bytes each one really starts with.
 *
 * Both halves matter. The extension decides the key and the `Content-Type` the shelf is
 * served with; the magic bytes are how the server knows the file is what the browser said
 * it was, since a `.png` is a name an uploader chooses and not a fact about the bytes.
 */
export const COVER_TYPES = {
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
} as const;

export type CoverType = keyof typeof COVER_TYPES;

export function isCoverType(value: string): value is CoverType {
  return value in COVER_TYPES;
}

/** The content type a stored cover is served with, read back from its own extension. */
export function coverContentType(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  const match = Object.entries(COVER_TYPES).find(([, meta]) => meta.ext === ext);
  return match?.[0] ?? 'application/octet-stream';
}

export function newCoverKey(cohortId: string, type: CoverType): string {
  return `covers/${cohortId}/${crypto.randomUUID()}.${COVER_TYPES[type].ext}`;
}

export function coverKeyBelongsToCohort(key: string, cohortId: string): boolean {
  return (
    /^covers\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(key) &&
    key.startsWith(`covers/${cohortId}/`)
  );
}

/** Whether the stored object really begins the way one of the allowed image types does. */
export function looksLikeCover(bytes: Uint8Array): boolean {
  return Object.values(COVER_TYPES).some((meta) =>
    meta.magic.every((byte, i) => bytes[i] === byte),
  );
}

/** Where the admin's browser should PUT the file. */
export async function uploadUrlFor(key: string): Promise<string> {
  const driver = storageDriver();
  if (driver === 'local') return `/api/textbooks/dev-upload?key=${encodeURIComponent(key)}`;
  if (driver === 'none') throw new Error('Textbook storage is not configured.');

  const { client, config } = r2();
  const url = new URL(objectUrl(config, key));
  url.searchParams.set('X-Amz-Expires', String(UPLOAD_URL_TTL_SECONDS));
  const signed = await client.sign(new Request(url, { method: 'PUT' }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

/** The stored object's size, or null when nothing is there. */
export async function objectSize(key: string): Promise<number | null> {
  const driver = storageDriver();
  if (driver === 'local') {
    try {
      return (await stat(localPath(key))).size;
    } catch {
      return null;
    }
  }
  if (driver === 'none') return null;

  const { client, config } = r2();
  const res = await client.fetch(objectUrl(config, key), { method: 'HEAD' });
  if (!res.ok) return null;
  const length = Number(res.headers.get('content-length'));
  return Number.isFinite(length) ? length : null;
}

export async function deleteObject(key: string): Promise<void> {
  const driver = storageDriver();
  if (driver === 'local') {
    await rm(localPath(key), { force: true });
    return;
  }
  if (driver === 'none') return;

  const { client, config } = r2();
  const res = await client.fetch(objectUrl(config, key), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed: ${res.status}`);
}

/** Development only: writes an uploaded body to the local store. */
export async function writeLocalObject(key: string, body: ReadableStream<Uint8Array>) {
  const path = localPath(key);
  await mkdir(dirname(path), { recursive: true });
  await pipeline(Readable.fromWeb(body as never), createWriteStream(path));
}

export type ObjectRead = {
  status: 200 | 206 | 416;
  body: ReadableStream<Uint8Array> | null;
  headers: Record<string, string>;
};

/**
 * Reads an object, or one byte range of it.
 *
 * The reader never asks for a whole book. PDF.js fetches the cross-reference table from the
 * end and then only the ranges behind the pages being looked at, so a student reading
 * chapter three of a 200 MB atlas moves a few megabytes, not two hundred.
 */
export async function readObject(key: string, range: string | null): Promise<ObjectRead | null> {
  const driver = storageDriver();

  if (driver === 'local') {
    const path = localPath(key);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      return null;
    }
    const parsed = parseByteRange(range, size);
    if (parsed === 'unsatisfiable') {
      return { status: 416, body: null, headers: { 'Content-Range': `bytes */${size}` } };
    }
    const { start, end } = parsed ?? { start: 0, end: size - 1 };
    const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
    return {
      status: parsed ? 206 : 200,
      body: stream,
      headers: {
        'Content-Length': String(end - start + 1),
        ...(parsed ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      },
    };
  }

  if (driver === 'none') return null;

  const { client, config } = r2();
  const res = await client.fetch(objectUrl(config, key), {
    headers: range ? { Range: range } : {},
  });
  if (res.status === 404) return null;
  if (res.status !== 200 && res.status !== 206 && res.status !== 416) {
    throw new Error(`R2 read failed: ${res.status}`);
  }

  const headers: Record<string, string> = {};
  for (const name of ['Content-Length', 'Content-Range']) {
    const value = res.headers.get(name);
    if (value) headers[name] = value;
  }
  return { status: res.status as 200 | 206 | 416, body: res.body, headers };
}
