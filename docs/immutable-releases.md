# Immutable UI releases

The package and policy publishers both execute `scripts/publish-immutable-release.mjs`.
The GitHub workflows accept explicit dispatches only. Creating a tag does not start
a second publisher. `prepare-release.yml` retains the reviewed main-only annotated
tag flow and dispatches the appropriate publisher.

The same executor can publish from a local checkout when hosted compute is unavailable.
Local evidence identifies its executor as `local`; it is not a successful GitHub CI run.
The full frozen install, release delta validation, style policy, type checks, tests,
and all package/gallery builds still run through the existing `pnpm check` command.

## Local execution

1. Finish the React change, matching policy version and exact peer dependency, lock,
   changelogs, Changeset, and release-contract tests. Do not edit published versions.
2. Before pushing source, inspect the actual workflow states and explicitly disable
   `ci.yml` and `ci-bootstrap-gate.yml` when hosted execution is prohibited. Keep those
   workflows disabled until restoring hosted execution is explicitly intended. The
   local publisher checks their states and does not silently disable or dispatch them.
3. Commit and push the reviewed source to `main`. Use the exact 40-character commit
   SHA below. The checkout must be clean, including untracked files, and the source
   must belong to remote `main`.
4. Run package publication before policy publication. Each invocation requires a
new absolute evidence directory outside the source checkout:

```sh
node scripts/publish-immutable-release.mjs \
  --family package --source-sha <exact-source-sha> \
  --evidence-dir /tmp/ui-package-release-evidence --publish

node scripts/publish-immutable-release.mjs \
  --family policy --source-sha <same-exact-source-sha> \
  --evidence-dir /tmp/ui-policy-release-evidence --publish
```

The evidence directory must be readable by the installed `gh` executable. For a
Snap installation, use a non-hidden directory beneath the user's home (for example
`~/Dev/xgc2-ui-release-evidence/`). Snap's private `/tmp` cannot read the host's
`/tmp` files, and its home interface also refuses hidden directories such as
`~/.cache`. Create the parent directory first; each evidence directory itself
must be new.

Omit `--publish` to produce reviewable tarballs and evidence without creating tags
or releases. Publication always runs all checks again; an old receipt never skips
validation. The source remains fixed through validation and packing.

The executor reuses the existing delta validator, packs only changed package assets,
requires the matching immutable React family before policy, and checks each packed
manifest. It records source/tree/tool/lock hashes, command exit codes and output
hashes, asset sizes and SHA256 values. Release notes include the exact source and
validation/asset evidence. Every uploaded asset is downloaded and hashed again.

## Failure handling

Existing release namespaces (including drafts) and asset names are rejected. Tags
must be annotated and resolve to the exact approved source. No operation resets a
tag, deletes a release, or overwrites an asset.

An API failure after tag creation leaves that exact tag intact. If no release or
asset namespace exists, a fresh invocation may reuse the verified tag after running
all checks again. An ambiguous partial release is refused and must be inspected;
the publisher will not delete it or fill it with potentially different assets.
The evidence receipt records whether the local tag was created, its remote identity
was verified, and release creation was attempted.
