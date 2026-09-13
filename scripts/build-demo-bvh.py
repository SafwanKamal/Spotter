#!/usr/bin/env python3
"""Write compact cached squat BVH clips for the Replay demo.

The viewer (Three.js BVHLoader) applies ZXY Euler channels by left-multiplying
quaternions, and adds each joint OFFSET to the motion positions. Rest pose is
Y-up, character facing +Z, left arm along +X, legs along -Y.

A squat therefore uses negative hip X (thighs forward) and positive knee X
(shins fold back under). Arm Y swings the T-pose arms forward; front-squat
forearms then flex so the hands sit near the shoulders.
"""
from __future__ import annotations

import math
from pathlib import Path

FPS = 30
DURATION = 4.0
FRAMES = int(DURATION * FPS) + 1
INTERVAL = 1.0 / FPS
OUT = Path(__file__).resolve().parents[1] / "public" / "motion-demos"

# Offsets in centimeters. Motion root positions are deltas from OFFSET because
# Three.js writes `frame.position + bone.offset` into the clip.
JOINTS = {
    "Hips": {
        "offset": (0.0, 96.0, 0.0),
        "channels": 6,
        "children": ["Spine", "LeftUpLeg", "RightUpLeg"],
    },
    "Spine": {
        "offset": (0.0, 18.0, 0.0),
        "channels": 3,
        "children": ["Spine1"],
    },
    "Spine1": {
        "offset": (0.0, 16.0, 0.0),
        "channels": 3,
        "children": ["Neck", "LeftShoulder", "RightShoulder"],
    },
    "Neck": {
        "offset": (0.0, 14.0, 0.0),
        "channels": 3,
        "children": ["Head"],
    },
    "Head": {
        "offset": (0.0, 12.0, 0.0),
        "channels": 3,
        "end": (0.0, 10.0, 0.0),
    },
    "LeftShoulder": {
        "offset": (7.0, 12.0, 0.0),
        "channels": 3,
        "children": ["LeftArm"],
    },
    "LeftArm": {
        "offset": (14.0, 0.0, 0.0),
        "channels": 3,
        "children": ["LeftForeArm"],
    },
    "LeftForeArm": {
        "offset": (26.0, 0.0, 0.0),
        "channels": 3,
        "children": ["LeftHand"],
    },
    "LeftHand": {
        "offset": (24.0, 0.0, 0.0),
        "channels": 3,
        "end": (10.0, 0.0, 0.0),
    },
    "RightShoulder": {
        "offset": (-7.0, 12.0, 0.0),
        "channels": 3,
        "children": ["RightArm"],
    },
    "RightArm": {
        "offset": (-14.0, 0.0, 0.0),
        "channels": 3,
        "children": ["RightForeArm"],
    },
    "RightForeArm": {
        "offset": (-26.0, 0.0, 0.0),
        "channels": 3,
        "children": ["RightHand"],
    },
    "RightHand": {
        "offset": (-24.0, 0.0, 0.0),
        "channels": 3,
        "end": (-10.0, 0.0, 0.0),
    },
    "LeftUpLeg": {
        "offset": (9.0, -6.0, 0.0),
        "channels": 3,
        "children": ["LeftLeg"],
    },
    "LeftLeg": {
        "offset": (0.0, -42.0, 0.0),
        "channels": 3,
        "children": ["LeftFoot"],
    },
    "LeftFoot": {
        "offset": (0.0, -42.0, 0.0),
        "channels": 3,
        "end": (0.0, -4.0, 12.0),
    },
    "RightUpLeg": {
        "offset": (-9.0, -6.0, 0.0),
        "channels": 3,
        "children": ["RightLeg"],
    },
    "RightLeg": {
        "offset": (0.0, -42.0, 0.0),
        "channels": 3,
        "children": ["RightFoot"],
    },
    "RightFoot": {
        "offset": (0.0, -42.0, 0.0),
        "channels": 3,
        "end": (0.0, -4.0, 12.0),
    },
}

ORDER = [
    "Hips",
    "Spine",
    "Spine1",
    "Neck",
    "Head",
    "LeftShoulder",
    "LeftArm",
    "LeftForeArm",
    "LeftHand",
    "RightShoulder",
    "RightArm",
    "RightForeArm",
    "RightHand",
    "LeftUpLeg",
    "LeftLeg",
    "LeftFoot",
    "RightUpLeg",
    "RightLeg",
    "RightFoot",
]


def ease(t: float) -> float:
    return 0.5 - 0.5 * math.cos(math.pi * t)


def squat_amount(frame: int) -> float:
    t = frame / (FRAMES - 1)
    if t < 0.42:
        return ease(t / 0.42)
    if t < 0.58:
        return 1.0
    return ease((1.0 - t) / 0.42)


def rx(deg: float) -> tuple[tuple[float, float, float], ...]:
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return ((1.0, 0.0, 0.0), (0.0, c, -s), (0.0, s, c))


def ry(deg: float) -> tuple[tuple[float, float, float], ...]:
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return ((c, 0.0, s), (0.0, 1.0, 0.0), (-s, 0.0, c))


def rz(deg: float) -> tuple[tuple[float, float, float], ...]:
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return ((c, -s, 0.0), (s, c, 0.0), (0.0, 0.0, 1.0))


def matmul(
    a: tuple[tuple[float, float, float], ...],
    b: tuple[tuple[float, float, float], ...],
) -> tuple[tuple[float, float, float], ...]:
    return tuple(
        tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3))
        for i in range(3)
    )


def rot_zxy(z: float, x: float, y: float) -> tuple[tuple[float, float, float], ...]:
    return matmul(matmul(rz(z), rx(x)), ry(y))


def apply(
    rotation: tuple[tuple[float, float, float], ...],
    vector: tuple[float, float, float],
) -> tuple[float, float, float]:
    return tuple(
        sum(rotation[i][j] * vector[j] for j in range(3)) for i in range(3)
    )


def add(
    left: tuple[float, float, float], right: tuple[float, float, float]
) -> tuple[float, float, float]:
    return (left[0] + right[0], left[1] + right[1], left[2] + right[2])


def joints_world(values: dict[str, tuple[float, ...]]) -> dict[str, tuple[float, float, float]]:
    world: dict[str, tuple[float, float, float]] = {}
    rotations: dict[str, tuple[tuple[float, float, float], ...]] = {}

    def walk(name: str, parent: str | None) -> None:
        joint = JOINTS[name]
        channels = values[name]
        if joint["channels"] == 6:
            local_pos = add(joint["offset"], channels[:3])
            local_rot = rot_zxy(channels[3], channels[4], channels[5])
        else:
            local_pos = joint["offset"]
            local_rot = rot_zxy(channels[0], channels[1], channels[2])
        if parent is None:
            world[name] = local_pos
            rotations[name] = local_rot
        else:
            world[name] = add(world[parent], apply(rotations[parent], local_pos))
            rotations[name] = matmul(rotations[parent], local_rot)
        for child in joint.get("children", []):
            walk(child, name)

    walk("Hips", None)
    return world


def arms(variant: str) -> dict[str, tuple[float, float, float]]:
    if variant == "front-squat":
        return {
            "LeftShoulder": (6.0, 0.0, 10.0),
            "LeftArm": (0.0, -8.0, -88.0),
            "LeftForeArm": (150.0, 6.0, 0.0),
            "LeftHand": (0.0, 12.0, 0.0),
            "RightShoulder": (6.0, 0.0, -10.0),
            "RightArm": (0.0, -8.0, 88.0),
            "RightForeArm": (-150.0, -6.0, 0.0),
            "RightHand": (0.0, -12.0, 0.0),
        }
    return {
        "LeftShoulder": (4.0, 0.0, 6.0),
        "LeftArm": (0.0, 16.0, -88.0),
        "LeftForeArm": (28.0, 0.0, 0.0),
        "LeftHand": (0.0, 0.0, 0.0),
        "RightShoulder": (4.0, 0.0, -6.0),
        "RightArm": (0.0, 16.0, 88.0),
        "RightForeArm": (-28.0, 0.0, 0.0),
        "RightHand": (0.0, 0.0, 0.0),
    }


def pose_without_hip_shift(variant: str, amount: float) -> dict[str, tuple[float, ...]]:
    a = amount
    hip_x = -96.0 * a
    knee_x = 112.0 * a
    knee_out = 10.0 * a
    ankle_x = -(hip_x + knee_x) - 8.0 * a
    torso = 16.0 * a if variant == "bodyweight" else 7.0 * a
    values: dict[str, tuple[float, ...]] = {
        "Hips": (0.0, 0.0, 0.0, 0.0, 4.0 * a, 0.0),
        "Spine": (0.0, torso, 0.0),
        "Spine1": (0.0, torso * 0.45, 0.0),
        "Neck": (0.0, -torso * 0.7, 0.0),
        "Head": (0.0, -torso * 0.25, 0.0),
        "LeftUpLeg": (knee_out, hip_x, 0.0),
        "LeftLeg": (0.0, knee_x, 0.0),
        "LeftFoot": (0.0, ankle_x, 0.0),
        "RightUpLeg": (-knee_out, hip_x, 0.0),
        "RightLeg": (0.0, knee_x, 0.0),
        "RightFoot": (0.0, ankle_x, 0.0),
        **arms(variant),
    }
    return values


def pose(variant: str, frame: int) -> dict[str, tuple[float, ...]]:
    amount = squat_amount(frame)
    values = pose_without_hip_shift(variant, amount)
    standing = joints_world(pose_without_hip_shift(variant, 0.0))
    current = joints_world(values)
    left = standing["LeftFoot"]
    squat_left = current["LeftFoot"]
    values["Hips"] = (
        0.0,
        left[1] - squat_left[1],
        left[2] - squat_left[2],
        0.0,
        4.0 * amount,
        0.0,
    )
    return values


def assert_looks_like_squat(variant: str) -> None:
    stand = joints_world(pose(variant, 0))
    bottom = joints_world(pose(variant, FRAMES // 2))
    drop = stand["Hips"][1] - bottom["Hips"][1]
    knee_forward = bottom["LeftLeg"][2] - bottom["Hips"][2]
    hand_span = abs(bottom["LeftHand"][0] - bottom["RightHand"][0])
    stand_span = abs(stand["LeftHand"][0] - stand["RightHand"][0])
    if drop < 28:
        raise SystemExit(f"{variant}: hip drop {drop:.1f}cm is too shallow")
    if knee_forward < 12:
        raise SystemExit(
            f"{variant}: knees are not forward of the hips ({knee_forward:.1f}cm)"
        )
    if bottom["Hips"][1] < bottom["LeftFoot"][1] + 28:
        raise SystemExit(f"{variant}: hips collapsed onto the floor")
    if bottom["LeftLeg"][1] <= bottom["LeftFoot"][1] + 18:
        raise SystemExit(f"{variant}: knees are not above the ankles")
    if bottom["LeftHand"][2] < bottom["Hips"][2] + 8:
        raise SystemExit(f"{variant}: hands are not in front of the body")
    if hand_span > 90 or stand_span > 90:
        raise SystemExit(
            f"{variant}: arms still look like a T-pose (hand span {hand_span:.1f}cm)"
        )
    if variant == "front-squat":
        if abs(stand["LeftHand"][1] - stand["LeftArm"][1]) > 20:
            raise SystemExit(f"{variant}: hands are not near the shoulders")
        if stand["LeftForeArm"][2] < stand["LeftHand"][2] + 12:
            raise SystemExit(f"{variant}: elbows are not in front of the hands")
        if hand_span > 50:
            raise SystemExit(f"{variant}: front-rack hands are too wide")


def fmt(n: float) -> str:
    value = 0.0 if abs(n) < 1e-9 else n
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text if text not in ("", "-") else "0"


def write_joint(name: str, indent: int) -> list[str]:
    joint = JOINTS[name]
    pad = "  " * indent
    kind = "ROOT" if name == "Hips" else "JOINT"
    lines = [f"{pad}{kind} {name}", f"{pad}{{"]
    ox, oy, oz = joint["offset"]
    lines.append(f"{pad}  OFFSET {fmt(ox)} {fmt(oy)} {fmt(oz)}")
    if joint["channels"] == 6:
        lines.append(
            f"{pad}  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation"
        )
    else:
        lines.append(f"{pad}  CHANNELS 3 Zrotation Xrotation Yrotation")
    for child in joint.get("children", []):
        lines.extend(write_joint(child, indent + 1))
    if "end" in joint:
        ex, ey, ez = joint["end"]
        lines.extend(
            [
                f"{pad}  End Site",
                f"{pad}  {{",
                f"{pad}    OFFSET {fmt(ex)} {fmt(ey)} {fmt(ez)}",
                f"{pad}  }}",
            ]
        )
    lines.append(f"{pad}}}")
    return lines


def write_clip(variant: str) -> str:
    lines = ["HIERARCHY", *write_joint("Hips", 0), "MOTION", f"Frames: {FRAMES}"]
    lines.append(f"Frame Time: {INTERVAL:.7f}".rstrip("0").rstrip("."))
    for frame in range(FRAMES):
        pose_values = pose(variant, frame)
        numbers: list[str] = []
        for name in ORDER:
            numbers.extend(fmt(n) for n in pose_values[name])
        lines.append(" ".join(numbers))
    return "\n".join(lines) + "\n"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for variant in ("bodyweight", "front-squat"):
        assert_looks_like_squat(variant)
        path = OUT / f"{variant}-4.0.bvh"
        path.write_text(write_clip(variant))
        stand = joints_world(pose(variant, 0))
        bottom = joints_world(pose(variant, FRAMES // 2))
        print(f"wrote {path} ({path.stat().st_size} bytes)")
        print(
            f"  {variant} stand hips={tuple(round(v, 1) for v in stand['Hips'])} "
            f"knee={tuple(round(v, 1) for v in stand['LeftLeg'])} "
            f"hand={tuple(round(v, 1) for v in stand['LeftHand'])}"
        )
        print(
            f"  {variant} bottom hips={tuple(round(v, 1) for v in bottom['Hips'])} "
            f"knee={tuple(round(v, 1) for v in bottom['LeftLeg'])} "
            f"hand={tuple(round(v, 1) for v in bottom['LeftHand'])}"
        )


if __name__ == "__main__":
    main()
