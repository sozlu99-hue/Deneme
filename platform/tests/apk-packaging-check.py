"""Check APK source bundles. Do not read keys, sign files, or start Android."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import copy
import importlib.util
import json
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("aesd_apk_builder", ROOT / "build-apks.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ApkPackagingChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.owner = builder.collect_assets("owner", "AESD Sahip")
        cls.customer = builder.collect_assets("customer", "AESD")
        cls.unified = builder.collect_assets("all", "AESD")
        cls.sources = builder.source_hashes()
        cls.now = datetime(2026, 10, 9, 9, 0, tzinfo=timezone.utc)
        cls.commit = "a" * 40

    def evidence(self, **changes):
        result = {
            "status": "live",
            "commit": self.commit,
            "checkedAt": self.now.isoformat(),
            "sourceHashes": self.sources,
            "apiOrigin": json.loads((ROOT / "web/config.json").read_text())["apiOrigin"],
            "deployId": "isolated-deployment-test",
            "productionHttpTested": False,
        }
        result.update(changes)
        return result

    def status(self, value):
        with tempfile.TemporaryDirectory(prefix="aesd-apk-evidence-") as folder:
            path = Path(folder) / "deployment.json"
            path.write_text(json.dumps(value))
            return builder.backend_status(path, self.commit, self.sources, self.now)

    def test_owner_bundle_has_staff_controls_and_complete_dependencies(self):
        result = builder.validate_assets(self.owner, "owner")
        self.assertTrue(result["closedLocalDependencies"])
        self.assertTrue(result["staffEntryBundled"])
        self.assertTrue(result["leasePublicKeyPreserved"])
        self.assertIn("private-pos.html", self.owner)
        self.assertIn("staff-checkout.js", self.owner)

    def test_customer_bundle_excludes_owner_and_staff_sources(self):
        result = builder.validate_assets(self.customer, "customer")
        self.assertFalse(result["privateSourceIncluded"])
        self.assertFalse(result["staffEntryBundled"])
        self.assertFalse(set(self.customer).intersection(builder.OWNER_ASSETS))
        self.assertNotIn("private-pos.html", self.customer)

    def test_unified_bundle_uses_server_roles_and_fetches_private_html_after_auth(self):
        result = builder.validate_assets(self.unified, "all")
        self.assertTrue(result["ownerDeviceControlsEnabled"])
        self.assertTrue(result["staffEntryBundled"])
        self.assertFalse(result["privateSourceIncluded"])
        self.assertNotIn("private-pos.html", self.unified)
        config = json.loads(self.unified["config.json"])
        self.assertEqual(config["audience"], "all")
        self.assertTrue(config["nativeApp"])

    def test_unified_build_preserves_existing_installation_and_drops_second_distribution(self):
        self.assertEqual(len(builder.PANELS), 1)
        audience, package, label, filename = builder.PANELS[0]
        self.assertEqual((audience, package, label), ("all", "com.oses.pos", "AESD"))
        self.assertEqual(filename, f"AESD-v{builder.VERSION_NAME}.apk")
        self.assertRegex(builder.VERSION_NAME, r"^\d+\.\d+\.\d+$")
        self.assertGreaterEqual(builder.VERSION_CODE, 161)

    def test_private_html_in_unified_bundle_blocks_build(self):
        with self.assertRaisesRegex(ValueError, "fetch private HTML"):
            builder.validate_assets(self.unified | {"private-pos.html": self.owner["private-pos.html"]}, "all")

    def test_missing_transitive_module_blocks_build(self):
        files = self.owner | {"staff-checkout.js": b"import './missing-checkout-module.js';"}
        with self.assertRaisesRegex(ValueError, "local asset is missing"):
            builder.validate_assets(files, "owner")

    def test_missing_product_photo_blocks_build(self):
        files = copy.copy(self.owner)
        del files["private-products-20261008.png"]
        with self.assertRaisesRegex(ValueError, "local asset is missing"):
            builder.validate_assets(files, "owner")

    def test_private_owner_html_in_customer_bundle_blocks_build(self):
        files = self.customer | {"private-pos.html": self.owner["private-pos.html"]}
        with self.assertRaisesRegex(ValueError, "customer APK includes"):
            builder.validate_assets(files, "customer")

    def test_private_key_marker_blocks_build(self):
        files = self.owner | {"staff-checkout.js": b"// BEGIN PRIVATE KEY"}
        with self.assertRaisesRegex(ValueError, "private-data marker"):
            builder.validate_assets(files, "owner")

    def test_changed_lease_key_blocks_build(self):
        config = json.loads(self.owner["config.json"])
        config["publicKey"] = "changed-public-key"
        with self.assertRaisesRegex(ValueError, "public key has changed"):
            builder.validate_assets(self.owner | {"config.json": json.dumps(config).encode()}, "owner")

    def test_path_traversal_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "leaves the public directory"):
            builder.local_asset("staff.html", "../private-release/key.jks")

    def test_no_evidence_does_not_claim_current_backend(self):
        result = builder.backend_status(None, None, self.sources, self.now)
        self.assertFalse(result["production_backend_deployed"])
        self.assertFalse(result["backendCurrent"])

    def test_old_health_record_does_not_claim_current_backend(self):
        result = self.status({"platformReady": True, "commit": self.commit})
        self.assertFalse(result["production_backend_deployed"])

    def test_stale_deployment_record_does_not_claim_current_backend(self):
        result = self.status(self.evidence(checkedAt=(self.now - timedelta(hours=3)).isoformat()))
        self.assertFalse(result["backendCurrent"])

    def test_different_live_commit_does_not_claim_current_backend(self):
        result = self.status(self.evidence(commit="b" * 40))
        self.assertFalse(result["backendCurrent"])

    def test_source_changed_after_deployment_does_not_claim_current_backend(self):
        changed = self.sources | {"web/app.js": "mismatched-source"}
        result = self.status(self.evidence(sourceHashes=changed))
        self.assertFalse(result["backendCurrent"])

    def test_unrelated_server_does_not_claim_current_backend(self):
        result = self.status(self.evidence(apiOrigin="https://unrelated.example"))
        self.assertFalse(result["backendCurrent"])

    def test_matching_fresh_deployment_keeps_http_check_separate(self):
        result = self.status(self.evidence())
        self.assertTrue(result["backendCurrent"])
        self.assertEqual(result["backendCommit"], self.commit)
        self.assertFalse(result["productionHttpTested"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
