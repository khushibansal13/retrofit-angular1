import os
import uuid
import tempfile
import threading
from typing import List

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

from analyzer import analyze_door_for_salto

app = FastAPI(title="Retrofit Vision Worker")


# ---------------------------------------------------------
# Job storage
# ---------------------------------------------------------

jobs = {}


# ---------------------------------------------------------
# Background analysis
# ---------------------------------------------------------

def process_job(job_id: str, image_paths: List[str]):
    print("\n" + "=" * 70, flush=True)
    print(f"[WORKER] STARTING JOB {job_id}", flush=True)
    print("=" * 70, flush=True)

    try:
        jobs[job_id]["status"] = "processing"

        print(
            f"[WORKER] Analyzing {len(image_paths)} image(s)",
            flush=True,
        )

        # IMPORTANT:
        # analyzer.py on this machine must use:
        # http://localhost:11434
        profile = analyze_door_for_salto(image_paths)

        print(
            f"[WORKER] Vision analysis completed for {job_id}",
            flush=True,
        )

        jobs[job_id] = {
            "status": "completed",
            "result": profile.model_dump(),
        }

        print("\n" + "=" * 70, flush=True)
        print(f"[WORKER] JOB {job_id} COMPLETED", flush=True)
        print("=" * 70, flush=True)

    except Exception as e:
        print("\n" + "!" * 70, flush=True)
        print(f"[WORKER] JOB {job_id} FAILED", flush=True)
        print(f"[WORKER] Error type: {type(e).__name__}", flush=True)
        print(f"[WORKER] Error: {e}", flush=True)
        print("!" * 70, flush=True)

        jobs[job_id] = {
            "status": "failed",
            "error": str(e),
        }

    finally:
        print(
            f"[WORKER] Cleaning up {len(image_paths)} input image(s)",
            flush=True,
        )

        for path in image_paths:
            try:
                if os.path.exists(path):
                    os.remove(path)
                    print(
                        f"[WORKER] Deleted: {path}",
                        flush=True,
                    )
            except OSError as e:
                print(
                    f"[WORKER] Could not delete {path}: {e}",
                    flush=True,
                )


# ---------------------------------------------------------
# Health
# ---------------------------------------------------------

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "retrofit-vision-worker",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
    }


# ---------------------------------------------------------
# Start analysis
# ---------------------------------------------------------

@app.post("/jobs")
async def create_job(
    files: List[UploadFile] = File(...)
):
    if not files:
        raise HTTPException(
            status_code=400,
            detail="At least one image is required.",
        )

    job_id = str(uuid.uuid4())

    print("\n" + "=" * 70, flush=True)
    print(f"[WORKER] RECEIVED NEW JOB: {job_id}", flush=True)
    print(
        f"[WORKER] Number of images: {len(files)}",
        flush=True,
    )
    print("=" * 70, flush=True)

    image_paths = []

    try:
        # Save uploaded images locally.
        for index, upload in enumerate(files, start=1):
            suffix = os.path.splitext(upload.filename or ".jpg")[1]

            fd, path = tempfile.mkstemp(
                suffix=suffix
            )

            os.close(fd)

            contents = await upload.read()

            with open(path, "wb") as output:
                output.write(contents)

            image_paths.append(path)

            print(
                f"[WORKER] Saved image {index}: {path}",
                flush=True,
            )

        jobs[job_id] = {
            "status": "processing",
        }

        # IMPORTANT:
        # Start a real background thread.
        # We do NOT wait for Ollama here.
        thread = threading.Thread(
            target=process_job,
            args=(job_id, image_paths),
            daemon=True,
        )

        thread.start()

        print(
            f"[WORKER] Background processing started: {job_id}",
            flush=True,
        )

        # This response takes only a few seconds.
        return {
            "jobId": job_id,
            "status": "processing",
        }

    except Exception:
        # If job setup itself fails, clean up.
        for path in image_paths:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError:
                pass

        raise


# ---------------------------------------------------------
# Get job status
# ---------------------------------------------------------

@app.get("/jobs/{job_id}")
def get_job(job_id: str):

    job = jobs.get(job_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="Job not found.",
        )

    return {
        "jobId": job_id,
        **job,
    }
