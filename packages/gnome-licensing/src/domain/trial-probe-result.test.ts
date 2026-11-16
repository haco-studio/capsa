import { describe, expect, it } from 'vitest';
import { LicenseServerOutcome } from './license-server-outcome.js';
import {
  isTrialProbeFresh,
  isValidTrialProbeResult,
  trialProbeResultOf,
} from './trial-probe-result.js';

describe('trialProbeResultOf', () => {
  it('is answered for a success', () => {
    expect(trialProbeResultOf(LicenseServerOutcome.succeeded({}))).toBe('answered');
  });

  it('is answered for a rejection', () => {
    expect(trialProbeResultOf(LicenseServerOutcome.rejected('INVALID_LICENSE_KEY'))).toBe(
      'answered'
    );
  });

  it('is no-response for no response', () => {
    expect(trialProbeResultOf(LicenseServerOutcome.noResponse())).toBe('no-response');
  });
});

describe('isValidTrialProbeResult', () => {
  it.each(['none', 'answered', 'no-response'])('accepts %s', (value) => {
    expect(isValidTrialProbeResult(value)).toBe(true);
  });

  it.each(['', 'unknown', 0, null])('rejects %s', (value) => {
    expect(isValidTrialProbeResult(value)).toBe(false);
  });
});

describe('isTrialProbeFresh', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  const minutesBefore = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);

  it('is false when no probe was made', () => {
    expect(isTrialProbeFresh(null, now)).toBe(false);
  });

  it.each([0, 29])('is true %i minutes after the probe', (minutes) => {
    expect(isTrialProbeFresh(minutesBefore(minutes), now)).toBe(true);
  });

  it.each([30, 120])('is false %i minutes after the probe', (minutes) => {
    expect(isTrialProbeFresh(minutesBefore(minutes), now)).toBe(false);
  });

  it('is false for a probe recorded in the future', () => {
    expect(isTrialProbeFresh(minutesBefore(-5), now)).toBe(false);
  });
});
