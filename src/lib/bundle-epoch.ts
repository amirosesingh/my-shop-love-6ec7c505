/**
 * Compatibility generation of the Android web bundle.
 *
 * Bundles published before the platform configuration isolation fix carried
 * web deployment values inside their JavaScript. A phone that had already
 * downloaded one of those bundles keeps serving it after an APK upgrade,
 * because the downloaded files live in app storage and survive the upgrade.
 *
 * The epoch is the permanent guard: the shell only serves an over-the-air
 * bundle that declares an epoch at or above this number. Every bundle from
 * before the fix declares nothing, so it is rejected and deleted, and the
 * clean assets inside the APK are used instead.
 *
 * Raise this number whenever a previously published bundle must never be
 * served again.
 */
export const BUNDLE_EPOCH = 2;

/** A manifest value is only trusted when it is a whole number. */
export function bundleEpochOf(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Is a bundle declaring `epoch` safe for this shell to serve? */
export function isBundleEpochCompatible(epoch: unknown, shell = BUNDLE_EPOCH): boolean {
  return bundleEpochOf(epoch) >= shell;
}
