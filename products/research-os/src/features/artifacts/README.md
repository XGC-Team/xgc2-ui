# Artifact and experiment-result consumers

These are H-owned views of existing build/experiment authorities, not another
BuildRecord store, scheduler, archive index or knowledge graph. Backend effects
and wire fixtures live in `xgc2-devops/platforms/research-os/internal/artifactrender`
and `internal/experiment/results*.go` (source PR xgc2-devops#39).

## Composition ports

`ArtifactPanel({scope, definition, actions?, onOpenSource, onOpenPDF})` receives
`ArtifactScope {projectId, workspace, artifactId, entryPoint, inputDigests}`.
`inputDigests` must be the common build owner's complete observations of saved
inputs; authors must not type Git commits, hashes or toolchain settings. Parse
the saved source with `parseArtifactDefinition(text, artifactId)`. Source,
optional template/props, and exact dependency versions must all be observed.
The source schema is `xgc.research.artifact/v1`, the same renderer definition,
not a conversion of an old draft or a copy of its authoritative body.

The component reads the existing `/manuscripts/build-records` collection and
projects only matching workspace/artifact/entry records. It retains the original
build inputs, toolchain, requester, log reference and immutable output URLs.
Only actual bounded downloaded bytes with the recorded size and SHA-256 enable
download or native media rendering. Browser media load is separate from metadata
or hash verification. PDF goes to A's existing PDFReader, not a second viewer.

`actions {available, busy, detail, generate, cancel?}` is an adapter to B's single
common lifecycle. It does not implement an endpoint or a local build registry.
Absent/unavailable integration disables generation. Opening this component never
starts a build. Ambiguous submission errors are retained and require ledger
reconciliation rather than automatic retries. Failed/cancelled builds retain
verified partial outputs and older successes. Explicit history selections stay
selected across new completions and changed inputs for the same object.

`onOpenPDF(file)` receives `{buildId, digest, sizeBytes, mediaType, url}`. A can
compose its existing ManuscriptPDF with the current workspace and entry point,
keeping the exact selected build/digest for annotations. `onOpenSource(path)`
opens A's existing editor; it does not pretend to open a historical snapshot.
Rights shown under the current definition are explicitly not historical rights.

`ExperimentResultPanel({scope, canonicalBundle, inspection, onOpenEvidence,
onOpenUse})` receives `{projectId, workspace}`, the ORIGINAL backend
`json.Marshal(ResultBundle)` bytes as a string, and the corresponding
ResultInspection. A pretty-printed/repaired copy does not match bundleDigest and
is rejected. The view checks that the digest, project/workspace, frozen Session,
Run/Attempt and original member/evidence references bind to the receipt. Missing
or partial checks remain visible. `referencesVerified` is never scientific
acceptance, execution success, semantic audit of parameter facts or publication.

`onOpenEvidence` receives the unchanged owner ArtifactRef projection; resolve it
through J/N's authorized canonical archive/file port, never arbitrary paths,
legacy IDs, names or timestamps. `onOpenUse` receives direct same-workspace
claim/design/body/artifact evidence edges for F's existing graph. No Start,
control, archive allocation, upload or knowledge-promotion action is present.
Authorization and canonical byte production are required from the existing
server owners; client checks do not replace authorization.

## Shared-owner integration and cleanup gate

A owns App/store/router/PDFReader composition, B owns the saved-input provider,
generic generate/cancel/capability/CAS/ledger and FilesPage, G owns the shared
draft/workflow composition, J/K/N own canonical Record exports, and F owns graph
persistence. These shared files are intentionally not changed here. This module
is not an end-to-end enabled feature until those owners register the ports.

In that same composition batch, replace H's draft-only end state rather than
retaining a second artifact implementation. The fixed baseline's DraftsPage
prints `copy.boundary` and `copy.draft` globally; draft-copy's boundary states
that no paper/video generation exists. Remove that blanket statement from the
wired artifact/result view and replace old tests that require that end state
with the real build/history/byte/receipt assertions. Keep the statement where
it still accurately describes an unexecuted definition editor. Do not delete
`research-drafts.json`, original sources, paper/workflow/RSS definitions or G/F
controls merely to remove that copy. Before wiring, changing labels alone would
be a false completion claim.

B/A also need to expose only the validated `*.artifact.json` entry in project
materials: the baseline material filter excludes JSON. Do not broadly expose all
configuration JSON or duplicate the shared file selector. Old Git guards belong
to B's deletion batch. This change adds no compatibility alias or old schema
reader and does not claim those shared deletions have already happened.

## Targeted validation

With the project's required Node 22.13+ (Node 22 needs the strip-types flag):

```sh
node --experimental-strip-types --test tests/artifact-results.node-test.mjs
```

Eight tests run without external fixtures; the ninth is explicitly skipped, not
counted as a wire integration pass. To exercise actual Go-produced wire bytes,
first run the backend test with an absolute temporary destination:

```sh
RESEARCH_RESULT_WIRE_EVIDENCE=/absolute/private/result-wire.json \
  go test -count=1 ./internal/experiment -run TestResultConsumerWireBytes
```

Then in this product:

```sh
RESEARCH_RESULT_WIRE_EVIDENCE=/absolute/private/result-wire.json \
  node --experimental-strip-types --test tests/artifact-results.node-test.mjs
```

That file contains only synthetic test facts. These Node tests exercise the
actual TypeScript projection functions without installing packages or rewriting
the shared lockfile. They are additional targeted tests, not replacements for
Vitest, full React typechecking, application build or browser acceptance. The
shared pipeline owner should add this explicit command to its coordinated gate;
the `.node-test.mjs` filename does not silently pretend to run under Vitest.
