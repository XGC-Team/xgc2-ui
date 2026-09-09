#!/usr/bin/env python3
"""Materialize an owned frontend for a product build without overwriting local edits."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

EXCLUDED = {'node_modules', 'dist', 'coverage', 'test-results', 'playwright-report', '.git', '__pycache__'}
RECEIPT = '.xgc-frontend-source.json'


def inventory(root):
    result = {}
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if any(part in EXCLUDED for part in relative.parts) or path.name == RECEIPT or path.name.endswith('.tsbuildinfo'):
            continue
        if path.is_symlink():
            raise ValueError(f'frontend source must not contain symlinks: {path}')
        if path.is_file():
            result[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def synchronize(source, target, *, adopt=False, check=False):
    source, target = source.resolve(), target.resolve()
    if source == target or source in target.parents or target in source.parents:
        raise ValueError('source and build directory must be separate')
    desired = inventory(source)
    if 'package.json' not in desired:
        raise ValueError(f'frontend package unavailable: {source}')
    receipt = target / RECEIPT
    previous = json.loads(receipt.read_text())['files'] if receipt.exists() else {}
    actual = inventory(target) if target.exists() else {}
    if not previous and actual:
        if not adopt or actual != desired:
            changed = sorted(name for name in actual.keys() | desired.keys() if actual.get(name) != desired.get(name))
            raise ValueError('unmanaged frontend; adoption requires byte-identical source: ' + ', '.join(changed[:12]))
    elif previous and actual != previous:
        changed = sorted(name for name in actual.keys() | previous.keys() if actual.get(name) != previous.get(name))
        raise ValueError('build copy has local edits; preserve them in the UI owner before syncing: ' + ', '.join(changed[:12]))
    if check:
        if actual != desired or not receipt.exists():
            raise ValueError('frontend build copy is stale; run prepare-web.py')
        return
    # Validate all files first. Stage source bytes before touching the build tree.
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.frontend-stage-', dir=target.parent) as temporary:
        stage = Path(temporary)
        for name in desired:
            dest = stage / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / name, dest)
        if inventory(stage) != desired or inventory(source) != desired:
            raise ValueError('frontend source changed during preparation; retry after writers finish')
        if (inventory(target) if target.exists() else {}) != actual:
            raise ValueError('build copy changed during preparation; no files replaced')
        for name in previous.keys() - desired.keys():
            (target / name).unlink()
        for name, digest in desired.items():
            if actual.get(name) == digest:
                continue
            dest = target / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            (stage / name).replace(dest)
        target.mkdir(parents=True, exist_ok=True)
        record = {'schemaVersion': 'xgc.frontend-build-copy/v1', 'owner': 'XGC-Team/xgc2-ui',
                  'product': source.name, 'files': desired}
        staged_receipt = stage / RECEIPT
        staged_receipt.write_text(json.dumps(record, sort_keys=True, indent=2) + '\n')
        staged_receipt.replace(receipt)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--product', choices=['xgc2', 'research-os'], required=True)
    parser.add_argument('--target', type=Path, required=True)
    parser.add_argument('--adopt', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        synchronize(Path(__file__).resolve().parent.parent / 'products' / args.product,
                    args.target, adopt=args.adopt, check=args.check)
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f'frontend: {error}\n')
    print(f'frontend: {args.product} build copy verified')


if __name__ == '__main__':
    main()
