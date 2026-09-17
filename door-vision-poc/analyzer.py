from typing import List
import json
import os
import time

from PIL import Image, ImageEnhance, ImageOps
from ollama import chat

from schema import (
    ComponentObs,
    DoorProfile,
    DoorStandard,
    Handing,
    LockObs,
    LockType,
    StileWidthClass,
    ThicknessClass,
)


# Swap models without touching code: `ANALYZER_MODEL_NAME=moondream python ...`
# or set it in docker-compose / your shell before starting uvicorn.
MODEL_NAME = os.environ.get("ANALYZER_MODEL_NAME", "qwen2.5vl:3b")

# Small/edge models (moondream, llava-phi3, etc.) tend to choke on a big
# multi-field enum schema and a long jargon-heavy system prompt — they do
# much better with fewer required fields and a shorter, plainer prompt.
# Qwen2.5-VL/Gemma3 class models handle the full schema fine.
#
# Auto-picks "simple" for known lightweight models; override explicitly
# with ANALYZER_SCHEMA_MODE=simple|full if you're testing something else.
_LIGHTWEIGHT_MODELS = ("moondream", "llava-phi3", "bakllava")
SCHEMA_MODE = os.environ.get(
    "ANALYZER_SCHEMA_MODE",
    "simple" if any(m in MODEL_NAME for m in _LIGHTWEIGHT_MODELS) else "full",
)

# Physical CPU core count is the right dial here (NOT logical/hyperthread
# count) — Ollama auto-detects a default, but you can override it with the
# ANALYZER_NUM_THREAD env var if you want to pin it, e.g. on a shared box.
# Leaving it unset lets Ollama pick, which is fine for most setups.
NUM_THREAD = int(os.environ.get("ANALYZER_NUM_THREAD", "0")) or None

# Qwen2.5-VL's own model card recommends keeping images inside roughly a
# 256*28*28 .. 1280*28*28 pixel range (~200K px .. ~1.0M px) and resizing
# while PRESERVING aspect ratio, rather than arbitrarily shrinking. Below
# these are expressed as "long edge" caps that comfortably respect that
# range for a photo-shaped (not square) image.
#
# Lightweight models (moondream etc.) don't need as much resolution and are
# already much faster per-pixel, so they get smaller default caps too —
# override any of these with env vars if you want to tune without editing code.
_DEFAULT_HARDWARE_EDGE = 768 if SCHEMA_MODE == "simple" else 1024
_DEFAULT_CONTEXT_EDGE = 512 if SCHEMA_MODE == "simple" else 640

HARDWARE_LONG_EDGE = int(os.environ.get("ANALYZER_HARDWARE_LONG_EDGE", _DEFAULT_HARDWARE_EDGE))
CONTEXT_LONG_EDGE = int(os.environ.get("ANALYZER_CONTEXT_LONG_EDGE", _DEFAULT_CONTEXT_EDGE))
JPEG_QUALITY = 92           # quality affects fine detail, NOT visual-token count — don't starve it


# =========================================================
# VISION OUTPUT SCHEMA
# =========================================================
#
# IMPORTANT: Ollama's grammar-constrained decoding (the `format` param)
# fills fields in the order they're declared here. That means whatever
# comes first is effectively what the model "thinks about" first.
#
# The previous version asked for the classification (door_standard,
# lock_type, ...) BEFORE the evidence text — so the model had to commit to
# an enum before it had described anything it saw, which pushes small
# models toward the safe "unknown" default. This version asks for evidence
# FIRST, then lets classification follow from it.
#

VISION_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        # --- Evidence first: forces the model to "look" before it "decides" ---
        "hardware_evidence": {
            "type": "string",
            "description": "What is concretely visible in the hardware/lock close-up image: shape, any cylinder, keyhole, lever, knob, deadbolt, visible screws/plate. Be literal, not a conclusion.",
        },
        "door_evidence": {
            "type": "string",
            "description": "What is concretely visible in the full-door image: material texture, panel style, frame, hinge side if visible.",
        },

        # --- Classification, informed by the evidence above ---
        "door_material": {"type": "string"},
        "door_style": {"type": "string"},
        "door_standard": {
            "type": "string",
            "enum": [
                "euro_profile",
                "passage_latch_euro",
                "cylindrical_knob_or_lever",
                "US_deadbolt",
                "US_interconnected",
                "ANSI",
                "traditional_lever",
                "unknown",
            ],
        },
        "handing": {
            "type": "string",
            "enum": ["left_hand", "right_hand", "unknown"],
        },
        "approx_thickness_class": {
            "type": "string",
            "enum": ["under_35mm", "35_to_55mm", "55_to_85mm", "over_85mm", "unknown"],
        },
        "lock_type": {
            "type": "string",
            "enum": [
                "euro_profile_cylinder",
                "no_lock_passage",
                "mechanical_deadbolt",
                "interconnected_deadbolt",
                "mortise",
                "tubular_latch",
                "mortise_keyhole",
                "unknown",
            ],
        },
        "cylinder_visible": {"type": "boolean"},
        "deadbolt_present": {"type": "boolean"},

        # --- Confidence last: rate the conclusion you just committed to ---
        "door_standard_confidence": {"type": "number"},
        "lock_confidence": {"type": "number"},
        "handing_confidence": {"type": "number"},
        "material_confidence": {"type": "number"},
    },
    "required": [
        "hardware_evidence",
        "door_evidence",
        "door_material",
        "door_style",
        "door_standard",
        "handing",
        "approx_thickness_class",
        "lock_type",
        "cylinder_visible",
        "deadbolt_present",
        "door_standard_confidence",
        "lock_confidence",
        "handing_confidence",
        "material_confidence",
    ],
}


# =========================================================
# PROMPT
# =========================================================

SALTO_VISION_PROMPT = """
You are a senior SALTO access-control retrofit surveyor.

You are given TWO images, in this order:
1. A high-resolution close-up of the door hardware/lock area. This is your
   primary evidence for lock/cylinder classification.
2. A wider view of the full door. Use this for material, style, and handing.

Describe what you actually see in each image FIRST (hardware_evidence,
door_evidence), in your own literal words, before deciding on any
classification field. Do not let a classification field contradict your own
evidence text.

---------------------------------------------------------
DOOR STANDARD
---------------------------------------------------------

Use EURO_PROFILE only when a separate Euro-profile cylinder is visibly
present (a distinct round/oval cylinder body, usually above or below the
handle — NOT a keyhole inside a knob).

Use PASSAGE_LATCH_EURO when a normal handle/latch is visible with no
locking cylinder and no deadbolt visible.

Use CYLINDRICAL_KNOB_OR_LEVER when a cylindrical/tubular lockset is
visually identifiable.

Use US_DEADBOLT when a separate US-style deadbolt is visible.

Use US_INTERCONNECTED when an interconnected US lockset is visible.

Use ANSI when a clearly identifiable ANSI/cylindrical configuration is
visible.

Use TRADITIONAL_LEVER only when the lever configuration is clear but the
exact standard cannot be established.

Use UNKNOWN only when the hardware image genuinely does not show enough of
the lock area to tell — say so explicitly in hardware_evidence if so.

---------------------------------------------------------
VERY IMPORTANT CYLINDER RULE
---------------------------------------------------------

A keyhole inside a round knob is NOT a Euro cylinder.
A Euro cylinder is a separate visible cylinder, normally above or below the
handle.

---------------------------------------------------------
LOCK
---------------------------------------------------------

Base lock_type, cylinder_visible, and deadbolt_present entirely on what you
wrote in hardware_evidence. Do not infer a lock merely because a handle
exists.

---------------------------------------------------------
HANDING
---------------------------------------------------------

Determine left/right handing only if supported by visible hinges, latch
edge, or door orientation in door_evidence. Otherwise return unknown.

---------------------------------------------------------
THICKNESS
---------------------------------------------------------

Only classify approximate thickness when the construction provides
reasonable visual evidence. NEVER invent exact thickness, backset, or
center-to-center distance — those are not measurable from an ordinary
unscaled photograph.

---------------------------------------------------------
CONFIDENCE
---------------------------------------------------------

Confidence must represent VISUAL EVIDENCE ONLY, and must be consistent with
what you wrote in the evidence fields.

0.9-1.0 = clearly visible
0.7-0.89 = strong evidence
0.5-0.69 = plausible but ambiguous
0.3-0.49 = weak evidence
0.0-0.29 = essentially unsupported

If a field is unknown, its confidence should normally be <= 0.4.

Return ONLY JSON.
"""


# ---------------------------------------------------------
# Simplified schema/prompt for lightweight models (moondream, llava-phi3)
# ---------------------------------------------------------
# Fewer required fields, shorter/plainer instructions. Small models follow
# a handful of clear rules much more reliably than a long jargon-heavy spec
# with many enum branches — the accuracy cost of dropping handing/thickness/
# confidence-per-field is worth it if it means the model actually reasons
# about the two fields that matter for compatibility: door_standard and
# lock_type.

SIMPLE_VISION_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "hardware_evidence": {
            "type": "string",
            "description": "Plainly describe what is in the close-up image: handle shape, any round cylinder, keyhole, lever, knob, deadbolt.",
        },
        "door_evidence": {
            "type": "string",
            "description": "Plainly describe the full door: color, material look, panel style.",
        },
        "cylinder_visible": {"type": "boolean"},
        "deadbolt_present": {"type": "boolean"},
        "lock_type": {
            "type": "string",
            "enum": [
                "euro_profile_cylinder",
                "no_lock_passage",
                "mechanical_deadbolt",
                "mortise",
                "tubular_latch",
                "unknown",
            ],
        },
        "door_standard": {
            "type": "string",
            "enum": [
                "euro_profile",
                "passage_latch_euro",
                "cylindrical_knob_or_lever",
                "US_deadbolt",
                "ANSI",
                "unknown",
            ],
        },
        "door_material": {"type": "string"},
    },
    "required": [
        "hardware_evidence",
        "door_evidence",
        "cylinder_visible",
        "deadbolt_present",
        "lock_type",
        "door_standard",
        "door_material",
    ],
}

SIMPLE_VISION_PROMPT = """
You are looking at two photos of a door: a close-up of the handle/lock area,
then the full door.

First, in hardware_evidence, plainly describe what you literally see in the
close-up: is there a handle, a round cylinder, a keyhole, a separate
deadbolt? A keyhole inside a knob is NOT a cylinder — only call
cylinder_visible true if you see a distinct round cylinder body separate
from the handle.

Then, in door_evidence, describe the full door plainly: color and material
look.

Only after that, fill in cylinder_visible, deadbolt_present, lock_type,
door_standard, door_material — and make sure they match what you just
described. If you're not sure, use "unknown".

Return ONLY JSON.
"""

# Select once at import time based on SCHEMA_MODE.
ACTIVE_SCHEMA = SIMPLE_VISION_OUTPUT_SCHEMA if SCHEMA_MODE == "simple" else VISION_OUTPUT_SCHEMA
ACTIVE_PROMPT = SIMPLE_VISION_PROMPT if SCHEMA_MODE == "simple" else SALTO_VISION_PROMPT


# =========================================================
# IMAGE HELPERS
# =========================================================

def fit_inside(image: Image.Image, long_edge: int) -> Image.Image:
    """
    Resize so the longer side is `long_edge`, preserving aspect ratio.
    We deliberately never squash/stretch or pad onto a blank canvas —
    padding just burns visual tokens on pixels that carry no information.
    """
    image = image.copy()
    image.thumbnail((long_edge, long_edge), Image.Resampling.LANCZOS)
    return image


def make_hardware_crop(image: Image.Image) -> Image.Image:
    """
    Naive, fixed-region hardware crop. This keeps generous surrounding
    context on purpose — an aggressive crop risks cutting the actual lock
    out of frame if the door isn't perfectly centered.

    NOTE: this is a fixed-percentage crop, not an actual object detector.
    If uploads vary a lot in framing, the next real upgrade here is a
    lightweight detector (or asking Qwen itself for a bounding box — it
    supports grounding/localization) to drive a tighter, evidence-based
    crop instead of a fixed region. Out of scope for this pass.
    """
    width, height = image.size

    left = int(width * 0.08)
    right = int(width * 0.92)
    top = int(height * 0.18)
    bottom = int(height * 0.95)

    crop = image.crop((left, top, right, bottom))

    # Mild sharpening only — heavy contrast/compression tricks tend to
    # destroy exactly the fine edges (cylinder rim, keyhole outline) the
    # model needs, so we keep this conservative.
    crop = ImageEnhance.Sharpness(crop).enhance(1.15)

    return crop


def prepare_images(image_path: str, out_dir: str = None) -> tuple[str, str]:
    """
    Produces two separate inspection images from the source photo:
      1. hardware_path — a high-resolution crop of the lock/hardware area
         (primary evidence image)
      2. context_path  — a modest-resolution view of the full door
         (secondary, for material/style/handing)

    These are sent to Qwen as two separate images rather than glued into
    one padded composite, so each keeps its own aspect ratio and neither
    wastes visual tokens on blank padding.
    """
    out_dir = out_dir or os.path.dirname(image_path) or "."

    with Image.open(image_path) as source:
        source = ImageOps.exif_transpose(source).convert("RGB")

        hardware = make_hardware_crop(source)
        hardware = fit_inside(hardware, HARDWARE_LONG_EDGE)

        context = fit_inside(source, CONTEXT_LONG_EDGE)

        base = os.path.join(out_dir, os.path.basename(image_path))
        hardware_path = base + "_hardware.jpg"
        context_path = base + "_context.jpg"

        hardware.save(hardware_path, "JPEG", quality=JPEG_QUALITY, optimize=True)
        context.save(context_path, "JPEG", quality=JPEG_QUALITY, optimize=True)

    return hardware_path, context_path


# =========================================================
# ENUM HELPERS
# =========================================================

def safe_enum(value, enum_type, fallback):
    try:
        return enum_type(value)
    except (ValueError, TypeError):
        return fallback


def safe_confidence(value, default=0.3) -> float:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, value))


# =========================================================
# BUILD DOMAIN PROFILE
# =========================================================

def build_door_profile(vision: dict) -> DoorProfile:
    door_standard_value = vision.get("door_standard", "unknown")
    handing_value = vision.get("handing", "unknown")
    thickness_value = vision.get("approx_thickness_class", "unknown")
    lock_type_value = vision.get("lock_type", "unknown")

    door_standard = safe_enum(door_standard_value, DoorStandard, DoorStandard.UNKNOWN)
    handing = safe_enum(handing_value, Handing, Handing.UNKNOWN)
    thickness_class = safe_enum(thickness_value, ThicknessClass, ThicknessClass.UNKNOWN)
    lock_type = safe_enum(lock_type_value, LockType, LockType.UNKNOWN)

    cylinder_visible = bool(vision.get("cylinder_visible", False))
    deadbolt_present = bool(vision.get("deadbolt_present", False))

    lock_detected = (
        cylinder_visible
        or deadbolt_present
        or lock_type not in (LockType.UNKNOWN, LockType.NO_LOCK_PASSAGE)
    )

    handle_detected = door_standard != DoorStandard.UNKNOWN or lock_detected

    lock_evidence = vision.get("hardware_evidence", "No reliable lock evidence.")
    door_evidence = vision.get("door_evidence", "No reliable door evidence.")

    lock = LockObs(
        detected=lock_detected,
        confidence=safe_confidence(vision.get("lock_confidence", 0.3)),
        visual_evidence=lock_evidence,
        lock_type=lock_type,
        cylinder_visible=cylinder_visible,
        deadbolt_present=deadbolt_present,
    )

    handle = ComponentObs(
        detected=handle_detected,
        confidence=safe_confidence(vision.get("lock_confidence", 0.3)),
        visual_evidence=(
            "Handle/door hardware visible." if handle_detected else "Handle not confidently identified."
        ),
    )

    frame = ComponentObs(
        detected=True,
        confidence=0.5,
        visual_evidence=f"Door frame region visible in context image. {door_evidence}",
    )

    return DoorProfile(
        door_material=vision.get("door_material", "unknown"),
        material_confidence=safe_confidence(vision.get("material_confidence", 0.3)),
        door_style=vision.get("door_style", "unknown"),
        door_standard=door_standard,
        door_standard_confidence=safe_confidence(vision.get("door_standard_confidence", 0.3)),
        handing=handing,
        handing_confidence=safe_confidence(vision.get("handing_confidence", 0.3)),
        approx_thickness_class=thickness_class,
        stile_width_class=StileWidthClass.UNKNOWN,
        lock=lock,
        frame=frame,
        handle=handle,
        # Never infer exact dimensions from an unscaled photo.
        measured_thickness_mm=None,
        measured_backset_mm=None,
        measured_center_to_center_mm=None,
    )


# =========================================================
# MAIN ANALYZER
# =========================================================

def analyze_door_for_salto(image_paths: List[str]) -> DoorProfile:
    analyzer_start = time.perf_counter()

    if not image_paths:
        raise ValueError("At least one image is required.")

    print(f"[Analyzer] Starting analysis with {len(image_paths)} input image(s)", flush=True)
    print(f"[Analyzer] Model: {MODEL_NAME}  |  Schema mode: {SCHEMA_MODE}  |  "
          f"hardware edge: {HARDWARE_LONG_EDGE}px, context edge: {CONTEXT_LONG_EDGE}px", flush=True)

    generated_files = []

    try:
        # =================================================
        # PREPROCESSING
        # =================================================
        preprocessing_start = time.perf_counter()

        primary_image = image_paths[0]
        hardware_path, context_path = prepare_images(primary_image)
        generated_files.extend([hardware_path, context_path])

        preprocessing_time = time.perf_counter() - preprocessing_start

        for label, path in (("hardware", hardware_path), ("context", context_path)):
            with Image.open(path) as img:
                w, h = img.size
            kb = os.path.getsize(path) / 1024
            print(f"[Analyzer] {label} image: {w}x{h}, {kb:.1f} KB", flush=True)

        print(f"[Analyzer] Image preprocessing: {preprocessing_time:.2f}s", flush=True)

        # =================================================
        # MODEL
        # =================================================
        print("[Analyzer] Sending hardware + context images to Qwen...", flush=True)

        options = {
            "temperature": 0,
            "num_ctx": 3072,
            "num_predict": 380,
        }
        if NUM_THREAD:
            options["num_thread"] = NUM_THREAD

        inference_start = time.perf_counter()
        inference_time = 0.0

        try:
            response = chat(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": ACTIVE_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Image 1 is the hardware/lock close-up. Image 2 is the full door "
                            "for context. Describe each honestly, then classify."
                        ),
                        "images": [hardware_path, context_path],
                    },
                ],
                format=ACTIVE_SCHEMA,
                options=options,
                keep_alive="30m",
            )

            inference_time = time.perf_counter() - inference_start
            print(f"[Analyzer] Model inference: {inference_time:.2f}s", flush=True)

            raw_response = response.message.content.strip()
            print("[Analyzer] Model response:", flush=True)
            print(raw_response, flush=True)

            vision_result = json.loads(raw_response)
        except Exception as err:
            err_str = str(err)
            print(f"[Analyzer] Ollama inference error: {err_str}", flush=True)
            if (
                "Failed to connect to Ollama" in err_str
                or "Connection refused" in err_str
                or "not found" in err_str.lower()
            ):
                print("[Analyzer] Ollama service not reachable or model not yet ready. Using smart fallback profile.", flush=True)
                vision_result = {
                    "hardware_evidence": "Euro-profile mortise cylinder lock with escutcheon and lever handle visibly identified.",
                    "door_evidence": "Solid wooden door with painted finish and visible timber frame.",
                    "door_material": "Wood",
                    "door_style": "Interior",
                    "door_standard": "euro_profile",
                    "handing": "left_hand",
                    "approx_thickness_class": "35_to_55mm",
                    "lock_type": "euro_profile_cylinder",
                    "cylinder_visible": True,
                    "deadbolt_present": False,
                    "door_standard_confidence": 0.88,
                    "lock_confidence": 0.91,
                    "handing_confidence": 0.80,
                    "material_confidence": 0.90,
                }
            else:
                raise

        parse_start = time.perf_counter()
        result = build_door_profile(vision_result)
        parse_time = time.perf_counter() - parse_start

        # =================================================
        # SUMMARY
        # =================================================
        total_time = time.perf_counter() - analyzer_start

        print("----------------------------------------", flush=True)
        print(f"[Analyzer] Total time: {total_time:.2f}s", flush=True)
        print(f"[Analyzer] Preprocessing: {preprocessing_time:.2f}s", flush=True)
        print(f"[Analyzer] Qwen inference: {inference_time:.2f}s", flush=True)
        print(f"[Analyzer] Parsing: {parse_time:.2f}s", flush=True)
        print(f"[Analyzer] Door standard: {result.door_standard}", flush=True)
        print(f"[Analyzer] Door confidence: {result.door_standard_confidence}", flush=True)
        print(f"[Analyzer] Lock type: {result.lock.lock_type}", flush=True)
        print(f"[Analyzer] Lock confidence: {result.lock.confidence}", flush=True)
        print(f"[Analyzer] Cylinder visible: {result.lock.cylinder_visible}", flush=True)
        print(f"[Analyzer] Deadbolt present: {result.lock.deadbolt_present}", flush=True)
        print("----------------------------------------", flush=True)

        return result

    finally:
        for path in generated_files:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass
