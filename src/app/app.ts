import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WizardComponent } from './views/wizard/wizard.component';
import { HubComponent } from './views/hub/hub.component';

export interface DoorConfig {
  // Holds a business-domain label ("Home / Residential", "Hotel /
  // Hospitality", ...) — kept as a plain string and kept the field name so
  // quotes-list.html/bom-quote.html (which just display it) don't need
  // touching.
  environment: string;

  // Price band (e.g. "Under €1,000" ... "Over €10,000") — shown in the
  // BOM/quote only, not read by the compatibility engine.
  budget: string;

  flowType: 'A' | 'B' | '';
  gdprAccepted: boolean;
  material: 'Wood' | 'Glass' | 'Metal' | '';
  type: string;
  thickness: string;

  // Kept for other views that already display them (support/switch-lock/
  // bom-quote screens) but no longer asked in the wizard itself — only
  // thickness is collected now.
  width: string;
  height: string;

  direction: string;
  leafCount: string;
  frameType: string;

  // Every customer is now asked about their existing lock, no retrofit-vs-
  // new-installation branching.
  existingLock: string;

  // UI-only id driving the "what does your lock look like?" picker's
  // selected-card styling and gating which follow-up questions show.
  // existingLock (above) carries the actual keyword string sent to the backend.
  existingLockId: string;

  // Free-text brand/model of the mortise case currently installed —
  // sales-enrichment field, not read by the engine.
  currentMortiseType: string;

  product: string | null;
  finish: string;
  quantity: string;
  fitStatus: 'fit' | 'no-fit' | '';
  orderStatus: 'draft' | 'submitted' | 'approved' | 'delivered' | 'installed' | '';

  // Kept: DoorProfile still supports measured_backset_mm/measured_center_to_center_mm.
  backsetMm: string;
  centerToCenterMm: string;

  // Preference only — feeds extra BOM line items, never the compatibility check.
  accessMethods: string[];

  // --- Optional "sales & install" fields (all BOM-only, asked for everyone) ---
  handlePosition: string;
  handleType: string;
  needsDeadbolt: boolean;
  needsKeyholeFailover: boolean;
  doubleSidedLock: boolean;
  waterResistant: boolean;
  hostingPreference: string;
  connectivity: string;
  usageTraffic: string;
  readerColor: string;
  spindleMm: string;
  cylinderToHandleMm: string;
}

export interface Quotation {
  id: string;
  name: string;
  createdAt: string;
  config: DoorConfig;
  orderStatus: 'draft' | 'submitted' | 'approved' | 'delivered' | 'installed';
}

export const EMPTY_CONFIG: DoorConfig = {
  environment: '',
  budget: '',
  flowType: '',
  gdprAccepted: false,
  material: '',
  type: 'Interior',
  thickness: '',
  width: '',
  height: '',
  direction: 'Inward Left',
  leafCount: 'Single',
  frameType: 'Timber',
  existingLock: 'Mortise',
  existingLockId: '',
  currentMortiseType: '',
  product: null,
  finish: 'Satin Chrome',
  quantity: '1',
  fitStatus: '',
  orderStatus: '',

  backsetMm: '',
  centerToCenterMm: '',
  accessMethods: [],

  handlePosition: '',
  handleType: '',
  needsDeadbolt: false,
  needsKeyholeFailover: false,
  doubleSidedLock: false,
  waterResistant: false,
  hostingPreference: '',
  connectivity: '',
  usageTraffic: '',
  readerColor: '',
  spindleMm: '8',
  cylinderToHandleMm: '',
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, WizardComponent, HubComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  phase = signal<'wizard' | 'hub'>('wizard');
  config = signal<DoorConfig>({ ...EMPTY_CONFIG });
  quotations = signal<Quotation[]>([]);

  saveQuotation(config: DoorConfig): void {
    const n = this.quotations().length + 1;
    const quotation: Quotation = {
      id: `Q-${Date.now()}`,
      name: `Quote #${n}`,
      createdAt: new Date().toISOString(),
      config: { ...config },
      orderStatus: 'draft',
    };

    this.quotations.update(items => [...items, quotation]);
    this.phase.set('hub');
  }

  updateQuotation(event: { id: string; changes: Partial<Quotation> }): void {
    this.quotations.update(items =>
      items.map(quotation =>
        quotation.id === event.id
          ? { ...quotation, ...event.changes }
          : quotation,
      ),
    );
  }

  deleteQuotation(id: string): void {
    this.quotations.update(items => items.filter(q => q.id !== id));
  }

  restartWizard(): void {
    this.config.set({ ...EMPTY_CONFIG });
    this.phase.set('wizard');
  }

  newQuote(): void {
    this.config.set({ ...EMPTY_CONFIG });
    this.phase.set('wizard');
  }

  editConfiguration(): void {
    this.phase.set('wizard');
  }
}
