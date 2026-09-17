import streamlit as st
import tempfile, os, json
from analyzer import analyze_door_for_salto
from engine import SaltoCompatibilityEngine

st.set_page_config(page_title="Salto Retrofit AI", layout="wide", page_icon="🔑")
st.title("🔑 SALTO Retrofit AI: B2C Door Scanner")
st.caption("Vision AI extracts architectural observations; deterministic rules decide Salto lock compatibility.")

engine = SaltoCompatibilityEngine()

# --- STEP 1: UPLOAD & ANALYSIS ---
uploaded_files = st.file_uploader(
    "Upload 1 to 5 photos of the door (Wide view, Lock close-up, Door edge)", 
    type=["jpg", "jpeg", "png"], 
    accept_multiple_files=True
)

if uploaded_files:
    cols = st.columns(len(uploaded_files))
    for i, file in enumerate(uploaded_files):
        cols[i].image(file, caption=f"View #{i+1}", use_container_width=True)

    if st.button("1. Analyze Door with Vision AI", type="primary"):
        temp_paths = []
        try:
            for f in uploaded_files:
                t = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
                t.write(f.getvalue())
                t.close()
                temp_paths.append(t.name)

            with st.spinner("Extracting lock standard, handing, and material..."):
                profile = analyze_door_for_salto(temp_paths)
                st.session_state["door_profile"] = profile
        finally:
            for p in temp_paths:
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except OSError:
                        pass

# --- STEP 2: PROFILE & COMPATIBILITY ---
if "door_profile" in st.session_state:
    profile = st.session_state["door_profile"]
    st.divider()
    
    col_left, col_right = st.columns([1, 1.2])
    
    with col_left:
        st.subheader("📋 Detected Door Profile")
        st.write(f"**Standard:** `{profile.door_standard.value}` (Conf: {profile.door_standard_confidence})")
        st.write(f"**Lock Form Factor:** `{profile.lock.lock_type.value}`")
        st.write(f"**Cylinder Visible:** `{profile.lock.cylinder_visible}`")
        st.write(f"**Handing:** `{profile.handing.value}`")
        st.write(f"**Material:** `{profile.door_material}`")
        st.write(f"**Visual Evidence:** {profile.lock.visual_evidence}")
        
        st.subheader("📏 Confirm Measurements")
        st.info("Exact millimeters cannot be guessed by 2D camera. Please verify:")
        thickness = st.slider("Door Thickness (mm)", min_value=25, max_value=100, value=45)
        profile.measured_thickness_mm = thickness

    with col_right:
        st.subheader("🎯 Salto Compatibility Results")
        results = engine.evaluate(profile)

        compatible_products = []

        for res in results:
            if res["status"] == "compatible":
                compatible_products.append(res)
                with st.container(border=True):
                    st.success(f"✅ **{res['name']}** (Compatible)")
                    for r in res["reasons"]:
                        st.write(f"- {r}")
                    st.caption(f"Source: {res['source_document']}")
            elif res["status"] == "missing_information":
                with st.container(border=True):
                    st.warning(f"⚠️ **{res['name']}** (Action Required)")
                    st.write(f"**Prerequisite:** {', '.join(res['missing_inputs'])}")
                    for r in res["reasons"]:
                        st.write(f"- {r}")
                    st.caption(f"Source: {res['source_document']}")
            else:
                with st.container(border=True):
                    st.error(f"❌ **{res['name']}** (Incompatible)")
                    for r in res["reasons"]:
                        st.write(f"- {r}")
                    st.caption(f"Source: {res['source_document']}")

    # --- STEP 3: CONFIGURATION & BOM GENERATION ---
    st.divider()
    st.subheader("🛠️ Step 3: Product Configuration & Bill of Materials (BOM)")
    
    if compatible_products:
        prod_options = {p["name"]: p for p in compatible_products}
        selected_prod_name = st.selectbox("Select Compatible Product to Configure:", list(prod_options.keys()))
        selected_prod = prod_options[selected_prod_name]
        
        cfg_col1, cfg_col2, cfg_col3 = st.columns(3)
        with cfg_col1:
            finish = st.selectbox("Hardware Finish", ["Matte Black", "Satin Chrome", "Polished Brass", "White"])
        with cfg_col2:
            platform = st.selectbox("Platform Ecosystem", ["Salto Homelok", "Salto KS", "Salto Space"])
        with cfg_col3:
            wireless = st.multiselect("Credentials", ["Smartphone (BLE/NFC)", "RFID Keyfob", "PIN Keypad"], default=["Smartphone (BLE/NFC)"])

        # Deterministic BOM Rules based on confirmed door profile
        bom = [
            {"item": f"{selected_prod['name']} Escutcheon/Lock Body", "sku": selected_prod['product_id'].upper().replace("_", "-"), "qty": 1, "type": "Core Unit"},
            {"item": f"Spindle & Screw Pack ({thickness}mm Door Thickness)", "sku": f"SPINDLE-{thickness}MM", "qty": 1, "type": "Mounting Kit"},
            {"item": f"Finish Cover Plate ({finish})", "sku": f"COV-{finish.replace(' ', '').upper()}", "qty": 1, "type": "Aesthetic"},
            {"item": f"Salto System Licensing ({platform})", "sku": "LIC-HOMELOK-RES", "qty": 1, "type": "Software"}
        ]
        
        if "RFID Keyfob" in wireless:
            bom.append({"item": "Contactless MIFARE DESFire EV3 Keyfob", "sku": "SALTO-FOB-EV3", "qty": 2, "type": "Access Media"})

        st.table(bom)
        
        # Customer / Sales Handover Export
        quote_payload = {
            "door_profile": profile.model_dump(),
            "selected_product": selected_prod,
            "configuration": {
                "finish": finish,
                "platform": platform,
                "credentials": wireless,
                "door_thickness_mm": thickness
            },
            "bom": bom
        }
        
        st.download_button(
            label="📥 Download Lead Quote & Handover JSON",
            data=json.dumps(quote_payload, indent=2),
            file_name="salto_retrofit_quote.json",
            mime="application/json"
        )
    else:
        st.info("No directly compatible product selected. Resolve prerequisites under 'Action Required' or consult Salto technical sales.")