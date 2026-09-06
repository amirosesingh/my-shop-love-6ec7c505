/**
 * A counter that increases every time somebody signs in on this device.
 *
 * Signing out is not instant: the till has to close the shift sign-in, tell the
 * server the session is finished and clear the cloud session. If the next
 * person signs in while that is still running, the older sign-out used to
 * finish afterwards and wipe the brand-new sign-in — the "I log in and I'm
 * thrown straight back out" fault.
 *
 * Every sign-out remembers the counter it started with. When it finishes it
 * only clears the screen if nobody has signed in since. Anything that fails
 * (a rejected token, a switched-off account) carries the counter of the request
 * that failed, so a stale rejection can never end a newer session.
 */

let epoch = 0;

/** The current sign-in generation. */
export function sessionEpoch(): number {
  return epoch;
}

/** Record a fresh sign-in and return its generation. */
export function bumpSessionEpoch(): number {
  epoch += 1;
  return epoch;
}

/** True when nothing newer has signed in since `started`. */
export function isCurrentEpoch(started: number): boolean {
  return started === epoch;
}

/** Test seam. */
export function __resetSessionEpoch(value = 0): void {
  epoch = value;
}
