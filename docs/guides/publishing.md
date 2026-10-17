# Publishing a package

Packages in `packages/<name>/` are published as `@haco-studio/<name>` to GitHub Packages by the manually triggered [Publish workflow](../../.github/workflows/publish.yml). There is no release process yet; the workflow publishes a package's current version on purpose, for example a pre-release that a consuming project needs.

## Running the workflow

Set the version in `packages/<name>/package.json` and merge it to `main` first. The workflow runs only from `main` and fails on any other ref.

From the Actions tab, open **Publish**, choose **Run workflow**, keep the `main` branch, and enter the directory name under `packages/` (for example `gnome-licensing`).

From the command line:

```
gh workflow run publish.yml --ref main -f package=gnome-licensing
```

The workflow rejects an input that is not a directory under `packages/`, that contains a path separator, or whose `package.json` is private, and refuses a version that is already in the registry; bump the version to publish again. It runs lint, build and tests before publishing.

## Dist-tags

- A pre-release version (one with a `-`, such as `0.1.0-next.0`) is published under the dist-tag `next`.
- Any other version is published under `latest`.

A plain `npm install @haco-studio/<name>` resolves `latest`, so a consuming project installs a pre-release with `npm install @haco-studio/<name>@next` or by its exact version.

## First publication

After a package's first publish, check its visibility in the package settings on GitHub. A new package can start out private; others can install it only once it is public.
