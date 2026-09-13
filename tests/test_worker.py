import importlib.util
import json
import os
import tempfile
import time
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "services" / "kimodo" / "worker.py"
SPEC = importlib.util.spec_from_file_location("kimodo_worker", MODULE_PATH)
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


class WorkerCommandTests(unittest.TestCase):
    def test_builds_an_input_folder_command_from_structured_meta(self):
        meta = worker.validate_meta(
            {
                "text": "A person performs one controlled push-up from a high plank.",
                "seed": 42,
            },
            4,
        )
        command = worker.build_command(4, meta, Path("motion"), Path("input"))
        self.assertEqual(command[0], "kimodo_gen")
        self.assertIn("--input_folder", command)
        self.assertIn("input", command)
        self.assertIn("Kimodo-SOMA-RP-v1.1", command)
        self.assertIn("--bvh_standard_tpose", command)
        self.assertNotIn("--seed", command)

    def test_resolves_preset_and_custom_meta_requests(self):
        duration, cache_key, meta = worker.resolve_request(
            {"duration": 4, "variant": "pushup"}
        )
        self.assertEqual(duration, 4.0)
        self.assertEqual(cache_key, "pushup")
        self.assertIn("push-up", meta["text"])

        duration, cache_key, meta = worker.resolve_request(
            {
                "duration": 3.47,
                "cacheKey": "custom-abcdef0123456789",
                "meta": {
                    "text": "A person performs one controlled kettlebell swing from a hip hinge.",
                    "seed": 42,
                    "cfg": {"enabled": True, "text_weight": 2.0, "constraint_weight": 2.0},
                },
            }
        )
        self.assertEqual(duration, 3.5)
        self.assertEqual(cache_key, "custom-abcdef0123456789")
        self.assertTrue(meta["text"].endswith("."))

    def test_rejects_unbounded_or_unknown_requests(self):
        for request in [
            {"duration": 1, "variant": "front-squat"},
            {"duration": 9, "variant": "front-squat"},
            {"duration": 4, "variant": "unknown-move"},
            {"duration": True, "variant": "bodyweight"},
            {"duration": 4, "meta": {"text": "too short"}},
        ]:
            with self.subTest(request=request):
                with self.assertRaises(ValueError):
                    worker.resolve_request(request)

    def test_resolves_supported_single_sample_bvh_names(self):
        with tempfile.TemporaryDirectory() as folder:
            stem = Path(folder) / "motion"
            current = stem.with_suffix(".bvh")
            current.write_text("BVH")
            self.assertEqual(worker.resolve_bvh_output(stem), current)
            current.unlink()
            suffixed = Path(str(stem) + "_00.bvh")
            suffixed.write_text("BVH")
            self.assertEqual(worker.resolve_bvh_output(stem), suffixed)

    def test_quantizes_duration_and_round_trips_disk_cache(self):
        self.assertEqual(worker.quantize_duration(3.47), 3.5)
        self.assertEqual(worker.quantize_duration(2.25), 2.5)
        with tempfile.TemporaryDirectory() as folder:
            previous = os.environ.get("KIMODO_CACHE_DIR")
            os.environ["KIMODO_CACHE_DIR"] = folder
            try:
                self.assertIsNone(worker.read_cached("front-squat", 4))
                worker.write_cached("front-squat", 4, "HIERARCHY")
                self.assertEqual(worker.read_cached("front-squat", 4), "HIERARCHY")
                self.assertTrue(worker.cache_path("front-squat", 4).is_file())
                meta = worker.validate_meta(
                    {"text": "A person performs one controlled front squat demonstration."},
                    4,
                )
                (Path(folder) / "meta.json").write_text(json.dumps(meta))
                self.assertTrue((Path(folder) / "meta.json").is_file())
            finally:
                if previous is None:
                    os.environ.pop("KIMODO_CACHE_DIR", None)
                else:
                    os.environ["KIMODO_CACHE_DIR"] = previous

    def test_finished_jobs_do_not_mark_worker_busy(self):
        worker.jobs.clear()
        now = time.time()
        for index in range(12):
            job_id = f"done-{index}"
            worker.jobs[job_id] = {
                "id": job_id,
                "status": "complete",
                "bvh": "HIERARCHY",
                "created": now - index,
            }
        with worker.lock:
            self.assertFalse(worker.worker_is_busy())
            self.assertLessEqual(
                sum(1 for job in worker.jobs.values() if job["status"] == "complete"),
                worker.MAX_FINISHED_JOBS,
            )
        worker.jobs["active"] = {
            "id": "active",
            "status": "running",
            "created": now,
        }
        with worker.lock:
            self.assertTrue(worker.worker_is_busy())
        worker.jobs.clear()


if __name__ == "__main__":
    unittest.main()
