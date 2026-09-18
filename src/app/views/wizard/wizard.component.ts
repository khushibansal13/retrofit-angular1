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
  | 'specs'
  | 'bom';

type DetailsMode =
  | 'choice'
  | 'scan'
  | 'manual'
  | 'detected'
  | 'gdpr'
  | 'analyzing';

interface DetectedProfile {
  material: 'Wood' | 'Glass' | 'Metal';
  materialConf: number;
  doorStyle: string;
  styleConf: number;
  existingLock: string;
  lockConf: number;
  frameConf: number;
  frameEvidence: string;
  handleEvidence: string;
  handing: string;
  handingConf: number;
  stileWidth: string;
  handlePosition: string;
  handleType: string;
  backsetMm: number | null;
  centerToCenterMm: number | null;
  doorStandard: string;
  doorStandardConf: number;
  lockType: string;
  cylinderVisible: boolean;
  deadboltPresent: boolean;
  thicknessClass: string;
}

interface LockTypeOption {
  id: string;
  icon: string;
  label: string;
  desc: string;
  existingLockValue: string;
}

interface ChoiceOption {
  value: string;
  label: string;
  hint: string;
}

interface AccessMethodOption {
  id: string;
  icon: string;
  label: string;
  desc: string;
  bomItem: string;
}

interface CardOption {
  id: string;
  icon: string;
  label: string;
  desc: string;
}

export interface DoorPhotoPreview {
  file: File;
  url: string;
  name: string;
  sizeFormatted: string;
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

  @ViewChild('cameraInput')
  private cameraInput?: ElementRef<HTMLInputElement>;

  @ViewChild('cameraVideo')
  private cameraVideo?: ElementRef<HTMLVideoElement>;

  filePreviews: DoorPhotoPreview[] = [];

  // Live in-app camera modal states
  isCameraOpen = false;
  isCameraLoading = false;
  cameraError = '';
  cameraStream: MediaStream | null = null;
  availableCameras: MediaDeviceInfo[] = [];
  selectedCameraIndex = 0;
  isShutterFlashing = false;

  constructor(
    private readonly arSession: ArSessionService,
    private readonly doorVision: DoorVisionService,
  ) {}

  screen: Screen = 'environment';

  detailsMode: DetailsMode = 'choice';

  // Local, transient carousel position for the business-profile screen.
  // Not persisted in DoorConfig — purely a "which slide is showing" flag.
  // 0 = business domain, 1 = budget, 2 = usage traffic.
  bizStep = 0;

  scanProgress = 0;
  scanLine = 0;

  gdprChecked = false;

  selectedFiles: File[] = [];

  scanError = '';

  analysisResult: DoorVisionResult | null = null;

  detectedProfile: DetectedProfile | null = null;

  readonly products = ALL_PRODUCTS;

  readonly businessDomains: CardOption[] = [
    {
      id: 'Home / Residential',
      icon: 'home',
      label: 'Home / Residential',
      desc: 'Private home or apartment',
    },
    {
      id: 'Hotel / Hospitality',
      icon: 'hotel',
      label: 'Hotel / Hospitality',
      desc: 'Guest rooms, staff and back-of-house doors',
    },
    {
      id: 'Office / Corporate',
      icon: 'business',
      label: 'Office / Corporate',
      desc: 'Workplace and office access',
    },
    {
      id: 'Education / University',
      icon: 'school',
      label: 'Education / University',
      desc: 'Campus, dorms, classrooms',
    },
    {
      id: 'Healthcare',
      icon: 'local_hospital',
      label: 'Healthcare',
      desc: 'Clinics, hospitals, care facilities',
    },
    {
      id: 'Retail',
      icon: 'storefront',
      label: 'Retail',
      desc: 'Shops and retail units',
    },
    {
      id: 'Government / Institutional',
      icon: 'account_balance',
      label: 'Government / Institutional',
      desc: 'Public sector and institutional buildings',
    },
    {
      id: 'Other',
      icon: 'apartment',
      label: 'Other',
      desc: "Something else — we'll ask more if needed",
    },
  ];

  readonly budgetOptions: CardOption[] = [
    {
      id: 'Under €1,000',
      icon: 'savings',
      label: 'Under €1,000',
      desc: 'Small, single-door budget',
    },
    {
      id: '€1,000 – €5,000',
      icon: 'balance',
      label: '€1,000 – €5,000',
      desc: 'A handful of doors',
    },
    {
      id: '€5,000 – €10,000',
      icon: 'workspace_premium',
      label: '€5,000 – €10,000',
      desc: 'Multi-door rollout',
    },
    {
      id: 'Over €10,000',
      icon: 'account_balance',
      label: 'Over €10,000',
      desc: 'Full-site or enterprise project',
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
    {
      id: 'Metal' as const,
      icon: '🔩',
      desc: 'Steel or aluminium security doors',
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

  readonly lockTypeOptions: LockTypeOption[] = [
    {
      id: 'euro',
      icon: 'vpn_key',
      label: 'Euro cylinder',
      desc: 'A key cylinder sticks out slightly from a round hole in the door edge.',
      existingLockValue: 'Euro Cylinder',
    },
    {
      id: 'us_deadbolt',
      icon: 'lock',
      label: 'Deadbolt',
      desc: 'A single throw-bolt lock, usually above the handle — common on US front doors.',
      existingLockValue: 'US Deadbolt',
    },
    {
      id: 'us_interconnected',
      icon: 'link',
      label: 'Deadbolt + handle combo',
      desc: 'A deadbolt and the handle/lever are linked together as one connected unit.',
      existingLockValue: 'US Interconnected Deadbolt',
    },
    {
      id: 'cylindrical_knob',
      icon: 'radio_button_checked',
      label: 'Knob or lever',
      desc: 'A round knob or lever handle with a keyhole underneath — no separate cylinder ring.',
      existingLockValue: 'Cylindrical Knob or Lever',
    },
    {
      id: 'surface_rim',
      icon: 'inventory_2',
      label: 'Surface-mounted box',
      desc: 'A rectangular metal box mounted on the surface of the door (night latch style).',
      existingLockValue: 'Surface Rim Lock',
    },
    {
      id: 'passage',
      icon: 'remove_circle_outline',
      label: 'Just a latch, no lock',
      desc: 'The door only has a spring latch — no separate locking cylinder or bolt.',
      existingLockValue: 'Passage Latch',
    },
  ];

  readonly backsetOptions: ChoiceOption[] = [
    { value: '60', label: '60 mm', hint: '≈ 2 3/8″ — most common' },
    { value: '70', label: '70 mm', hint: '≈ 2 3/4″' },
  ];

  readonly centerToCenterOptions: ChoiceOption[] = [
    { value: '101.6', label: '101.6 mm', hint: '≈ 4″ — most common' },
    { value: '139.7', label: '139.7 mm', hint: '≈ 5 1/2″' },
  ];

  readonly accessMethodOptions: AccessMethodOption[] = [
    {
      id: 'phone',
      icon: 'smartphone',
      label: 'Phone (Bluetooth/App)',
      desc: 'Unlock from a mobile app',
      bomItem: 'Mobile Credential License',
    },
    {
      id: 'card',
      icon: 'credit_card',
      label: 'Key card / fob',
      desc: 'Tap a card or fob to unlock',
      bomItem: 'RFID Key Cards (pack of 5)',
    },
    {
      id: 'pin',
      icon: 'dialpad',
      label: 'PIN code',
      desc: 'Enter a code on a keypad',
      bomItem: 'PIN Keypad Module',
    },
    {
      id: 'key',
      icon: 'key',
      label: 'Physical key (backup)',
      desc: 'Keep a mechanical key as a backup',
      bomItem: 'Mechanical Override Key (pair)',
    },
  ];

  readonly handlePositionOptions: CardOption[] = [
    {
      id: 'top',
      icon: 'vertical_align_top',
      label: 'Top',
      desc: 'Handle sits near the top of the lock case — often Scandinavian-style prep.',
    },
    {
      id: 'center',
      icon: 'vertical_align_center',
      label: 'Center',
      desc: 'Handle is roughly centered on the lock case — most common ANSI/DIN prep.',
    },
    {
      id: 'bottom',
      icon: 'vertical_align_bottom',
      label: 'Bottom',
      desc: 'Handle sits below the cylinder/deadbolt.',
    },
  ];

  readonly hostingOptions: ChoiceOption[] = [
    { value: 'on_premise', label: 'On-premise', hint: 'Your own server' },
    { value: 'cloud', label: 'SALTO Cloud', hint: 'Hosted for you' },
  ];

  readonly connectivityOptions: ChoiceOption[] = [
    { value: 'wired', label: 'Wired', hint: 'Hardwired to network' },
    { value: 'wireless', label: 'Wireless', hint: 'Battery + BLE/RF' },
  ];

  // Now also shown on the business-profile carousel (step 3), not just the
  // specs screen — usage patterns are a business-context question, so they
  // belong alongside domain/budget.
  readonly usageTrafficOptions: ChoiceOption[] = [
    { value: 'low', label: 'Low', hint: '< 50 uses/day' },
    { value: 'medium', label: 'Medium', hint: '50–200 uses/day' },
    { value: 'high', label: 'High', hint: '200+ uses/day' },
  ];

  readonly handleTypeOptions: ChoiceOption[] = [
    { value: 'lever', label: 'Lever', hint: 'Push-down handle' },
    { value: 'knob', label: 'Knob', hint: 'Round turning knob' },
    { value: 'pull_bar', label: 'Pull bar', hint: 'Straight pull handle' },
  ];

  readonly readerColors = Object.keys(FINISH_COLORS);

  readonly steps: {
    id: Screen;
    label: string;
    shortLabel: string;
  }[] = [
    {
      id: 'environment',
      label: 'Business Profile',
      shortLabel: 'Profile',
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
      id: 'specs',
      label: 'Extra Details',
      shortLabel: 'Specs',
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

  get isMetal(): boolean {
    return this.config.material === 'Metal';
  }

  get showBacksetQuestion(): boolean {
    return (
      this.config.existingLockId === 'us_deadbolt' ||
      this.config.existingLockId === 'us_interconnected'
    );
  }

  get showCenterToCenter(): boolean {
    return this.config.existingLockId === 'us_interconnected';
  }

  isAiSuppliedValue(value: string, options: ChoiceOption[]): boolean {
    return !!value && !options.some(option => option.value === value);
  }

  get isHotel(): boolean {
    return this.config.environment === 'Hotel / Hospitality';
  }

  get showHighTrafficAdvisory(): boolean {
    return (
      this.config.usageTraffic === 'high' ||
      this.config.environment === 'Education / University'
    );
  }

  get accessMethodBomItems(): string[] {
    return this.accessMethodOptions
      .filter(option => this.isAccessMethodSelected(option.id))
      .map(option => option.bomItem);
  }

  get quantity(): number {
    return Math.max(
      1,
      parseInt(this.config.quantity, 10) || 1,
    );
  }

  get fit(): boolean {
    if (!this.selectedProduct) {
      return false;
    }

    return this.isProductCompatible(this.selectedProduct.id);
  }

  get recommendationResults(): DoorVisionRecommendation[] {
    return (
      this.analysisResult?.recommendations ??
      this.doorVision.getLastResult()?.recommendations ??
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

  get bomExtraSpecChips(): string[] {
    const c = this.config;
    const chips: string[] = [];

    if (c.environment) chips.push(`Business: ${c.environment}`);
    if (c.budget) chips.push(`Budget: ${c.budget}`);
    if (c.currentMortiseType) chips.push(`Current mortise: ${c.currentMortiseType}`);
    if (c.backsetMm) chips.push(`Backset ${c.backsetMm}mm`);
    if (c.centerToCenterMm) chips.push(`Center-to-center ${c.centerToCenterMm}mm`);
    if (c.handlePosition) chips.push(`Handle position: ${this.formatValue(c.handlePosition)}`);
    if (c.handleType) chips.push(this.formatValue(c.handleType));
    if (c.needsDeadbolt) chips.push('Wants thumb-turn deadbolt');
    if (c.needsKeyholeFailover) chips.push('Wants mechanical key backup');
    if (c.doubleSidedLock) chips.push('Double-sided locking');
    if (c.waterResistant) chips.push('Exterior / weather-exposed');
    if (c.hostingPreference) {
      chips.push(c.hostingPreference === 'on_premise' ? 'On-premise hosting' : 'SALTO cloud platform');
    }
    if (c.connectivity) chips.push(this.formatValue(c.connectivity));
    if (c.usageTraffic) chips.push(`${this.formatValue(c.usageTraffic)} traffic`);
    if (c.readerColor) chips.push(`Reader: ${c.readerColor}`);
    if (c.spindleMm && c.spindleMm !== '8') chips.push(`Spindle ${c.spindleMm}mm`);
    if (c.cylinderToHandleMm) chips.push(`Cylinder-to-handle ${c.cylinderToHandleMm}mm`);

    return chips;
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

  selectBusinessDomain(id: string): void {
    this.set('environment', id);
    this.bizStep = 1;
  }

  // New: picking a budget now advances to the usage-traffic slide, the same
  // way picking a domain advances to budget.
  selectBudget(id: string): void {
    this.set('budget', id);
    this.bizStep = 2;
  }

  goToBizStep(step: number): void {
    if (step >= 1 && !this.config.environment) {
      return;
    }

    this.bizStep = step;
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

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  addFiles(files: File[]): void {
    this.scanError = '';
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length !== files.length) {
      this.scanError = 'Only image files (JPG, PNG, WebP) can be uploaded.';
      return;
    }

    const availableSlots = 5 - this.filePreviews.length;
    if (availableSlots <= 0) {
      this.scanError = 'Maximum 5 photos reached. Remove a photo to add a new one.';
      return;
    }

    if (imageFiles.length > availableSlots) {
      this.scanError = `You can select up to 5 photos. Only the first ${availableSlots} ${availableSlots === 1 ? 'was' : 'were'} added.`;
    }

    const toAdd = imageFiles.slice(0, availableSlots);
    for (const file of toAdd) {
      const url = URL.createObjectURL(file);
      this.filePreviews.push({
        file,
        url,
        name: file.name,
        sizeFormatted: this.formatFileSize(file.size),
      });
    }

    this.selectedFiles = this.filePreviews.map(p => p.file);
    if (this.selectedFiles.length > 0) {
      this.arSession.setDoorImage(this.selectedFiles[0]);
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length) {
      this.addFiles(files);
    }
    input.value = '';
  }

  onDropFiles(event: DragEvent): void {
    event.preventDefault();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) {
      this.addFiles(files);
    }
  }

  removePhoto(index: number, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (index >= 0 && index < this.filePreviews.length) {
      URL.revokeObjectURL(this.filePreviews[index].url);
      this.filePreviews.splice(index, 1);
      this.selectedFiles = this.filePreviews.map(p => p.file);
      if (this.selectedFiles.length > 0) {
        this.arSession.setDoorImage(this.selectedFiles[0]);
      }
      this.scanError = '';
    }
  }

  clearAllPhotos(): void {
    this.filePreviews.forEach(p => URL.revokeObjectURL(p.url));
    this.filePreviews = [];
    this.selectedFiles = [];
    this.scanError = '';
  }

  async openCamera(): Promise<void> {
    if (this.filePreviews.length >= 5) {
      this.scanError = 'Maximum 5 photos already added. Remove a photo to take a new one.';
      return;
    }

    const hasGetUserMedia = typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function';

    if (!hasGetUserMedia) {
      this.cameraInput?.nativeElement.click();
      return;
    }

    this.isCameraOpen = true;
    this.cameraError = '';
    this.isCameraLoading = true;
    await this.startCameraStream();
  }

  async startCameraStream(): Promise<void> {
    this.stopCameraStream();
    this.cameraError = '';
    this.isCameraLoading = true;

    try {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.availableCameras = devices.filter(d => d.kind === 'videoinput');
      } catch {
        this.availableCameras = [];
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      if (this.availableCameras.length > 0 && this.availableCameras[this.selectedCameraIndex]?.deviceId) {
        (constraints.video as MediaTrackConstraints).deviceId = {
          exact: this.availableCameras[this.selectedCameraIndex].deviceId,
        };
      }

      this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.isCameraLoading = false;

      setTimeout(() => {
        if (this.cameraVideo?.nativeElement && this.cameraStream) {
          this.cameraVideo.nativeElement.srcObject = this.cameraStream;
          this.cameraVideo.nativeElement.play().catch(() => {});
        }
      }, 60);
    } catch (err: any) {
      console.warn('getUserMedia error, providing native camera option:', err);
      this.isCameraLoading = false;
      if (err.name === 'NotAllowedError') {
        this.cameraError = 'Camera permission was denied. Please allow camera in site settings or tap below to open device camera.';
      } else {
        this.cameraError = 'Live camera could not be started directly. Tap below to use your device camera.';
      }
    }
  }

  stopCameraStream(): void {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
  }

  closeCamera(): void {
    this.stopCameraStream();
    this.isCameraOpen = false;
    this.cameraError = '';
  }

  switchCameraDevice(): void {
    if (this.availableCameras.length <= 1) return;
    this.selectedCameraIndex = (this.selectedCameraIndex + 1) % this.availableCameras.length;
    this.startCameraStream();
  }

  capturePhoto(): void {
    const video = this.cameraVideo?.nativeElement;
    if (!video || !this.cameraStream) return;

    this.isShutterFlashing = true;
    setTimeout(() => this.isShutterFlashing = false, 250);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const photoName = `door-snap-${this.filePreviews.length + 1}-${Date.now().toString().slice(-4)}.jpg`;
      const file = new File([blob], photoName, { type: 'image/jpeg' });
      this.addFiles([file]);

      if (this.filePreviews.length >= 5) {
        this.closeCamera();
      }
    }, 'image/jpeg', 0.92);
  }

  triggerNativeCamera(): void {
    this.closeCamera();
    this.cameraInput?.nativeElement.click();
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

  private isUsefulEvidence(text: string | undefined | null): boolean {
    if (!text) {
      return false;
    }

    const normalized = text.trim().toLowerCase();

    return (
      normalized.length > 6 &&
      !['yes', 'no', 'true', 'false', 'unknown', 'n/a'].includes(normalized)
    );
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

    if (result.clean_door_image) {
      this.arSession.setCleanDoorImageUrl(result.clean_door_image);
    } else {
      this.arSession.setCleanDoorImageUrl(null);
    }

    if (result.target_placement) {
      this.arSession.setTargetPlacement(result.target_placement);
    } else {
      this.arSession.setTargetPlacement(null);
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

      frameEvidence:
        this.isUsefulEvidence(result.profile.frame.visual_evidence)
          ? result.profile.frame.visual_evidence
          : '',

      handleEvidence:
        this.isUsefulEvidence((result.profile.handle as any)?.visual_evidence)
          ? (result.profile.handle as any).visual_evidence
          : '',

      handing:
        this.formatValue(
          result.profile.handing,
        ),

      handingConf:
        this.toPercent(
          result.profile.handing_confidence,
        ),

      stileWidth:
        this.formatValue(
          result.profile.stile_width_class,
        ),

      handlePosition:
        (result.profile.handle as any)?.handle_position &&
        (result.profile.handle as any).handle_position !== 'unknown'
          ? this.formatValue((result.profile.handle as any).handle_position)
          : '',

      handleType:
        (result.profile.handle as any)?.handle_type &&
        (result.profile.handle as any).handle_type !== 'unknown'
          ? this.formatValue((result.profile.handle as any).handle_type)
          : '',

      backsetMm: result.profile.measured_backset_mm,
      centerToCenterMm: result.profile.measured_center_to_center_mm,

        doorStandard:
        this.formatValue(
          result.profile.door_standard,
        ),

      doorStandardConf:
        this.toPercent(
          result.profile.door_standard_confidence,
        ),

      lockType:
        this.formatValue(
          result.profile.lock.lock_type,
        ),

      cylinderVisible:
        result.profile.lock.cylinder_visible,

      deadboltPresent:
        result.profile.lock.deadbolt_present,

      thicknessClass:
        this.formatValue(
          result.profile.approx_thickness_class,
        ),
    };

    const existingLockId =
      this.mapLockTypeToOptionId(
        result.profile.lock.lock_type,
      );

    const matchedOption =
      this.lockTypeOptions.find(
        option => option.id === existingLockId,
      );

    const updates:
      Partial<DoorConfig> = {
      material,

      existingLockId,

      existingLock:
        matchedOption
          ? matchedOption.existingLockValue
          : result.profile.lock.lock_type,

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

    if (result.profile.measured_backset_mm != null) {
      updates.backsetMm = String(result.profile.measured_backset_mm);
    }

    if (result.profile.measured_center_to_center_mm != null) {
      updates.centerToCenterMm = String(result.profile.measured_center_to_center_mm);
    }

    const handlePos = (result.profile.handle as any)?.handle_position;
    if (handlePos && handlePos !== 'unknown') {
      updates.handlePosition = handlePos;
    }

    const handleTyp = (result.profile.handle as any)?.handle_type;
    if (handleTyp && handleTyp !== 'unknown') {
      updates.handleType = handleTyp;
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
  ): 'Wood' | 'Glass' | 'Metal' {
    const value =
      material.toLowerCase();

    if (value.includes('glass')) {
      return 'Glass';
    }

    if (
      value.includes('metal') ||
      value.includes('steel') ||
      value.includes('aluminium') ||
      value.includes('aluminum')
    ) {
      return 'Metal';
    }

    return 'Wood';
  }

  private mapLockTypeToOptionId(
    lockType: string,
  ): string {
    const map: Record<string, string> = {
      euro_profile_cylinder: 'euro',
      cylindrical_knob: 'cylindrical_knob',
      rim_cylinder: 'surface_rim',
      no_lock_passage: 'passage',
      mechanical_deadbolt: 'us_deadbolt',
      interconnected_deadbolt: 'us_interconnected',
      tubular_latch: 'cylindrical_knob',
    };

    return map[lockType] ?? '';
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
    material: 'Wood' | 'Glass' | 'Metal',
  ): void {
    this.setMany({
      material,
      product: null,
      finish: 'Satin Chrome',
    });
  }

  selectLockType(
    option: LockTypeOption,
  ): void {
    const updates: Partial<DoorConfig> = {
      existingLockId: option.id,
      existingLock: option.existingLockValue,
    };

    if (option.id !== 'us_deadbolt' && option.id !== 'us_interconnected') {
      updates.backsetMm = '';
    }

    if (option.id !== 'us_interconnected') {
      updates.centerToCenterMm = '';
    }

    this.setMany(updates);
  }

  selectBackset(value: string): void {
    this.set(
      'backsetMm',
      this.config.backsetMm === value ? '' : value,
    );
  }

  selectCenterToCenter(value: string): void {
    this.set(
      'centerToCenterMm',
      this.config.centerToCenterMm === value ? '' : value,
    );
  }

  toggleAccessMethod(id: string): void {
    const current = this.config.accessMethods ?? [];

    const next = current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id];

    this.setMany({ accessMethods: next });
  }

  isAccessMethodSelected(id: string): boolean {
    return (this.config.accessMethods ?? []).includes(id);
  }

  continueFromDetails(): void {
    if (
      !this.config.material ||
      !this.config.thickness ||
      (!this.analysisResult && !this.config.existingLockId)
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
          existing_lock: this.config.existingLockId ? this.config.existingLock : undefined,
        })
        .subscribe({
          next: result => {
            this.applyRecommendationResult(result, thickness);
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
          this.applyRecommendationResult(result, thickness);
        },

        error: error => {
          this.scanError =
            this.getAnalysisError(
              error,
            );
        },
      });
  }

  private applyRecommendationResult(
    result: DoorVisionResult,
    thickness: number,
  ): void {
    this.analysisResult = result;

    const updates: Partial<DoorConfig> = {
      thickness: String(thickness),
    };

    if (
      this.config.product &&
      !result.recommendations.some(
        r => r.product_id === this.config.product && r.status === 'compatible',
      )
    ) {
      updates.product = null;
    }

    this.setMany(updates);

    this.screen = 'lock';
  }

  selectProduct(
    product: Product,
  ): void {
    const rec = this.getRecommendation(product.id);
    if (rec && rec.status !== 'compatible') {
      return;
    }

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
    if (recommendation.status !== 'compatible') {
      return;
    }

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
    if (!this.config.product || !this.isProductCompatible(this.config.product)) {
      return;
    }

    this.screen = 'specs';
  }

  continueFromSpecs(): void {
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

    if (this.selectedFiles.length > 0 && !this.arSession.hasCustomDoorImage()) {
      this.arSession.setDoorImage(this.selectedFiles[0]);
    }

    if (this.analysisResult?.clean_door_image && !this.arSession.getCleanDoorImageUrl()) {
      this.arSession.setCleanDoorImageUrl(this.analysisResult.clean_door_image);
    }

    if (this.analysisResult?.target_placement && !this.arSession.getTargetPlacement()) {
      this.arSession.setTargetPlacement(this.analysisResult.target_placement);
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
    if (!this.analysisResult) {
      this.analysisResult = this.doorVision.getLastResult();
    }

    if (this.config.product) {
      this.screen = 'bom';
      return;
    }

    if (
      this.config.material &&
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
          this.config.thickness
        );

      case 'specs':
        return !!this.config.product;

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
    this.stopCameraStream();
    this.filePreviews.forEach(p => URL.revokeObjectURL(p.url));
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
