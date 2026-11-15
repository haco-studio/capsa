// Provide the GNOME Shell global log function for the test environment
globalThis.log = () => {};

import { describe, expect, it } from 'vitest';
import type {
  DisabledReason,
  LicenseStatus,
  NetworkState,
  TrialProbeResult,
} from '../domain/index.js';
import {
  ActivationId,
  DeviceId,
  License,
  LicenseKey,
  TrialDays,
  TrialPeriod,
} from '../domain/index.js';
import type { LicenseApiClient, LicenseRepository } from '../operations/index.js';
import {
  LicenseOperations,
  TrialWarningOperations,
  ValidationResult,
} from '../operations/index.js';
import { LicenseStateHandler } from './license-state-handler.js';

const unexpected = (name: string) => (): never => {
  throw new Error(`${name} is not expected to be called`);
};

/**
 * A repository standing in for storage shared with another process: its data
 * is changed directly (as the other process would), then fireChange() reports it.
 */
function createSharedStorage() {
  const store: { status: LicenseStatus; license: License | null; lastOnlineAt: Date | null } = {
    status: 'expired',
    license: createLicense('expired'),
    lastOnlineAt: null,
  };
  const trialPeriod = new TrialPeriod({ daysUsed: new TrialDays(30), lastUsedDate: '2026-06-15' });
  const watchers = new Set<() => void>();

  const repository: LicenseRepository = {
    getStatus: () => store.status,
    setStatus: unexpected('setStatus'),
    loadLicense: () => store.license,
    saveLicense: unexpected('saveLicense'),
    loadTrialPeriod: () => trialPeriod,
    saveTrialPeriod: unexpected('saveTrialPeriod'),
    getTrialWarningThreshold: () => 0,
    setTrialWarningThreshold: unexpected('setTrialWarningThreshold'),
    getLastOnlineAt: () => store.lastOnlineAt,
    setLastOnlineAt: (date) => {
      store.lastOnlineAt = date;
    },
    getTrialProbeResult: () => 'none',
    setTrialProbeResult: unexpected('setTrialProbeResult'),
    getTrialProbedAt: () => null,
    setTrialProbedAt: unexpected('setTrialProbedAt'),
    watchChanges: (callback) => {
      watchers.add(callback);
      return () => watchers.delete(callback);
    },
  };

  return {
    repository,
    store,
    fireChange: () => {
      for (const watcher of [...watchers]) {
        watcher();
      }
    },
    watcherCount: () => watchers.size,
  };
}

/**
 * An in-memory repository that records every trial period it is asked to save.
 */
function createTrialStorage(
  status: LicenseStatus,
  trialPeriod: TrialPeriod,
  trialWarningThreshold = 0
) {
  const store: {
    status: LicenseStatus;
    trialPeriod: TrialPeriod;
    trialWarningThreshold: number;
    lastOnlineAt: Date | null;
    trialProbeResult: TrialProbeResult;
    trialProbedAt: Date | null;
  } = {
    status,
    trialPeriod,
    trialWarningThreshold,
    lastOnlineAt: null,
    trialProbeResult: 'none',
    trialProbedAt: null,
  };
  const savedTrialPeriods: TrialPeriod[] = [];

  const repository: LicenseRepository = {
    getStatus: () => store.status,
    setStatus: (next) => {
      store.status = next;
    },
    // No stored license, so initialize() never calls the license API.
    loadLicense: () => null,
    saveLicense: unexpected('saveLicense'),
    loadTrialPeriod: () => store.trialPeriod,
    saveTrialPeriod: (next) => {
      store.trialPeriod = next;
      savedTrialPeriods.push(next);
    },
    getTrialWarningThreshold: () => store.trialWarningThreshold,
    setTrialWarningThreshold: (threshold) => {
      store.trialWarningThreshold = threshold;
    },
    getLastOnlineAt: () => store.lastOnlineAt,
    setLastOnlineAt: (date) => {
      store.lastOnlineAt = date;
    },
    getTrialProbeResult: () => store.trialProbeResult,
    setTrialProbeResult: (result) => {
      store.trialProbeResult = result;
    },
    getTrialProbedAt: () => store.trialProbedAt,
    setTrialProbedAt: (date) => {
      store.trialProbedAt = date;
    },
    watchChanges: () => () => {},
  };

  return { repository, store, savedTrialPeriods };
}

function trialPeriod(daysUsed: number, lastUsedDate: string): TrialPeriod {
  return new TrialPeriod({ daysUsed: new TrialDays(daysUsed), lastUsedDate });
}

/**
 * A network that is online or offline, counting its watchers. change() sets
 * the state and reports it to the watchers as Gio.NetworkMonitor would.
 */
function createNetwork(initial: NetworkState = 'online') {
  const callbacks = new Set<(state: NetworkState) => void>();
  const network = {
    state: initial,
    get watchers() {
      return callbacks.size;
    },
    change(next: NetworkState) {
      network.state = next;
      for (const callback of [...callbacks]) {
        callback(next);
      }
    },
  };
  const provider = {
    getNetworkState: () => network.state,
    watchNetworkState: (callback: (state: NetworkState) => void) => {
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },
  };
  return { network, provider };
}

const NOW = new Date('2026-06-15T12:00:00Z');
const MINUTE = 60 * 1000;

/** A clock that starts at NOW and can be moved forward. */
function createClock() {
  const clock = {
    now: NOW,
    advanceMinutes(minutes: number) {
      clock.now = new Date(clock.now.getTime() + minutes * MINUTE);
    },
  };
  return clock;
}

/** `date` as YYYY-MM-DD in UTC, which is how the clock's days are named here. */
function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A license server reached through probe(): it answers until told otherwise,
 * counts the probes, and can hold them until released.
 */
function createLicenseServer() {
  const held: (() => void)[] = [];
  const server = {
    answers: true,
    hold: false,
    probes: 0,
    probe(): Promise<ValidationResult> {
      server.probes++;
      const outcome = () =>
        server.answers
          ? ValidationResult.rejected('INVALID_LICENSE_KEY')
          : ValidationResult.noResponse();
      if (!server.hold) {
        return Promise.resolve(outcome());
      }
      return new Promise((resolve) => {
        held.push(() => resolve(outcome()));
      });
    },
    release() {
      for (const resolve of held.splice(0)) {
        resolve();
      }
    },
  };
  return server;
}

function createHandler(
  repository: LicenseRepository,
  warnings: string[] = [],
  networkStateProvider = createNetwork().provider,
  server = createLicenseServer(),
  clock = createClock()
): LicenseStateHandler {
  const apiClient: LicenseApiClient = {
    activate: unexpected('activate'),
    validate: unexpected('validate'),
    probe: () => server.probe(),
  };
  const licenseOperations = new LicenseOperations(
    repository,
    apiClient,
    { now: () => clock.now, today: () => dayOf(clock.now) },
    networkStateProvider,
    { getDeviceId: () => new DeviceId('test-device'), getDeviceLabel: () => 'Test Device' }
  );
  const trialWarningOperations = new TrialWarningOperations(
    repository,
    {
      notifyError: () => {},
      notifyWarning: (_title, message) => warnings.push(message),
    },
    'Example'
  );
  return new LicenseStateHandler(licenseOperations, trialWarningOperations);
}

function createLicense(status: LicenseStatus = 'valid'): License {
  return new License({
    licenseKey: new LicenseKey('TEST-LICENSE-KEY-123'),
    activationId: new ActivationId('550e8400-e29b-41d4-a716-446655440000'),
    validUntil: new Date('2026-12-31T00:00:00Z'),
    lastValidated: new Date(),
    status,
  });
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('LicenseStateHandler', () => {
  it('unlocks as soon as a license stored by another process is reported', async () => {
    const storage = createSharedStorage();
    const handler = createHandler(storage.repository);
    handler.initialize(() => {});
    await flushPromises();
    expect(handler.getDisabledReason()).toBe('license-expired');

    storage.store.license = createLicense();
    storage.store.status = 'valid';
    storage.fireChange();

    expect(handler.getDisabledReason()).toBeNull();
  });

  it('reports a license that another process marked invalid', async () => {
    const storage = createSharedStorage();
    const handler = createHandler(storage.repository);
    const invalidReasons: DisabledReason[] = [];
    handler.initialize((reason) => invalidReasons.push(reason));
    await flushPromises();
    invalidReasons.length = 0;

    storage.store.license = createLicense();
    storage.store.status = 'valid';
    storage.fireChange();
    expect(handler.getDisabledReason()).toBeNull();
    expect(invalidReasons).toEqual([]);

    storage.store.status = 'expired';
    storage.fireChange();

    expect(handler.getDisabledReason()).toBe('license-expired');
    expect(invalidReasons).toEqual(['license-expired']);
  });

  it('notifies additional state listeners of changes stored by another process', async () => {
    const storage = createSharedStorage();
    const handler = createHandler(storage.repository);
    handler.initialize(() => {});
    await flushPromises();
    let notified = 0;
    handler.onStateChange(() => notified++);

    storage.store.license = createLicense();
    storage.store.status = 'valid';
    storage.fireChange();

    expect(notified).toBe(1);
  });

  it('stops following stored changes once disposed', async () => {
    const storage = createSharedStorage();
    const handler = createHandler(storage.repository);
    handler.initialize(() => {});
    await flushPromises();

    handler.dispose();
    storage.store.license = createLicense();
    storage.store.status = 'valid';
    storage.fireChange();

    expect(storage.watcherCount()).toBe(0);
    expect(handler.getDisabledReason()).toBe('license-expired');
  });

  it('watches stored changes only once when initialized again', async () => {
    const storage = createSharedStorage();
    const handler = createHandler(storage.repository);
    handler.initialize(() => {});
    handler.initialize(() => {});
    await flushPromises();

    expect(storage.watcherCount()).toBe(1);
  });

  it('follows the network state until disposed', async () => {
    const storage = createSharedStorage();
    const { network, provider } = createNetwork();
    const handler = createHandler(storage.repository, [], provider);
    handler.initialize(() => {});
    handler.initialize(() => {});
    await flushPromises();
    expect(network.watchers).toBe(1);

    handler.dispose();

    expect(network.watchers).toBe(0);
  });

  it('unlocks once the network comes back after the offline grace period was exceeded', async () => {
    const storage = createSharedStorage();
    storage.store.license = createLicense();
    storage.store.status = 'valid';
    storage.store.lastOnlineAt = new Date('2026-06-01T00:00:00Z');
    const { network, provider } = createNetwork('offline');
    const handler = createHandler(storage.repository, [], provider);
    handler.initialize(() => {});
    await flushPromises();
    expect(handler.getDisabledReason()).toBe('offline-grace-exceeded');

    network.change('online');

    expect(handler.getDisabledReason()).toBeNull();
    expect(storage.store.lastOnlineAt).toEqual(NOW);
  });

  describe('recordUse', () => {
    it('records now as last online when online', async () => {
      const storage = createSharedStorage();
      const handler = createHandler(storage.repository);
      handler.initialize(() => {});
      await flushPromises();
      storage.store.lastOnlineAt = new Date('2026-06-10T00:00:00Z');

      handler.recordUse();

      expect(storage.store.lastOnlineAt).toEqual(NOW);
    });

    it('leaves last online unchanged when offline', async () => {
      const storage = createSharedStorage();
      const handler = createHandler(storage.repository, [], createNetwork('offline').provider);
      handler.initialize(() => {});
      await flushPromises();
      const lastOnlineAt = new Date('2026-06-10T00:00:00Z');
      storage.store.lastOnlineAt = lastOnlineAt;

      handler.recordUse();

      expect(storage.store.lastOnlineAt).toEqual(lastOnlineAt);
    });

    it('records today once per day during the trial', async () => {
      const storage = createTrialStorage('trial', trialPeriod(5, '2026-06-14'));
      const handler = createHandler(storage.repository);
      handler.initialize(() => {});
      await flushPromises();

      handler.recordUse();

      expect(storage.savedTrialPeriods).toHaveLength(1);
      expect(storage.savedTrialPeriods[0].lastUsedDate).toBe('2026-06-15');
      expect(storage.savedTrialPeriods[0].daysUsed.toNumber()).toBe(6);

      handler.recordUse();

      expect(storage.savedTrialPeriods).toHaveLength(1);
    });

    it.each(['trial-expired', 'valid', 'expired', 'invalid'] as const)(
      'writes no trial data when the status is %s',
      async (status) => {
        const storage = createTrialStorage(status, trialPeriod(5, '2026-06-14'));
        storage.repository.saveTrialPeriod = unexpected('saveTrialPeriod');
        const handler = createHandler(storage.repository);
        handler.initialize(() => {});
        await flushPromises();

        handler.recordUse();

        expect(storage.store.trialPeriod.daysUsed.toNumber()).toBe(5);
      }
    );

    it('keeps the extension usable on the 30th day of the trial', async () => {
      const storage = createTrialStorage('trial', trialPeriod(29, '2026-06-14'));
      const handler = createHandler(storage.repository);
      handler.initialize(() => {});
      await flushPromises();

      handler.recordUse();
      await flushPromises();

      expect(storage.store.trialPeriod.daysUsed.toNumber()).toBe(30);
      expect(storage.store.status).toBe('trial');
      expect(handler.getDisabledReason()).toBeNull();
    });

    it('locks as soon as the trial ends during the session while the license server answers', async () => {
      const storage = createTrialStorage('trial', trialPeriod(30, '2026-06-15'));
      const clock = createClock();
      const handler = createHandler(storage.repository, [], undefined, undefined, clock);
      handler.initialize(() => {});
      await flushPromises();
      expect(storage.store.trialProbeResult).toBe('answered');
      expect(handler.getDisabledReason()).toBeNull();

      clock.advanceMinutes(24 * 60);
      handler.recordUse();

      expect(storage.store.status).toBe('trial-expired');
      expect(handler.getDisabledReason()).toBe('trial-expired');
    });

    it('stays open when the trial ends during the session while the license server does not answer', async () => {
      const storage = createTrialStorage('trial', trialPeriod(30, '2026-06-15'));
      const server = createLicenseServer();
      server.answers = false;
      const clock = createClock();
      const handler = createHandler(storage.repository, [], undefined, server, clock);
      handler.initialize(() => {});
      await flushPromises();

      clock.advanceMinutes(24 * 60);
      handler.recordUse();
      expect(storage.store.status).toBe('trial-expired');
      expect(handler.getDisabledReason()).toBeNull();

      await flushPromises();
      expect(server.probes).toBe(2);
      expect(handler.getDisabledReason()).toBeNull();
    });

    it('stays open when the trial ends during the session before any probe', async () => {
      const storage = createTrialStorage('trial', trialPeriod(30, '2026-06-14'));
      const handler = createHandler(storage.repository, [], createNetwork('offline').provider);
      handler.initialize(() => {});
      await flushPromises();

      handler.recordUse();
      await flushPromises();

      expect(storage.store.status).toBe('trial-expired');
      expect(storage.store.trialProbeResult).toBe('none');
      expect(handler.getDisabledReason()).toBeNull();
    });

    it('warns when a recorded day crosses a warning threshold and the license server answers', async () => {
      const storage = createTrialStorage('trial', trialPeriod(26, '2026-06-14'));
      const warnings: string[] = [];
      const handler = createHandler(storage.repository, warnings);
      handler.initialize(() => {});
      await flushPromises();
      expect(warnings).toEqual([]);

      handler.recordUse();
      await flushPromises();

      expect(warnings).toHaveLength(1);
      expect(storage.store.trialWarningThreshold).toBe(3);
    });

    it('holds back a reached warning without an answer and shows it once a later probe gets one', async () => {
      const storage = createTrialStorage('trial', trialPeriod(26, '2026-06-14'));
      const server = createLicenseServer();
      server.answers = false;
      const clock = createClock();
      const warnings: string[] = [];
      const handler = createHandler(storage.repository, warnings, undefined, server, clock);
      handler.initialize(() => {});
      await flushPromises();

      handler.recordUse();
      await flushPromises();
      expect(server.probes).toBe(1);
      expect(warnings).toEqual([]);
      expect(storage.store.trialWarningThreshold).toBe(0);

      server.answers = true;
      clock.advanceMinutes(31);
      handler.recordUse();
      await flushPromises();

      expect(server.probes).toBe(2);
      expect(warnings).toEqual([
        'Your Example trial has 3 days of use left. Activate a license to keep using it.',
      ]);
      expect(storage.store.trialWarningThreshold).toBe(3);
    });

    it('does not probe before a warning threshold is reached', async () => {
      const storage = createTrialStorage('trial', trialPeriod(5, '2026-06-14'));
      const server = createLicenseServer();
      const handler = createHandler(storage.repository, [], undefined, server);
      handler.initialize(() => {});
      await flushPromises();

      handler.recordUse();
      await flushPromises();

      expect(server.probes).toBe(0);
    });

    describe('after the trial', () => {
      function endedTrialStorage(probedMinutesAgo: number) {
        const storage = createTrialStorage('trial-expired', trialPeriod(30, '2026-06-01'));
        storage.store.trialProbeResult = 'answered';
        storage.store.trialProbedAt = new Date(NOW.getTime() - probedMinutesAgo * MINUTE);
        return storage;
      }

      it('probes on use only once the stored result is 30 minutes old', async () => {
        const storage = endedTrialStorage(10);
        const server = createLicenseServer();
        const clock = createClock();
        const handler = createHandler(storage.repository, [], undefined, server, clock);
        handler.initialize(() => {});
        await flushPromises();
        expect(server.probes).toBe(0);

        handler.recordUse();
        await flushPromises();
        expect(server.probes).toBe(0);

        clock.advanceMinutes(20);
        handler.recordUse();
        await flushPromises();
        expect(server.probes).toBe(1);
        expect(storage.store.trialProbedAt).toEqual(clock.now);
      });

      it('never waits for a probe, and starts no second one on use or network recovery while it is in flight', async () => {
        const storage = endedTrialStorage(10);
        const server = createLicenseServer();
        const clock = createClock();
        const { network, provider } = createNetwork('online');
        const handler = createHandler(storage.repository, [], provider, server, clock);
        handler.initialize(() => {});
        await flushPromises();
        const states: string[] = [];
        handler.onStateChange((state) => states.push(state.status));

        server.hold = true;
        server.answers = false;
        clock.advanceMinutes(30);
        handler.recordUse();
        expect(server.probes).toBe(1);
        expect(handler.getDisabledReason()).toBe('trial-expired');

        handler.recordUse();
        network.change('online');
        expect(server.probes).toBe(1);

        server.release();
        await flushPromises();
        expect(handler.getDisabledReason()).toBeNull();
        expect(storage.store.trialProbeResult).toBe('no-response');
        expect(states).toEqual(['trial-expired']);
      });

      it('probes when the network comes back, unless the stored result is fresh', async () => {
        const storage = endedTrialStorage(10);
        const server = createLicenseServer();
        server.answers = false;
        const clock = createClock();
        const { network, provider } = createNetwork('offline');
        const handler = createHandler(storage.repository, [], provider, server, clock);
        handler.initialize(() => {});
        await flushPromises();
        expect(handler.getDisabledReason()).toBe('trial-expired');

        network.change('online');
        await flushPromises();
        expect(server.probes).toBe(0);
        expect(handler.getDisabledReason()).toBe('trial-expired');

        network.change('offline');
        clock.advanceMinutes(25);
        network.change('online');
        await flushPromises();

        expect(server.probes).toBe(1);
        expect(handler.getDisabledReason()).toBeNull();
      });

      it('reports the lock when a probe on network recovery gets an answer again', async () => {
        const storage = endedTrialStorage(60);
        storage.store.trialProbeResult = 'no-response';
        const server = createLicenseServer();
        const { network, provider } = createNetwork('offline');
        const handler = createHandler(storage.repository, [], provider, server);
        const reasons: DisabledReason[] = [];
        handler.initialize((reason) => reasons.push(reason));
        await flushPromises();
        expect(handler.getDisabledReason()).toBeNull();

        network.change('online');
        await flushPromises();

        expect(server.probes).toBe(1);
        expect(handler.getDisabledReason()).toBe('trial-expired');
        expect(reasons).toEqual(['trial-expired']);
      });
    });
  });

  it('warns after initialize once a probe answers for a threshold reached earlier', async () => {
    const storage = createTrialStorage('trial', trialPeriod(27, '2026-06-15'));
    const warnings: string[] = [];
    const handler = createHandler(storage.repository, warnings);

    handler.initialize(() => {});
    await flushPromises();

    expect(storage.savedTrialPeriods).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(storage.store.trialWarningThreshold).toBe(3);
  });

  it('does not warn after initialize while the license server does not answer', async () => {
    const storage = createTrialStorage('trial', trialPeriod(27, '2026-06-15'));
    const server = createLicenseServer();
    server.answers = false;
    const warnings: string[] = [];
    const handler = createHandler(storage.repository, warnings, undefined, server);

    handler.initialize(() => {});
    await flushPromises();

    expect(server.probes).toBe(1);
    expect(warnings).toEqual([]);
    expect(storage.store.trialWarningThreshold).toBe(0);
  });

  it('does not record a trial day on initialize', async () => {
    const storage = createTrialStorage('trial', trialPeriod(5, '2026-06-14'));
    const handler = createHandler(storage.repository);

    handler.initialize(() => {});
    await flushPromises();

    expect(storage.savedTrialPeriods).toEqual([]);
    expect(storage.store.trialPeriod.daysUsed.toNumber()).toBe(5);
  });
});
