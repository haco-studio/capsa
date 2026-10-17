/**
 * DisabledReason
 *
 * Why the extension is not allowed to run its licensed features right now.
 * `null` (used by callers) means the extension is enabled.
 */

export const DISABLED_REASONS = [
  'trial-expired',
  'license-expired',
  'license-invalid',
  'offline-grace-exceeded',
] as const;

export type DisabledReason = (typeof DISABLED_REASONS)[number];

/**
 * User-facing description of a DisabledReason, shown while the extension is locked.
 */
export interface DisabledReasonDescription {
  /** What happened, e.g. "Your Example license has expired." */
  readonly headline: string;
  /** What to do about it. Rendered on its own line below the headline. */
  readonly instruction: string;
  /**
   * Whether an "Open Preferences" action can resolve the reason.
   * False for reasons the user cannot fix from the preferences window.
   */
  readonly canOpenPreferences: boolean;
}

/**
 * Map a DisabledReason to its user-facing copy and action applicability.
 *
 * @param productName The extension's name as shown to the user, e.g. "Example"
 */
export function describeDisabledReason(
  reason: DisabledReason,
  productName: string
): DisabledReasonDescription {
  switch (reason) {
    case 'trial-expired':
      return {
        headline: `Your ${productName} trial has ended.`,
        instruction: `Activate a license to keep using ${productName}.`,
        canOpenPreferences: true,
      };
    case 'license-expired':
      return {
        headline: `Your ${productName} license has expired.`,
        instruction: 'Re-activate it to continue.',
        canOpenPreferences: true,
      };
    case 'license-invalid':
      return {
        headline: `Your ${productName} license is no longer valid.`,
        instruction: 'Re-activate it to continue.',
        canOpenPreferences: true,
      };
    case 'offline-grace-exceeded':
      return {
        headline: 'This device has been offline for too long.',
        instruction: 'Reconnect to the internet to continue.',
        canOpenPreferences: false,
      };
  }
}
