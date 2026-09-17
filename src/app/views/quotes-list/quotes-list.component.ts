import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DoorConfig, Quotation } from '../../app';
import { ALL_PRODUCTS, Product } from '../../data/products';
import {
  buildQuoteTextSummary,
  getAccessMethodLabels,
  getConfigSummaryChips,
} from '../../data/config-summary';

interface StatusMeta {
  label: string;
  color: 'default' | 'warning' | 'info' | 'success';
  icon: string;
}

@Component({
  selector: 'app-quotes-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressBarModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './quotes-list.component.html',
  styleUrl: './quotes-list.component.css',
})
export class QuotesListComponent implements OnDestroy {
  @Input() quotations: Quotation[] = [];

  @Output() newQuote = new EventEmitter<void>();

  @Output() updateQuotation = new EventEmitter<{
    id: string;
    changes: Partial<Quotation>;
  }>();

  @Output() deleteQuotation = new EventEmitter<string>();

  expandedId: string | null = null;
  renamingId: string | null = null;
  renameValue = '';
  confirmDeleteId: string | null = null;
  snack: string | null = null;
  simulatingId: string | null = null;

  private approvalTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private snackTimer: ReturnType<typeof setTimeout> | null = null;

  readonly statusMeta: Record<string, StatusMeta> = {
    draft: {
      label: 'Draft',
      color: 'default',
      icon: 'receipt_long',
    },
    submitted: {
      label: 'Sent to Sales',
      color: 'warning',
      icon: 'hourglass_top',
    },
    approved: {
      label: 'Approved',
      color: 'info',
      icon: 'check_circle',
    },
    delivered: {
      label: 'Hardware Delivered',
      color: 'success',
      icon: 'local_shipping',
    },
    installed: {
      label: 'Installed',
      color: 'success',
      icon: 'build',
    },
  };

  getProduct(q: Quotation): Product | undefined {
    return ALL_PRODUCTS.find(product => product.id === q.config.product);
  }

  getQuantity(q: Quotation): number {
    return Math.max(1, parseInt(q.config.quantity, 10) || 1);
  }

  getThickness(q: Quotation): number {
    return parseInt(q.config.thickness, 10) || 0;
  }

  fits(q: Quotation): boolean {
    const product = this.getProduct(q);

    if (!product) {
      return false;
    }

    const thickness = this.getThickness(q);

    return (
      thickness >= product.thicknessMin &&
      thickness <= product.thicknessMax
    );
  }

  // Everything the customer told us across the whole wizard — business
  // context, existing lock, backset/CtC, security preferences, hosting,
  // etc. — not just the fit-relevant fields shown in the summary strip.
  getConfigChips(q: Quotation): string[] {
    return getConfigSummaryChips(q.config);
  }

  getAccessMethods(q: Quotation): string[] {
    return getAccessMethodLabels(q.config);
  }

  isExpanded(q: Quotation): boolean {
    return this.expandedId === q.id;
  }

  isSending(q: Quotation): boolean {
    return this.simulatingId === q.id;
  }

  toggleBom(q: Quotation): void {
    this.expandedId = this.isExpanded(q) ? null : q.id;
  }

  // Plain-text export the customer or sales rep can save/email — no PDF
  // library needed, a Blob download works in every browser.
  downloadQuote(q: Quotation): void {
    const product = this.getProduct(q);

    const summary = buildQuoteTextSummary(
      q.name,
      q.createdAt,
      this.getQuantity(q),
      q.config,
      product,
    );

    const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${q.name.replace(/[^a-z0-9]+/gi, '-') || 'quote'}.txt`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  sendToSales(q: Quotation): void {
    this.updateQuotation.emit({
      id: q.id,
      changes: { orderStatus: 'submitted' },
    });

    this.showSnack(`"${q.name}" sent to the Sales team.`);

    this.simulatingId = q.id;

    const existingTimer = this.approvalTimers.get(q.id);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.updateQuotation.emit({
        id: q.id,
        changes: { orderStatus: 'approved' },
      });

      this.simulatingId = null;
      this.approvalTimers.delete(q.id);
    }, 4000);

    this.approvalTimers.set(q.id, timer);
  }

  startRename(q: Quotation): void {
    this.renamingId = q.id;
    this.renameValue = q.name;
  }

  cancelRename(): void {
    this.renamingId = null;
    this.renameValue = '';
  }

  confirmRename(): void {
    if (this.renamingId && this.renameValue.trim()) {
      this.updateQuotation.emit({
        id: this.renamingId,
        changes: {
          name: this.renameValue.trim(),
        },
      });
    }

    this.cancelRename();
  }

  startDelete(q: Quotation): void {
    this.confirmDeleteId = q.id;
  }

  cancelDelete(): void {
    this.confirmDeleteId = null;
  }

  confirmDelete(): void {
    const id = this.confirmDeleteId;

    if (!id) {
      return;
    }

    this.deleteQuotation.emit(id);

    this.confirmDeleteId = null;

    if (this.expandedId === id) {
      this.expandedId = null;
    }
  }

  showSnack(message: string): void {
    this.snack = message;

    if (this.snackTimer) {
      clearTimeout(this.snackTimer);
    }

    this.snackTimer = setTimeout(() => {
      this.snack = null;
    }, 4000);
  }

  closeSnack(): void {
    this.snack = null;

    if (this.snackTimer) {
      clearTimeout(this.snackTimer);
      this.snackTimer = null;
    }
  }

  statusLabel(q: Quotation): string {
    return this.statusMeta[q.orderStatus]?.label ?? q.orderStatus;
  }

  statusIcon(q: Quotation): string {
    return this.statusMeta[q.orderStatus]?.icon ?? 'receipt_long';
  }

  statusClass(q: Quotation): string {
    return this.statusMeta[q.orderStatus]?.color ?? 'default';
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  trackQuotation(_: number, quotation: Quotation): string {
    return quotation.id;
  }

  trackBomItem(index: number): number {
    return index;
  }

  ngOnDestroy(): void {
    this.approvalTimers.forEach(timer => clearTimeout(timer));
    this.approvalTimers.clear();

    if (this.snackTimer) {
      clearTimeout(this.snackTimer);
    }
  }
}
