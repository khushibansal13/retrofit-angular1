import { CommonModule } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ArSessionService } from '../../services/ar-session.service';
import { Product, ALL_PRODUCTS, FINISH_COLORS } from '../../data/products';
import { DoorConfig } from '../../app';

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
  private readonly arSession = inject(ArSessionService);

  @ViewChild('stage', { static: true })
  stage!: ElementRef<HTMLDivElement>;

  @ViewChild('doorFileInput')
  doorFileInput?: ElementRef<HTMLInputElement>;

  doorImageUrl: string = '';
  isCustomDoor = false;

  selectedProduct: Product | null = null;
  readonly ALL_PRODUCTS = ALL_PRODUCTS;
  readonly FINISH_COLORS = FINISH_COLORS;

  modelUrl = '/models/salto-lock.glb';
  displayMode: '3d' | '2d' = '3d';
  flipHorizontal = false;

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

  private dragStart = {
    x: 0,
    y: 0,
    placementX: 62,
    placementY: 50,
  };

  ngOnInit(): void {
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
    // Component destroyed
  }

  private loadPlacement(): void {
    const saved = this.arSession.getPlacement();
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

  refreshDoorImage(): void {
    this.doorImageUrl = this.arSession.getDoorImageUrl();
    this.isCustomDoor = this.arSession.hasCustomDoorImage();
  }

  onDoorPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.arSession.setDoorImage(file);
      this.refreshDoorImage();
    }
  }

  triggerDoorUpload(): void {
    this.doorFileInput?.nativeElement.click();
  }

  setDisplayMode(mode: '3d' | '2d'): void {
    this.displayMode = mode;
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
    if (this.wasDragging) {
      this.wasDragging = false;
      return;
    }

    const target = event.target as HTMLElement;
    if (
      target.closest('.stage-controls') ||
      target.closest('.stage-toolbar') ||
      target.closest('.placement-drag-handle') ||
      target.closest('button')
    ) {
      return;
    }

    const stage = this.stage.nativeElement;
    const rect = stage.getBoundingClientRect();
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

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
  }

  onDrag(event: PointerEvent): void {
    if (!this.isDragging) {
      return;
    }

    const dist = Math.hypot(
      event.clientX - this.dragStartPos.x,
      event.clientY - this.dragStartPos.y,
    );
    if (dist > 5) {
      this.wasDragging = true;
    }

    const stage = this.stage.nativeElement;
    const rect = stage.getBoundingClientRect();

    const deltaX =
      ((event.clientX - this.dragStart.x) / rect.width) * 100;

    const deltaY =
      ((event.clientY - this.dragStart.y) / rect.height) * 100;

    this.placement.x = this.clamp(
      this.dragStart.placementX + deltaX,
      5,
      95,
    );

    this.placement.y = this.clamp(
      this.dragStart.placementY + deltaY,
      5,
      95,
    );

    this.isPlaced = true;
  }

  stopDrag(): void {
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
    this.savePlacementState();
  }

  setHanding(flipped: boolean): void {
    this.flipHorizontal = flipped;
    this.savePlacementState();
  }

  resetPlacement(): void {
    this.placement = {
      x: 62,
      y: 50,
      scale: 1,
      rotation: 0,
    };
    this.flipHorizontal = false;
    this.isPlaced = true;
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

  @HostListener('window:pointerup')
  onWindowPointerUp(): void {
    this.stopDrag();
  }
}
