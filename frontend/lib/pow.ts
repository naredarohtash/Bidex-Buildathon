/**
 * Proof-of-work solver.
 *
 * Several routes are protected by it — login and password reset among them —
 * and each expects `{ challenge, nonce, hash }` alongside the request. The
 * password reset form sent only the email, so the server answered
 * "Proof-of-work solution is required" and no link was ever sent. The solver
 * existed only inside the login form, so nothing else could satisfy the check.
 *
 * The work itself is small: sha256(`${challenge}:${nonce}`) until the hash has
 * `difficulty` leading zero bits. At the current difficulty that is a few tens
 * of milliseconds.
 */

export interface PowSolution {
  challenge: string;
  nonce: string;
  hash: string;
}

function leadingZeroBits(hex: string): number {
  let bits = 0;
  for (const ch of hex) {
    const v = parseInt(ch, 16);
    if (v === 0) {
      bits += 4;
      continue;
    }
    // Math.clz32 counts 32-bit leading zeros; a hex digit is 4 bits.
    bits += Math.clz32(v) - 28;
    break;
  }
  return bits;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fetch a challenge for `action` and solve it.
 *
 * Returns null when the server has proof-of-work switched off, so callers can
 * simply spread the result and send nothing extra.
 */
export async function solvePow(action: string): Promise<PowSolution | null> {
  try {
    const res = await fetch(`/api/auth/pow/challenge?action=${encodeURIComponent(action)}`, {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data?.enabled || !data?.challenge) return null;

    const difficulty = Number(data.difficulty) || 0;
    let nonce = 0;
    let hash = "";

    // Bounded so a misconfigured difficulty cannot hang the tab forever.
    const limit = 20_000_000;
    for (; nonce < limit; nonce++) {
      hash = await sha256Hex(`${data.challenge}:${nonce}`);
      if (leadingZeroBits(hash) >= difficulty) break;
    }
    if (nonce >= limit) return null;

    return { challenge: data.challenge, nonce: String(nonce), hash };
  } catch {
    return null;
  }
}
