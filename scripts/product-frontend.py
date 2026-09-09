#!/usr/bin/env python3
"""Run each product frontend with its own dependency lock and build context."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

owner = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('product', choices=['xgc2', 'research-os'])
parser.add_argument('action', choices=['build', 'test', 'typecheck', 'install'])
args = parser.parse_args()
if args.product == 'xgc2':
    backend = Path(os.environ.get('XGC2_PRODUCT_ROOT', str(owner.parent.parent / 'xgc2'))).resolve()
    if not (backend / 'core-xgc/go.mod').is_file():
        parser.exit(1, 'Set XGC2_PRODUCT_ROOT to the XGC2 backend checkout\n')
    target = backend / 'web'
    prepared = subprocess.run([sys.executable, str(owner / 'scripts/sync-product-frontend.py'),
                               '--product', 'xgc2', '--target', str(target)])
    if prepared.returncode:
        raise SystemExit(prepared.returncode)
    if args.action == 'install':
        subprocess.run([sys.executable, str(backend / 'scripts/prepare-native-agent.py')], check=True)
        command = [sys.executable, str(backend / 'scripts/ensure-web-dependencies.py')]
    else:
        command = ['npm', 'run', 'test:unit' if args.action == 'test' else args.action]
else:
    target = owner / 'products/research-os'
    command = ['npm', 'ci'] if args.action == 'install' else ['npm', 'run', args.action]
raise SystemExit(subprocess.run(command, cwd=target).returncode)
