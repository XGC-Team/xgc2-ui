# Shared native conversation artifact

`xgc2-native-agent-0.1.0.tgz` is a fixed build snapshot of the existing `devops/products/common/native-agent/web` package, including its upstream license notices. The application consumes the shared conversation renderer and client protocol, not the previous Research page layout.

A tarball avoids hot reloads and missing modules when another process rebuilds the shared package. `package-lock.json` pins archive integrity. This is a local build snapshot, not a claim of an upstream release or clean-commit provenance. Upgrade deliberately from the shared package owner and rerun integration checks.

SHA-256: `69cabab5cdf7d28ea037aaf58b6a948f272f0093898cf22ca9de0d594620f9e0`

The UI currently consumes `xgc2-native-agent-0.1.0-locale.tgz`, a local derivative of that retained snapshot. Run `node scripts/prepare-native-locale.mjs` to reproduce the patch. It adds Chinese/English labels to composer controls that the snapshot leaves in English, using the application's document language. Protocol code and upstream license notices are retained; the live shared package source is not modified.

The local derivative also retains native timestamps on work/plan presentation items so approval history stays in order, and displays `turn/diff/updated` as a diff preview instead of an unfinished execution. Native event reduction, transport and approval option IDs are unchanged. `scripts/check-native-presentation.mjs` covers chronology and distinguishes diff previews from genuinely unconfirmed commands. The Atlas host supplies the shared T3 semantic tokens in `src/index.css`.
