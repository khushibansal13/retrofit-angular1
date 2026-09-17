import base64
import logging
import os
import cv2
import numpy as np

logger = logging.getLogger("door_vision_inpainter")

def clean_door_inpaint(image_path: str, handing: str = "right_hand") -> str:
    """
    Automatically detects and removes existing door lock & handle hardware
    and any user placement marker dots from a door photo using fast Telea inpainting
    and natural texture synthesis.
    
    Returns:
        base64 data URL string (e.g. 'data:image/jpeg;base64,...')
    """
    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Image not found at path: {image_path}")

    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Failed to read image file: {image_path}")

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 1. Determine target placement & handing
    target = detect_target_placement(img, handing_hint=handing)
    is_left = target.get("is_left", False)
    
    mask = np.zeros((h, w), dtype=np.uint8)
    
    # 2. Erase any user placement white marker dot / sticker
    _, thresh_white = cv2.threshold(gray, 215, 255, cv2.THRESH_BINARY)
    cnts, _ = cv2.findContours(thresh_white, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in cnts:
        area = cv2.contourArea(c)
        if 15 < area < 5000:
            (cx, cy), radius = cv2.minEnclosingCircle(c)
            y_pct = cy / h * 100
            if 35 <= y_pct <= 75:
                pad = max(int(radius * 2.8), 16)
                cv2.circle(mask, (int(cx), int(cy)), pad, 255, -1)

    if target.get("type") == "marker_dot":
        cx = int(target["x"] * w / 100)
        cy = int(target["y"] * h / 100)
        pad = max(22, int(min(w, h) * 0.035))
        cv2.circle(mask, (cx, cy), pad, 255, -1)

    # 3. Erase existing lock hardware (handles, rosettes, escutcheon plates, cylinders)
    y1 = int(h * 0.35)
    y2 = int(h * 0.72)
    if is_left:
        x1 = int(w * 0.02)
        x2 = int(w * 0.48)
    else:
        x1 = int(w * 0.52)
        x2 = int(w * 0.98)

    roi = gray[y1:y2, x1:x2]
    if roi.size > 0:
        med_val = np.median(roi)
        diff = np.abs(roi.astype(np.float32) - med_val)
        threshold = max(20.0, float(np.percentile(diff, 60)))
        hw_mask = (diff > threshold).astype(np.uint8) * 255

        close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        hw_mask = cv2.morphologyEx(hw_mask, cv2.MORPH_CLOSE, close_kernel)

        kernel_size = max(5, int(min(w, h) * 0.018))
        if kernel_size % 2 == 0:
            kernel_size += 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        hw_mask = cv2.dilate(hw_mask, kernel, iterations=2)

        coverage = np.sum(hw_mask > 0) / hw_mask.size
        if 0.015 < coverage < 0.85:
            mask[y1:y2, x1:x2] = cv2.bitwise_or(mask[y1:y2, x1:x2], hw_mask)

    # 4. Inpaint using Telea texture synthesis
    inpaint_radius = max(5, int(min(w, h) * 0.007))
    clean_img = cv2.inpaint(img, mask, inpaintRadius=inpaint_radius, flags=cv2.INPAINT_TELEA)

    # 5. Convert clean image to base64 Data URL
    _, buffer = cv2.imencode(".jpg", clean_img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    b64_str = base64.b64encode(buffer).decode("utf-8")
    data_url = f"data:image/jpeg;base64,{b64_str}"
    
    logger.info("Successfully inpainted clean door for %s in %dx%d resolution", image_path, w, h)
    return data_url


def detect_target_placement(img_or_path, handing_hint: str = "unknown") -> dict:
    """
    Detects target lock placement coordinates (e.g. user-placed white dot / sticker or existing lock center).
    Returns dict: {'x': float (%), 'y': float (%), 'is_left': bool, 'type': 'marker_dot' | 'existing_lock' | 'default'}
    """
    if isinstance(img_or_path, str):
        img = cv2.imread(img_or_path)
    else:
        img = img_or_path

    if img is None:
        return {'x': 62.0, 'y': 50.0, 'is_left': False, 'type': 'default'}

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Search for explicit target marker dot (e.g. white circular dot in lock zone 38% to 72% height)
    _, thresh = cv2.threshold(gray, 225, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if 20 < area < 4500:
            (cx, cy), radius = cv2.minEnclosingCircle(cnt)
            circle_area = np.pi * (radius ** 2)
            circularity = area / circle_area if circle_area > 0 else 0
            x, y, bw, bh = cv2.boundingRect(cnt)
            aspect = bw / float(bh) if bh > 0 else 0

            y_pct = cy / h * 100
            x_pct = cx / w * 100

            if 0.65 < circularity <= 1.25 and 0.7 < aspect < 1.35 and 38 <= y_pct <= 72:
                pad = int(radius * 1.5)
                y1, y2 = max(0, int(cy - pad)), min(h, int(cy + pad))
                x1, x2 = max(0, int(cx - pad)), min(w, int(cx + pad))
                surround = gray[y1:y2, x1:x2]
                if np.mean(surround) < 220:  # Has contrast with surrounding area
                    return {
                        'x': round(float(x_pct), 1),
                        'y': round(float(y_pct), 1),
                        'is_left': bool(x_pct < 50),
                        'type': 'marker_dot'
                    }

    # 2. Check handing based on contrast variance in lock zones
    left_roi = gray[int(h * 0.36):int(h * 0.70), int(w * 0.05):int(w * 0.45)]
    right_roi = gray[int(h * 0.36):int(h * 0.70), int(w * 0.55):int(w * 0.95)]
    left_var = cv2.Laplacian(left_roi, cv2.CV_64F).var() if left_roi.size > 0 else 0
    right_var = cv2.Laplacian(right_roi, cv2.CV_64F).var() if right_roi.size > 0 else 0

    if "left" in handing_hint.lower():
        is_left = True
    elif "right" in handing_hint.lower():
        is_left = False
    else:
        is_left = left_var > right_var

    return {
        'x': 28.0 if is_left else 72.0,
        'y': 52.0,
        'is_left': is_left,
        'type': 'handing_default'
    }
