import argparse
import json
import os
import time
from typing import List

import requests
from bs4 import BeautifulSoup
from ollama import Client


# Separate from ANALYZER_MODEL_NAME (analyzer.py) since this is a text-only
# extraction task, not vision — a plain instruction-following model is fine
# and is usually faster/cheaper than a VL model for this.
INGEST_MODEL_NAME = os.environ.get(
    "INGEST_MODEL_NAME",
    "qwen2.5:3b",
)

# Railway Ollama service
# Ollama running locally, exposed to Railway through Cloudflare Tunnel
OLLAMA_HOST = os.environ.get(
    "OLLAMA_HOST",
    "http://localhost:11434",
)
ollama_client = Client(host=OLLAMA_HOST)


REVIEW_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "product_ingest_review",
)

MAX_SOURCE_CHARS = 12000


# =========================================================
# SOURCE FETCHING
# =========================================================

def fetch_text(source: str) -> str:
    if source.startswith("http://") or source.startswith("https://"):
        return _fetch_url_text(source)

    if source.lower().endswith(".pdf"):
        return _fetch_pdf_text(source)

    with open(source, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def _fetch_url_text(url: str) -> str:
    response = requests.get(
        url,
        timeout=30,
        headers={"User-Agent": "RetrofitAI-Ingest/0.1"},
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    text = soup.get_text(separator="\n")
    lines = [line.strip() for line in text.splitlines()]

    return "\n".join(line for line in lines if line)


def _fetch_pdf_text(path: str) -> str:
    from pypdf import PdfReader

    reader = PdfReader(path)
    pages = [page.extract_text() or "" for page in reader.pages]

    return "\n".join(pages)


# =========================================================
# EXTRACTION SCHEMA
# =========================================================

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "product_id": {"type": "string"},
        "extraction_notes": {
            "type": "string",
            "description": (
                "Anything ambiguous, conflicting, or not found in the "
                "source text — be explicit about gaps rather than guessing."
            ),
        },
        "door_standard": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Door/lock standards this product is documented to fit, "
                "in the source's own words."
            ),
        },
        "lock_type": {
            "type": "array",
            "items": {"type": "string"},
        },
        "door_thickness_mm_min": {
            "type": ["number", "null"],
        },
        "door_thickness_mm_max": {
            "type": ["number", "null"],
        },
        "backset_mm": {
            "type": "array",
            "items": {"type": "number"},
        },
        "center_to_center_mm": {
            "type": "array",
            "items": {"type": "number"},
        },
        "face_plates": {
            "type": "array",
            "items": {"type": "string"},
        },
        "levers": {
            "type": "array",
            "items": {"type": "string"},
        },
        "handing_support": {
            "type": "string",
            "enum": [
                "left_hand_only",
                "right_hand_only",
                "both_reversible",
                "unknown",
            ],
        },
        "swing_direction_support": {
            "type": "string",
            "enum": [
                "inward_only",
                "outward_only",
                "both",
                "unknown",
            ],
        },
        "hinge_notes": {
            "type": "string",
            "description": (
                "Any hinge/clearance requirement mentioned in the source. "
                "Empty string if none found."
            ),
        },
        "market_countries_or_regions": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Countries/regions the source explicitly states this "
                "product targets or is certified for. Do NOT infer "
                "from language of the page alone."
            ),
        },
        "certifications": {
            "type": "array",
            "items": {"type": "string"},
        },
        "technology_platforms": {
            "type": "array",
            "items": {"type": "string"},
        },
        "wireless": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": [
        "product_id",
        "extraction_notes",
        "door_standard",
        "lock_type",
        "door_thickness_mm_min",
        "door_thickness_mm_max",
        "backset_mm",
        "center_to_center_mm",
        "face_plates",
        "levers",
        "handing_support",
        "swing_direction_support",
        "hinge_notes",
        "market_countries_or_regions",
        "certifications",
        "technology_platforms",
        "wireless",
    ],
}


EXTRACTION_PROMPT = """
You are extracting structured technical specifications for a SALTO access
control lock product, from real source text (a product page or datasheet).

STRICT RULES:
- Only extract facts that are actually present in the provided text.
- If a field is not mentioned in the source, use null / an empty array /
  "unknown" as appropriate. NEVER invent a plausible-sounding number.
- If the source is ambiguous or contradicts itself, say so in
  extraction_notes rather than picking one interpretation silently.
- market_countries_or_regions must come from an EXPLICIT statement in the
  text (e.g. "available in the UK and Ireland"). Do not infer availability
  from the page's language, currency, or domain.

Return ONLY JSON matching the schema.
"""


# =========================================================
# EXTRACTION
# =========================================================

def extract_product_spec(product_id: str, source_texts: List[str]) -> dict:
    combined = "\n\n---SOURCE BREAK---\n\n".join(
        text[:MAX_SOURCE_CHARS] for text in source_texts
    )

    response = ollama_client.chat(
        model=INGEST_MODEL_NAME,
        messages=[
            {
                "role": "system",
                "content": EXTRACTION_PROMPT,
            },
            {
                "role": "user",
                "content": (
                    f"product_id: {product_id}\n\n"
                    f"SOURCE TEXT:\n{combined}"
                ),
            },
        ],
        format=EXTRACTION_SCHEMA,
        options={"temperature": 0},
    )

    result = json.loads(
        response.message.content.strip()
    )

    result["needs_human_review"] = True
    result["extraction_model"] = INGEST_MODEL_NAME
    result["extracted_at"] = time.strftime(
        "%Y-%m-%dT%H:%M:%SZ",
        time.gmtime(),
    )

    return result


# =========================================================
# CLI
# =========================================================

def main():
    parser = argparse.ArgumentParser(
        description="Ingest SALTO product specs via LLM extraction."
    )

    parser.add_argument(
        "--product-id",
        required=True,
    )

    parser.add_argument(
        "--source",
        action="append",
        required=True,
        help="A URL or local file (.pdf/.txt/.md). Repeatable.",
    )

    args = parser.parse_args()

    print(
        f"[Ingest] Fetching {len(args.source)} source(s) "
        f"for {args.product_id}..."
    )

    source_texts = []

    for source in args.source:
        print(f"[Ingest]   - {source}")

        try:
            text = fetch_text(source)
            source_texts.append(text)
        except Exception as error:
            print(f"[Ingest]     FAILED: {error}")

    if not source_texts:
        raise SystemExit(
            "No sources could be fetched. Aborting."
        )

    print(
        f"[Ingest] Extracting structured spec with "
        f"{INGEST_MODEL_NAME}..."
    )

    result = extract_product_spec(
        args.product_id,
        source_texts,
    )

    os.makedirs(REVIEW_DIR, exist_ok=True)

    out_path = os.path.join(
        REVIEW_DIR,
        f"{args.product_id}_{int(time.time())}.json",
    )

    with open(
        out_path,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            result,
            f,
            indent=2,
        )

    print(f"[Ingest] Wrote review file: {out_path}")

    print(
        "[Ingest] This is a DRAFT — verify every field "
        "against the real datasheet"
    )

    print(
        "[Ingest] before copying anything into "
        "retrofit_ai_demo_seed_dataset.json."
    )


if __name__ == "__main__":
    main()
