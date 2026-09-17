import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';

import { DoorConfig, Quotation } from '../../app';
import { QuotesListComponent } from '../quotes-list/quotes-list.component';
import { SwitchLockComponent } from '../switch-lock/switch-lock.component';
import { SupportComponent } from '../support/support.component';
import {ArViewerComponent} from '../ar-viewer/ar-viewer.component';
import {DiyInstallComponent} from '../diy-install/diy-install.component';

interface Tab {
  label: string;
  icon: string;
}

@Component({
  selector: 'app-hub',
  standalone: true,
  imports: [
    CommonModule,
    MatBadgeModule,
    MatIconModule,
    QuotesListComponent,
    SwitchLockComponent,
    SupportComponent,
    ArViewerComponent,
    DiyInstallComponent,
  ],
  templateUrl: './hub.component.html',
  styleUrl: './hub.component.css',
})
export class HubComponent {
  @Input({ required: true })
  config!: DoorConfig;

  @Input({ required: true })
  quotations: Quotation[] = [];

  @Output()
  configChange = new EventEmitter<DoorConfig>();

  @Output()
  updateQuotation = new EventEmitter<{ id: string; changes: Partial<Quotation> }>();

  @Output()
  deleteQuotation = new EventEmitter<string>();

  @Output()
  restartWizard = new EventEmitter<void>();

  @Output()
  newQuote = new EventEmitter<void>();

  @Output()
  editConfiguration = new EventEmitter<void>();

  tab = 0;

  readonly tabs: Tab[] = [
    { label: 'AR View', icon: 'view_in_ar' },
    { label: 'Quotes', icon: 'receipt_long' },
    { label: 'Switch Lock', icon: 'lock' },
    { label: 'DIY Install', icon: 'build' },
    { label: 'Support', icon: 'support_agent' },
  ];

  get draftCount(): number {
    return this.quotations.filter(q => q.orderStatus === 'draft').length;
  }

  setTab(index: number): void {
    this.tab = index;
  }

  goToAR(): void {
    this.tab = 0;
  }

  onConfigChange(config: DoorConfig): void {
    this.configChange.emit(config);
  }

  onQuotationUpdate(event: { id: string; changes: Partial<Quotation> }): void {
    this.updateQuotation.emit(event);
  }

  onQuotationDelete(id: string): void {
    this.deleteQuotation.emit(id);
  }

  onNewQuote(): void {
    this.newQuote.emit();
  }

  onRestartWizard(): void {
    this.restartWizard.emit();
  }

  // The AR viewer's own back button — a real, non-destructive way back to
  // the wizard. Previously nothing in the UI ever triggered this at all;
  // the only "back" available was Switch Lock's reconfigure button, which
  // wipes the whole configuration via restartWizard instead.
  onExitAr(): void {
    this.editConfiguration.emit();
  }

  onEditConfiguration(): void {
    this.editConfiguration.emit();
  }
}
