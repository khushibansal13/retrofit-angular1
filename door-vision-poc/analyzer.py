from typing import List
import os
from PIL import Image
from ollama import chat
from schema import DoorProfile

# Keep the model configurable, but default to 7b now that you've confirmed
# it's genuinely better.
MODEL_NAME = os.environ.get("ANALYZER_MODEL", "qwen2.5vl:7b")

# Category wording below is copied verbatim from the customer-facing lock
# picker (wizard.component.ts's lockTypeOptions) so the AI's classification
# and the confirmation screen the customer sees say exactly the same thing.
SALTO_VISION_PROMPT = """You are a senior access control surveyor for Salto Systems.
Inspect the multi-angle photos of the door to derive technical retrofit parameters.

Classify the current lock into ONE of these six categories — use this exact
language, it matches what the customer will be shown to confirm or correct:

1. Euro cylinder: A key cylinder sticks out slightly from a round hole in the door edge.
   -> door_standard: "euro_profile"
   -> lock_type: "euro_profile_cylinder"
   -> cylinder_visible: true

2. Deadbolt: A single throw-bolt lock, usually above the handle — common on US front doors.
   -> door_standard: "US_deadbolt"
   -> lock_type: "mechanical_deadbolt"
   -> deadbolt_present: true

3. Deadbolt + handle combo: A deadbolt and the handle/lever are linked together as one connected unit.
   -> door_standard: "US_interconnected"
   -> lock_type: "interconnected_deadbolt"
   -> deadbolt_present: true

4. Knob or lever: A round knob or lever handle with a keyhole underneath — no separate cylinder ring.
   -> door_standard: "cylindrical_knob_or_lever"
   -> lock_type: "cylindrical_knob"

5. Surface-mounted box: A rectangular metal box mounted on the surface of the door (night latch style).
   -> door_standard: "surface_rim_lock"
   -> lock_type: "rim_cylinder"
   -> cylinder_visible: true
   -> deadbolt_present: true

6. Just a latch, no lock: The door only has a spring latch — no separate locking cylinder or bolt.
   -> door_standard: "passage_latch_euro"
   -> lock_type: "no_lock_passage"

If none of these six genuinely match what you see, do not force one — use
door_standard "unknown" instead of guessing.

DEADBOLT_PRESENT — READ CAREFULLY (this is commonly missed):
deadbolt_present is NOT limited to category 2/3/5 above. Set it to true
whenever you see ANY additional throw-bolt security hardware beyond the
door's main handle/latch, including:
  - a separate round or square deadbolt cylinder,
  - a manual sliding bolt or barrel bolt (aldrop) mounted on the surface of
    the door, operated by hand rather than a key,
  - a separate keyhole-only plate mounted above or near the main lock, with
    no handle attached to it.
This is independent of the category above — for example, a door classified
as category 4 (Knob or lever) that ALSO has a separate hand-operated slide
bolt should still have deadbolt_present: true. Look at the full height of
the door edge, not just the handle area, before deciding this is false.

BRAND TEXT: if a brand name is clearly embossed or printed on the lock
hardware and legible (e.g. stamped into a knob or faceplate), include it as
plain text in visual_evidence (e.g. "Knob or lever, 'EUROPA' embossed on
faceplate"). Do not guess a brand if it isn't clearly legible.
"""


def optimize_image(img_path: str, max_dimension: int = 1024) -> str:
    print(f"[VISION] Optimizing image: {img_path}", flush=True)

    out_path = img_path + "_opt.jpg"

    with Image.open(img_path) as img:
        print(
            f"[VISION] Original image: size={img.size}, format={img.format}",
            flush=True
        )

        img = img.convert("RGB")
        img.thumbnail(
            (max_dimension, max_dimension),
            Image.Resampling.LANCZOS
        )

        print(
            f"[VISION] Optimized image size: {img.size}",
            flush=True
        )

        img.save(out_path, "JPEG", quality=85)

    print(f"[VISION] Optimized image created: {out_path}", flush=True)

    return out_path


def analyze_door_for_salto(image_paths: List[str]) -> DoorProfile:
    print("\n" + "=" * 80, flush=True)
    print("[VISION] STARTING SALTO DOOR ANALYSIS", flush=True)
    print(f"[VISION] Model: {MODEL_NAME}", flush=True)
    print(f"[VISION] Number of input images: {len(image_paths)}", flush=True)
    print(f"[VISION] Input images: {image_paths}", flush=True)
    print("=" * 80, flush=True)

    optimized_paths = []

    try:
        # ---------------------------------------------------------
        # Optimize images
        # ---------------------------------------------------------
        for image_path in image_paths:
            print(
                f"[VISION] Checking image: {image_path}",
                flush=True
            )

            if not os.path.exists(image_path):
                print(
                    f"[VISION][ERROR] Image does not exist: {image_path}",
                    flush=True
                )
                raise FileNotFoundError(image_path)

            optimized_path = optimize_image(image_path)
            optimized_paths.append(optimized_path)

        print(
            f"[VISION] Prepared {len(optimized_paths)} images for Ollama",
            flush=True
        )

        print(
            f"[VISION] Images being sent: {optimized_paths}",
            flush=True
        )

        # ---------------------------------------------------------
        # Send request to Ollama
        # ---------------------------------------------------------
        print("\n[VISION] Calling Ollama...", flush=True)
        print(f"[VISION] Model: {MODEL_NAME}", flush=True)
        print("[VISION] Temperature: 0.0", flush=True)
        print("[VISION] Context: 16384", flush=True)
        print(
            "[VISION] Asking model to classify lock and extract "
            "retrofit parameters...",
            flush=True
        )

        response = chat(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": SALTO_VISION_PROMPT
                },
                {
                    "role": "user",
                    "content": (
                        "Extract door parameters for Salto retrofit "
                        "compatibility. Output strictly JSON."
                    ),
                    "images": optimized_paths
                }
            ],
            format=DoorProfile.model_json_schema(),
            options={
                "temperature": 0.0,
                "num_ctx": 16384
            }
        )

        print("\n[VISION] Ollama response received", flush=True)

        # ---------------------------------------------------------
        # Raw model response
        # ---------------------------------------------------------
        raw_response = response.message.content

        print("\n" + "-" * 80, flush=True)
        print("[VISION] RAW MODEL RESPONSE:", flush=True)
        print(raw_response, flush=True)
        print("-" * 80, flush=True)

        # ---------------------------------------------------------
        # Validate response
        # ---------------------------------------------------------
        print(
            "[VISION] Validating model response against DoorProfile...",
            flush=True
        )

        door_profile = DoorProfile.model_validate_json(raw_response)

        print(
            "[VISION] DoorProfile validation successful",
            flush=True
        )

        # ---------------------------------------------------------
        # Print extracted values
        # ---------------------------------------------------------
        print("\n" + "-" * 80, flush=True)
        print("[VISION] DETECTED DOOR PARAMETERS:", flush=True)

        print(
            f"[VISION] door_standard = "
            f"{getattr(door_profile, 'door_standard', None)}",
            flush=True
        )

        print(
            f"[VISION] lock_type = "
            f"{getattr(door_profile, 'lock_type', None)}",
            flush=True
        )

        print(
            f"[VISION] cylinder_visible = "
            f"{getattr(door_profile, 'cylinder_visible', None)}",
            flush=True
        )

        print(
            f"[VISION] deadbolt_present = "
            f"{getattr(door_profile, 'deadbolt_present', None)}",
            flush=True
        )

        print(
            f"[VISION] visual_evidence = "
            f"{getattr(door_profile, 'visual_evidence', None)}",
            flush=True
        )

        print("-" * 80, flush=True)

        print(
            "[VISION] FINAL DoorProfile:",
            flush=True
        )
        print(
            door_profile.model_dump_json(indent=2),
            flush=True
        )

        print("\n[VISION] SALTO DOOR ANALYSIS COMPLETED", flush=True)
        print("=" * 80 + "\n", flush=True)

        return door_profile

    except Exception as e:
        print("\n" + "=" * 80, flush=True)
        print("[VISION][ERROR] SALTO DOOR ANALYSIS FAILED", flush=True)
        print(
            f"[VISION][ERROR] {type(e).__name__}: {e}",
            flush=True
        )
        print("=" * 80, flush=True)
        raise

    finally:
        # ---------------------------------------------------------
        # Cleanup optimized images
        # ---------------------------------------------------------
        print(
            "[VISION] Cleaning up optimized images...",
            flush=True
        )

        for p in optimized_paths:
            if os.path.exists(p):
                try:
                    os.remove(p)
                    print(
                        f"[VISION] Removed temporary image: {p}",
                        flush=True
                    )
                except OSError as e:
                    print(
                        f"[VISION][WARNING] Failed to remove {p}: {e}",
                        flush=True
                    )

        print("[VISION] Cleanup complete", flush=True)
