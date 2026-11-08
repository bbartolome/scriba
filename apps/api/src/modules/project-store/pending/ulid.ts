import { randomBytes } from 'node:crypto';

/**
 * Pending change IDs: sortable, time-based ULIDs (spec, "Storage"). The 48-bit millisecond time comes
 * first, then 80 random bits, both in Crockford base32, so 26 characters sort in creation order.
 * Two IDs made in the same millisecond differ by a counter, so they still sort in order.
 */
// PROVISIONAL (survey 20 item 21): ULID pending IDs

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RANDOM_BITS = 80n;
const RANDOM_MASK = (1n << RANDOM_BITS) - 1n;

let lastMillis = -1;
let lastRandom = 0n;

function encode(value: bigint): string {
  let rest = value;
  let text = '';
  for (let i = 0; i < 26; i += 1) {
    text = `${ALPHABET[Number(rest & 31n)] ?? '0'}${text}`;
    rest >>= 5n;
  }
  return text;
}

/** Returns a new pending change ID for the given instant (the current time by default). */
export function newPendingId(now: number = Date.now()): string {
  let random: bigint;
  if (now === lastMillis) {
    random = (lastRandom + 1n) & RANDOM_MASK;
  } else {
    random = BigInt(`0x${randomBytes(10).toString('hex')}`);
    lastMillis = now;
  }
  lastRandom = random;
  return encode((BigInt(now) << RANDOM_BITS) | random);
}
