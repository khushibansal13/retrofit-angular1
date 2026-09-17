import json
from typing import Any, Dict, List, Optional
from schema import DoorProfile, DoorStandard

STATUS_RANK = {"compatible": 0, "missing_information": 1, "incompatible": 2}


class SaltoCompatibilityEngine:
    def __init__(self, seed_file: str = "retrofit_ai_demo_seed_dataset.json"):
        with open(seed_file, "r") as f:
            self.data = json.load(f)
        self.products = self.data.get("products", [])

    def evaluate(self, profile: DoorProfile) -> List[Dict[str, Any]]:
        results = [self._evaluate_product(p, profile) for p in self.products]
        results.sort(key=lambda r: STATUS_RANK.get(r["status"], 3))
        return results

    def _evaluate_product(
        self, p: Dict[str, Any], profile: DoorProfile
    ) -> Dict[str, Any]:
        prod_id = p["product_id"]
        name = p["name"]
        source_doc = p.get("source_documents", ["Salto Technical Specs"])[0]
        rules: Dict[str, Any] = p.get("compatibility_rules", {})

        if profile.door_standard == DoorStandard.UNKNOWN:
            return {
                "product_id": prod_id,
                "name": name,
                "family": p.get("family"),
                "status": "missing_information",
                "reasons": [
                    "We couldn't confidently identify your current lock type yet — "
                    "tell us what it looks like, or upload a clearer close-up photo."
                ],
                "missing_inputs": ["door_standard"],
                "source_document": source_doc,
            }

        if not rules:
            return {
                "product_id": prod_id,
                "name": name,
                "family": p.get("family"),
                "status": "missing_information",
                "reasons": ["No compatibility rules are configured for this product yet."],
                "missing_inputs": [],
                "source_document": source_doc,
            }

        reasons: List[str] = []
        cautions: List[str] = []
        missing: List[str] = []
        worst_status = "compatible"

        def escalate(new_status: str) -> None:
            nonlocal worst_status
            if STATUS_RANK.get(new_status, 0) > STATUS_RANK.get(worst_status, 0):
                worst_status = new_status

        # door_standard — every product has this rule; it's the primary gate.
        rule = rules.get("door_standard")
        if rule:
            if profile.door_standard.value in rule.get("any_of", []):
                if rule.get("pass_message"):
                    reasons.append(rule["pass_message"])
            else:
                escalate(rule.get("on_fail", "incompatible"))
                reasons.append(
                    rule.get(
                        "fail_message",
                        f"Requires a different door standard; detected {profile.door_standard.value}.",
                    )
                )

        # lock_type — currently only DLok Euro distinguishes "cylinder
        # actually visible" from "Euro-prepped but only a passage latch".
        rule = rules.get("lock_type")
        if rule and worst_status != "incompatible":
            if profile.lock.lock_type.value in rule.get("any_of", []):
                if rule.get("pass_message"):
                    reasons.append(rule["pass_message"])
            else:
                escalate(rule.get("on_fail", "missing_information"))
                reasons.append(
                    rule.get("fail_message", "Required lock hardware not confirmed yet.")
                )
                missing.append("lock_type")

        # thickness_mm — real datasheet-verified ranges, now checked for
        # ALL 5 products instead of just 2. Previously DLok Euro didn't
        # check thickness at all, and XS4 Euro/ANSI only checked whether a
        # value was *present*, never whether it was actually in range.
        rule = rules.get("thickness_mm")
        if rule and worst_status != "incompatible":
            if profile.measured_thickness_mm is None:
                escalate("missing_information")
                missing.append(f"door_thickness_mm (Required: {rule['min']}-{rule['max']}mm)")
                reasons.append(
                    f"Confirm door thickness ({rule['min']}-{rule['max']}mm required) to finish checking fit."
                )
            elif rule["min"] <= profile.measured_thickness_mm <= rule["max"]:
                if rule.get("pass_message"):
                    reasons.append(rule["pass_message"])
            else:
                escalate(rule.get("on_fail", "incompatible"))
                reasons.append(
                    rule.get("fail_message", "Door thickness is outside the supported range.")
                )

        # backset_mm — was previously hand-authored only for the two DBolt
        # products; now driven by the same dataset field for anything that
        # declares it.
        rule = rules.get("backset_mm")
        if rule and worst_status != "incompatible":
            tolerance = rule.get("tolerance", 0)
            options = rule.get("any_of", [])
            if profile.measured_backset_mm is None:
                escalate("missing_information")
                missing.append(f"backset_mm (one of: {', '.join(str(v) for v in options)}mm)")
            elif any(abs(profile.measured_backset_mm - v) <= tolerance for v in options):
                if rule.get("pass_message"):
                    reasons.append(rule["pass_message"])
            else:
                escalate(rule.get("on_fail", "incompatible"))
                reasons.append(
                    rule.get("fail_message", "Backset doesn't match a supported option.")
                )

        # center_to_center_mm — DBolt Touch IC only.
        rule = rules.get("center_to_center_mm")
        if rule and worst_status != "incompatible":
            tolerance = rule.get("tolerance", 0)
            options = rule.get("any_of", [])
            if profile.measured_center_to_center_mm is None:
                escalate("missing_information")
                missing.append(
                    f"center_to_center_mm (one of: {', '.join(str(v) for v in options)}mm)"
                )
            elif any(abs(profile.measured_center_to_center_mm - v) <= tolerance for v in options):
                if rule.get("pass_message"):
                    reasons.append(rule["pass_message"])
            else:
                escalate(rule.get("on_fail", "incompatible"))
                reasons.append(
                    rule.get(
                        "fail_message",
                        "Center-to-center spacing doesn't match a supported fitting.",
                    )
                )

        # lever_style / faceplate_mm / handle_to_cylinder_mm — real,
        # datasheet-verified constraints that exist in the dataset, but the
        # app doesn't collect lever style, faceplate shape, or send the
        # "cylinder-to-handle distance" specs-screen answer to the backend
        # yet. Surfacing them as a standing caution rather than silently
        # ignoring verified data — this is honest about what we haven't
        # wired up yet, not a false "fully checked" claim.
        if worst_status == "compatible":
            for key in ("lever_style", "faceplate_mm", "handle_to_cylinder_mm"):
                rule = rules.get(key)
                if rule:
                    cautions.append(
                        rule.get(
                            "fail_message",
                            f"{key.replace('_', ' ')} not yet confirmed — verify with an installer photo.",
                        )
                    )

        # Surface rim lock is a special case none of the dataset's
        # door_standard rules encode a nuanced answer for: DLok/DBolt are a
        # hard no, but XS4 just needs the surface box removed and a mortise
        # cut — worth a specific message instead of the generic
        # "requires a different door standard" text.
        if profile.door_standard == DoorStandard.SURFACE_RIM_LOCK:
            if prod_id in ("salto_dlok_euro", "salto_dbolt_touch", "salto_dbolt_touch_ic"):
                worst_status = "incompatible"
                reasons = [
                    "Incompatible: Surface rim lock box detected. Residential DLok/DBolt requires a mortise or tubular cross-bore."
                ]
                cautions = []
            elif prod_id.startswith("salto_xs4"):
                worst_status = "missing_information"
                if "door_mortise_preparation" not in missing:
                    missing.append("door_mortise_preparation")
                reasons = [
                    "Surface rim lock detected. Retrofitting an XS4 escutcheon requires removing the surface box and cutting a standard mortise pocket."
                ]
                cautions = []

        return {
            "product_id": prod_id,
            "name": name,
            "family": p.get("family"),
            "status": worst_status,
            "reasons": reasons + cautions,
            "missing_inputs": missing,
            "source_document": source_doc,
        }
