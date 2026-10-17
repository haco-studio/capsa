# capsa

TypeScript libraries published as `@haco-studio/*` packages on GitHub Packages.

## Status

Early development. No package has been published yet. Packages stay at `0.x` while their APIs settle, and a `0.x` release may break compatibility.

## Getting started

The packages are served from GitHub Packages, which requires a token with the `read:packages` scope even for public packages. Point the `@haco-studio` scope at it in your project's `.npmrc`:

```
@haco-studio:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then install a package with `npm install @haco-studio/<package>`.

## Documentation

- [Publishing a package](docs/guides/publishing.md): how to publish a package to GitHub Packages with the Publish workflow.
