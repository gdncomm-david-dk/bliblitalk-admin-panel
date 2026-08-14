/**
 * SEC-017: decide an uploaded file's type from its bytes rather than from the
 * `Content-Type` the uploader wrote on the multipart part. Multer's `file.mimetype` is that
 * client-supplied claim, so filtering on it validates a claim and not a fact — an HTML or
 * SVG payload sent as `image/gif` passed straight through.
 *
 * Four fixed signatures is the whole problem here, so this is a dozen lines rather than a
 * dependency. Adding `file-type` would pull an ESM-only package into a CommonJS backend to
 * detect formats whose magic bytes have not changed in thirty years.
 *
 * This is a format check, not a safety guarantee: a real GIF can still carry a malicious
 * payload for a decoder bug. What it removes is the "arbitrary bytes served under an image
 * extension" case, which combined with the `nosniff` header (SEC-032) closes the stored-XSS
 * path the review described.
 */
export type ImageKind = { mime: string; ext: string };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

export function sniffImageType(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG)) {
    return { mime: "image/png", ext: "png" };
  }
  // Every JPEG variant (JFIF, Exif, raw) opens with the same SOI + first marker byte.
  if (buf.length >= 3 && buf.subarray(0, 3).equals(JPEG)) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (buf.length >= 6) {
    const head = buf.subarray(0, 6).toString("latin1");
    if (head === "GIF87a" || head === "GIF89a") return { mime: "image/gif", ext: "gif" };
  }
  // WEBP is a RIFF container: "RIFF", a 4-byte little-endian length, then the "WEBP" form type.
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}
