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
    out_path = img_path + "_opt.jpg"
    with Image.open(img_path) as img:
        img = img.convert("RGB")
        img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        img.save(out_path, "JPEG", quality=85)
    return out_path

def analyze_door_for_salto(image_paths: List[str]) -> DoorProfile:
    optimized_paths = [optimize_image(p) for p in image_paths]
    try:
        response = chat(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": SALTO_VISION_PROMPT},
                {
                    "role": "user",
                    "content": "Extract door parameters for Salto retrofit compatibility. Output strictly JSON.",
                    "images": optimized_paths
                }
            ],
            format=DoorProfile.model_json_schema(),
            options={"temperature": 0.0, "num_ctx": 16384}
        )
        return DoorProfile.model_validate_json(response.message.content)
    finally:
        for p in optimized_paths:
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
