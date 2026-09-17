from typing import List
import os
from PIL import Image
from ollama import chat
from schema import DoorProfile

MODEL_NAME = "qwen2.5vl:3b"

SALTO_VISION_PROMPT = """You are a senior access control surveyor for Salto Systems.
Inspect the multi-angle photos of the door to derive technical retrofit parameters:

CRITICAL HARDWARE FORM FACTOR IDENTIFICATION:
1. Surface Rim Lock / Night Latch:
   - A box-shaped lock mechanism mounted ON TOP of the door's interior surface (surface-mounted box), often operated by turning a knob or key, with round deadbolts throwing into an exterior frame bracket.
     -> door_standard: "surface_rim_lock"
     -> lock_type: "rim_cylinder"
     -> cylinder_visible: true
     -> deadbolt_present: true

2. Cylindrical Knob / Tubular Latch:
   - A spherical/round metal doorknob that has a keyhole integrated directly in its center, with the latch mechanism recessed inside the door edge.
     -> door_standard: "cylindrical_knob_or_lever"
     -> lock_type: "cylindrical_knob"

3. Euro Profile Cylinder:
   - A separate teardrop-shaped key cylinder located below or above a lever handle.

4. Passage Latch (No Lock):
   - Only a handle is present; no keyhole or cylinder anywhere.
     -> door_standard: "passage_latch_euro"
     -> lock_type: "no_lock_passage"

5. US Deadbolt:
   - A separate round/square deadbolt cylinder mounted 4-5.5 inches above a handle.
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
