/**
 * The shared **cumulative-weight scan** — the accumulate-and-walk loop two seeded weighted draws in
 * this package lean on, factored out so the loop (and its `r → total` final-element fallback) lives in
 * exactly one place.
 *
 * **Only the scan is shared — never the draw.** {@link composeSession}'s `weightedPick` and
 * {@link generateSpot}'s `pickByDifficulty` both walk a cumulative weight sum and return the first index
 * the running total passes, but they *draw their threshold differently*: the session composer draws a
 * float `nextFloat() * total` (a real in `[0, total)`), the generator draws an integer `nextInt(total)`
 * (an int in `[0, total)`). Folding the draw in here would change one of those — and with it the
 * seeded, byte-for-byte output the whole package's determinism tests pin. So each caller keeps its own
 * draw and its own index→element mapping and passes the already-drawn `threshold` in; this helper owns
 * only the scan, which is provably identical in both and therefore safe to share with zero behaviour
 * change.
 *
 * Purity: a plain arithmetic walk, no randomness or I/O — the randomness is the caller's draw.
 */

/**
 * Return the first index `i` whose cumulative weight sum (`weights[0] + … + weights[i]`) **exceeds**
 * `threshold` — i.e. the bucket `threshold` lands in when the weights are laid end to end. Walks the
 * weights once, subtracting each from a running copy of `threshold` and returning as soon as it goes
 * negative; if `threshold` reaches or passes the total (the `r → total` floating-point edge a caller's
 * draw can hit), it falls back to the **last** index. This is exactly the loop both
 * `weightedPick` and `pickByDifficulty` ran inline, so each caller's seeded output is unchanged.
 *
 * Assumes a non-empty `weights` (every caller guards an empty list before calling — an empty list has
 * no bucket to land in); the fallback index `weights.length - 1` is only reached for a non-empty list.
 *
 * @param weights The per-bucket weights, in the order the caller offers its elements.
 * @param threshold The already-drawn position to locate — a float `r * total` or an integer
 *   `nextInt(total)`, drawn by the caller off its own seeded stream so this helper stays pure.
 */
export function scanCumulativeWeights(weights: readonly number[], threshold: number): number {
  let remaining = threshold
  for (let i = 0; i < weights.length; i++) {
    remaining -= weights[i]!
    if (remaining < 0) return i
  }
  return weights.length - 1
}
