# Shared native conversation artifact

`xgc2-native-agent-0.1.0-thought.tgz` is an unpatched build snapshot of the `devops/products/common/native-agent/web` package, including its upstream license notices. The application consumes the shared conversation renderer and client protocol, not the previous Research page layout.

A tarball avoids hot reloads and missing modules when another process rebuilds the shared package. `package-lock.json` pins archive integrity. This is a local build snapshot, not a claim of an upstream release or clean-commit provenance. Upgrade deliberately from the shared package owner and rerun integration checks.

To refresh the snapshot after the shared package changes:

```sh
cd devops/products/common/native-agent/web
npm pack            # prepack runs the build; produces xgc2-native-agent-<version>.tgz
```

Then copy the archive to a new suffixed name under `products/research-os/vendor/` (the current snapshot is `xgc2-native-agent-0.1.0-thought.tgz`), update the `file:` dependency in `products/research-os/package.json`, run `npm install` in `products/research-os` to refresh the lockfile integrity hash, and verify with `npm test` and `npm run build`. Reusing a tarball filename does not refresh the lock.

Chinese composer labels (for example thinking-effort names) are applied host-side in `src/features/chat/ChatPage.tsx`, which maps effort IDs per UI locale; the vendored snapshot needs no local patch.
