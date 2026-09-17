import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ArSessionService {
  private doorImageUrl: string | null = null;
  private cleanDoorImageUrl: string | null = null;
  private readonly STORAGE_KEY = 'retrofit-door-image-data';
  private readonly CLEAN_STORAGE_KEY = 'retrofit-clean-door-image-data';

  constructor() {
    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.doorImageUrl = stored;
      }
      try {
        sessionStorage.removeItem(this.CLEAN_STORAGE_KEY);
      } catch {
        // Ignore
      }
      this.cleanDoorImageUrl = null;
    } catch {
      // Storage access may be limited
    }
  }

  setDoorImage(file: File, resetCleanState = false): void {
    if (resetCleanState) {
      this.clearDoorImage();
    } else if (this.doorImageUrl && this.doorImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.doorImageUrl);
    }

    this.doorImageUrl = URL.createObjectURL(file);

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        try {
          sessionStorage.setItem(this.STORAGE_KEY, base64);
        } catch {
          // Ignore quota error
        }
      };
      reader.readAsDataURL(file);
    } catch {
      // Ignore reader error
    }
  }

  setDoorImageUrl(url: string): void {
    this.doorImageUrl = url;
    try {
      sessionStorage.setItem(this.STORAGE_KEY, url);
    } catch {
      // Ignore
    }
  }

  getDoorImageUrl(): string {
    if (this.doorImageUrl) {
      return this.doorImageUrl;
    }

    try {
      const stored = sessionStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.doorImageUrl = stored;
        return stored;
      }
    } catch {
      // Ignore
    }

    return '/sample-doors/default-door.jpg';
  }

  hasCustomDoorImage(): boolean {
    return !!this.doorImageUrl || !!sessionStorage.getItem(this.STORAGE_KEY);
  }

  clearCleanDoorImage(): void {
    this.cleanDoorImageUrl = null;
    try {
      sessionStorage.removeItem(this.CLEAN_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  setCleanDoorImageUrl(url: string | null): void {
    this.cleanDoorImageUrl = url;
    try {
      if (url) {
        sessionStorage.setItem(this.CLEAN_STORAGE_KEY, url);
      } else {
        sessionStorage.removeItem(this.CLEAN_STORAGE_KEY);
      }
    } catch {
      // Ignore quota error
    }
  }

  getCleanDoorImageUrl(): string | null {
    if (this.cleanDoorImageUrl) {
      return this.cleanDoorImageUrl;
    }
    try {
      const stored = sessionStorage.getItem(this.CLEAN_STORAGE_KEY);
      if (stored) {
        this.cleanDoorImageUrl = stored;
        return stored;
      }
    } catch {
      // Ignore
    }
    return null;
  }

  hasCleanDoorImage(): boolean {
    return !!this.getCleanDoorImageUrl();
  }

  private readonly PRODUCT_KEY = 'retrofit-selected-product';
  private readonly FINISH_KEY = 'retrofit-selected-finish';
  private readonly PLACEMENT_KEY = 'retrofit-ar-placement';

  setSelectedProduct(productId: string, finish?: string): void {
    try {
      sessionStorage.setItem(this.PRODUCT_KEY, productId);
      if (finish) {
        sessionStorage.setItem(this.FINISH_KEY, finish);
      }
    } catch {
      // Storage access may be limited
    }
  }

  getSelectedProductId(): string | null {
    try {
      return sessionStorage.getItem(this.PRODUCT_KEY);
    } catch {
      return null;
    }
  }

  setSelectedFinish(finish: string): void {
    try {
      sessionStorage.setItem(this.FINISH_KEY, finish);
    } catch {
      // Storage access may be limited
    }
  }

  getSelectedFinish(): string | null {
    try {
      return sessionStorage.getItem(this.FINISH_KEY);
    } catch {
      return null;
    }
  }

  savePlacement(placement: { x: number; y: number; scale: number; rotation: number; isPlaced?: boolean; flipHorizontal?: boolean }): void {
    try {
      sessionStorage.setItem(this.PLACEMENT_KEY, JSON.stringify(placement));
    } catch {
      // Storage access may be limited
    }
  }

  getPlacement(): { x: number; y: number; scale: number; rotation: number; isPlaced?: boolean; flipHorizontal?: boolean } | null {
    try {
      const data = sessionStorage.getItem(this.PLACEMENT_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Storage access may be limited
    }
    return null;
  }

  private readonly TARGET_PLACEMENT_KEY = 'retrofit-target-placement';

  setTargetPlacement(placement: { x: number; y: number; is_left: boolean; type?: string } | null): void {
    try {
      if (placement) {
        sessionStorage.setItem(this.TARGET_PLACEMENT_KEY, JSON.stringify(placement));
      } else {
        sessionStorage.removeItem(this.TARGET_PLACEMENT_KEY);
      }
    } catch {
      // Storage access may be limited
    }
  }

  getTargetPlacement(): { x: number; y: number; is_left: boolean; type?: string } | null {
    try {
      const data = sessionStorage.getItem(this.TARGET_PLACEMENT_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // Storage access may be limited
    }
    return null;
  }

  clearDoorImage(): void {
    if (this.doorImageUrl && this.doorImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.doorImageUrl);
    }
    this.doorImageUrl = null;
    this.cleanDoorImageUrl = null;
    try {
      sessionStorage.removeItem(this.STORAGE_KEY);
      sessionStorage.removeItem(this.CLEAN_STORAGE_KEY);
      sessionStorage.removeItem(this.TARGET_PLACEMENT_KEY);
    } catch {
      // Ignore
    }
  }
}
