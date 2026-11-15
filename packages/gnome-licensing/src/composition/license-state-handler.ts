/**
 * LicenseStateHandler
 *
 * Manages license initialization, state tracking, and validity checks.
 * Wraps LicenseOperations so the Controller can ask why the extension is
 * disabled without recomputing the reason itself.
 */

import type { DisabledReason, LicenseState } from '../domain/index.js';
import type { LicenseOperations, TrialWarningOperations } from '../operations/index.js';

declare function log(message: string): void;

export class LicenseStateHandler {
  private disabledReason: DisabledReason | null = null;
  private stopWatchingStoredChanges: (() => void) | null = null;
  private stopWatchingNetworkState: (() => void) | null = null;

  constructor(
    private readonly licenseOperations: LicenseOperations,
    private readonly trialWarningOperations: TrialWarningOperations
  ) {}

  initialize(onBecameInvalid: (reason: DisabledReason) => void): void {
    this.licenseOperations.onStateChange(() => {
      this.disabledReason = this.licenseOperations.getDisabledReason();
      if (this.disabledReason) {
        log(`[LicenseStateHandler] License invalid (${this.disabledReason}), notifying controller`);
        onBecameInvalid(this.disabledReason);
      }
    });

    // The preferences window runs in its own process and writes license
    // changes straight to storage; follow them so activating a license there
    // unlocks the extension without reloading it.
    this.stopWatchingStoredChanges?.();
    this.stopWatchingStoredChanges = this.licenseOperations.watchStoredChanges();

    // Reconnecting ends an exceeded offline grace period, so recompute the
    // cached disabled reason whenever the device comes online. The license
    // server can be asked again then, too.
    this.stopWatchingNetworkState?.();
    this.stopWatchingNetworkState = this.licenseOperations.watchNetworkState(() => {
      this.disabledReason = this.licenseOperations.getDisabledReason();
      this.probeInBackground();
    });

    this.licenseOperations
      .initialize()
      .then(() => {
        this.disabledReason = this.licenseOperations.getDisabledReason();
        if (this.disabledReason) {
          log(`[LicenseStateHandler] License invalid on startup: ${this.disabledReason}`);
        }
        // initialize() may have probed the license server; a warning held
        // back for want of an answer is shown once a probe gets one.
        this.trialWarningOperations.checkAndNotify();
      })
      .catch((e) => {
        log(`[LicenseStateHandler] Initialization failed: ${e}`);
      });
  }

  /**
   * Record that the user used the extension (e.g. opened its main UI or
   * triggered one of its features). When the device is online
   * this records now as the last time it was online. During the trial it also
   * counts today as a usage day (at most once per calendar day) and, when a
   * new day was recorded, warns the user if a pre-expiry threshold was just
   * crossed and the license server answers.
   *
   * Once the trial has ended or reached a warning threshold, it also asks the
   * license server in the background whether it is there, unless it was asked
   * within the last 30 minutes or is being asked already. The use never waits
   * for the answer: when it arrives and changes whether the extension is
   * enabled, the disabled reason is updated and state listeners are notified.
   *
   * Call it before reading getDisabledReason(): the first use after the last
   * trial day ends the trial, and the resulting state change updates the
   * disabled reason synchronously.
   */
  recordUse(): void {
    this.licenseOperations.recordOnlineIfConnected();
    if (this.licenseOperations.recordTrialUsage()) {
      this.trialWarningOperations.checkAndNotify();
    }
    this.probeInBackground();
  }

  /**
   * Ask the license server whether it is there when a probe is due, without
   * waiting for it, and evaluate the pre-expiry warning again once it answers.
   */
  private probeInBackground(): void {
    this.licenseOperations
      .probeLicenseServerIfDue()
      .then((result) => {
        if (result !== null) {
          this.trialWarningOperations.checkAndNotify();
        }
      })
      .catch((e) => {
        log(`[LicenseStateHandler] License server probe failed: ${e}`);
      });
  }

  /**
   * Why the extension is currently disabled, or null when it is enabled.
   */
  getDisabledReason(): DisabledReason | null {
    return this.disabledReason;
  }

  /**
   * The current license state, read fresh from the repository.
   */
  getLicenseState(): LicenseState {
    return this.licenseOperations.getState();
  }

  /**
   * Register an additional listener for license state changes.
   * Listeners are removed by dispose().
   */
  onStateChange(listener: (state: LicenseState) => void): void {
    this.licenseOperations.onStateChange(listener);
  }

  /**
   * Stop following stored license changes and the network state, and remove
   * all state listeners.
   */
  dispose(): void {
    this.stopWatchingStoredChanges?.();
    this.stopWatchingStoredChanges = null;
    this.stopWatchingNetworkState?.();
    this.stopWatchingNetworkState = null;
    this.licenseOperations.clearCallbacks();
  }
}
