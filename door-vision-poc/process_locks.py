import os
import numpy as np
from PIL import Image
from collections import deque
import shutil

output_dir = os.path.join(os.path.dirname(__file__), "..", "public", "locks")
os.makedirs(output_dir, exist_ok=True)

def clean_image(input_path, output_path, crop_box=None, bg_threshold=226):
    im = Image.open(input_path)
    arr = np.array(im)
    
    if crop_box is not None:
        y1, y2, x1, x2 = crop_box
        arr = arr[y1:y2, x1:x2]
    
    h, w, c = arr.shape
    is_bg = np.zeros((h, w), dtype=bool)
    visited = np.zeros((h, w), dtype=bool)
    
    q = deque()
    for x in range(w):
        q.append((0, x))
        q.append((h - 1, x))
        visited[0, x] = True
        visited[h - 1, x] = True
    for y in range(h):
        q.append((y, 0))
        q.append((y, w - 1))
        visited[y, 0] = True
        visited[y, w - 1] = True
        
    while q:
        y, x = q.popleft()
        r, g, b, a = arr[y, x]
        if a < 10:
            is_bg[y, x] = True
            for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                    visited[ny, nx] = True
                    q.append((ny, nx))
            continue
            
        is_neutral = (abs(int(r) - int(g)) <= 8) and (abs(int(g) - int(b)) <= 8) and (abs(int(r) - int(b)) <= 8)
        if r >= bg_threshold and g >= bg_threshold and b >= bg_threshold and is_neutral:
            is_bg[y, x] = True
            for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                    visited[ny, nx] = True
                    q.append((ny, nx))

    clean = arr.copy()
    clean[is_bg, 3] = 0
    
    alpha = clean[:, :, 3] > 10
    if not np.any(alpha):
        print(f"Warning: Empty result for {input_path}")
        return
        
    rmin, rmax = np.where(np.any(alpha, axis=1))[0][[0, -1]]
    cmin, cmax = np.where(np.any(alpha, axis=0))[0][[0, -1]]
    
    final_img = Image.fromarray(clean[rmin:rmax+1, cmin:cmax+1])
    final_img.save(output_path, 'PNG')
    print(f"Saved {os.path.basename(output_path)}: {final_img.size}")

def generate_black_variant(src_path, out_path):
    im = Image.open(src_path)
    arr = np.array(im).copy()
    is_green = (arr[:, :, 1] > arr[:, :, 0] + 30) & (arr[:, :, 1] > arr[:, :, 2] + 30)
    is_already_dark = (arr[:, :, 0] < 75) & (arr[:, :, 1] < 75) & (arr[:, :, 2] < 75)
    is_metal = (arr[:, :, 3] > 10) & (~is_green) & (~is_already_dark)
    metal_vals = arr[is_metal, :3].astype(float)
    scaled_metal = (metal_vals * 0.22 + 10).clip(20, 85).astype(np.uint8)
    arr[is_metal, :3] = scaled_metal
    Image.fromarray(arr).save(out_path, 'PNG')
    print(f"Saved black variant: {os.path.basename(out_path)}")
