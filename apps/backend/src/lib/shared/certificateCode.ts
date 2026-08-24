import { randomBytes } from "crypto";

/**
 * SEC-021: the code was `randomBytes(4)` — 32 bits, roughly four billion values. That is
 * thin for an identifier that is meant to prove a certificate is genuine, and it becomes
 * guessable the moment a public verification endpoint exists. 16 bytes puts it out of reach
 * permanently.
 *
 * Crockford base32 rather than hex: it is a third shorter at the same entropy, and it drops
 * the characters people confuse when reading a code off a printed certificate — I/L are not
 * in the alphabet at all, and O and U are excluded so they cannot be misread as 0 and V.
 *
 * Codes already printed on issued certificates keep their old shape and stay valid. Nothing
 * re-issues them, and `verificationCode` is only ever compared for equality, never parsed —
 * so the two lengths coexist. `@unique` on the column holds across both.
 *
 * The longer code still fits the certificate PDF bliblitalk-user-fe renders: at 16px
 * Helvetica-Bold the ID line measures 315pt inside a 716pt content width, against 371pt for
 * the recognition line already sitting above it.
 *
 * bliblitalk-user-fe carries a byte-identical copy of this file. It is not one of the
 * mirrored files `pnpm sync:admin` manages, so a change to either must be applied to both by
 * hand, or the two apps start minting different code shapes for the same table.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U

export function generateVerificationCode(): string {
  const bytes = randomBytes(16);
  let out = "";
  // 16 bytes → 26 base32 characters (130 bits of alphabet capacity for 128 bits of entropy).
  // Read as a bit stream rather than byte-by-byte so no entropy is discarded by rounding.
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(acc >> bits) & 0b11111];
    }
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 0b11111];
  // The `BT2-CERT-` prefix is unchanged from the 32-bit codes on purpose: old and new codes
  // stay recognisable as the same kind of artefact, and anything matching on the prefix keeps
  // working across both. Only the random part grew. The inner hyphen groups it for someone
  // reading it off a printed certificate; it is cosmetic but part of the stored value.
  return `BT2-CERT-${out.slice(0, 13)}-${out.slice(13)}`;
}
