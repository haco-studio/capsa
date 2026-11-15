---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: null
max_refine_rounds: 3
retries_remaining: 1
check_command: "npm run build && npm run check:strict && npm run test:run && grep -q '\"version\": \"0.1.0-next.1\"' packages/gnome-licensing/package.json && grep -q '\"version\": \"0.1.0-next.1\"' package-lock.json"
assignee: null
branch: task/1116-0310-license-gate-only-when-server-answers
created_at: 2026-11-15T18:04:00Z
updated_at: 2026-11-15T18:17:00Z
---

# fix(gnome-licensing): lock and warn only while the license server answers

## Overview

`@haco-studio/gnome-licensing` gates a GNOME Shell extension behind a trial
of 30 days of use. The gate is a reminder, not enforcement: it should lock
the extension or urge a purchase only when the user can act on it right
away, that is, only while the license server answers. The current
behaviour breaks that principle in four ways:

1. **The lock is decided once per `enable()`.** After the trial ends, the
   keyless probe (`LicenseOperations.probeLicenseServer`) runs only from
   `initialize()`, i.e. at login, screen unlock or when the extension is
   enabled. Whether the extension is locked until the next `enable()`
   depends on what the server happened to do at that one moment.
2. **A trial that ends during a session never probes.** When
   `recordTrialUsage()` records the last day, the stored probe result is
   still `none`, and `getDisabledReason()` locks on `none`. The extension
   stays locked until the next `enable()` even if the server never answers.
3. **The pre-expiry warning ignores the server.** `TrialWarningOperations`
   warns at 3 and 1 remaining days whether or not the server answers, so
   while no license server runs it urges the user to buy a license that
   cannot be bought.
4. **The trial is effectively 29 days.** Recording the 30th day of use sets
   `trial-expired` immediately, so the very use that counts day 30 is
   refused.

Change the package to this specification:

- **Counting days** — Days are counted as before (once per calendar day of
  use). Day 30 is usable; the trial ends with the first use on a 31st day.
  The `trial-days-used` key keeps its type, range (0 to 30) and meaning;
  derive "the trial has ended" from the stored data instead (for example,
  30 days used and today is not the last day used), or from the status
  `trial-expired`, rather than widening the key.
- **Lock after the trial** — An ended trial is locked only when the most
  recent probe got an answer from the license server (`answered`). When
  the most recent probe got no response, and when no probe has been made
  yet (`none`), the extension opens. A server outage and a retired server
  are not told apart. The offline grace period still applies as it does
  today to an opened, ended trial.
- **Pre-expiry warning** — A warning whose threshold has been reached is
  shown only when the most recent probe got an answer. Otherwise it is not
  shown and not marked as warned, so it can still be shown later, once a
  probe gets an answer while the threshold still applies (and the trial
  has not ended). Evaluate the warning again after such a probe, not only
  when a new day is recorded.
- **When to probe** — Once the trial has ended, and once a warning
  threshold has been reached, probe the license server in the background
  on each use of the extension (`LicenseStateHandler.recordUse()`) and when
  the network comes back online, as well as on `initialize()`. A probe
  result is fresh for 30 minutes; skip the probe while the stored result is
  fresh, and do not start a second probe while one is in flight. A use
  never waits for the probe: the gate decides from the result already
  stored, and updates the cached disabled reason (and notifies state change
  listeners) when the probe completes and changes the decision.
- **Unchanged** — A valid license, a license the server rejected
  (`expired` / `invalid`), and the 7-day offline grace period behave
  exactly as today.

Storage constraints: do not rename any existing GSettings key or change its
type or meaning; the extension declares these keys in its own schema, so a
change breaks every installed copy. Adding keys is fine (for example the
time of the last probe, as `x` in Unix seconds with default `0`). Every
added key goes into the "GSettings keys" table of the package README, with
type, default and meaning. Decide whether an added key must be in
`LICENSE_STATE_KEYS` of `GSettingsLicenseRepository` and explain the choice
in the comment there, as the existing comment does for the excluded keys.

Documentation: rewrite the README's "Behavior" section to the new rules
(the "Keyless probe after the trial" bullet describes the old one), and
correct the repository README's "Status", which still says no package has
been published (`@haco-studio/gnome-licensing` `0.1.0-next.0` is published
under the `next` dist-tag).

Version: bump `@haco-studio/gnome-licensing` to `0.1.0-next.1` with
`npm version 0.1.0-next.1 --no-git-tag-version --workspace packages/gnome-licensing`
so that `package-lock.json` follows. Do not publish it; publishing is done
by hand after merge.

Tests: cover the specification with unit tests using fakes for the
repository, API client, date provider and network state provider, as the
existing `*.test.ts` files do. At least: day 30 is usable and the first use
on a 31st day ends the trial; an ended trial opens on `none` and on
`no-response` and locks on `answered`; a trial that ends during a session
with no server answer stays open; a probe is started on use and on network
recovery only when the stored result is older than 30 minutes and none is
in flight; a reached warning threshold is not shown without an answer and
is shown after a later probe gets one; valid, rejected and offline-grace
behaviour is unchanged.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] Using the extension on day 30 of the trial is allowed; the first use
      on a 31st day ends the trial (unit tests).
- [x] An ended trial is locked only when the most recent probe answered;
      it opens on `none` and `no-response`, subject to the unchanged offline
      grace period (unit tests).
- [x] A trial that ends during a session while the server does not answer
      leaves the extension open (unit tests).
- [x] Once the trial has ended or a warning threshold is reached, a use and
      a network recovery start a background probe only when the stored
      result is older than 30 minutes and no probe is in flight; a use
      never waits for it (unit tests).
- [x] The pre-expiry warning is shown only when the most recent probe
      answered, and a suppressed warning is shown after a later probe gets
      an answer (unit tests).
- [x] Valid licenses, rejected licenses (`expired` / `invalid`) and the
      offline grace period behave as before (existing and new unit tests).
- [x] `packages/gnome-licensing/package.json` and `package-lock.json` carry
      version `0.1.0-next.1` (gate in `check_command`).

### Before merge (verified outside the check command)

- [x] Reading the diff confirms that no existing GSettings key is renamed or changes type or meaning;
      every added key is listed in the package README's "GSettings keys"
      table.
- [x] The package README's "Behavior" section and the repository README's
      "Status" describe the new behaviour and the published pre-release.
