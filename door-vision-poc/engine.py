import json
from typing import List, Dict, Any
from schema import DoorProfile, DoorStandard

class SaltoCompatibilityEngine:
    def __init__(self, seed_file: str = "retrofit_ai_demo_seed_dataset.json"):
        with open(seed_file, "r") as f:
            self.data = json.load(f)
        self.products = self.data.get("products", [])

    def evaluate(self, profile: DoorProfile) -> List[Dict[str, Any]]:
        results = []

        for p in self.products:
            prod_id = p["product_id"]
            name = p["name"]
            status = "incompatible"
            reasons = []
            missing = []
            source_doc = p.get("source_documents", ["Salto Technical Specs"])[0]

            # 1. SALTO DLok Euro
            if prod_id == "salto_dlok_euro":
                if profile.door_standard == DoorStandard.EURO_PROFILE and profile.lock.cylinder_visible:
                    status = "compatible"
                    reasons.append("Euro profile cylinder detected. Direct cylinder retrofit supported.")
                elif profile.door_standard in [DoorStandard.EURO_PROFILE, DoorStandard.PASSAGE_LATCH_EURO] and not profile.lock.cylinder_visible:
                    status = "missing_information"
                    missing.append("euro_cylinder_installation")
                    reasons.append("Passage latch detected (no cylinder found). Requires Euro-profile mortise cassette before installing DLok.")
                elif profile.door_standard == DoorStandard.CYLINDRICAL_KNOB_OR_LEVER:
                    status = "incompatible"
                    reasons.append("Incompatible: Cylindrical knob lock detected. DLok Euro requires a DIN Euro profile mortise cylinder.")
                else:
                    reasons.append(f"Requires Euro Profile Cylinder; detected {profile.door_standard.value}.")

            # 2. SALTO XS4 Original+ EURO
            elif prod_id == "salto_xs4_original_plus_euro":
                if profile.door_standard in [DoorStandard.EURO_PROFILE, DoorStandard.PASSAGE_LATCH_EURO]:
                    if profile.measured_thickness_mm is None:
                        status = "missing_information"
                        missing.append("door_thickness_mm")
                        reasons.append("Euro door profile confirmed. Confirm thickness to size spindle.")
                    else:
                        status = "compatible"
                        reasons.append(f"Compatible with European DIN mortise. Handing: {profile.handing.value}.")
                else:
                    reasons.append(f"Requires European profile door; detected {profile.door_standard.value}.")

            # 3. SALTO DBolt Touch
            elif prod_id == "salto_dbolt_touch":
                if profile.door_standard == DoorStandard.US_DEADBOLT:
                    if profile.measured_thickness_mm is None:
                        status = "missing_information"
                        missing.append("door_thickness_mm (Required: 35-85mm)")
                        reasons.append("US Deadbolt detected. Awaiting thickness confirmation.")
                    elif 35 <= profile.measured_thickness_mm <= 85:
                        status = "compatible"
                        reasons.append(f"Door thickness {profile.measured_thickness_mm}mm supported (35-85mm).")
                    else:
                        status = "incompatible"
                        reasons.append("Door thickness out of range.")
                else:
                    reasons.append(f"Requires US Deadbolt standard; detected {profile.door_standard.value}.")

            # 4. SALTO DBolt Touch Interconnected
            elif prod_id == "salto_dbolt_touch_ic":
                if profile.door_standard == DoorStandard.US_INTERCONNECTED:
                    if profile.measured_thickness_mm is None:
                        status = "missing_information"
                        missing.append("door_thickness_mm (Required: 40-85mm)")
                        reasons.append("Interconnected standard detected. Awaiting thickness confirmation.")
                    elif 40 <= profile.measured_thickness_mm <= 85:
                        status = "compatible"
                        reasons.append(f"Door thickness {profile.measured_thickness_mm}mm supported (40-85mm).")
                    else:
                        status = "incompatible"
                        reasons.append("Door thickness out of range (requires 40-85mm).")
                else:
                    reasons.append(f"Requires US Interconnected standard; detected {profile.door_standard.value}.")

            # 5. SALTO XS4 Original+ ANSI
            elif prod_id == "salto_xs4_original_plus_ansi":
                if profile.door_standard in [DoorStandard.ANSI, DoorStandard.CYLINDRICAL_KNOB_OR_LEVER, DoorStandard.US_DEADBOLT]:
                    if profile.measured_thickness_mm is None:
                        status = "missing_information"
                        missing.append("door_thickness_mm")
                        reasons.append("Cylindrical/ANSI preparation detected. Confirm door thickness to check spindle sizing.")
                    else:
                        status = "compatible"
                        reasons.append("Directly compatible: Retrofits standard cylindrical knob/lever cross-bore using Salto ANSI cylindrical latch cartridge.")
                else:
                    reasons.append(f"Requires ANSI/Cylindrical door standard; detected {profile.door_standard.value}.")

            # 6. Surface Rim Lock Advisory
            # FIX: this used to be a second, unrelated `if/else` — its `else`
            # fired on every product that wasn't a surface rim lock, tacking
            # a bogus "Product rule not matched" reason onto every already-
            # correct result above. It's now nested inside the branch it
            # actually concerns, and only touches status/reasons for a
            # profile that IS a surface rim lock.
            if profile.door_standard == DoorStandard.SURFACE_RIM_LOCK:
                if prod_id in ["salto_dlok_euro", "salto_dbolt_touch", "salto_dbolt_touch_ic"]:
                    status = "incompatible"
                    reasons = ["Incompatible: Surface rim lock box detected. Residential DLok/DBolt requires a mortise or tubular cross-bore."]
                elif prod_id.startswith("salto_xs4"):
                    status = "missing_information"
                    missing.append("door_mortise_preparation")
                    reasons.append("Surface rim lock detected. Retrofitting an XS4 escutcheon requires removing the surface box and cutting a standard mortise pocket.")

            results.append({
                "product_id": prod_id,
                "name": name,
                "family": p.get("family"),
                "status": status,
                "reasons": reasons,
                "missing_inputs": missing,
                "source_document": source_doc
            })

        order = {"compatible": 0, "missing_information": 1, "incompatible": 2}
        results.sort(key=lambda x: order.get(x["status"], 3))
        return results
