import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { DoorConfig } from '../../app';
import {
  ALL_PRODUCTS,
  FINISH_COLORS,
  Product,
} from '../../data/products';

import {
  DoorVisionRecommendation,
  DoorVisionResult,
  DoorVisionService,
} from '../../services/door-vision.service';

import { ArSessionService } from '../../services/ar-session.service';

type Screen =
  | 'environment'
  | 'details'
  | 'lock'
  | 'bom';

type DetailsMode =
  | 'choice'
  | 'scan'
  | 'manual'
  | 'detected'
  | 'gdpr'
  | 'analyzing';

interface DetectedProfile {
  material: 'Wood' | 'Glass';
  materialConf: number;
  doorStyle: string;
  styleConf: number;
  existingLock: string;
  lockConf: number;
  frameConf: number;
  handing: string;
  handingConf: number;
}

@Component({
  selector: 'app-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './wizard.component.html',
  styleUrls: ['./wizard.component.css'],
})
export class WizardComponent
  implements OnInit, OnDestroy
{
  @Input({ required: true })
  config!: DoorConfig;

  @Output()
  configChange =
    new EventEmitter<DoorConfig>();

  @Output()
  finish =
    new EventEmitter<void>();

  @ViewChild('fileInput')
  private fileInput?: ElementRef<HTMLInputElement>;

  constructor(
    private readonly arSession: ArSessionService,
    private readonly doorVision: DoorVisionService,
  ) {}

  screen: Screen = 'environment';

  detailsMode: DetailsMode = 'choice';

  scanProgress = 0;
  scanLine = 0;

  gdprChecked = false;

  selectedFiles: File[] = [];

  scanError = '';

  analysisResult: DoorVisionResult | null = null;

  // Toggles the optional installer-detail inputs (backset, center-to-center).
  // Off by default so a casual customer sees only material/width/height/thickness.
  showAdvancedDetails = false;

  detectedProfile: DetectedProfile | null = null;

  readonly products = ALL_PRODUCTS;

  readonly environments = [
    {
      id: 'Home' as const,
      icon: 'home',
      label: 'Home / Residential',
      desc: 'Private home or apartment',
    },
    {
      id: 'Facility' as const,
      icon: 'business',
      label: 'Facility / Commercial',
      desc: 'Office, retail, or commercial site',
    },
  ];

  readonly materials = [
    {
      id: 'Wood' as const,
      icon: '🪵',
      desc: 'Timber, MDF, composite',
    },
    {
      id: 'Glass' as const,
      icon: '🪟',
      desc: 'Frameless or semi-framed toughened glass',
    },
  ];

  readonly directions = [
    'Inward Left',
    'Inward Right',
    'Outward Left',
    'Outward Right',
  ];

  readonly leafCounts = [
    'Single',
    'Double',
  ];

  readonly steps: {
    id: Screen;
    label: string;
    shortLabel: string;
  }[] = [
    {
      id: 'environment',
      label: 'Installation',
      shortLabel: 'Install',
    },
    {
      id: 'details',
      label: 'Door Details',
      shortLabel: 'Details',
    },
    {
      id: 'lock',
      label: 'Smart Lock',
      shortLabel: 'Lock',
    },
    {
      id: 'bom',
      label: 'Review',
      shortLabel: 'Review',
    },
  ];

  private scanTimer:
    ReturnType<typeof setInterval> | null = null;

  private detectTimer:
    ReturnType<typeof setTimeout> | null = null;

  /*
   * DoorConfig.product contains only the product ID.
   * Resolve that ID to the actual catalog Product.
   */
  get selectedProduct(): Product | undefined {
    if (!this.config.product) {
      return undefined;
    }

    return this.products.find(
      product => product.id === this.config.product,
    );
  }

  get isGlass(): boolean {
    return this.config.material === 'Glass';
  }

  get quantity(): number {
    return Math.max(
      1,
      parseInt(this.config.quantity, 10) || 1,
    );
  }

  /*
   * Compatibility always comes from the backend recommendation.
   */
  get fit(): boolean {
    if (!this.selectedProduct) {
      return false;
    }

    const recommendation =
      this.analysisResult?.recommendations.find(
        result =>
          result.product_id ===
          this.selectedProduct?.id,
      );

    return (
      recommendation?.status ===
      'compatible'
    );
  }

  get recommendationResults(): DoorVisionRecommendation[] {
    return (
      this.analysisResult?.recommendations ??
      []
    );
  }

  get compatibleRecommendations(): DoorVisionRecommendation[] {
    return this.recommendationResults.filter(
      recommendation =>
        recommendation.status ===
        'compatible',
    );
  }

  get missingInformationRecommendations(): DoorVisionRecommendation[] {
    return this.recommendationResults.filter(
      recommendation =>
        recommendation.status ===
        'missing_information',
    );
  }

  get incompatibleRecommendations(): DoorVisionRecommendation[] {
    return this.recommendationResults.filter(
      recommendation =>
        recommendation.status ===
        'incompatible',
    );
  }

  getProduct(
    productId: string,
  ): Product | undefined {
    return this.products.find(
      product => product.id === productId,
    );
  }

  set(
    key: keyof DoorConfig,
    value: string | boolean | null,
  ): void {
    this.config = {
      ...this.config,
      [key]: value,
    } as DoorConfig;

    this.configChange.emit(
      this.config,
    );
  }

  setMany(
    updates: Partial<DoorConfig>,
  ): void {
    this.config = {
      ...this.config,
      ...updates,
    };

    this.configChange.emit(
      this.config,
    );
  }

  toggleAdvancedDetails(): void {
    this.showAdvancedDetails = !this.showAdvancedDetails;
  }

  selectEnvironment(
    id: 'Home' | 'Facility',
  ): void {
    this.set(
      'environment',
      id,
    );
  }

  continueFromEnvironment(): void {
    if (!this.config.environment) {
      return;
    }

    this.detailsMode = 'choice';
    this.screen = 'details';
  }

  openManual(): void {
    this.detailsMode = 'manual';
  }

  openScan(): void {
    this.detailsMode = 'scan';
  }

  backToDetailsChoice(): void {
    this.detailsMode = 'choice';
  }

  openFilePicker(): void {
    this.fileInput?.nativeElement.click();
  }

  onFilesSelected(
    event: Event,
  ): void {
    const input =
      event.target as HTMLInputElement;

    const files =
      Array.from(input.files ?? []);

    this.scanError = '';

    if (!files.length) {
      return;
    }

    const imageFiles =
      files.filter(file =>
        file.type.startsWith('image/'),
      );

    if (
      imageFiles.length !==
      files.length
    ) {
      this.scanError =
        'Only image files can be uploaded.';

      input.value = '';
      return;
    }

    if (
      imageFiles.length < 1 ||
      imageFiles.length > 5
    ) {
      this.scanError =
        'Please select between 1 and 5 door images.';

      input.value = '';
      return;
    }

    this.selectedFiles =
      imageFiles;

    if (this.selectedFiles.length > 0) {
      this.arSession.setDoorImage(this.selectedFiles[0]);
    }
  }

  startScan(): void {
    this.scanError = '';
    this.detailsMode = 'gdpr';
  }

  beginAnalysis(): void {
    if (
      !this.gdprChecked ||
      this.selectedFiles.length < 1 ||
      this.selectedFiles.length > 5
    ) {
      if (
        this.selectedFiles.length < 1 ||
        this.selectedFiles.length > 5
      ) {
        this.scanError =
          'Please select between 1 and 5 door images before continuing.';
      }

      return;
    }

    this.set(
      'gdprAccepted',
      true,
    );

    this.detailsMode =
      'analyzing';

    this.scanProgress = 10;
    this.scanLine = 10;

    this.scanError = '';
    this.analysisResult = null;

    this.clearTimers();

    this.scanTimer =
      setInterval(() => {
        if (this.scanProgress < 90) {
          this.scanProgress += 2;
          this.scanLine =
            this.scanProgress;
        }
      }, 120);

    this.doorVision
      .analyzeDoor(
        this.selectedFiles,
      )
      .subscribe({
        next: result =>
          this.handleAnalysisSuccess(
            result,
          ),

        error: error =>
          this.handleAnalysisError(
            error,
          ),
      });
  }

  private handleAnalysisSuccess(
    result: DoorVisionResult,
  ): void {
    this.clearTimers();

    this.scanProgress = 100;
    this.scanLine = 100;

    this.analysisResult = result;

    if (
      this.selectedFiles.length > 0
    ) {
      this.arSession.setDoorImage(
        this.selectedFiles[0],
      );
    }

    const material =
      this.mapMaterial(
        result.profile.door_material,
      );

    const lockDescription =
      result.profile.lock
        .visual_evidence ||
      result.profile.lock.lock_type;

    this.detectedProfile = {
      material,

      materialConf:
        this.toPercent(
          result.profile
            .material_confidence,
        ),

      doorStyle:
        result.profile.door_style ||
        'Unknown',

      styleConf:
        this.toPercent(
          result.profile
            .door_standard_confidence,
        ),

      existingLock:
        this.formatValue(
          lockDescription,
        ),

      lockConf:
        this.toPercent(
          result.profile.lock.confidence,
        ),

      frameConf:
        this.toPercent(
          result.profile.frame.confidence,
        ),

      handing:
        this.formatValue(
          result.profile.handing,
        ),

      handingConf:
        this.toPercent(
          result.profile.handing_confidence,
        ),
    };

    const updates:
      Partial<DoorConfig> = {
      material,

      existingLock:
      result.profile.lock.lock_type,

      type:
        this.config.type ||
        result.profile.door_style ||
        'Interior',
    };

    if (
      result.profile
        .measured_thickness_mm != null
    ) {
      updates.thickness =
        String(
          Math.round(
            result.profile
              .measured_thickness_mm,
          ),
        );
    }

    this.setMany(
      updates,
    );

    this.detailsMode =
      'detected';
  }

  private handleAnalysisError(
    error: unknown,
  ): void {
    this.clearTimers();

    this.scanProgress = 0;
    this.scanLine = 0;

    this.scanError =
      this.getAnalysisError(
        error,
      );

    this.detailsMode =
      'scan';
  }

  private getAnalysisError(
    error: unknown,
  ): string {
    const response = (
      error as {
        error?: {
          detail?: string;
        };
      }
    )?.error;

    if (response?.detail) {
      return response.detail;
    }

    return 'We could not analyse these images. Please try again with 1–5 clear door photos.';
  }

  private mapMaterial(
    material: string,
  ): 'Wood' | 'Glass' {
    const value =
      material.toLowerCase();

    return value.includes('glass')
      ? 'Glass'
      : 'Wood';
  }

  private toPercent(
    confidence: number,
  ): number {
    return Math.round(
      confidence <= 1
        ? confidence * 100
        : confidence,
    );
  }

  private formatValue(
    value: string,
  ): string {
    return value
      .replaceAll('_', ' ')
      .replace(
        /\b\w/g,
        char =>
          char.toUpperCase(),
      );
  }

  formatRecommendationInput(
    input: string,
  ): string {
    return this.formatValue(
      input,
    );
  }

  useDetectedDetails(): void {
    this.detailsMode =
      'manual';
  }

  setMaterial(
    material: 'Wood' | 'Glass',
  ): void {
    this.setMany({
      material,
      product: null,
      finish: 'Satin Chrome',
    });
  }

  continueFromDetails(): void {
    if (
      !this.config.material ||
      !this.config.width ||
      !this.config.height ||
      !this.config.thickness
    ) {
      return;
    }

    const thickness =
      Number(this.config.thickness);

    if (
      !Number.isFinite(thickness) ||
      thickness <= 0
    ) {
      return;
    }

    this.scanError = '';

    const backsetMm = this.config.backsetMm ? Number(this.config.backsetMm) : undefined;
    const centerToCenterMm = this.config.centerToCenterMm
      ? Number(this.config.centerToCenterMm)
      : undefined;

    /*
     * --------------------------------------------------
     * SCANNED FLOW
     * --------------------------------------------------
     */
    if (this.analysisResult) {
      const profile = {
        ...this.analysisResult.profile,
        measured_thickness_mm:
        thickness,
      };

      this.doorVision
        .checkCompatibility({
          profile,
          door_thickness_mm: thickness,
          backset_mm: backsetMm,
          center_to_center_mm: centerToCenterMm,
        })
        .subscribe({
          next: result => {
            this.analysisResult =
              result;

            this.setMany({
              thickness:
                String(thickness),
            });

            this.screen =
              'lock';
          },

          error: error => {
            this.scanError =
              this.getAnalysisError(
                error,
              );
          },
        });

      return;
    }

    /*
     * --------------------------------------------------
     * MANUAL FLOW
     * --------------------------------------------------
     */
    this.doorVision
      .recommendProducts({
        door_material:
        this.config.material,

        door_thickness_mm:
        thickness,

        door_type:
          this.config.type ||
          'Interior',

        existing_lock:
          this.config.existingLock ||
          'Mortise',

        frame_type:
          this.config.frameType ||
          'Timber',

        backset_mm: backsetMm,
        center_to_center_mm: centerToCenterMm,
      })
      .subscribe({
        next: result => {
          this.analysisResult =
            result;

          this.setMany({
            thickness:
              String(thickness),
          });

          this.screen =
            'lock';
        },

        error: error => {
          this.scanError =
            this.getAnalysisError(
              error,
            );
        },
      });
  }

  selectProduct(
    product: Product,
  ): void {
    const finish =
      product.finishes[0] ||
      'Satin Chrome';

    this.setMany({
      product: product.id,
      finish,
    });

    this.arSession.setSelectedProduct(
      product.id,
      finish,
    );
  }

  selectRecommendation(
    recommendation: DoorVisionRecommendation,
  ): void {
    const product =
      this.getProduct(
        recommendation.product_id,
      );

    if (!product) {
      return;
    }

    this.selectProduct(
      product,
    );
  }

  selectFinish(
    product: Product,
    finish: string,
  ): void {
    this.setMany({
      product: product.id,
      finish,
    });

    this.arSession.setSelectedProduct(
      product.id,
      finish,
    );
  }

  continueFromLock(): void {
    if (!this.config.product) {
      return;
    }

    this.screen = 'bom';
  }

  incrementQuantity(): void {
    this.set(
      'quantity',
      String(
        this.quantity + 1,
      ),
    );
  }

  decrementQuantity(): void {
    this.set(
      'quantity',
      String(
        Math.max(
          1,
          this.quantity - 1,
        ),
      ),
    );
  }

  finishWizard(): void {
    if (
      !this.selectedProduct ||
      !this.fit ||
      !this.config.gdprAccepted ||
      this.quantity < 1
    ) {
      return;
    }

    if (this.selectedFiles.length > 0) {
      this.arSession.setDoorImage(this.selectedFiles[0]);
    }

    if (this.selectedProduct) {
      this.arSession.setSelectedProduct(
        this.selectedProduct.id,
        this.config.finish || this.selectedProduct.finishes[0],
      );
    }

    this.set(
      'orderStatus',
      'submitted',
    );

    this.finish.emit();
  }

  finishColor(
    finish: string,
  ): string {
    const value =
      (
        FINISH_COLORS as Record<
          string,
          unknown
        >
      )[finish];

    if (
      typeof value === 'string'
    ) {
      return value;
    }

    if (
      value &&
      typeof value === 'object' &&
      'base' in value
    ) {
      return String(
        (
          value as {
            base: string;
          }
        ).base,
      );
    }

    return '#888';
  }

  trackProduct(
    _: number,
    product: Product,
  ): string {
    return product.id;
  }

  ngOnInit(): void {
    if (this.config.product) {
      this.screen = 'bom';
      return;
    }

    if (
      this.config.material &&
      this.config.width &&
      this.config.height &&
      this.config.thickness
    ) {
      this.screen = 'lock';
      return;
    }

    if (this.config.environment) {
      this.screen = 'details';
      this.detailsMode =
        'manual';
      return;
    }

    this.screen = 'environment';
    this.detailsMode =
      'choice';
  }

  stepIndex(
    step: Screen,
  ): number {
    return this.steps.findIndex(
      item => item.id === step,
    );
  }

  canVisitStep(
    step: Screen,
  ): boolean {
    switch (step) {
      case 'environment':
        return true;

      case 'details':
        return !!this.config.environment;

      case 'lock':
        return !!(
          this.config.environment &&
          this.config.material &&
          this.config.width &&
          this.config.height &&
          this.config.thickness
        );

      case 'bom':
        return !!this.config.product;
    }
  }

  isStepComplete(
    step: Screen,
  ): boolean {
    const current =
      this.stepIndex(
        this.screen,
      );

    return (
      this.stepIndex(step) <
      current &&
      this.canVisitStep(step)
    );
  }

  goToStep(
    step: Screen,
  ): void {
    if (
      !this.canVisitStep(step)
    ) {
      return;
    }

    this.screen = step;

    if (step === 'details') {
      this.detailsMode =
        this.config.material
          ? 'manual'
          : 'choice';
    }
  }

  goBack(): void {
    const index =
      this.stepIndex(
        this.screen,
      );

    if (index <= 0) {
      return;
    }

    this.goToStep(
      this.steps[index - 1].id,
    );
  }

  private clearTimers(): void {
    if (this.scanTimer) {
      clearInterval(
        this.scanTimer,
      );

      this.scanTimer = null;
    }

    if (this.detectTimer) {
      clearTimeout(
        this.detectTimer,
      );

      this.detectTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  getRecommendation(
    productId: string,
  ): DoorVisionRecommendation | undefined {
    return this.analysisResult?.recommendations.find(
      recommendation =>
        recommendation.product_id ===
        productId,
    );
  }

  isProductCompatible(
    productId: string,
  ): boolean {
    return (
      this.getRecommendation(
        productId,
      )?.status === 'compatible'
    );
  }

  isProductIncompatible(
    productId: string,
  ): boolean {
    return (
      this.getRecommendation(
        productId,
      )?.status === 'incompatible'
    );
  }
}
