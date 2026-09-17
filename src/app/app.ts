import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WizardComponent } from './views/wizard/wizard.component';
import { HubComponent } from './views/hub/hub.component';

export interface DoorConfig {
  environment: 'Home' | 'Facility' | '';
  flowType: 'A' | 'B' | '';
  gdprAccepted: boolean;
  material: 'Wood' | 'Glass' | '';
  type: string;
  thickness: string;
  width: string;
  height: string;
  direction: string;
  leafCount: string;
  frameType: string;
  existingLock: string;
  product: string | null;
  finish: string;
  quantity: string;
  fitStatus: 'fit' | 'no-fit' | '';
  orderStatus: 'draft' | 'submitted' | 'approved' | 'delivered' | 'installed' | '';

  // Kept: DoorProfile still supports measured_backset_mm/measured_center_to_center_mm.
  // Dropped countryCode/faceplate/leverStyle/hingeType — the simplified DoorProfile
  // has nowhere to put them.
  backsetMm: string;
  centerToCenterMm: string;
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
  product: null,
  finish: 'Satin Chrome',
  quantity: '1',
  fitStatus: '',
  orderStatus: '',

  backsetMm: '',
  centerToCenterMm: '',
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
