from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field

class DoorStandard(str, Enum):
    EURO_PROFILE = "euro_profile"                          # Teardrop Euro cylinder present
    PASSAGE_LATCH_EURO = "passage_latch_euro"              # Euro latch only, NO cylinder
    CYLINDRICAL_KNOB_OR_LEVER = "cylindrical_knob_or_lever"# ANSI/Tubular cylindrical knob or lever
    SURFACE_RIM_LOCK = "surface_rim_lock"                  # Surface-mounted night latch / rim box (Europa 3-bolt)
    US_DEADBOLT = "US_deadbolt"                            # US Deadbolt
    US_INTERCONNECTED = "US_interconnected"               # Interconnected
    ANSI = "ANSI"                                          # Commercial ANSI Mortise
    TRADITIONAL_LEVER = "traditional_lever"                # Skeleton/lever keyway
    UNKNOWN = "unknown"

class Handing(str, Enum):
    LEFT_HAND = "left_hand"
    RIGHT_HAND = "right_hand"
    UNKNOWN = "unknown"

class ThicknessClass(str, Enum):
    THIN_UNDER_35MM = "under_35mm"
    STANDARD_35_55MM = "35_to_55mm"
    THICK_55_85MM = "55_to_85mm"
    OVER_85MM = "over_85mm"
    UNKNOWN = "unknown"

class StileWidthClass(str, Enum):
    NARROW_UNDER_60MM = "narrow_stile"
    WIDE_OVER_60MM = "standard_stile"
    UNKNOWN = "unknown"

class LockType(str, Enum):
    EURO_CYLINDER = "euro_profile_cylinder"
    CYLINDRICAL_KNOB = "cylindrical_knob"
    RIM_CYLINDER = "rim_cylinder"                          # Surface mounted lock box / night latch
    NO_LOCK_PASSAGE = "no_lock_passage"
    MECHANICAL_DEADBOLT = "mechanical_deadbolt"
    INTERCONNECTED_DEADBOLT = "interconnected_deadbolt"
    MORTISE = "mortise"
    TUBULAR_LATCH = "tubular_latch"
    MORTISE_KEYHOLE = "mortise_keyhole"
    UNKNOWN = "unknown"

class DoorMaterial(str, Enum):
    WOOD = "Wood"
    GLASS = "Glass"
    METAL = "Metal"
    UNKNOWN = "Unknown"

class ComponentObs(BaseModel):
    detected: bool
    confidence: float = Field(..., ge=0.0, le=1.0)
    visual_evidence: str

class LockObs(ComponentObs):
    lock_type: LockType
    cylinder_visible: bool
    deadbolt_present: bool

class DoorProfile(BaseModel):
    door_material: DoorMaterial
    material_confidence: float = Field(..., ge=0.0, le=1.0)
    door_style: str
    door_standard: DoorStandard
    door_standard_confidence: float = Field(..., ge=0.0, le=1.0)
    handing: Handing
    handing_confidence: float = Field(..., ge=0.0, le=1.0)
    approx_thickness_class: ThicknessClass
    stile_width_class: StileWidthClass
    lock: LockObs
    frame: ComponentObs
    handle: ComponentObs

    measured_thickness_mm: Optional[float] = None
    measured_backset_mm: Optional[float] = None
    measured_center_to_center_mm: Optional[float] = None
