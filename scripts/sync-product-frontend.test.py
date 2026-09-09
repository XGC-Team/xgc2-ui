import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('frontend_sync', Path(__file__).with_name('sync-product-frontend.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class FrontendSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / 'owner'
        self.target = Path(self.temp.name) / 'product/web'
        self.source.mkdir()
        (self.source / 'package.json').write_text('{}')
        (self.source / 'App.tsx').write_text('original')

    def test_materializes_and_updates_only_owned_unchanged_files(self):
        sync.synchronize(self.source, self.target)
        (self.target / 'node_modules').mkdir()
        (self.target / 'node_modules/keep').write_text('dependency')
        (self.source / 'App.tsx').write_text('updated')
        sync.synchronize(self.source, self.target)
        self.assertEqual((self.target / 'App.tsx').read_text(), 'updated')
        self.assertEqual((self.target / 'node_modules/keep').read_text(), 'dependency')
        sync.synchronize(self.source, self.target, check=True)

    def test_refuses_to_overwrite_another_writers_changes(self):
        sync.synchronize(self.source, self.target)
        (self.target / 'App.tsx').write_text('uncommitted work')
        (self.source / 'App.tsx').write_text('new owner work')
        with self.assertRaisesRegex(ValueError, 'local edits'):
            sync.synchronize(self.source, self.target)
        self.assertEqual((self.target / 'App.tsx').read_text(), 'uncommitted work')

    def test_adoption_requires_byte_identical_full_inventory(self):
        self.target.mkdir(parents=True)
        (self.target / 'package.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'byte-identical'):
            sync.synchronize(self.source, self.target, adopt=True)
        (self.target / 'App.tsx').write_text('original')
        sync.synchronize(self.source, self.target, adopt=True)

    def test_stale_check_is_read_only_and_removed_source_is_retired(self):
        sync.synchronize(self.source, self.target)
        (self.source / 'App.tsx').unlink()
        with self.assertRaisesRegex(ValueError, 'stale'):
            sync.synchronize(self.source, self.target, check=True)
        self.assertTrue((self.target / 'App.tsx').exists())
        sync.synchronize(self.source, self.target)
        self.assertFalse((self.target / 'App.tsx').exists())

    def test_rejects_overlapping_source_and_target(self):
        with self.assertRaisesRegex(ValueError, 'separate'):
            sync.synchronize(self.source, self.source / 'copy')


if __name__ == '__main__':
    unittest.main()
