import { CommonModule } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ArSessionService } from '../../services/ar-session.service';
import { DoorVisionService } from '../../services/door-vision.service';
import { Product, ALL_PRODUCTS, FINISH_COLORS } from '../../data/products';
import { DoorConfig } from '../../app';

export const PRODUCT_HEIGHTS_MM: Record<string, number> = {
  salto_xs4_original_plus_euro: 282,
  salto_xs4_original_plus_ansi: 290,
  salto_dbolt_touch: 160,
  salto_dbolt_touch_ic: 300,
  salto_dlok_euro: 100,
};

@Component({
  selector: 'app-ar-viewer',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './ar-viewer.component.html',
  styleUrl: './ar-viewer.component.css',
})
export class ArViewerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() config?: DoorConfig;

  // Lets the Hub know the customer wants to leave AR and go back to editing
  // their configuration, without losing any of it.
  @Output() back = new EventEmitter<void>();

  private readonly arSession = inject(ArSessionService);
  private readonly doorVision = inject(DoorVisionService);

  @ViewChild('stage', { static: true })
  stage!: ElementRef<HTMLDivElement>;

  @ViewChild('doorViewport')
  doorViewport?: ElementRef<HTMLDivElement>;

  @ViewChild('doorImageElem')
  doorImageElem?: ElementRef<HTMLImageElement>;

  @ViewChild('doorFileInput')
  doorFileInput?: ElementRef<HTMLInputElement>;

  doorAspectRatio = '2 / 3';
  doorNaturalWidth = 682;
  doorNaturalHeight = 1024;

  doorImageUrl: string = '';
  cleanDoorUrl: string | null = null;
  useCleanDoor = true;
  isCleaningDoor = false;
  isCustomDoor = false;

  get activeDoorImageUrl(): string {
    if (this.useCleanDoor && this.cleanDoorUrl) {
      return this.cleanDoorUrl;
    }
    return this.doorImageUrl;
  }

  toggleCleanDoor(clean: boolean): void {
    this.useCleanDoor = clean;
  }

  selectedProduct: Product | null = null;
  readonly ALL_PRODUCTS = ALL_PRODUCTS;
  readonly FINISH_COLORS = FINISH_COLORS;

  modelUrl = '/models/salto-lock.glb';
  displayMode: '3d' | '2d' | 'live' = '2d';
  liveOverlayMode: '2d' | '3d' = '2d';
  flipHorizontal = false;

  @ViewChild('videoElement')
  videoElement?: ElementRef<HTMLVideoElement>;

  private mediaStream: MediaStream | null = null;
  cameraError: string | null = null;
  isCameraLoading = false;
  availableDevices: MediaDeviceInfo[] = [];
  selectedCameraIndex = 0;
  hasMultipleCameras = false;

  placement = {
    x: 62,
    y: 50,
    scale: 1,
    rotation: 0,
  };

  isPlaced = true;
  justPlaced = false;
  rippleActive = false;
  rippleCoords = { x: 62, y: 50 };

  isDragging = false;
  wasDragging = false;
  private dragStartPos = { x: 0, y: 0 };
  isSaving = false;
  savedMessage = '';
  isPositionLocked = false;
  showLockMenu = false;
  private hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  private dragStart = {
    x: 0,
    y: 0,
    placementX: 62,
    placementY: 50,
  };

  ngOnInit(): void {
    this.arSession.clearCleanDoorImage();
    this.refreshDoorImage();
    this.loadSelectedProduct();
    this.loadPlacement();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      this.loadSelectedProduct();
    }
  }

  ngOnDestroy(): void {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.stopCamera();
  }

  onLockMouseEnter(): void {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.showLockMenu = true;
  }

  onLockMouseLeave(): void {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }
    this.hoverTimeout = setTimeout(() => {
      this.showLockMenu = false;
      this.hoverTimeout = null;
    }, 500);
  }

  onLockClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.wasDragging) {
      this.wasDragging = false;
      return;
    }
    this.showLockMenu = !this.showLockMenu;
  }

  goBack(): void {
    this.back.emit();
  }

  setDisplayMode(mode: '3d' | '2d' | 'live'): void {
    this.displayMode = mode;
    if (mode === 'live') {
      this.startCamera();
    } else {
      this.stopCamera();
    }
  }

  setLiveOverlayMode(mode: '2d' | '3d'): void {
    this.liveOverlayMode = mode;
  }

  async startCamera(): Promise<void> {
    this.stopCamera();
    this.cameraError = null;
    this.isCameraLoading = true;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser.');
      }

      // Check for available video devices
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.availableDevices = devices.filter(d => d.kind === 'videoinput');
        this.hasMultipleCameras = this.availableDevices.length > 1;
      } catch {
        // Enumerate devices may be restricted before permission is granted
      }

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: { ideal: 'environment' }
        },
        audio: false
      };

      if (
        this.availableDevices.length > 0 &&
        this.availableDevices[this.selectedCameraIndex]?.deviceId
      ) {
        constraints.video = {
          deviceId: { exact: this.availableDevices[this.selectedCameraIndex].deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        };
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Re-query devices in case labels/list became accessible after permission grant
      try {
        const updatedDevices = await navigator.mediaDevices.enumerateDevices();
        this.availableDevices = updatedDevices.filter(d => d.kind === 'videoinput');
        this.hasMultipleCameras = this.availableDevices.length > 1;
      } catch {
        // Ignore
      }

      setTimeout(() => {
        if (this.videoElement?.nativeElement && this.mediaStream) {
          const video = this.videoElement.nativeElement;
          video.srcObject = this.mediaStream;
          video.play().catch(err => {
            console.warn('Auto-play was prevented:', err);
          });
        }
      }, 80);
    } catch (err: any) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.cameraError = 'Camera access was blocked. Please enable camera permission in your browser URL bar / site settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        this.cameraError = 'No camera device found. Please connect a webcam or camera.';
      } else {
        this.cameraError = err.message || 'Unable to start camera.';
      }
    } finally {
      this.isCameraLoading = false;
    }
  }

  stopCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      this.mediaStream = null;
    }
    if (this.videoElement?.nativeElement) {
      this.videoElement.nativeElement.srcObject = null;
    }
    this.cameraError = null;
  }

  switchCamera(event?: Event): void {
    event?.stopPropagation();
    if (this.availableDevices.length > 1) {
      this.selectedCameraIndex = (this.selectedCameraIndex + 1) % this.availableDevices.length;
      this.startCamera();
    }
  }

  captureFrame(event?: Event): void {
    event?.stopPropagation();
    if (!this.videoElement?.nativeElement) {
      return;
    }
    const video = this.videoElement.nativeElement;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      this.arSession.setDoorImageUrl(dataUrl);
      this.refreshDoorImage();
      this.setDisplayMode('2d');
    }
  }

  private loadPlacement(): void {
    const target = this.arSession.getTargetPlacement();
    const saved = this.arSession.getPlacement();

    if (target) {
      this.placement = {
        x: target.x,
        y: target.y,
        scale: saved?.scale ?? 1,
        rotation: saved?.rotation ?? 0,
      };
      this.flipHorizontal = target.is_left;
      this.isPlaced = true;
      this.rippleCoords = { x: this.placement.x, y: this.placement.y };
      return;
    }

    if (saved) {
      this.placement = {
        x: saved.x ?? 62,
        y: saved.y ?? 50,
        scale: saved.scale ?? 1,
        rotation: saved.rotation ?? 0,
      };
      this.flipHorizontal = saved.flipHorizontal ?? false;
      this.isPlaced = saved.isPlaced ?? true;
      this.rippleCoords = { x: this.placement.x, y: this.placement.y };
    }
  }

  onDoorImageLoaded(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img) return;

    this.doorNaturalWidth = img.naturalWidth || 682;
    this.doorNaturalHeight = img.naturalHeight || 1024;
    this.doorAspectRatio = `${this.doorNaturalWidth} / ${this.doorNaturalHeight}`;

    const existingTarget = this.arSession.getTargetPlacement();
    if (!existingTarget) {
      const detected = this.detectWhiteMarkerOnImage(img);
      if (detected) {
        this.arSession.setTargetPlacement(detected);
        this.placement.x = detected.x;
        this.placement.y = detected.y;
        this.flipHorizontal = detected.is_left;
        this.isPlaced = true;
        this.rippleCoords = { x: detected.x, y: detected.y };
        this.savePlacementState();
      }
    } else {
      this.placement.x = existingTarget.x;
      this.placement.y = existingTarget.y;
      this.flipHorizontal = existingTarget.is_left;
      this.rippleCoords = { x: existingTarget.x, y: existingTarget.y };
    }
  }

  private detectWhiteMarkerOnImage(img: HTMLImageElement): { x: number; y: number; is_left: boolean } | null {
    try {
      if (!img.complete || img.naturalWidth === 0) return null;
      const canvas = document.createElement('canvas');
      const w = 400;
      const h = Math.round((img.naturalHeight / img.naturalWidth) * 400);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // Scan hardware height zone: 38% to 72% height
      const minY = Math.floor(h * 0.38);
      const maxY = Math.floor(h * 0.72);

      let bestSpot: { x: number; y: number; score: number } | null = null;

      for (let y = minY; y < maxY; y += 2) {
        for (let x = 15; x < w - 15; x += 2) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          if (lum > 220 && Math.abs(r - g) < 25 && Math.abs(r - b) < 25) {
            const rad = 12;
            let surroundLum = 0;
            let count = 0;
            for (let dy = -rad; dy <= rad; dy += rad * 2) {
              for (let dx = -rad; dx <= rad; dx += rad * 2) {
                const sy = y + dy;
                const sx = x + dx;
                if (sy >= 0 && sy < h && sx >= 0 && sx < w) {
                  const sIdx = (sy * w + sx) * 4;
                  surroundLum += 0.299 * data[sIdx] + 0.587 * data[sIdx + 1] + 0.114 * data[sIdx + 2];
                  count++;
                }
              }
            }
            const avgSurround = surroundLum / (count || 1);
            const contrast = lum - avgSurround;
            if (contrast > 40) {
              if (!bestSpot || contrast > bestSpot.score) {
                bestSpot = { x, y, score: contrast };
              }
            }
          }
        }
      }

      if (bestSpot) {
        const xPct = Math.round((bestSpot.x / w) * 1000) / 10;
        const yPct = Math.round((bestSpot.y / h) * 1000) / 10;
        return {
          x: xPct,
          y: yPct,
          is_left: xPct < 50,
        };
      }
    } catch (err) {
      console.warn('Canvas marker detection skipped:', err);
    }
    return null;
  }

  refreshDoorImage(): void {
    this.doorImageUrl = this.arSession.getDoorImageUrl();
    this.cleanDoorUrl = null;
    this.useCleanDoor = false;
    this.isCustomDoor = this.arSession.hasCustomDoorImage();
  }

  snapToTarget(): void {
    const target = this.arSession.getTargetPlacement();
    if (target) {
      this.placement.x = target.x;
      this.placement.y = target.y;
      this.flipHorizontal = target.is_left;
      this.rippleCoords = { x: target.x, y: target.y };
      this.rippleActive = true;
      this.justPlaced = true;
      setTimeout(() => this.rippleActive = false, 900);
      setTimeout(() => this.justPlaced = false, 400);
      this.savePlacementState();
    }
  }

  togglePositionLock(): void {
    this.isPositionLocked = !this.isPositionLocked;
    this.showLockMenu = true;
  }

  onDoorPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.arSession.setDoorImage(file);
      this.arSession.clearCleanDoorImage();
      this.cleanDoorUrl = null;
      this.useCleanDoor = false;
      this.refreshDoorImage();
    }
    input.value = '';
  }

  triggerDoorUpload(): void {
    this.doorFileInput?.nativeElement.click();
  }

  private loadSelectedProduct(): void {
    if (this.config?.product) {
      const found = ALL_PRODUCTS.find(p => p.id === this.config!.product);
      if (found) {
        this.selectedProduct = found;
        return;
      }
    }

    const selectedProductId = this.getSelectedProductId();

    if (!selectedProductId) {
      this.selectedProduct = ALL_PRODUCTS[0] ?? null;
      return;
    }

    this.selectedProduct =
      ALL_PRODUCTS.find(product => product.id === selectedProductId) ??
      ALL_PRODUCTS[0] ??
      null;
  }

  private getSelectedProductId(): string | null {
    try {
      return sessionStorage.getItem('retrofit-selected-product');
    } catch {
      return null;
    }
  }

  get doorHeightMm(): number {
    if (this.config?.height) {
      const parsed = parseFloat(this.config.height);
      if (!isNaN(parsed) && parsed > 500) {
        return parsed;
      }
    }
    return 2050; // Standard architectural door height in mm
  }

  get lockHeightPercent(): number {
    const prodId = this.selectedProduct?.id || 'salto_xs4_original_plus_euro';
    const lockH = PRODUCT_HEIGHTS_MM[prodId] ?? 282;
    const ratio = lockH / this.doorHeightMm;
    return Math.round(ratio * 1000) / 10;
  }

  get lockHeightStyle(): string {
    return `calc(${this.lockHeightPercent}% * ${this.placement.scale})`;
  }

  get placementLeft(): string {
    return `${this.placement.x}%`;
  }

  get placementTop(): string {
    return `${this.placement.y}%`;
  }

  get placementTransform(): string {
    return [
      'translate(-50%, -50%)',
      `scale(${this.placement.scale})`,
      `rotate(${this.placement.rotation}deg)`,
    ].join(' ');
  }

  get productImage(): string {
    if (!this.selectedProduct) {
      return '';
    }
    const isBlack = this.productFinish?.toLowerCase().includes('black');
    if (isBlack) {
      return this.selectedProduct.imageUrl.replace('.png', '_black.png');
    }
    return this.selectedProduct.imageUrl;
  }

  getProductPlacementClass(): string {
    if (!this.selectedProduct) {
      return '';
    }
    const id = this.selectedProduct.id;
    if (id.includes('dlok')) return 'type-dlok';
    if (id === 'salto_dbolt_touch_ic') return 'type-dbolt-ic';
    if (id.includes('dbolt')) return 'type-dbolt';
    return 'type-xs4';
  }

  get productName(): string {
    return this.selectedProduct?.name ?? 'SALTO lock';
  }

  get productFinish(): string {
    if (this.config?.finish) {
      return this.config.finish;
    }
    return (
      this.arSession.getSelectedFinish() ??
      this.selectedProduct?.finishes?.[0] ??
      'Satin Chrome'
    );
  }

  selectFinish(finish: string): void {
    this.arSession.setSelectedFinish(finish);
    if (this.config) {
      this.config.finish = finish;
    }
  }

  getFinishColor(finish: string): string {
    return this.FINISH_COLORS[finish] ?? '#888888';
  }

  selectProduct(product: Product): void {
    this.selectedProduct = product;
    const finish = product.finishes[0] || 'Satin Chrome';
    this.arSession.setSelectedProduct(product.id, finish);

    if (this.config) {
      this.config.product = product.id;
      this.config.finish = finish;
    }
  }

  onStageClick(event: MouseEvent): void {
    if (this.wasDragging || this.isPositionLocked) {
      this.wasDragging = false;
      return;
    }

    const target = event.target as HTMLElement;
    if (
      target.closest('.product-placement') ||
      target.closest('.stage-controls') ||
      target.closest('.stage-toolbar') ||
      target.closest('.under-construction-card') ||
      target.closest('.lock-hover-actions') ||
      target.closest('button')
    ) {
      return;
    }

    const container = this.doorViewport?.nativeElement || this.stage.nativeElement;
    const rect = container.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    this.placeLockAt(x, y);
  }

  placeLockAt(x: number, y: number): void {
    this.placement.x = this.clamp(Math.round(x * 10) / 10, 5, 95);
    this.placement.y = this.clamp(Math.round(y * 10) / 10, 5, 95);
    this.isPlaced = true;
    this.rippleCoords = { x: this.placement.x, y: this.placement.y };
    this.rippleActive = true;
    this.justPlaced = true;

    setTimeout(() => {
      this.rippleActive = false;
    }, 900);

    setTimeout(() => {
      this.justPlaced = false;
    }, 400);

    this.savePlacementState();
  }

  startDrag(event: PointerEvent): void {
    if (this.isPositionLocked) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('.lock-hover-actions') || target.closest('button')) {
      return;
    }

    const currentTarget = event.currentTarget as HTMLElement;
    if (currentTarget) {
      const rect = currentTarget.getBoundingClientRect();
      if (event.clientY < rect.top) {
        return;
      }
    }

    event.preventDefault();
    event.stopPropagation();

    this.isDragging = true;
    this.wasDragging = false;
    this.dragStartPos = { x: event.clientX, y: event.clientY };

    this.dragStart = {
      x: event.clientX,
      y: event.clientY,
      placementX: this.placement.x,
      placementY: this.placement.y,
    };

    try {
      currentTarget?.setPointerCapture?.(event.pointerId);
    } catch (_) {}
  }

  onDrag(event: PointerEvent): void {
    if (!this.isDragging) {
      return;
    }

    const dist = Math.hypot(
      event.clientX - this.dragStartPos.x,
      event.clientY - this.dragStartPos.y,
    );
    if (dist > 3) {
      this.wasDragging = true;
    }

    const container = this.doorViewport?.nativeElement || this.stage.nativeElement;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const deltaX =
      ((event.clientX - this.dragStart.x) / rect.width) * 100;

    const deltaY =
      ((event.clientY - this.dragStart.y) / rect.height) * 100;

    this.placement.x = this.clamp(
      this.dragStart.placementX + deltaX,
      2,
      98,
    );

    this.placement.y = this.clamp(
      this.dragStart.placementY + deltaY,
      2,
      98,
    );

    this.isPlaced = true;
  }

  stopDrag(event?: PointerEvent): void {
    if (event && event.pointerId !== undefined) {
      try {
        const target = event.target as HTMLElement;
        if (target?.hasPointerCapture?.(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
      } catch (_) {}
    }
    if (this.isDragging) {
      this.isDragging = false;
      this.savePlacementState();
    }
  }

  zoomIn(): void {
    this.placement.scale = this.clamp(
      this.placement.scale + 0.1,
      0.4,
      2.5,
    );
    this.savePlacementState();
  }

  zoomOut(): void {
    this.placement.scale = this.clamp(
      this.placement.scale - 0.1,
      0.4,
      2.5,
    );
    this.savePlacementState();
  }

  rotateLeft(): void {
    this.placement.rotation -= 5;
    this.savePlacementState();
  }

  rotateRight(): void {
    this.placement.rotation += 5;
    this.savePlacementState();
  }

  toggleHanding(): void {
    this.flipHorizontal = !this.flipHorizontal;
    this.showLockMenu = true;
    this.savePlacementState();
  }

  setHanding(flipped: boolean): void {
    this.flipHorizontal = flipped;
    this.savePlacementState();
  }

  resetPlacement(): void {
    const target = this.arSession.getTargetPlacement();
    this.placement = {
      x: target?.x ?? 62,
      y: target?.y ?? 50,
      scale: 1,
      rotation: 0,
    };
    this.flipHorizontal = target?.is_left ?? false;
    this.isPlaced = true;
    this.rippleCoords = { x: this.placement.x, y: this.placement.y };
    this.savePlacementState();
  }

  private savePlacementState(): void {
    this.arSession.savePlacement({
      ...this.placement,
      isPlaced: this.isPlaced,
      flipHorizontal: this.flipHorizontal,
    });
  }

  async saveView(): Promise<void> {
    this.isSaving = true;
    this.savedMessage = '';

    try {
      this.savePlacementState();
      await new Promise(resolve => setTimeout(resolve, 300));
      this.savedMessage = 'AR placement saved for this session.';
    } finally {
      this.isSaving = false;
    }
  }

  hasDoorImage(): boolean {
    return !!this.doorImageUrl;
  }

  private clamp(
    value: number,
    min: number,
    max: number,
  ): number {
    return Math.min(Math.max(value, min), max);
  }

  @HostListener('window:pointermove', ['$event'])
  onWindowPointerMove(event: PointerEvent): void {
    if (this.isDragging) {
      this.onDrag(event);
    }
  }

  @HostListener('window:pointerup', ['$event'])
  onWindowPointerUp(event?: PointerEvent): void {
    if (this.isDragging) {
      this.stopDrag(event);
    }
  }

  @HostListener('window:pointercancel', ['$event'])
  onWindowPointerCancel(event?: PointerEvent): void {
    if (this.isDragging) {
      this.stopDrag(event);
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.showLockMenu = false;
  }
}
