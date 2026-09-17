import os
import shutil
import tempfile
from typing import List, Optional

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from analyzer import analyze_door_for_salto
from engine import SaltoCompatibilityEngine

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


# =========================================================
# Configuration
# =========================================================

DATASET_PATH = os.path.join(
    os.path.dirname(
        os.path.abspath(__file__)
    ),
    "retrofit_ai_demo_seed_dataset.json",
)


# =========================================================
# Compatibility engine
# =========================================================

compatibility_engine = (
    SaltoCompatibilityEngine(
        DATASET_PATH
    )
)


# =========================================================
# FastAPI
# =========================================================

app = FastAPI(
    title="DoorVision POC"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

locks_static_dir = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "public",
    "locks",
)
if os.path.isdir(locks_static_dir):
    app.mount("/locks", StaticFiles(directory=locks_static_dir), name="locks")


# =========================================================
# OpenAPI
# =========================================================

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title="DoorVision POC",
        version="1.0.0",
        description="Multi-angle Door Analyzer",
        routes=app.routes,
    )

    openapi_schema["openapi"] = "3.0.2"

    app.openapi_schema = openapi_schema

    return app.openapi_schema


app.openapi = custom_openapi


# =========================================================
# Requests
# =========================================================
#
# NOTE: the simplified schema.py you're now using has no
# swing_direction/hinge_type/country_code/faceplate/lever/width/height
# fields on DoorProfile — those were part of the earlier expanded schema
# and don't exist here, so these request models only carry what
# DoorProfile can actually hold: thickness, backset, center-to-center.

class CompatibilityRequest(BaseModel):
    profile: DoorProfile

    door_thickness_mm: float | None = None

    backset_mm: float | None = None

    center_to_center_mm: float | None = None


class ManualDoorRecommendationRequest(BaseModel):
    door_material: str
    door_thickness_mm: float
    door_type: str = "Interior"
    existing_lock: str = "Mortise"
    frame_type: str = "Timber"

    backset_mm: Optional[float] = None
    center_to_center_mm: Optional[float] = None


# =========================================================
# Health
# =========================================================

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "DoorVision POC",
        "products_loaded":
            len(
                compatibility_engine.products
            ),
    }


# =========================================================
# Analyze door from images
# =========================================================

@app.get("/api/analyze-door")
async def analyze_door_info():
    return {
        "status": "online",
        "service": "DoorVision POC",
        "endpoint": "/api/analyze-door",
        "method": "POST",
        "content_type": "multipart/form-data",
        "field_name": "files",
        "accepted_images": "1 to 5 image files (JPEG/PNG)",
        "message": "The analyze-door service is running and ready. Upload images using HTTP POST multipart/form-data.",
        "interactive_docs": "http://127.0.0.1:8000/docs#/default/analyze_door_batch_api_analyze_door_post",
    }


@app.post("/api/analyze-door")
async def analyze_door_batch(
    files: Optional[List[UploadFile]] = File(None),
    file: Optional[UploadFile] = File(None),
):
    all_files: List[UploadFile] = []
    if files:
        all_files.extend(files)
    if file:
        all_files.append(file)

    if not (1 <= len(all_files) <= 5):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Please provide 1-5 images under the 'files' field. "
                f"Received {len(all_files)}."
            ),
        )

    temp_paths = []

    try:
        for file_item in all_files:
            file_item.file.seek(0, 2)
            file_size = file_item.file.tell()
            file_item.file.seek(0)

            if file_size == 0:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Uploaded file '{file_item.filename or 'image'}' is empty (0 bytes). "
                        f"Please attach a valid image."
                    ),
                )

            suffix = (
                os.path.splitext(
                    file_item.filename or ""
                )[1]
                or ".jpg"
            )

            temp_file = (
                tempfile.NamedTemporaryFile(
                    delete=False,
                    suffix=suffix,
                )
            )

            shutil.copyfileobj(
                file_item.file,
                temp_file,
            )

            temp_file.close()

            temp_paths.append(
                temp_file.name
            )

        profile = (
            analyze_door_for_salto(
                temp_paths
            )
        )

        results = (
            compatibility_engine.evaluate(
                profile
            )
        )

        return {
            "profile":
                profile.model_dump(),

            "recommendations":
                results,

            "metadata": {
                "images_analyzed":
                    len(temp_paths),

                "dataset":
                    os.path.basename(
                        DATASET_PATH
                    ),

                "products_evaluated":
                    len(results),

                "principle": (
                    "Vision AI extracts observations; "
                    "deterministic rules decide "
                    "technical compatibility."
                ),
            },
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Door analysis failed: {str(error)}",
        )

    finally:
        for path in temp_paths:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


# =========================================================
# Check compatibility after scanned door
# =========================================================

@app.post("/api/check-compatibility")
async def check_compatibility(
    request: CompatibilityRequest,
):
    try:
        profile_data = (
            request.profile.model_dump()
        )

        if request.door_thickness_mm is not None:
            profile_data["measured_thickness_mm"] = request.door_thickness_mm

        if request.backset_mm is not None:
            profile_data["measured_backset_mm"] = request.backset_mm

        if request.center_to_center_mm is not None:
            profile_data["measured_center_to_center_mm"] = request.center_to_center_mm

        profile = (
            DoorProfile.model_validate(
                profile_data
            )
        )

        recommendations = (
            compatibility_engine.evaluate(
                profile
            )
        )

        return {
            "profile":
                profile.model_dump(),

            "recommendations":
                recommendations,

            "metadata": {
                "images_analyzed": 0,

                "dataset":
                    os.path.basename(
                        DATASET_PATH
                    ),

                "products_evaluated":
                    len(
                        recommendations
                    ),

                "principle": (
                    "Vision AI extracts observations; "
                    "deterministic rules decide "
                    "technical compatibility."
                ),
            },
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# MANUAL PRODUCT RECOMMENDATION
# =========================================================

@app.post("/api/recommend-products")
async def recommend_products(
    request: ManualDoorRecommendationRequest,
):
    try:
        if request.door_thickness_mm <= 0:
            raise HTTPException(
                status_code=400,
                detail="Door thickness must be greater than 0 mm.",
            )

        profile = build_manual_door_profile(request)

        recommendations = (
            compatibility_engine.evaluate(
                profile
            )
        )

        return {
            "profile":
                profile.model_dump(),

            "recommendations":
                recommendations,

            "metadata": {
                "images_analyzed": 0,

                "dataset":
                    os.path.basename(
                        DATASET_PATH
                    ),

                "products_evaluated":
                    len(
                        recommendations
                    ),

                "principle": (
                    "Manual door details are "
                    "evaluated using the same "
                    "deterministic compatibility "
                    "engine as scanned doors."
                ),
            },
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# Build manual DoorProfile
# =========================================================

def build_manual_door_profile(
    request: ManualDoorRecommendationRequest,
) -> DoorProfile:

    lock_type = map_manual_lock_type(request.existing_lock)
    door_standard = map_manual_door_standard(request.existing_lock)
    thickness_class = map_thickness_class(request.door_thickness_mm)

    return DoorProfile(
        door_material=request.door_material,
        material_confidence=1.0,
        door_style=request.door_type,
        door_standard=door_standard,
        door_standard_confidence=1.0,
        handing=Handing.UNKNOWN,
        handing_confidence=1.0,
        approx_thickness_class=thickness_class,
        stile_width_class=StileWidthClass.UNKNOWN,
        lock=LockObs(
            detected=True,
            confidence=1.0,
            visual_evidence=f"Manual selection: {request.existing_lock}",
            lock_type=lock_type,
            cylinder_visible=lock_type in [LockType.EURO_CYLINDER, LockType.RIM_CYLINDER],
            deadbolt_present=lock_type in [
                LockType.MECHANICAL_DEADBOLT,
                LockType.INTERCONNECTED_DEADBOLT,
                LockType.RIM_CYLINDER,
            ],
        ),
        frame=ComponentObs(
            detected=True,
            confidence=1.0,
            visual_evidence=f"Manual selection: {request.frame_type}",
        ),
        handle=ComponentObs(
            detected=False,
            confidence=1.0,
            visual_evidence="Handle details were not provided in manual flow.",
        ),
        measured_thickness_mm=request.door_thickness_mm,
        measured_backset_mm=request.backset_mm,
        measured_center_to_center_mm=request.center_to_center_mm,
    )


# =========================================================
# Manual lock mapping
# =========================================================

def map_manual_lock_type(value: str) -> LockType:
    normalized = value.strip().lower().replace("-", "_")

    if "interconnected" in normalized:
        return LockType.INTERCONNECTED_DEADBOLT

    if "surface" in normalized or "rim" in normalized or "night latch" in normalized:
        return LockType.RIM_CYLINDER

    if "deadbolt" in normalized:
        return LockType.MECHANICAL_DEADBOLT

    if "euro" in normalized:
        return LockType.EURO_CYLINDER

    if "tubular" in normalized:
        return LockType.TUBULAR_LATCH

    if "passage" in normalized:
        return LockType.NO_LOCK_PASSAGE

    if "keyhole" in normalized:
        return LockType.MORTISE_KEYHOLE

    if "mortise" in normalized:
        return LockType.MORTISE

    if "cylindrical" in normalized or "knob" in normalized:
        return LockType.CYLINDRICAL_KNOB

    if "lever" in normalized:
        return LockType.TUBULAR_LATCH

    return LockType.UNKNOWN


# =========================================================
# Manual door standard mapping
# =========================================================

def map_manual_door_standard(existing_lock: str) -> DoorStandard:
    normalized = existing_lock.strip().lower()

    if "interconnected" in normalized:
        return DoorStandard.US_INTERCONNECTED

    if "surface" in normalized or "rim" in normalized or "night latch" in normalized:
        return DoorStandard.SURFACE_RIM_LOCK

    if "deadbolt" in normalized:
        return DoorStandard.US_DEADBOLT

    if "euro" in normalized:
        return DoorStandard.EURO_PROFILE

    if "ansi" in normalized:
        return DoorStandard.ANSI

    if (
        "cylindrical" in normalized
        or "knob" in normalized
        or "lever" in normalized
        or "tubular" in normalized
    ):
        return DoorStandard.CYLINDRICAL_KNOB_OR_LEVER

    if "passage" in normalized:
        return DoorStandard.PASSAGE_LATCH_EURO

    # Manual UI default is "Mortise" — treat as European mortise prep.
    if "mortise" in normalized:
        return DoorStandard.EURO_PROFILE

    return DoorStandard.UNKNOWN


# =========================================================
# Thickness classification
# =========================================================

def map_thickness_class(thickness_mm: float) -> ThicknessClass:
    if thickness_mm < 35:
        return ThicknessClass.THIN_UNDER_35MM

    if thickness_mm <= 55:
        return ThicknessClass.STANDARD_35_55MM

    if thickness_mm <= 85:
        return ThicknessClass.THICK_55_85MM

    return ThicknessClass.OVER_85MM
