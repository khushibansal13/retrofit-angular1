import { Injectable } from '@angular/core';
import {
  HttpClient,
} from '@angular/common/http';
import {
  Observable,
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

export interface DoorVisionResult {
  profile: DoorVisionProfile;

  recommendations:
    DoorVisionRecommendation[];

  metadata: DoorVisionMetadata;
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

  private readonly apiUrl =
    'http://127.0.0.1:8000/api';

  constructor(
    private readonly http: HttpClient,
  ) {}

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
    );
  }

  checkCompatibility(
    request: CheckCompatibilityRequest,
  ): Observable<DoorVisionResult> {

    return this.http.post<DoorVisionResult>(
      `${this.apiUrl}/check-compatibility`,
      request,
    );
  }

  recommendProducts(
    request:
    ManualDoorRecommendationRequest,
  ): Observable<DoorVisionResult> {

    return this.http.post<DoorVisionResult>(
      `${this.apiUrl}/recommend-products`,
      request,
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
