"""Single-process, authenticated Kimodo job worker. Run beside a configured kimodo_gen CLI."""
import hashlib
import json
import math
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# The NVIDIA checkout lives at ./kimodo next to this worker. That directory is the
# repo root, not the installed package, and it shadows `import kimodo` whenever the
# worker's directory is on sys.path — which forces the slow kimodo_gen CLI path.
_ROOT = Path(__file__).resolve().parent
_CHECKOUT = (_ROOT / "kimodo").resolve()
_cleaned_path = []
for _entry in sys.path:
    try:
        _resolved = Path(_entry or ".").resolve()
    except OSError:
        _cleaned_path.append(_entry)
        continue
    if _resolved in (_ROOT, _CHECKOUT):
        continue
    _cleaned_path.append(_entry)
sys.path[:] = _cleaned_path

MODEL = "Kimodo-SOMA-RP-v1.1"
SEED = 42
PRESET_PROMPTS = {
    "bodyweight": "A person performs one controlled bodyweight squat, starting upright, lowering into a squat and returning to standing.",
    "front-squat": "A person performs one controlled front squat with hands held at the front shoulders, starting upright, lowering into a squat and returning to standing.",
    "pushup": "A person performs one deep push-up on the floor, starting in a straight-arm plank with hands under the shoulders, bending both elbows until the chest nearly touches the floor, then pressing back up until the arms straighten.",
    "lunge": "A person performs one controlled reverse lunge, stepping one foot back, bending both knees, then returning to stand.",
    "deadlift": "A person performs one controlled conventional deadlift, hinging to grip a barbell, standing tall, then lowering with control.",
    "plank": "A person performs one plank up-down on the floor, starting in a straight-arm plank, dropping to both forearms into a forearm plank, then pressing back up to straight arms.",
    "overhead-press": "A person performs one controlled overhead press, lifting a barbell from the shoulders to lockout overhead, then lowering it.",
    "jumping-jack": "A person performs one athletic jumping jack, jumping the feet wide while raising the arms overhead, then returning to stand.",
}
CACHE_KEY_RE = re.compile(r"^(?:[a-z0-9-]+|custom-[a-f0-9]{16})$")
# Finished jobs stay briefly so the UI can poll BVH; they must not trip "busy".
FINISHED_JOB_TTL_SEC = 120
STALE_ACTIVE_JOB_SEC = 600
MAX_FINISHED_JOBS = 8
jobs = {}
lock = threading.Lock()
executor = ThreadPoolExecutor(max_workers=1)
runtime = {"model": None, "resolved": None, "device": None}
runtime_lock = threading.Lock()


def prune_jobs(now=None):
    """Drop finished jobs and fail stuck active ones. Caller must hold `lock`."""
    now = time.time() if now is None else now
    for key, value in list(jobs.items()):
        status = value.get("status")
        age = now - value.get("created", now)
        if status in ("queued", "running") and age > STALE_ACTIVE_JOB_SEC:
            jobs[key].update(
                status="failed",
                error="Generation timed out on the worker. Try again.",
            )
    finished = sorted(
        (
            (key, value.get("created", now))
            for key, value in jobs.items()
            if value.get("status") in ("complete", "failed")
        ),
        key=lambda item: item[1],
    )
    for key, created in finished:
        if now - created > FINISHED_JOB_TTL_SEC:
            del jobs[key]
    finished = sorted(
        (
            (key, value.get("created", now))
            for key, value in jobs.items()
            if value.get("status") in ("complete", "failed")
        ),
        key=lambda item: item[1],
    )
    overflow = len(finished) - MAX_FINISHED_JOBS
    for key, _ in finished[: max(0, overflow)]:
        del jobs[key]


def worker_is_busy():
    """True only while a live generation occupies the single GPU slot."""
    prune_jobs()
    return any(job.get("status") in ("queued", "running") for job in jobs.values())


def quantize_duration(duration):
    if isinstance(duration, bool) or not isinstance(duration, (int, float)):
        raise ValueError("Invalid motion request")
    stepped = math.floor(float(duration) * 2 + 0.5) / 2
    return min(8.0, max(2.0, stepped))


def sanitize_cache_key(value, text):
    if isinstance(value, str) and CACHE_KEY_RE.fullmatch(value):
        return value
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
    return f"custom-{digest}"


def validate_meta(meta, duration):
    if not isinstance(meta, dict):
        raise ValueError("Invalid motion meta")
    text = meta.get("text")
    if not isinstance(text, str):
        raise ValueError("Invalid motion meta text")
    cleaned = " ".join(text.strip().split())
    if not 24 <= len(cleaned) <= 500:
        raise ValueError("Invalid motion meta text length")
    payload = {
        "text": cleaned if cleaned.endswith(".") else cleaned + ".",
        "duration": float(duration),
        "num_samples": 1,
        "seed": int(meta.get("seed", SEED)),
        "diffusion_steps": int(meta.get("diffusion_steps", os.environ.get("KIMODO_DIFFUSION_STEPS", "30"))),
        "cfg": {
            "enabled": True,
            "text_weight": 2.0,
            "constraint_weight": 2.0,
        },
    }
    if isinstance(meta.get("cfg"), dict):
        cfg = meta["cfg"]
        payload["cfg"]["enabled"] = bool(cfg.get("enabled", True))
        payload["cfg"]["text_weight"] = float(cfg.get("text_weight", 2.0))
        payload["cfg"]["constraint_weight"] = float(cfg.get("constraint_weight", 2.0))
    if isinstance(meta.get("spotter"), dict):
        payload["spotter"] = meta["spotter"]
    return payload


def resolve_request(request):
    if isinstance(request.get("duration"), bool) or not isinstance(request.get("duration"), (int, float)):
        raise ValueError("Invalid motion request")
    raw_duration = float(request["duration"])
    if not 2 <= raw_duration <= 8:
        raise ValueError("Invalid motion request")
    duration = quantize_duration(raw_duration)
    if "meta" in request and request["meta"] is not None:
        meta = validate_meta(request["meta"], duration)
        cache_key = sanitize_cache_key(request.get("cacheKey") or request.get("variant"), meta["text"])
        return duration, cache_key, meta
    variant = request.get("variant")
    if variant not in PRESET_PROMPTS:
        raise ValueError("Invalid motion request")
    meta = validate_meta({"text": PRESET_PROMPTS[variant], "seed": SEED}, duration)
    return duration, variant, meta


def build_command(duration, meta, output, input_folder):
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not 2 <= duration <= 8:
        raise ValueError("Invalid motion request")
    validate_meta(meta, duration)
    return [
        "kimodo_gen",
        "--input_folder",
        str(input_folder),
        "--model",
        MODEL,
        "--bvh",
        "--bvh_standard_tpose",
        "--output",
        str(output),
    ]


def resolve_bvh_output(stem):
    """Support the single-sample names emitted by current and earlier CLIs."""
    candidates = [stem.with_suffix(".bvh"), Path(str(stem) + "_00.bvh")]
    existing = [path for path in candidates if path.is_file()]
    if len(existing) != 1:
        raise OSError("Kimodo did not produce exactly one BVH file")
    return existing[0]


def cache_dir():
    return Path(os.environ.get("KIMODO_CACHE_DIR", Path(__file__).resolve().parent / "cache"))


def cache_path(cache_key, duration):
    return cache_dir() / f"{MODEL}-{SEED}-{cache_key}-{quantize_duration(duration):.1f}.bvh"


def read_cached(cache_key, duration):
    path = cache_path(cache_key, duration)
    if path.is_file() and 0 < path.stat().st_size <= 2_000_000:
        return path.read_text()
    return None


def write_cached(cache_key, duration, bvh):
    path = cache_path(cache_key, duration)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(bvh)


def generation_env():
    env = os.environ.copy()
    env.setdefault("LOCAL_CACHE", "true")
    env.setdefault("TEXT_ENCODER_MODE", "api")
    env.setdefault("TEXT_ENCODER_URL", env.get("TEXT_ENCODER_URL", "http://127.0.0.1:9550/"))
    return env


def prepare_generation_env():
    os.environ.setdefault("LOCAL_CACHE", "true")
    os.environ.setdefault("TEXT_ENCODER_MODE", "api")
    os.environ.setdefault("TEXT_ENCODER_URL", os.environ.get("TEXT_ENCODER_URL", "http://127.0.0.1:9550/"))


def ensure_model():
    with runtime_lock:
        if runtime["model"] is not None:
            return runtime["model"], runtime["resolved"], runtime["device"]
        prepare_generation_env()
        # Drop any shadowed/partial kimodo import from an earlier failed attempt.
        for name in list(sys.modules):
            if name == "kimodo" or name.startswith("kimodo."):
                del sys.modules[name]
        import torch
        from kimodo import load_model
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        model, resolved = load_model(MODEL, device=device, default_family="Kimodo", return_resolved_name=True)
        runtime.update(model=model, resolved=resolved, device=device)
        return model, resolved, device


def generate_inprocess(duration, meta):
    import torch
    from kimodo.exports.bvh import save_motion_bvh
    from kimodo.skeleton import SOMASkeleton30, global_rots_to_local_rots
    from kimodo.tools import seed_everything

    started = time.time()
    model, resolved, device = ensure_model()
    seed_everything(int(meta.get("seed", SEED)))
    prompt = meta["text"]
    if not prompt.endswith("."):
        prompt += "."
    fps = float(model.fps)
    steps = int(meta.get("diffusion_steps", os.environ.get("KIMODO_DIFFUSION_STEPS", "30")))
    cfg = meta.get("cfg") or {}
    cfg_kwargs = {}
    if cfg.get("enabled", True):
        cfg_kwargs = {
            "cfg_type": "separated",
            "cfg_weight": [
                float(cfg.get("text_weight", 2.0)),
                float(cfg.get("constraint_weight", 2.0)),
            ],
        }
    else:
        cfg_kwargs = {"cfg_type": "nocfg"}
    output = model(
        [prompt],
        [max(2, int(round(duration * fps)))],
        constraint_lst=[],
        num_denoising_steps=steps,
        num_samples=1,
        multi_prompt=True,
        post_processing="g1" not in str(resolved),
        return_numpy=True,
        **cfg_kwargs,
    )
    skeleton = model.skeleton
    if isinstance(skeleton, SOMASkeleton30):
        skeleton = skeleton.somaskel77.to(device)
    joints_pos = torch.from_numpy(output["posed_joints"][0]).to(device)
    joints_rot = torch.from_numpy(output["global_rot_mats"][0]).to(device)
    local_rot_mats = global_rots_to_local_rots(joints_rot, skeleton)
    root_positions = joints_pos[:, skeleton.root_idx, :]
    with tempfile.NamedTemporaryFile(suffix=".bvh", delete=False) as tmp:
        path = Path(tmp.name)
    try:
        save_motion_bvh(path, local_rot_mats, root_positions, skeleton=skeleton, fps=fps, standard_tpose=True)
        bvh = path.read_text()
    finally:
        path.unlink(missing_ok=True)
    print(
        f"in-process Kimodo ok steps={steps} duration={duration}s elapsed={time.time() - started:.2f}s",
        flush=True,
    )
    return bvh


def generate_cli(duration, meta):
    with tempfile.TemporaryDirectory(prefix="spotter-motion-") as folder:
        root = Path(folder)
        input_folder = root / "input"
        input_folder.mkdir()
        (input_folder / "meta.json").write_text(json.dumps(meta))
        stem = root / "motion"
        subprocess.run(
            build_command(duration, meta, stem, input_folder),
            check=True,
            capture_output=True,
            timeout=240,
            env=generation_env(),
        )
        output = resolve_bvh_output(stem)
        if output.stat().st_size > 2_000_000:
            raise ValueError("Output too large")
        return output.read_text()


def generate(job_id, duration, cache_key, meta):
    duration = quantize_duration(duration)
    with lock:
        jobs[job_id]["status"] = "running"
    try:
        bvh = read_cached(cache_key, duration)
        cached = bvh is not None
        if not cached:
            # Warm in-process is ~2–5s. CLI reloads the checkpoint (~2 min) and
            # must not silently reclaim jobs once the model is resident.
            if runtime["model"] is not None:
                bvh = generate_inprocess(duration, meta)
            else:
                try:
                    bvh = generate_inprocess(duration, meta)
                except Exception as error:
                    print(
                        f"in-process Kimodo failed, using CLI: {type(error).__name__}: {error}",
                        file=sys.stderr,
                        flush=True,
                    )
                    bvh = generate_cli(duration, meta)
            if len(bvh) > 2_000_000:
                raise ValueError("Output too large")
            write_cached(cache_key, duration, bvh)
        with lock:
            jobs[job_id].update(status="complete", bvh=bvh, model=MODEL, cached=cached)
    except Exception as error:
        print(
            f"Kimodo job {job_id} failed: {type(error).__name__}: {error}",
            file=sys.stderr,
            flush=True,
        )
        with lock:
            if job_id in jobs and jobs[job_id].get("status") in ("queued", "running"):
                jobs[job_id].update(
                    status="failed",
                    error="Generation failed. Check worker model access, GPU memory, and CLI installation.",
                )


def preload_model():
    try:
        ensure_model()
    except Exception as error:
        print(f"Kimodo preload skipped: {type(error).__name__}: {error}", file=sys.stderr)


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data):
        encoded = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def authorized(self):
        token = os.environ.get("KIMODO_API_TOKEN", "")
        ok = bool(token) and secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token)
        if not ok:
            self.reply(401, {"error": "Unauthorized"})
        return ok

    def do_GET(self):
        if not self.authorized():
            return
        if self.path == "/health":
            clips = sorted(path.name for path in cache_dir().glob("*.bvh")) if cache_dir().is_dir() else []
            self.reply(200, {
                "cliInstalled": bool(shutil.which("kimodo_gen")),
                "model": MODEL,
                "seed": SEED,
                "output": "SOMA77 BVH, standard T-pose",
                "modelLoaded": runtime["model"] is not None,
                "cachedClips": clips,
                "input": "structured meta.json via --input_folder",
            })
            return
        job_id = self.path.removeprefix("/jobs/")
        with lock:
            item = jobs.get(job_id)
            self.reply(200 if item else 404, {k: v for k, v in item.items() if k != "created"} if item else {"error": "Job not found or worker restarted"})

    def do_POST(self):
        if not self.authorized():
            return
        if self.path != "/jobs":
            self.reply(404, {"error": "Unknown endpoint"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 8192:
                raise ValueError()
            request = json.loads(self.rfile.read(size))
            duration, cache_key, meta = resolve_request(request)
            build_command(duration, meta, "motion", "input")
        except (ValueError, KeyError, TypeError):
            self.reply(400, {"error": "Invalid request"})
            return
        cached = read_cached(cache_key, duration)
        if cached:
            with lock:
                prune_jobs()
                job_id = str(uuid.uuid4())
                jobs[job_id] = {"id": job_id, "status": "complete", "bvh": cached, "model": MODEL, "cached": True, "created": time.time()}
            self.reply(200, {"id": job_id, "status": "complete", "bvh": cached, "model": MODEL, "cached": True})
            return
        # Prefer a short "warming up" retry over the multi-minute CLI cold path.
        if runtime["model"] is None and os.environ.get("KIMODO_PRELOAD", "").lower() in ("1", "true", "yes"):
            self.reply(503, {"error": "Kimodo is still warming up. Retry in about a minute."})
            return
        if not shutil.which("kimodo_gen") and runtime["model"] is None:
            self.reply(503, {"error": "Install and verify kimodo_gen first"})
            return
        with lock:
            if worker_is_busy():
                self.reply(429, {"error": "Worker busy. Try again after the current generation completes."})
                return
            job_id = str(uuid.uuid4())
            jobs[job_id] = {"id": job_id, "status": "queued", "created": time.time()}
        executor.submit(generate, job_id, duration, cache_key, meta)
        self.reply(202, {"id": job_id, "status": "queued"})


if __name__ == "__main__":
    if not os.environ.get("KIMODO_API_TOKEN"):
        raise SystemExit("Set KIMODO_API_TOKEN before starting the worker.")
    prepare_generation_env()
    if os.environ.get("KIMODO_PRELOAD", "").lower() in ("1", "true", "yes"):
        # Keep preload off the generation executor so one slot stays free for jobs.
        threading.Thread(target=preload_model, name="kimodo-preload", daemon=True).start()
    ThreadingHTTPServer((os.environ.get("KIMODO_BIND", "127.0.0.1"), int(os.environ.get("PORT", "8001"))), Handler).serve_forever()
