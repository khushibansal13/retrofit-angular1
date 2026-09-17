import { Injectable } from '@angular/core';
import {
  HttpClient,
} from '@angular/common/http';
import {
  Observable,
  tap,
} from 'rxjs';

export interface DoorVisionComponent {
  detected: boolean;
  confidence: number;
  visual_evidence: string;
}

export interface DoorVisionLock
  extends DoorVisionComponent {
  lock_type: string;
  cylinder_visible: boolean;
  deadbolt_present: boolean;
}

export interface DoorVisionHandle
  extends DoorVisionComponent {
  handle_position: string;
  handle_type: string;
}

export interface DoorVisionProfile {
  door_material: string;
  material_confidence: number;

  door_style: string;

  door_standard: string;
  door_standard_confidence: number;

  handing: string;
  handing_confidence: number;

  approx_thickness_class: string;

  stile_width_class: string;

  lock: DoorVisionLock;

  frame: DoorVisionComponent;

  handle: DoorVisionHandle;

  measured_thickness_mm: number | null;

  measured_backset_mm: number | null;

  measured_center_to_center_mm: number | null;
}

export interface DoorVisionRecommendation {
  product_id: string;

  name: string;

  family: string;

  status:
    | 'compatible'
    | 'missing_information'
    | 'incompatible';

  reasons: string[];

  missing_inputs: string[];

  source_document: string;
}

export interface DoorVisionMetadata {
  images_analyzed: number;

  dataset: string;

  products_evaluated: number;

  principle: string;
}

export interface TargetPlacement {
  x: number;
  y: number;
  is_left: boolean;
  type?: string;
}

export interface DoorVisionResult {
  profile: DoorVisionProfile;

  recommendations:
    DoorVisionRecommendation[];

  metadata: DoorVisionMetadata;

  clean_door_image?: string | null;

  target_placement?: TargetPlacement | null;
}

export interface ManualDoorRecommendationRequest {
  door_material:
    | 'Wood'
    | 'Glass'
    | 'Metal';

  door_thickness_mm: number;

  door_type: string;

  existing_lock: string;

  frame_type: string;

  backset_mm?: number;

  center_to_center_mm?: number;
}

export interface CheckCompatibilityRequest {
  profile: DoorVisionProfile;

  door_thickness_mm?: number | null;

  backset_mm?: number | null;

  center_to_center_mm?: number | null;

  // When the customer confirms/corrects the AI-detected lock type on the
  // "here's what we found" screen, this overrides profile.lock/door_standard
  // server-side using the same mapping the manual flow uses.
  existing_lock?: string;
}

@Injectable({
  providedIn: 'root',
})
export class DoorVisionService {

  private get apiUrl(): string {
    if (typeof window !== 'undefined') {
      return '/api';
    }
    return 'http://127.0.0.1:8000/api';
  }


  private lastResult: DoorVisionResult | null = null;
  private readonly CACHE_KEY = 'retrofit-last-analysis-result';

  constructor(
    private readonly http: HttpClient,
  ) {}

  setLastResult(result: DoorVisionResult): void {
    this.lastResult = result;
    try {
      sessionStorage.setItem(this.CACHE_KEY, JSON.stringify(result));
    } catch {
      // Ignore storage errors
    }
  }

  getLastResult(): DoorVisionResult | null {
    if (this.lastResult) {
      return this.lastResult;
    }
    try {
      const stored = sessionStorage.getItem(this.CACHE_KEY);
      if (stored) {
        this.lastResult = JSON.parse(stored);
        return this.lastResult;
      }
    } catch {
      // Ignore storage errors
    }
    return null;
  }

  analyzeDoor(
    files: File[],
  ): Observable<DoorVisionResult> {

    if (
      files.length < 1 ||
      files.length > 5
    ) {
      throw new Error(
        'Please provide between 1 and 5 images.',
      );
    }

    const formData =
      new FormData();

    files.forEach(file => {
      formData.append(
        'files',
        file,
        file.name,
      );
    });

    return this.http.post<DoorVisionResult>(
      `${this.apiUrl}/analyze-door`,
      formData,
    ).pipe(
      tap(result => this.setLastResult(result))
    );
  }

  checkCompatibility(
    request: CheckCompatibilityRequest,
  ): Observable<DoorVisionResult> {

    return this.http.post<DoorVisionResult>(
      `${this.apiUrl}/check-compatibility`,
      request,
    ).pipe(
      tap(result => this.setLastResult(result))
    );
  }

  recommendProducts(
    request:
    ManualDoorRecommendationRequest,
  ): Observable<DoorVisionResult> {

    return this.http.post<DoorVisionResult>(
      `${this.apiUrl}/recommend-products`,
      request,
    ).pipe(
      tap(result => this.setLastResult(result))
    );
  }

  cleanDoor(file: File, handing: string = 'right_hand'): Observable<{ clean_door_image: string; target_placement?: TargetPlacement | null }> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('handing', handing);
    return this.http.post<{ clean_door_image: string; target_placement?: TargetPlacement | null }>(
      `${this.apiUrl}/clean-door`,
      formData,
    );
  }

  healthCheck(): Observable<{
    status: string;
    service: string;
    products_loaded: number;
  }> {

    return this.http.get<{
      status: string;
      service: string;
      products_loaded: number;
    }>(
      `${this.apiUrl}/health`,
    );
  }
}
