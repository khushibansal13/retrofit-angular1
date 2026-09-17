import os
import shutil
import tempfile
import uuid
import time
import requests

from typing import List, Optional

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
    BackgroundTasks,
)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel

from engine import SaltoCompatibilityEngine

from schema import (
    ComponentObs,
    DoorMaterial,
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


# Railway:
#
# VISION_WORKER_URL=https://lamp-indie-translate-toolbox.trycloudflare.com
#
# Local development:
#
# defaults to http://localhost:9000
#
VISION_WORKER_URL = os.environ.get(
    "VISION_WORKER_URL",
    "http://localhost:9000",
).rstrip("/")


# =========================================================
# Compatibility engine
# =========================================================

compatibility_engine = SaltoCompatibilityEngine(
    DATASET_PATH
)


# =========================================================
# In-memory analysis jobs
# =========================================================

analysis_jobs = {}


# =========================================================
# FastAPI
# =========================================================

app = FastAPI(
    title="Retrofit AI Door Vision API"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# Static files
# =========================================================

static_dir = os.path.join(
    os.path.dirname(
        os.path.abspath(__file__)
    ),
    "static",
)

if os.path.isdir(static_dir):

    app.mount(
        "/static",
        StaticFiles(
            directory=static_dir
        ),
        name="static",
    )


# =========================================================
# Request models
# =========================================================

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
        "products_loaded": len(
            compatibility_engine.products
        ),
    }


# =========================================================
# Analyze-door information endpoint
# =========================================================

@app.get("/api/analyze-door")
async def analyze_door_info():

    return {
        "status": "ok",
        "message": (
            "POST images to this endpoint "
            "to start door analysis."
        ),
        "poll": (
            "GET /api/analyze-door/{job_id}"
        ),
    }


# =========================================================
# Vision worker communication
# =========================================================

def run_vision_worker(
    temp_paths: List[str],
) -> dict:
    """
    Send uploaded images to the Windows vision worker.

    The Windows worker runs the long-running Ollama
    vision analysis locally.

    Railway receives the resulting DoorProfile JSON.
    """

    multipart_files = []

    try:

        # -------------------------------------------------
        # Open all uploaded images
        # -------------------------------------------------

        for index, path in enumerate(
            temp_paths,
            start=1,
        ):

            filename = (
                os.path.basename(path)
                or f"door-{index}.jpg"
            )

            file_handle = open(
                path,
                "rb",
            )

            multipart_files.append(
                (
                    "files",
                    (
                        filename,
                        file_handle,
                        "image/jpeg",
                    ),
                )
            )

        print(
            "[VISION WORKER] "
            f"Submitting {len(temp_paths)} image(s)"
        )

        print(
            "[VISION WORKER] URL: "
            f"{VISION_WORKER_URL}"
        )

        # -------------------------------------------------
        # Create worker job
        # -------------------------------------------------

        response = requests.post(
            f"{VISION_WORKER_URL}/jobs",
            files=multipart_files,
            timeout=30,
        )

        response.raise_for_status()

        worker_job = response.json()

        worker_job_id = worker_job.get(
            "jobId"
        )

        if not worker_job_id:

            raise RuntimeError(
                "Vision worker did not return a jobId."
            )

        print(
            "[VISION WORKER] "
            f"Job created: {worker_job_id}"
        )

    except requests.RequestException as error:

        raise RuntimeError(
            "Could not communicate with the "
            f"vision worker: {error}"
        ) from error

    finally:

        # -------------------------------------------------
        # Close uploaded image handles
        # -------------------------------------------------

        for _, file_data in multipart_files:

            try:

                file_data[1].close()

            except Exception:
                pass

    # -----------------------------------------------------
    # Poll the worker
    #
    # The worker itself is running Ollama in a background
    # thread, so these are short HTTP requests.
    # -----------------------------------------------------

    poll_interval = 10

    max_attempts = 180

    for attempt in range(
        1,
        max_attempts + 1,
    ):

        try:

            print(
                "[VISION WORKER] "
                f"Checking job {worker_job_id} "
                f"(attempt "
                f"{attempt}/{max_attempts})"
            )

            status_response = requests.get(
                f"{VISION_WORKER_URL}/jobs/"
                f"{worker_job_id}",
                timeout=15,
            )

            status_response.raise_for_status()

            worker_result = (
                status_response.json()
            )

        except requests.RequestException as error:

            raise RuntimeError(
                "Could not read vision worker job "
                f"status: {error}"
            ) from error

        status = worker_result.get(
            "status"
        )

        # -------------------------------------------------
        # Worker is still processing
        # -------------------------------------------------

        if status == "processing":

            time.sleep(
                poll_interval
            )

            continue

        # -------------------------------------------------
        # Worker failed
        # -------------------------------------------------

        if status == "failed":

            raise RuntimeError(
                worker_result.get(
                    "error",
                    "Vision worker analysis failed.",
                )
            )

        # -------------------------------------------------
        # Worker completed
        # -------------------------------------------------

        if status == "completed":

            profile = worker_result.get(
                "result"
            )

            if not profile:

                raise RuntimeError(
                    "Vision worker completed "
                    "without returning a profile."
                )

            print(
                "[VISION WORKER] "
                "Vision analysis completed."
            )

            return profile

        # -------------------------------------------------
        # Unknown worker status
        # -------------------------------------------------

        raise RuntimeError(
            "Vision worker returned "
            f"unexpected status: {status}"
        )

    # -----------------------------------------------------
    # Maximum wait reached
    # -----------------------------------------------------

    raise RuntimeError(
        "Vision worker analysis timed out "
        "after "
        f"{max_attempts * poll_interval} seconds."
    )


# =========================================================
# Background door analysis
# =========================================================

def process_door_analysis(
    job_id: str,
    temp_paths: List[str],
):
    """
    Background processing for door analysis.

    Flow:

        Railway FastAPI
            ↓
        Cloudflare Tunnel
            ↓
        Windows Vision Worker
            ↓
        Local Ollama
            ↓
        DoorProfile
            ↓
        Railway compatibility engine
    """

    try:

        print("=" * 70)

        print(
            f"[JOB {job_id}] "
            "BACKGROUND ANALYSIS STARTED"
        )

        print("=" * 70)

        print(
            f"[JOB {job_id}] "
            f"Image count: {len(temp_paths)}"
        )

        # -------------------------------------------------
        # STEP 1
        # Vision analysis
        # -------------------------------------------------

        print(
            f"[JOB {job_id}] "
            "STEP 1: Sending images to vision worker..."
        )

        profile_data = run_vision_worker(
            temp_paths
        )

        print(
            f"[JOB {job_id}] "
            "STEP 1 COMPLETE: "
            "Vision analysis finished."
        )

        # -------------------------------------------------
        # Validate the returned DoorProfile
        # -------------------------------------------------

        profile = DoorProfile.model_validate(
            profile_data
        )

        print(
            f"[JOB {job_id}] "
            "DoorProfile validated successfully."
        )

        # -------------------------------------------------
        # STEP 2
        # Deterministic compatibility
        # -------------------------------------------------

        print(
            f"[JOB {job_id}] "
            "STEP 2: Evaluating compatibility..."
        )

        results = compatibility_engine.evaluate(
            profile
        )

        print(
            f"[JOB {job_id}] "
            "STEP 2 COMPLETE: "
            f"{len(results)} product(s) evaluated."
        )

        # -------------------------------------------------
        # STEP 3
        # Store final result
        # -------------------------------------------------

        analysis_jobs[job_id] = {

            "status": "completed",

            "result": {

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
            },

            "error": None,
        }

        print("=" * 70)

        print(
            f"[JOB {job_id}] "
            "ANALYSIS COMPLETED"
        )

        print("=" * 70)

    except Exception as error:

        print("=" * 70)

        print(
            f"[JOB {job_id}] "
            "ANALYSIS FAILED"
        )

        print(
            f"[JOB {job_id}] "
            f"Error: {str(error)}"
        )

        print("=" * 70)

        analysis_jobs[job_id] = {

            "status": "failed",

            "result": None,

            "error": str(error),
        }

    finally:

        # -------------------------------------------------
        # Cleanup temporary images
        # -------------------------------------------------

        print(
            f"[JOB {job_id}] "
            "Cleaning up temporary images..."
        )

        for path in temp_paths:

            if os.path.exists(path):

                try:

                    os.remove(path)

                except OSError as cleanup_error:

                    print(
                        f"[JOB {job_id}] "
                        f"Could not remove {path}: "
                        f"{cleanup_error}"
                    )


# =========================================================
# Start door analysis
# =========================================================

@app.post("/api/analyze-door")
async def analyze_door(
    background_tasks: BackgroundTasks,
    files: Optional[
        List[UploadFile]
    ] = File(None),
    file: Optional[
        UploadFile
    ] = File(None),
):

    # -----------------------------------------------------
    # Support both:
    #
    # files=
    #
    # and:
    #
    # file=
    # -----------------------------------------------------

    uploaded_files: List[
        UploadFile
    ] = []

    if files:

        uploaded_files.extend(
            files
        )

    if file:

        uploaded_files.append(
            file
        )

    # -----------------------------------------------------
    # Validate number of images
    # -----------------------------------------------------

    if not uploaded_files:

        raise HTTPException(
            status_code=400,
            detail=(
                "At least one image is required."
            ),
        )

    if len(uploaded_files) > 5:

        raise HTTPException(
            status_code=400,
            detail=(
                "A maximum of 5 images "
                "can be analyzed."
            ),
        )

    # -----------------------------------------------------
    # Create job ID
    # -----------------------------------------------------

    job_id = str(
        uuid.uuid4()
    )

    temp_paths: List[str] = []

    try:

        # -------------------------------------------------
        # Save uploaded files temporarily
        # -------------------------------------------------

        print(
            f"[JOB {job_id}] "
            f"Receiving {len(uploaded_files)} image(s)"
        )

        for index, upload in enumerate(
            uploaded_files,
            start=1,
        ):

            original_filename = (
                upload.filename
                or f"door-{index}.jpg"
            )

            suffix = os.path.splitext(
                original_filename
            )[1]

            if not suffix:

                suffix = ".jpg"

            file_descriptor, temp_path = (
                tempfile.mkstemp(
                    suffix=suffix
                )
            )

            os.close(
                file_descriptor
            )

            contents = await upload.read()

            with open(
                temp_path,
                "wb",
            ) as output:

                output.write(
                    contents
                )

            temp_paths.append(
                temp_path
            )

            print(
                f"[JOB {job_id}] "
                f"Saved image {index}: "
                f"{original_filename}"
            )

        # -------------------------------------------------
        # Initialize job
        # -------------------------------------------------

        analysis_jobs[job_id] = {

            "status": "processing",

            "result": None,

            "error": None,
        }

        # -------------------------------------------------
        # Run long analysis in background
        # -------------------------------------------------

        background_tasks.add_task(
            process_door_analysis,
            job_id,
            temp_paths,
        )

        print(
            f"[JOB {job_id}] "
            "Background task started."
        )

        # -------------------------------------------------
        # Return immediately
        # -------------------------------------------------

        return {

            "jobId":
                job_id,

            "status":
                "processing",

            "message": (
                "Door analysis has started. "
                "Poll the job status endpoint "
                "for the result."
            ),
        }

    except Exception as error:

        # -------------------------------------------------
        # Cleanup if job could not start
        # -------------------------------------------------

        for path in temp_paths:

            if os.path.exists(path):

                try:

                    os.remove(path)

                except OSError:
                    pass

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# Get door analysis job
# =========================================================

@app.get(
    "/api/analyze-door/{job_id}"
)
async def get_door_analysis(
    job_id: str,
):

    job = analysis_jobs.get(
        job_id
    )

    if job is None:

        raise HTTPException(
            status_code=404,
            detail="Analysis job not found.",
        )

    # -----------------------------------------------------
    # Processing
    # -----------------------------------------------------

    if job["status"] == "processing":

        return {

            "jobId":
                job_id,

            "status":
                "processing",
        }

    # -----------------------------------------------------
    # Failed
    # -----------------------------------------------------

    if job["status"] == "failed":

        return {

            "jobId":
                job_id,

            "status":
                "failed",

            "result":
                None,

            "error":
                job.get("error"),
        }

    # -----------------------------------------------------
    # Completed
    # -----------------------------------------------------

    return {

        "jobId":
            job_id,

        "status":
            "completed",

        **job["result"],
    }


# =========================================================
# Compatibility check
# =========================================================

@app.post(
    "/api/check-compatibility"
)
async def check_compatibility(
    request: CompatibilityRequest,
):

    try:

        results = (
            compatibility_engine.evaluate(
                request.profile
            )
        )

        return {

            "profile":
                request.profile.model_dump(),

            "recommendations":
                results,
        }

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# Manual product recommendation
# =========================================================

@app.post(
    "/api/recommend-products"
)
async def recommend_products(
    request: ManualDoorRecommendationRequest,
):

    try:

        # -------------------------------------------------
        # Convert manual form values into DoorProfile
        # -------------------------------------------------

        profile = DoorProfile(

            door_material=
                DoorMaterial(
                    request.door_material
                ),

            door_thickness_mm=
                request.door_thickness_mm,

            door_type=
                request.door_type,

            existing_lock=
                request.existing_lock,

            frame_type=
                request.frame_type,

            backset_mm=
                request.backset_mm,

            center_to_center_mm=
                request.center_to_center_mm,
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
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# OpenAPI customization
# =========================================================

def custom_openapi():

    if app.openapi_schema:

        return app.openapi_schema

    openapi_schema = get_openapi(
        title="Retrofit AI Door Vision API",
        version="1.0.0",
        description=(
            "AI-assisted door analysis and "
            "Salto retrofit compatibility API."
        ),
        routes=app.routes,
    )

    app.openapi_schema = openapi_schema

    return app.openapi_schema


app.openapi = custom_openapi
