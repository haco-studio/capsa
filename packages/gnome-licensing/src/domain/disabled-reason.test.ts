import { describe, expect, it } from 'vitest';
import type { DisabledReason } from './disabled-reason.js';
import { DISABLED_REASONS, describeDisabledReason } from './disabled-reason.js';

const PRODUCT_NAME = 'Example';

describe('describeDisabledReason', () => {
  it('describes trial-expired with an Open Preferences action', () => {
    expect(describeDisabledReason('trial-expired', PRODUCT_NAME)).toEqual({
      headline: 'Your Example trial has ended.',
      instruction: 'Activate a license to keep using Example.',
      canOpenPreferences: true,
    });
  });

  it('describes license-expired with an Open Preferences action', () => {
    expect(describeDisabledReason('license-expired', PRODUCT_NAME)).toEqual({
      headline: 'Your Example license has expired.',
      instruction: 'Re-activate it to continue.',
      canOpenPreferences: true,
    });
  });

  it('describes license-invalid with an Open Preferences action', () => {
    expect(describeDisabledReason('license-invalid', PRODUCT_NAME)).toEqual({
      headline: 'Your Example license is no longer valid.',
      instruction: 'Re-activate it to continue.',
      canOpenPreferences: true,
    });
  });

  it('describes offline-grace-exceeded without an action', () => {
    expect(describeDisabledReason('offline-grace-exceeded', PRODUCT_NAME)).toEqual({
      headline: 'This device has been offline for too long.',
      instruction: 'Reconnect to the internet to continue.',
      canOpenPreferences: false,
    });
  });

  it('returns a non-empty headline and instruction for every reason', () => {
    for (const reason of DISABLED_REASONS satisfies readonly DisabledReason[]) {
      const { headline, instruction } = describeDisabledReason(reason, PRODUCT_NAME);
      expect(headline.length).toBeGreaterThan(0);
      expect(instruction.length).toBeGreaterThan(0);
    }
  });
});
