---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: null
max_refine_rounds: 3
retries_remaining: 1
check_command: "npm run build && npm run check:strict && npm run test:run && test -f packages/gnome-licensing/LICENSE && grep -q 'GNU GENERAL PUBLIC LICENSE' packages/gnome-licensing/LICENSE && grep -q '\"name\": \"@haco-studio/gnome-licensing\"' packages/gnome-licensing/package.json && grep -q '\"license\": \"GPL-3.0-or-later\"' packages/gnome-licensing/package.json && grep -q '\"version\": \"0.1.0-next.0\"' packages/gnome-licensing/package.json && test ! -f LICENSE && ! grep -q '^## License' README.md && grep -q 'npm run build' .github/workflows/ci.yml && ! grep -rqiE 'sutto' packages/gnome-licensing/src/"
assignee: null
branch: task/1017-1627-extract-gnome-licensing
created_at: 2026-10-17T16:27:12Z
updated_at: 2026-10-17T16:43:08Z
---

# feat(gnome-licensing): add the license gate client for GNOME Shell extensions

## Overview

Add the first package of this repository, `@haco-studio/gnome-licensing`
in `packages/gnome-licensing/`: the client side of a license gate for
GNOME Shell extensions. Its source is an existing, working client that
lives inside a GNOME Shell extension. Extract it from there into this
package so that more than one extension can use it, generalizing only
what is specific to that extension.

The source to extract from is the public repository
`x7c1/sutto` (https://github.com/x7c1/sutto, GPL-3.0-or-later, same
author). Read it there; do not modify it. The files are:

- `src/domain/licensing/` — license state, trial days, trial period,
  trial warnings, the probe result, license key / activation id / device
  id value objects, the status display, the disabled reason.
- `src/operations/licensing/` — `LicenseOperations`,
  `TrialWarningOperations`, and their ports (`license-api-client.ts`,
  `license-repository.ts`).
- `src/infra/api/` — the HTTP client on libsoup and the request/response
  mapping, including the classification of responses into an
  authoritative answer and no response.
- `src/infra/glib/license-repository.ts`, `network-state-provider.ts`,
  `device-info-provider.ts`, `date-provider.ts` — the GLib/Gio adapters.
- `src/composition/licensing/license-state-handler.ts` — the wrapper an
  extension's controller uses.
- `src/prefs/license-ui.ts` — the license key entry for the preferences
  window (Adw/Gtk).
- The unit tests next to each of these.

The behavior of the gate must not change. In particular, keep: trial by
day of use (30 days), no downgrade on no response (timeout, 5xx, DNS
failure, 404, 410, and 4xx without a known reason code), the offline
limit of 7 days counted from the last time online, the keyless probe of
an expired trial, and the fresh-trial fallback where the source has it.
Port the unit tests that pin these, so they run here under Vitest.

### What to generalize

Anything the source hard-codes for its own extension becomes a parameter
the consuming extension passes in:

- the license API base URL;
- the `Gio.Settings` object the repository reads and writes (the keys
  stay the same names as in the source: document the required keys and
  their types in the package README, so an extension can declare them in
  its own GSettings schema);
- the product name and any user-facing strings that name the extension;
- the purchase link: make it optional; when absent, nothing offers to
  purchase.

Nothing in `packages/gnome-licensing/src/` may name the source
extension (a gate in `check_command` checks this).

### Package shape

- `package.json`: `"name": "@haco-studio/gnome-licensing"`,
  `"version": "0.1.0-next.0"`, `"license": "GPL-3.0-or-later"`,
  `"type": "module"`, `repository` pointing at
  `https://github.com/haco-studio/capsa` with `directory`
  `packages/gnome-licensing`, `publishConfig.registry`
  `https://npm.pkg.github.com`, and an `exports` map.
- Ship compiled ES modules with type declarations (`tsc` into `dist/`,
  extending `../../tsconfig.base.json`); `files` limited to what a
  consumer needs plus `LICENSE` and `README.md`.
- Split entry points by where the code runs, because a GNOME Shell
  extension's preferences run in a separate GTK process that cannot load
  Shell modules, and the Shell process cannot load GTK 4:
  the main entry (`.`) for the domain, operations, the HTTP client and
  the GLib/Gio adapters and the state handler; a `./prefs` entry for the
  Adw/Gtk license UI. Keep `gi://` imports out of modules the domain
  tests import, as the source does.
- `@girs/*` type packages as `peerDependencies` (and `devDependencies`
  for this package's own build), at the versions the source uses.
- `LICENSE`: the GPL-3.0 text (copy the source repository's `LICENSE`).
- `README.md` for the package: what it is, that it is built for the
  author's own extensions and is not supported for other uses, how to
  wire it (entry points, the parameters above, the GSettings keys).

### Repository changes

- Add a `build` script to the root `package.json` that builds every
  workspace, and a Build step back into `.github/workflows/ci.yml`
  between lint and tests.
- Biome, the base tsconfig and Vitest at the root already cover
  `packages/*`; adjust them only if the package needs it.
- The repository root keeps no `LICENSE` and the root `README.md` gets
  no License section (gates in `check_command`). Licenses are per
  package.

Out of scope: publishing the package (a separate workflow does that),
changing the source extension to use this package, and any change to the
license API contract.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `packages/gnome-licensing/package.json` names the package
      `@haco-studio/gnome-licensing` at `0.1.0-next.0` under
      `GPL-3.0-or-later`, and the package carries the GPL-3.0 text in
      `LICENSE`; the repository root has no `LICENSE` and the root README
      has no License section (gates in `check_command`).
- [x] `npm run build` builds the package to ES modules with type
      declarations, and CI runs the build.
- [x] The ported unit tests pass under Vitest and cover: trial days
      counted per day of use up to 30; no downgrade on timeout, 5xx,
      404, 410 and an unknown 4xx; downgrade on each known reason code;
      the 7-day offline limit counted from the last time online; the
      keyless probe of an expired trial opening the gate on no response
      and keeping it closed on an authoritative answer.
- [x] Nothing in `packages/gnome-licensing/src/` names the source
      extension (gate in `check_command`).
