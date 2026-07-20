// S3-compatible object storage for private files (KYC documents).
//
// MinIO locally, real AWS S3 in production — same API, switched by env alone:
//   S3_ENDPOINT   http://minio:9000   (unset → AWS's default endpoint for the region)
//   S3_REGION / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET
//
// The bucket is PRIVATE. Nothing is ever served statically: callers get a short-lived signed
// URL only after the owning service has checked who is asking. That is the whole point of not
// reusing the base64-data-URI pattern the photo endpoints use — an identity document must not
// be inlined into any JSON a client can already fetch.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'node:crypto'

// TWO endpoints, and the difference matters:
//   S3_ENDPOINT         where THIS SERVICE writes — inside Docker that's http://minio:9000
//   S3_PUBLIC_ENDPOINT  what a signed URL must say, because a BROWSER opens it and cannot
//                       resolve "minio". Locally http://localhost:9010.
// A presigned URL is signed for a specific host, so it can't just be string-replaced afterwards —
// the signature would break. Hence a second client that signs against the public host.
// On real AWS both are unset and the SDK's default endpoint is correct for each.
const ENDPOINT = process.env.S3_ENDPOINT || ''
const PUBLIC_ENDPOINT = process.env.S3_PUBLIC_ENDPOINT || ENDPOINT
const REGION = process.env.S3_REGION || 'us-east-1'
const ACCESS_KEY = process.env.S3_ACCESS_KEY || ''
const SECRET_KEY = process.env.S3_SECRET_KEY || ''
export const S3_BUCKET = process.env.S3_BUCKET || 'homehelp-kyc'

/** False when storage isn't configured — callers should fail loudly rather than silently drop files. */
export const storageConfigured = () => !!(ACCESS_KEY && SECRET_KEY)

const creds = () => (storageConfigured() ? { credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } } : {})
const clientFor = (endpoint) => new S3Client({
  region: REGION,
  ...(endpoint ? { endpoint, forcePathStyle: true } : {}), // MinIO needs path-style addressing
  ...creds(),
})

export const s3 = clientFor(ENDPOINT)              // reads/writes from inside the network
const s3Signer = PUBLIC_ENDPOINT === ENDPOINT ? s3 : clientFor(PUBLIC_ENDPOINT) // signs browser-facing URLs

/** Create the bucket if it's missing. Safe to call on every boot. */
export async function ensureBucket(bucket = S3_BUCKET) {
  if (!storageConfigured()) { console.warn('[storage] S3 not configured — uploads will be rejected'); return false }
  try { await s3.send(new HeadBucketCommand({ Bucket: bucket })); return true } catch { /* create below */ }
  try { await s3.send(new CreateBucketCommand({ Bucket: bucket })); console.log(`[storage] created bucket ${bucket}`); return true }
  catch (e) { console.error('[storage] could not create bucket:', e.message); return false }
}

/**
 * Accepted upload types. Magic bytes are checked too — a client-declared mime type is a
 * suggestion, not evidence, and this is the boundary where a renamed .exe would get in.
 */
const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.slice(0, 5).toString('ascii') === '%PDF-' },
]

/** Identify a buffer by its magic bytes. Returns null when it isn't a type we accept. */
export function sniffType(buf) {
  if (!buf || buf.length < 12) return null
  return SIGNATURES.find((s) => s.test(buf)) || null
}

export const checksum = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

/** Random, unguessable key. Never derived from user input — a filename must not pick the path. */
export const storageKey = (prefix, ext) => `${prefix}/${Date.now()}-${crypto.randomBytes(12).toString('hex')}.${ext}`

export async function putObject(key, buf, mime, bucket = S3_BUCKET) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: mime }))
  return key
}

/**
 * Short-lived read URL. Default 5 minutes: long enough to open, short enough that a copied link
 * isn't a lasting leak. Signed against the PUBLIC endpoint — the caller is a browser.
 */
export const signedGetUrl = (key, expiresIn = 300, bucket = S3_BUCKET) =>
  getSignedUrl(s3Signer, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn })

export const deleteObject = (key, bucket = S3_BUCKET) =>
  s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))

/**
 * Fetch an object's bytes + content type, for services that must PROXY the file to a client that
 * can't reach the storage host directly (e.g. the phone can't resolve the localhost-bound MinIO
 * port — the gateway can, so the service streams it through). Returns { body, contentType }.
 */
export async function getObjectStream(key, bucket = S3_PUBLIC_BUCKET) {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  return { body: out.Body, contentType: out.ContentType || 'application/octet-stream' }
}

/* ---------- public media (profile photos) ----------
 * A SECOND bucket, public-read, deliberately separate from the KYC one.
 *
 * A worker's face photo is not an identity document: it is already shown to every customer who
 * books them, rendered by the customer app straight from `pro.avatar`. Signed URLs can't serve
 * that — they expire, so a customer's job screen would show a dead image minutes later. Keeping
 * avatars in their own public bucket means the KYC bucket stays private with no exception carved
 * into it, which is the part that must never leak.
 */
export const S3_PUBLIC_BUCKET = process.env.S3_PUBLIC_BUCKET || 'homehelp-media'

/** Create the public bucket and mark it read-only-to-the-world. Safe to call on every boot. */
export async function ensurePublicBucket(bucket = S3_PUBLIC_BUCKET) {
  if (!storageConfigured()) return false
  try { await s3.send(new HeadBucketCommand({ Bucket: bucket })) }
  catch { try { await s3.send(new CreateBucketCommand({ Bucket: bucket })); console.log(`[storage] created public bucket ${bucket}`) } catch (e) { console.error('[storage] could not create public bucket:', e.message); return false } }
  try {
    // Anonymous GET only. No list, no write — a leaked key name is the most anyone can learn.
    await s3.send(new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${bucket}/*`] }],
      }),
    }))
    return true
  } catch (e) { console.error('[storage] could not set public policy:', e.message); return false }
}

export async function putPublicObject(key, buf, mime, bucket = S3_PUBLIC_BUCKET) {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: mime }))
  return key
}

/** A stable, non-expiring URL. Built against the PUBLIC endpoint — a browser/phone fetches it. */
export const publicUrl = (key, bucket = S3_PUBLIC_BUCKET) =>
  `${(PUBLIC_ENDPOINT || '').replace(/\/$/, '')}/${bucket}/${key}`
