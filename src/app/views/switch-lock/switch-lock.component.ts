import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';

import { DoorConfig } from '../../app';
import { ALL_PRODUCTS, FINISH_COLORS, Product } from '../../data/products';
import { ArSessionService } from '../../services/ar-session.service';

@Component({
  selector: 'app-switch-lock',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
  ],
  templateUrl: './switch-lock.component.html',
  styleUrls: ['./switch-lock.component.css'],
})
export class SwitchLockComponent {
  private readonly arSession = inject(ArSessionService);
  @Input({ required: true }) config!: DoorConfig;

  @Output() configChange = new EventEmitter<DoorConfig>();
  @Output() viewInAR = new EventEmitter<void>();
  @Output() restartWizard = new EventEmitter<void>();

  // New: a non-destructive "go back and edit" path, separate from
  // restartWizard (which wipes the whole configuration).
  @Output() editConfiguration = new EventEmitter<void>();

  readonly finishColors = FINISH_COLORS;

  get material(): 'Wood' | 'Glass' | 'Metal' | '' {
    return this.config.material as 'Wood' | 'Glass' | 'Metal' | '';
  }

  get selectedProduct(): Product | null {
    if (!this.config.product) {
      return null;
    }

    return ALL_PRODUCTS.find(product => product.id === this.config.product) ?? null;
  }

  // This is a catalog, not a recommendation engine — Switch Lock only has
  // material + thickness to go on (it never sees the actual compatibility
  // engine's door_standard-based verdict), so the badge is deliberately
  // scoped to "fits your door's material and thickness", not a blanket
  // "compatible" claim.
  isBestMatch(product: Product): boolean {
    if (!this.material) {
      return false;
    }

    const thickness = Number(this.config.thickness);

    if (!Number.isFinite(thickness) || thickness <= 0) {
      return false;
    }

    return (
      product.compatible.includes(this.material) &&
      thickness >= product.thicknessMin &&
      thickness <= product.thicknessMax
    );
  }

  get sortedProducts(): Product[] {
    return [...ALL_PRODUCTS].sort((a, b) => {
      const aScore = this.isBestMatch(a) ? 0 : 1;
      const bScore = this.isBestMatch(b) ? 0 : 1;
      return aScore - bScore;
    });
  }

  isSelected(product: Product): boolean {
    return this.config.product === product.id;
  }

  selectProduct(product: Product): void {
    const finish = this.isSelected(product)
      ? this.config.finish
      : product.finishes[0];

    this.arSession.setSelectedProduct(product.id, finish);

    this.configChange.emit({
      ...this.config,
      product: product.id,
      finish,
    });
  }

  selectFinish(product: Product, finish: string, event: Event): void {
    event.stopPropagation();

    this.arSession.setSelectedProduct(product.id, finish);

    this.configChange.emit({
      ...this.config,
      product: product.id,
      finish,
    });
  }

  isFinishSelected(product: Product, finish: string): boolean {
    return this.config.product === product.id &&
      this.config.finish === finish;
  }

  getBrandColor(brand: string): string {
    return brand === 'SALTO' ? '#1565C0' : '#6A1B9A';
  }

  getFinishColor(finish: string): string {
    return this.finishColors[finish] ?? '#888';
  }
}
