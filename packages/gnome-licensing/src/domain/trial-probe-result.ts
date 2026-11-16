import type { LicenseServerOutcome } from './license-server-outcome.js';

/**
 * The result of the most recent time the license server was asked, near or
 * after the end of the Trial Period, whether it is there.
 *
 * - none: the license server has not been asked yet
 * - answered: the license server answered (accepted or rejected the request)
 * - no-response: the license server did not answer
 *
 * The license gate is a reminder, not enforcement: an ended trial is locked,
 * and a pre-expiry warning shown, only when the most recent probe answered,
 * so a server outage or a retired server never strands anyone.
 */
export const TRIAL_PROBE_RESULTS = ['none', 'answered', 'no-response'] as const;
export type TrialProbeResult = (typeof TRIAL_PROBE_RESULTS)[number];

export function isValidTrialProbeResult(value: unknown): value is TrialProbeResult {
  return typeof value === 'string' && TRIAL_PROBE_RESULTS.includes(value as TrialProbeResult);
}

/**
 * Map the outcome of a probe request to the stored result: a success and a
 * rejection both mean the license server answered.
 */
export function trialProbeResultOf(outcome: LicenseServerOutcome<unknown>): TrialProbeResult {
  return outcome.kind === 'no-response' ? 'no-response' : 'answered';
}

/** How long a probe result stays fresh: no new probe is made before then. */
export const TRIAL_PROBE_FRESH_MINUTES = 30;

const MILLISECONDS_PER_MINUTE = 60 * 1000;

/**
 * Whether a probe made at `probedAt` is still fresh at `now`. A probe never
 * made, or one recorded in the future (the clock was set back), is not fresh.
 */
export function isTrialProbeFresh(probedAt: Date | null, now: Date): boolean {
  if (probedAt === null) {
    return false;
  }
  const elapsed = now.getTime() - probedAt.getTime();
  return elapsed >= 0 && elapsed < TRIAL_PROBE_FRESH_MINUTES * MILLISECONDS_PER_MINUTE;
}
