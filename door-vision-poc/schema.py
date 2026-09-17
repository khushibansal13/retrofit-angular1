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

    # New: three real cases from customer test photos that had nowhere to
    # go before — forcing them into one of the categories above would have
    # produced a confidently wrong answer, so they get their own honest
    # "we don't have a matching product / need more info" treatment in
    # engine.py instead.
    GLASS_PATCH_LOCK = "glass_patch_lock"                  # Frameless glass door, patch fittings/patch lock
    EXISTING_ELECTRONIC_LOCK = "existing_electronic_lock"  # Door or adjacent wall already has a keypad/reader/smart lock
    NO_HARDWARE_PREPARED = "no_hardware_prepared"          # Bare door slab, no lock cut or installed at all

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

    # Matches the three new DoorStandard cases above.
    PATCH_LOCK = "patch_lock"
    ELECTRONIC_EXISTING = "electronic_existing"
    NONE_PREPARED = "none_prepared"

    UNKNOWN = "unknown"

class HandlePosition(str, Enum):
    TOP = "top"          # Near the top of the lock case — Scandinavian-style prep
    CENTER = "center"     # Roughly centered — most common ANSI/DIN prep
    BOTTOM = "bottom"     # Below the cylinder/deadbolt
    UNKNOWN = "unknown"

class HandleType(str, Enum):
    LEVER = "lever"
    KNOB = "knob"
    PULL_BAR = "pull_bar"
    UNKNOWN = "unknown"

class ComponentObs(BaseModel):
    detected: bool
    confidence: float = Field(..., ge=0.0, le=1.0)
    visual_evidence: str

class LockObs(ComponentObs):
    lock_type: LockType
    cylinder_visible: bool

    # NOTE: this is broader than "is there a US-style deadbolt cylinder".
    # Set it true for ANY additional throw-bolt hardware beyond the main
    # handle/latch — a separate round/square deadbolt, a manual sliding or
    # barrel bolt (aldrop) mounted on the surface, or a separate keyhole-only
    # plate with no handle. It's independent of lock_type: a door can have
    # deadbolt_present=true even when its primary lock_type is a cylindrical
    # knob, if it also has one of these added on. See analyzer.py's prompt.
    deadbolt_present: bool

class HandleObs(ComponentObs):
    handle_position: HandlePosition
    handle_type: HandleType

class DoorProfile(BaseModel):
    door_material: str
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
    handle: HandleObs

    measured_thickness_mm: Optional[float] = None
    measured_backset_mm: Optional[float] = None
    measured_center_to_center_mm: Optional[float] = None
