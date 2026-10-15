"""Product commands execute in their authoritative source tree."""
import os
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT = Path(__file__).with_name("product-frontend.py")


class ProductFrontendTests(unittest.TestCase):
    def test_xgc2_build_and_test_preserve_product_source(self):
        with tempfile.TemporaryDirectory() as directory:
            product = Path(directory)
            (product / "core-xgc").mkdir()
            (product / "core-xgc/go.mod").write_text("module fixture\n")
            (product / "web").mkdir()
            source = product / "web/local-edit.tsx"
            source.write_text("preserve product edit")
            for action, command in (("build", "build"), ("test", "test:unit"), ("typecheck", "typecheck")):
                with self.subTest(action=action), mock.patch.dict(os.environ, {"XGC2_PRODUCT_ROOT": str(product)}), mock.patch.object(sys, "argv", [str(SCRIPT), "xgc2", action]), mock.patch("subprocess.run") as run:
                    run.return_value.returncode = 0
                    with self.assertRaises(SystemExit) as stopped:
                        runpy.run_path(str(SCRIPT), run_name="__main__")
                    self.assertEqual(stopped.exception.code, 0)
                    run.assert_called_once_with(["npm", "run", command], cwd=product / "web")
                    self.assertEqual(source.read_text(), "preserve product edit")

    def test_sync_cli_rejects_removed_xgc2_source(self):
        with mock.patch.object(sys, "argv", ["sync-product-frontend.py", "--product", "xgc2", "--target", "/unused"]):
            with self.assertRaises(SystemExit) as stopped:
                runpy.run_path(str(SCRIPT.with_name("sync-product-frontend.py")), run_name="__main__")
            self.assertEqual(stopped.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
