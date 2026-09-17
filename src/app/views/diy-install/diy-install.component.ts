import {
  CommonModule,
} from '@angular/common';

import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { DoorConfig } from '../../app';
import { ALL_PRODUCTS, Product } from '../../data/products';
import { getInstallGuide, InstallGuide, InstallStep } from './install-guides';

interface InstallTool {
  icon: string;
  label: string;
}

@Component({
  selector: 'app-diy-install',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './diy-install.component.html',
  styleUrls: ['./diy-install.component.css'],
})
export class DiyInstallComponent implements OnChanges {
  @Input({ required: true }) config!: DoorConfig;

  currentStep = 0;

  started = false;
  completed = false;

  imageZoomOpen = false;
  imageZoom = 1;

  acknowledgedSteps = new Set<number>();

  finalChecks = {
    lockMounted: false,
    handleTested: false,
    readerTested: false,
    doorTested: false,
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] && !changes['config'].firstChange) {
      this.resetInstallationState();
    }
  }

  // ------------------------------------------------------------
  // Product / guide
  // ------------------------------------------------------------

  get product(): Product | null {
    if (!this.config?.product) {
      return null;
    }

    return (
      ALL_PRODUCTS.find(product => product.id === this.config.product) ??
      null
    );
  }

  get productName(): string {
    return this.product?.name ?? 'SALTO smart lock';
  }

  get productImage(): string | null {
    return this.product?.imageUrl ?? null;
  }

  private get realGuide(): InstallGuide | null {
    return getInstallGuide(this.config?.product);
  }

  get usingRealGuide(): boolean {
    return this.realGuide !== null;
  }

  get guideSource(): string | null {
    return this.realGuide?.source ?? null;
  }

  get steps(): InstallStep[] {
    const guide = this.realGuide;

    if (guide) {
      return guide.steps.filter(
        step => !step.when || step.when(this.config),
      );
    }

    return [
      {
        title: 'Prepare the door',
        description:
          'Remove the existing lock and make sure the door edge and mounting area are clean and accessible.',
        icon: 'construction',
      },
      {
        title: 'Check the dimensions',
        description:
          'Confirm the configured door dimensions before installation.',
        icon: 'straighten',
        warning:
          'Do not continue if the measured dimensions differ from your approved configuration.',
      },
      {
        title: 'Install the lock body',
        description:
          'Position the lock body in the prepared opening. Keep the mechanism aligned and make sure it moves freely before tightening the screws.',
        icon: 'lock',
      },
      {
        title: 'Install the handle and reader',
        description:
          `Install the ${this.productName} exterior components according to the supplied mounting instructions.`,
        icon: 'settings',
      },
      {
        title: 'Connect and test',
        description:
          'Check the handle movement, latch operation and electronic reader. Test the door several times before putting it into service.',
        icon: 'check_circle',
      },
    ];
  }

  get currentInstallStep(): InstallStep | null {
    return this.steps[this.currentStep] ?? null;
  }

  // ------------------------------------------------------------
  // Progress
  // ------------------------------------------------------------

  get stepNumber(): number {
    return this.currentStep + 1;
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  get progressPercent(): number {
    if (this.steps.length <= 1) {
      return 100;
    }

    return Math.round(
      (this.currentStep / (this.steps.length - 1)) * 100,
    );
  }

  get zoomPercent(): number {
    return Math.round(this.imageZoom * 100);
  }

  get isFirstStep(): boolean {
    return this.currentStep === 0;
  }

  get isLastStep(): boolean {
    return this.currentStep === this.steps.length - 1;
  }

  get isCriticalStep(): boolean {
    return !!this.currentInstallStep?.warning;
  }

  get currentStepAcknowledged(): boolean {
    return this.acknowledgedSteps.has(this.currentStep);
  }

  get canContinue(): boolean {
    if (!this.currentInstallStep) {
      return false;
    }

    if (this.isCriticalStep) {
      return this.currentStepAcknowledged;
    }

    return true;
  }

  // ------------------------------------------------------------
  // Preparation
  // ------------------------------------------------------------

  get doorSummary(): string {
    const parts: string[] = [];

    if (this.config?.material) {
      parts.push(this.config.material);
    }

    if (this.config?.thickness) {
      parts.push(`${this.config.thickness} mm thick`);
    }

    if (this.config?.leafCount) {
      parts.push(`${this.config.leafCount.toLowerCase()} door`);
    }

    return parts.join(' · ') || 'Door configuration';
  }

  get installationLevel(): string {
    if (this.steps.length >= 10) {
      return 'Advanced DIY';
    }

    if (this.steps.length >= 6) {
      return 'Intermediate';
    }

    return 'Basic installation';
  }

  get estimatedTime(): string {
    if (this.steps.length >= 10) {
      return '45–60 min';
    }

    if (this.steps.length >= 6) {
      return '30–45 min';
    }

    return '20–30 min';
  }

  get requiredTools(): InstallTool[] {
    const tools: InstallTool[] = [
      {
        icon: 'build',
        label: 'Hex / Allen key',
      },
      {
        icon: 'straighten',
        label: 'Tape measure',
      },
    ];

    if (
      this.steps.some(step =>
        step.title.toLowerCase().includes('drill'),
      )
    ) {
      tools.push({
        icon: 'handyman',
        label: 'Drill',
      });

      tools.push({
        icon: 'architecture',
        label: '14–16 mm drill bits',
      });
    }

    if (
      this.steps.some(
        step =>
          step.title.toLowerCase().includes('screw') ||
          step.title.toLowerCase().includes('secure'),
      )
    ) {
      tools.push({
        icon: 'screwdriver',
        label: 'Screwdriver',
      });
    }

    return tools;
  }

  get safetyNotes(): string[] {
    const notes = [
      'Keep the door open while working on the lock.',
      'Do not force the lock mechanism or handle.',
      'Keep small screws and electronic parts together during installation.',
    ];

    if (
      this.steps.some(step =>
        step.description.toLowerCase().includes('drill'),
      )
    ) {
      notes.push(
        'Protect your eyes when drilling or modifying the door.',
      );
    }

    if (
      this.steps.some(step =>
        step.warning?.toLowerCase().includes('program'),
      )
    ) {
      notes.push(
        'Program and test the lock before closing the door.',
      );
    }

    return notes;
  }

  get includedParts(): string[] {
    if (this.product?.bomAccessories?.length) {
      return [
        'Lock / escutcheon assembly',
        'Mounting hardware',
        ...this.product.bomAccessories,
      ];
    }

    return [
      'Lock assembly',
      'Inside / outside hardware',
      'Mounting screws',
      'Battery compartment',
    ];
  }

  // ------------------------------------------------------------
  // Current step context
  // ------------------------------------------------------------

  get currentStepTools(): InstallTool[] {
    const step = this.currentInstallStep;

    if (!step) {
      return [];
    }

    const title = step.title.toLowerCase();
    const description = step.description.toLowerCase();

    const tools: InstallTool[] = [];

    if (
      title.includes('drill') ||
      description.includes('drill')
    ) {
      tools.push(
        {
          icon: 'handyman',
          label: 'Drill',
        },
        {
          icon: 'architecture',
          label: 'Correct drill bit',
        },
        {
          icon: 'straighten',
          label: 'Measure twice',
        },
      );
    }

    if (
      title.includes('handing') ||
      title.includes('lever')
    ) {
      tools.push({
        icon: 'build',
        label: 'Allen key',
      });
    }

    if (
      title.includes('screw') ||
      title.includes('secure') ||
      title.includes('mount')
    ) {
      tools.push({
        icon: 'screwdriver',
        label: 'Screwdriver',
      });
    }

    if (
      title.includes('battery') ||
      description.includes('battery')
    ) {
      tools.push({
        icon: 'battery_std',
        label: 'AA batteries',
      });
    }

    if (
      title.includes('program') ||
      description.includes('program')
    ) {
      tools.push({
        icon: 'smartphone',
        label: 'SALTO programming setup',
      });
    }

    return tools;
  }

  get involvedParts(): string[] {
    const step = this.currentInstallStep;

    if (!step) {
      return [];
    }

    const title = step.title.toLowerCase();

    if (title.includes('handing')) {
      return ['Lock body', 'Handing mechanism', 'Handing screw'];
    }

    if (title.includes('mortise')) {
      return ['Mortise lock', 'Door edge', 'Faceplate', 'Mounting screws'];
    }

    if (title.includes('drill')) {
      return ['Door leaf', 'Mounting holes', 'Through bolts'];
    }

    if (title.includes('outside')) {
      return ['Outside escutcheon', 'Reader', 'Spindle', 'Lock body'];
    }

    if (title.includes('electronics')) {
      return ['Inside electronics', 'Ribbon cable', 'Spindle'];
    }

    if (title.includes('lever')) {
      return ['Inside lever', 'Spindle', 'Set screw'];
    }

    if (title.includes('cover')) {
      return ['Inside cover', 'Electronics module', 'Bottom screw'];
    }

    if (title.includes('battery')) {
      return ['Battery compartment', 'AA batteries'];
    }

    if (title.includes('program')) {
      return ['Lock electronics', 'Reader', 'Credential'];
    }

    return ['Lock assembly', 'Mounting hardware'];
  }

  // ------------------------------------------------------------
  // Installation lifecycle
  // ------------------------------------------------------------

  startInstallation(): void {
    this.started = true;
    this.completed = false;
    this.currentStep = 0;
    this.acknowledgedSteps.clear();
  }

  next(): void {
    if (!this.canContinue) {
      return;
    }

    if (this.isLastStep) {
      this.completed = true;
      return;
    }

    this.currentStep++;
  }

  previous(): void {
    if (this.isFirstStep) {
      return;
    }

    this.currentStep--;
  }

  goToStep(index: number): void {
    if (index < 0 || index >= this.steps.length) {
      return;
    }

    if (index > this.currentStep && this.isCriticalStep) {
      if (!this.currentStepAcknowledged) {
        return;
      }
    }

    this.currentStep = index;
  }

  acknowledgeCurrentStep(): void {
    this.acknowledgedSteps.add(this.currentStep);
  }

  restart(): void {
    this.resetInstallationState();
  }

  private resetInstallationState(): void {
    this.currentStep = 0;
    this.started = false;
    this.completed = false;
    this.imageZoomOpen = false;
    this.imageZoom = 1;
    this.acknowledgedSteps.clear();

    this.finalChecks = {
      lockMounted: false,
      handleTested: false,
      readerTested: false,
      doorTested: false,
    };
  }

  // ------------------------------------------------------------
  // Final commissioning
  // ------------------------------------------------------------

  get installationComplete(): boolean {
    return Object.values(this.finalChecks).every(Boolean);
  }

  finishInstallation(): void {
    if (!this.installationComplete) {
      return;
    }

    this.completed = true;
  }

  // ------------------------------------------------------------
  // Image viewer
  // ------------------------------------------------------------

  openImage(): void {
    if (!this.currentInstallStep?.imageUrl) {
      return;
    }

    this.imageZoom = 1;
    this.imageZoomOpen = true;
  }

  closeImage(): void {
    this.imageZoomOpen = false;
    this.imageZoom = 1;
  }

  zoomIn(): void {
    this.imageZoom = Math.min(3, this.imageZoom + 0.25);
  }

  zoomOut(): void {
    this.imageZoom = Math.max(1, this.imageZoom - 0.25);
  }

  resetZoom(): void {
    this.imageZoom = 1;
  }
}
