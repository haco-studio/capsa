---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: null
max_refine_rounds: 3
retries_remaining: 1
check_command: "npm run build && npm run check:strict && npm run test:run && test -f .github/workflows/publish.yml && grep -q 'workflow_dispatch' .github/workflows/publish.yml && grep -q 'packages: write' .github/workflows/publish.yml && ! grep -q 'packages: write' .github/workflows/ci.yml"
assignee: null
branch: task/1017-1650-publish-workflow
created_at: 2026-10-17T16:44:00Z
updated_at: 2026-10-17T16:50:04Z
---

# ci: add a manually triggered workflow that publishes one package to GitHub Packages

## Overview

Packages in `packages/<name>/` are published as `@haco-studio/<name>` to
GitHub Packages (`https://npm.pkg.github.com`). There is no release
process yet. Add a minimal, manually triggered workflow so a package's
current version can be published on purpose, for example a pre-release
that a consuming project needs before a release process exists.

`.github/workflows/publish.yml`:

- Triggered only by `workflow_dispatch`, with a required `package` input
  (the directory name under `packages/`, e.g. `gnome-licensing`).
- Runs only from the default branch: fail early when the ref is not
  `main`, so nothing unreviewed is published.
- Workflow-level `permissions: contents: read`; the publishing job adds
  `packages: write`. No other token or secret: `GITHUB_TOKEN` publishes
  to GitHub Packages.
- Checks out with `persist-credentials: false`, sets up Node 24 with
  `registry-url: https://npm.pkg.github.com` and `scope: '@haco-studio'`
  (pin actions by commit SHA as `ci.yml` does), runs `npm ci`, lint, build
  and tests, then publishes that one workspace
  (`npm publish --workspace packages/<name>`).
- Validates the input: the directory must exist under `packages/` and its
  `package.json` must not be private. Reject anything else, including
  path separators in the input.
- Publishes a pre-release version (one with a `-` in it) under the npm
  dist-tag `next`, and any other version under `latest`.
- Refuses to publish a version that is already in the registry, with a
  clear message (`npm view` the exact version first).

Document how to run it in a short `docs/guides/publishing.md` (how to
trigger it from the Actions tab or `gh workflow run`, the dist-tag rule,
and that a package published for the first time is private on GitHub
Packages until its visibility is changed in the package settings), and
link the guide from the README's documentation section (add one if
there is none). Keep it free of any reference to private repositories.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `.github/workflows/publish.yml` exists, is triggered by
      `workflow_dispatch`, and grants `packages: write` (gates in
      `check_command`).

### Before merge (verified outside the check command)

- [ ] Reading the workflow confirms: it refuses a ref other than `main`;
      it rejects a `package` input that is not a directory under
      `packages/` or that contains a path separator; `packages: write` is
      granted only to the publishing job; pre-releases go to `next`; an
      already published version is refused.
- [ ] `actionlint` (if available locally) reports no problem in
      `publish.yml`.
