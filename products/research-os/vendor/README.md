# Shared agent runtime artifact

`xgc2-agent-runtime-0.1.0-clipath.tgz` is an unpatched build snapshot of `@xgc2/agent-runtime`, including its upstream license notices. The application consumes the shared conversation renderer and client protocol.

A tarball avoids hot reloads and missing modules when another process rebuilds the shared package. `package-lock.json` pins archive integrity. This is a local build snapshot, not a claim of an upstream release or clean-commit provenance. Upgrade deliberately from the shared package owner and rerun integration checks.

To refresh the snapshot after the shared package changes:

```sh
cd devops/products/common/agent-runtime/web
npm pack            # prepack runs the build; produces xgc2-agent-runtime-<version>.tgz
```

Then copy the archive under `products/research-os/vendor/` (the current snapshot is `xgc2-agent-runtime-0.1.0-clipath.tgz`), update the `file:` dependency in `products/research-os/package.json`, run `npm install` in `products/research-os` to refresh the lockfile integrity hash, and verify with `npm test` and `npm run build`. Reusing a tarball filename does not refresh the lock.

Chinese composer labels (for example thinking-effort names) are applied host-side in `src/features/chat/ChatPage.tsx`, which maps effort IDs per UI locale; the vendored snapshot needs no local patch.

Provider list buttons (`agent-provider-select`) show the name and availability only. A CLI version or commit hash belongs in the right-hand editor (`agent-provider-version`) after that provider is available, on the same line as `agent-provider-login-status`. The empty CLI path hint is the control placeholder, not a second line under the label. Shipping that rule requires a new snapshot and a refreshed lock; editing the shared source alone does not change this app. The current snapshot is `xgc2-agent-runtime-0.1.0-clipath.tgz`.
