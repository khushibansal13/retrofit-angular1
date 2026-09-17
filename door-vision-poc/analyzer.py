from typing import List
import os
from PIL import Image
from ollama import Client
from schema import DoorProfile


# Vision model used for door analysis
MODEL_NAME = os.environ.get(
    "ANALYZER_MODEL",
    "qwen2.5vl:3b",
)

# Railway Ollama service
# Ollama running locally, exposed to Railway through Cloudflare Tunnel
OLLAMA_HOST = os.environ.get(
    "OLLAMA_HOST",
    "https://but-originally-breakdown-existed.trycloudflare.com",
)

ollama_client = Client(host=OLLAMA_HOST)


SALTO_VISION_PROMPT = """You are a senior access control surveyor for Salto Systems.
Inspect the multi-angle photos of the door and classify it into EXACTLY ONE of the
6 hardware categories below. Each category is an ATOMIC bundle: door_standard,
lock_type, cylinder_visible and deadbolt_present must ALL come from the SAME
category. Never mix a door_standard from one category with a lock_type from
another — that combination is always wrong.

1. Euro cylinder:
   A distinct cylindrical metal body — with a visible keyway slot or a
   thumb-turn — physically protruding a few millimeters OUT of the door
   edge/faceplate. The cylinder is its own separate round part, clearly
   raised above the surrounding metal.
     -> door_standard: "euro_profile"
     -> lock_type: "euro_profile_cylinder"
     -> cylinder_visible: true

   DO NOT choose this just because the faceplate has a round hole. Mortise
   lock faceplates often have round holes for screws, spindles, or unused
   prep bores that have NO cylinder in them. If you see a hole but nothing
   is actually protruding out of it, this is NOT category 1 — check
   category 4 instead.

2. Deadbolt only:
   A separate round or square keyed cylinder mounted on its own, 4-6 inches
   above or below a handle, with NO handle mechanism built into the same
   plate. Often has a visible throw-bolt.
     -> door_standard: "US_deadbolt"
     -> lock_type: "mechanical_deadbolt"
     -> deadbolt_present: true

3. Deadbolt + handle combo (interconnected):
   A deadbolt cylinder and a handle/knob mounted close together and clearly
   operated as one linked unit (single connecting plate or rod visible).
     -> door_standard: "US_interconnected"
     -> lock_type: "interconnected_deadbolt"
     -> deadbolt_present: true

4. Knob or lever:
   A round knob or a lever handle with the keyhole built directly into its
   own center/base, no separate deadbolt cylinder anywhere else on the door.
   This also covers mortise lock bodies operated by a lever handle on each
   face of the door, where the faceplate has no protruding cylinder.
     -> door_standard: "cylindrical_knob_or_lever"
     -> lock_type: "cylindrical_knob"

5. Surface-mounted box:
   A rectangular metal box mounted ON TOP of the door's surface (not
   recessed into the door edge), operated by a thumb-turn or key, often with
   a rim cylinder on the outside face.
     -> door_standard: "surface_rim_lock"
     -> lock_type: "rim_cylinder"
     -> cylinder_visible: true
     -> deadbolt_present: true

6. Just a latch, no lock:
   Only a handle or lever is present. No keyhole, no cylinder, no deadbolt
   anywhere on the door — it only latches, it cannot be locked.
     -> door_standard: "passage_latch_euro"
     -> lock_type: "no_lock_passage"

DEADBOLT_PRESENT — READ CAREFULLY:
Set deadbolt_present: true whenever ANY of the following are visible, even if
they don't fit neatly into categories 2/3/5 above:
- A manual slide bolt or barrel bolt (a separate sliding metal bar latch).
- A separate keyhole-only plate mounted apart from the main handle, even if
  you cannot see a bolt directly.
- Any second locking point on the door in addition to the main handle/lock.
Do NOT set deadbolt_present just because a lock LOOKS secure — only set it
when you can see a distinct bolt mechanism or a separate keyed cylinder.

DOOR MATERIAL — classify door_material using ONLY these 4 exact values:
- "Wood": timber, laminate, veneer, painted wood grain, wooden panel doors.
- "Glass": doors that are predominantly a glass pane or frameless glass,
  including glass doors with a small patch-fitting lock.
- "Metal": steel, aluminium, industrial/security doors, fire-rated metal
  doors, doors with visible metal cladding or a metal frame that makes up
  most of the visible door surface.
- "Unknown": use this if you cannot clearly tell — NEVER invent a word like
  "solid", "composite", or "unclear". Only ever output one of the 4 values
  above, nothing else.

BRAND TEXT:
If any brand name or logo is legibly embossed or printed on the lock, handle,
or cylinder, transcribe it exactly as written into visual_evidence. Never
guess a brand name you cannot actually read.
"""


def optimize_image(img_path: str, max_dimension: int = 1024) -> str:
    print(f"[VISION] Optimizing image: {img_path}", flush=True)

    out_path = img_path + "_opt.jpg"

    with Image.open(img_path) as img:
        print(
            f"[VISION] Original image size: {img.size[0]}x{img.size[1]}",
            flush=True,
        )

        img = img.convert("RGB")
        img.thumbnail(
            (max_dimension, max_dimension),
            Image.Resampling.LANCZOS,
        )

        print(
            f"[VISION] Optimized image size: {img.size[0]}x{img.size[1]}",
            flush=True,
        )

        img.save(out_path, "JPEG", quality=85)

    print(f"[VISION] Optimized image saved: {out_path}", flush=True)

    return out_path


def analyze_door_for_salto(image_paths: List[str]) -> DoorProfile:
    print("\n" + "=" * 70, flush=True)
    print("[VISION] STARTING SALTO DOOR ANALYSIS", flush=True)
    print("=" * 70, flush=True)

    print(f"[VISION] Model: {MODEL_NAME}", flush=True)
    print(f"[VISION] Ollama host: {OLLAMA_HOST}", flush=True)
    print(f"[VISION] Input image count: {len(image_paths)}", flush=True)

    for i, path in enumerate(image_paths, start=1):
        print(f"[VISION] Input image {i}: {path}", flush=True)

    optimized_paths = []

    try:
        # ---------------------------------------------------------
        # Optimize images
        # ---------------------------------------------------------
        print("\n[VISION] STEP 1: Optimizing images...", flush=True)

        for path in image_paths:
            optimized_paths.append(optimize_image(path))

        print(
            f"[VISION] Optimized {len(optimized_paths)} image(s)",
            flush=True,
        )

        for i, path in enumerate(optimized_paths, start=1):
            print(
                f"[VISION] Optimized image {i}: {path}",
                flush=True,
            )

        # ---------------------------------------------------------
        # Call Ollama
        # ---------------------------------------------------------
        print("\n[VISION] STEP 2: Calling Ollama...", flush=True)
        print(f"[VISION] Model: {MODEL_NAME}", flush=True)
        print(f"[VISION] Ollama host: {OLLAMA_HOST}", flush=True)
        print(
            f"[VISION] Sending {len(optimized_paths)} image(s) to model",
            flush=True,
        )
        print("[VISION] Temperature: 0.0", flush=True)
        print("[VISION] Context: 8192", flush=True)
        print("[VISION] Keep alive: 30m", flush=True)
        print("[VISION] Waiting for model response...", flush=True)

        response = ollama_client.chat(
            model=MODEL_NAME,
            messages=[
                {
                    "role": "system",
                    "content": SALTO_VISION_PROMPT,
                },
                {
                    "role": "user",
                    "content": (
                        "Extract door parameters for Salto retrofit "
                        "compatibility. Output strictly JSON."
                    ),
                    "images": optimized_paths,
                },
            ],
            format=DoorProfile.model_json_schema(),
           options={
    "temperature": 0.0,
    "num_ctx": 4096,
},
            keep_alive="30m",
        )

        print("\n[VISION] Ollama response received!", flush=True)

        # ---------------------------------------------------------
        # Raw response
        # ---------------------------------------------------------
        raw_response = response.message.content

        print("\n" + "-" * 70, flush=True)
        print("[VISION] RAW MODEL RESPONSE:", flush=True)
        print("-" * 70, flush=True)
        print(raw_response, flush=True)
        print("-" * 70, flush=True)

        # ---------------------------------------------------------
        # Validate response
        # ---------------------------------------------------------
        print("\n[VISION] STEP 3: Validating model response...", flush=True)

        result = DoorProfile.model_validate_json(raw_response)

        print("[VISION] Validation successful!", flush=True)

        # ---------------------------------------------------------
        # Print extracted values
        # ---------------------------------------------------------
        print("\n" + "-" * 70, flush=True)
        print("[VISION] EXTRACTED DOOR PROFILE", flush=True)
        print("-" * 70, flush=True)

        print(
            f"[VISION] door_standard      = {result.door_standard}",
            flush=True,
        )

        print(
            f"[VISION] lock_type           = {result.lock.lock_type}",
            flush=True,
        )

        print(
            f"[VISION] cylinder_visible    = {result.lock.cylinder_visible}",
            flush=True,
        )

        print(
            f"[VISION] deadbolt_present    = {result.lock.deadbolt_present}",
            flush=True,
        )

        print(
            f"[VISION] door_material       = {result.door_material}",
            flush=True,
        )

        print(
            f"[VISION] visual_evidence     = {result.lock.visual_evidence}",
            flush=True,
        )

        print("-" * 70, flush=True)

        print("\n[VISION] FINAL DoorProfile:", flush=True)
        print(
            result.model_dump_json(indent=2),
            flush=True,
        )

        print("\n[VISION] SALTO DOOR ANALYSIS COMPLETE", flush=True)

        return result

    except Exception as e:
        print("\n" + "!" * 70, flush=True)
        print("[VISION] ERROR DURING SALTO DOOR ANALYSIS", flush=True)
        print(f"[VISION] Error type: {type(e).__name__}", flush=True)
        print(f"[VISION] Error: {e}", flush=True)
        print("!" * 70, flush=True)

        raise

    finally:
        # ---------------------------------------------------------
        # Cleanup
        # ---------------------------------------------------------
        print(
            "\n[VISION] STEP 4: Cleaning up optimized images...",
            flush=True,
        )

        for p in optimized_paths:
            if os.path.exists(p):
                try:
                    os.remove(p)
                    print(
                        f"[VISION] Deleted: {p}",
                        flush=True,
                    )
                except OSError as e:
                    print(
                        f"[VISION] Could not delete {p}: {e}",
                        flush=True,
                    )

        print("[VISION] Cleanup complete.", flush=True)
        print("=" * 70 + "\n", flush=True)
