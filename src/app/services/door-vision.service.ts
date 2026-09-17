import { Injectable } from '@angular/core';
import {
  HttpClient,
} from '@angular/common/http';
import {
  Observable,
  of,
  throwError,
  timer,
} from 'rxjs';
import {
  catchError,
  filter,
  switchMap,
  take,
  tap,
} from 'rxjs/operators';


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


// =========================================================
// Background analysis response
// =========================================================

export interface DoorVisionAnalysisJob {
  jobId: string;

  status:
    | 'processing'
    | 'completed'
    | 'failed';

  message?: string;

  error?: string;
}


// =========================================================
// Manual recommendation
// =========================================================

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


// =========================================================
// Compatibility request
// =========================================================

export interface CheckCompatibilityRequest {
  profile: DoorVisionProfile;

  door_thickness_mm?: number | null;

  backset_mm?: number | null;

  center_to_center_mm?: number | null;

  // When the customer confirms/corrects the AI-detected
  // lock type on the "here's what we found" screen,
  // this overrides profile.lock/door_standard
  // server-side using the same mapping the manual flow uses.
  existing_lock?: string;
}


@Injectable({
  providedIn: 'root',
})
export class DoorVisionService {

  private get apiUrl(): string {

    // if (typeof window !== 'undefined') {
    //   return '/api';
    // }

    return 'https://retrofit-angular1-production.up.railway.app/api';
  }


  // =======================================================
  // Last completed analysis
  // =======================================================

  private lastResult:
    DoorVisionResult | null = null;

  private readonly CACHE_KEY =
    'retrofit-last-analysis-result';


  // =======================================================
  // Polling configuration
  // =======================================================

  /**
   * How often Angular checks whether Ollama has finished.
   *
   * Ollama can take several minutes, but each polling
   * request is very short and therefore does not hit
   * Cloudflare's 120 second timeout.
   */
private readonly POLL_INTERVAL_MS = 15000;

  /**
   * Maximum number of polling attempts.
   *
   * 600 attempts x 3 seconds = 30 minutes.
   *
   * This is intentionally generous because the local
   * Ollama machine may take several minutes to analyse
   * an image.
   */
  private readonly MAX_POLL_ATTEMPTS = 600;


  constructor(
    private readonly http: HttpClient,
  ) {}


  // =======================================================
  // Cache result
  // =======================================================

  setLastResult(
    result: DoorVisionResult,
  ): void {

    this.lastResult = result;

    try {

      sessionStorage.setItem(
        this.CACHE_KEY,
        JSON.stringify(result),
      );

    } catch {

      // Ignore storage errors

    }
  }


  // =======================================================
  // Get cached result
  // =======================================================

  getLastResult():
    DoorVisionResult | null {

    if (this.lastResult) {
      return this.lastResult;
    }

    try {

      const stored =
        sessionStorage.getItem(
          this.CACHE_KEY,
        );

      if (stored) {

        this.lastResult =
          JSON.parse(stored);

        return this.lastResult;
      }

    } catch {

      // Ignore storage errors

    }

    return null;
  }


  // =======================================================
  // Analyze door
  // =======================================================
  //
  // NEW FLOW:
  //
  // 1. Upload images
  // 2. Backend immediately returns jobId
  // 3. Angular polls the job
  // 4. Backend eventually returns DoorVisionResult
  //
  // Ollama can take >120 seconds because Angular is no
  // longer waiting on the original POST request.
  //
  // =======================================================

  analyzeDoor(
    files: File[],
  ): Observable<DoorVisionResult> {

    if (
      files.length < 1 ||
      files.length > 5
    ) {

      return throwError(
        () =>
          new Error(
            'Please provide between 1 and 5 images.',
          ),
      );
    }


    const formData =
      new FormData();


    files.forEach(
      file => {

        formData.append(
          'files',
          file,
          file.name,
        );

      },
    );


    // -------------------------------------------------------
    // STEP 1
    // Upload image and start background job
    // -------------------------------------------------------

    return this.http.post<DoorVisionAnalysisJob>(
      `${this.apiUrl}/analyze-door`,
      formData,
    ).pipe(

      switchMap(
        job => {

          if (
            !job ||
            !job.jobId
          ) {

            return throwError(
              () =>
                new Error(
                  'Door analysis did not return a valid job ID.',
                ),
            );
          }


          console.log(
            '[DoorVision] Analysis job started:',
            job.jobId,
          );


          // -------------------------------------------------
          // STEP 2
          // Poll the job until it completes
          // -------------------------------------------------

          return this.pollAnalysisJob(
            job.jobId,
          );

        },
      ),

      // -----------------------------------------------------
      // STEP 3
      // Save completed result
      // -----------------------------------------------------

      tap(
        result => {

          console.log(
            '[DoorVision] Analysis completed.',
          );

          this.setLastResult(
            result,
          );

        },
      ),

    );
  }


  // =======================================================
  // Poll background analysis job
  // =======================================================

  private pollAnalysisJob(
    jobId: string,
  ): Observable<DoorVisionResult> {

    let attempts = 0;


    return timer(
      0,
      this.POLL_INTERVAL_MS,
    ).pipe(

      switchMap(
        () => {

          attempts++;

          console.log(
            `[DoorVision] Checking analysis job ` +
            `${jobId} ` +
            `(attempt ${attempts})`,
          );


          return this.http.get<
            DoorVisionAnalysisJob &
            Partial<DoorVisionResult>
          >(
            `${this.apiUrl}/analyze-door/${jobId}`,
          );

        },
      ),


      switchMap(
        response => {

          // -------------------------------------------------
          // Still processing
          // -------------------------------------------------

          if (
            response.status === 'processing'
          ) {

            console.log(
              `[DoorVision] Job ${jobId} ` +
              `is still processing.`,
            );

            return of(null);
          }


          // -------------------------------------------------
          // Analysis failed
          // -------------------------------------------------

          if (
            response.status === 'failed'
          ) {

            console.error(
              `[DoorVision] Job ${jobId} failed:`,
              response.error,
            );

            return throwError(
              () =>
                new Error(
                  response.error ||
                  'Door analysis failed.',
                ),
            );
          }


          // -------------------------------------------------
          // Analysis completed
          // -------------------------------------------------

          if (
            response.status === 'completed'
          ) {

            if (
              !response.profile ||
              !response.recommendations ||
              !response.metadata
            ) {

              return throwError(
                () =>
                  new Error(
                    'Door analysis completed but returned an invalid result.',
                  ),
              );
            }


            const result:
              DoorVisionResult = {

              profile:
                response.profile,

              recommendations:
                response.recommendations,

              metadata:
                response.metadata,

              clean_door_image:
                response.clean_door_image ??
                null,

              target_placement:
                response.target_placement ??
                null,
            };


            console.log(
              `[DoorVision] Job ${jobId} completed.`,
            );


            return of(result);
          }


          // -------------------------------------------------
          // Unexpected status
          // -------------------------------------------------

          return throwError(
            () =>
              new Error(
                `Unknown analysis job status: ${response.status}`,
              ),
          );

        },
      ),


      // -----------------------------------------------------
      // Continue polling while result is null
      // -----------------------------------------------------

      filter(
        (
          result,
        ): result is DoorVisionResult =>
          result !== null,
      ),


      // -----------------------------------------------------
      // Safety limit
      // -----------------------------------------------------

      take(
        this.MAX_POLL_ATTEMPTS,
      ),


      // -----------------------------------------------------
      // If polling finishes without a result
      // -----------------------------------------------------

      catchError(
        error => {

          console.error(
            '[DoorVision] Polling failed:',
            error,
          );

          return throwError(
            () => error,
          );
        },
      ),

    );
  }


  // =======================================================
  // Check compatibility after scanned door
  // =======================================================

  checkCompatibility(
    request: CheckCompatibilityRequest,
  ): Observable<DoorVisionResult> {

    return this.http.post<DoorVisionResult>(
      `${this.apiUrl}/check-compatibility`,
      request,
    ).pipe(

      tap(
        result =>
          this.setLastResult(
            result,
          ),
      ),

    );
  }


  // =======================================================
  // Manual product recommendation
  // =======================================================

  recommendProducts(
    request:
      ManualDoorRecommendationRequest,
  ): Observable<DoorVisionResult> {

    return this.http.post<DoorVisionResult>(
      `${this.apiUrl}/recommend-products`,
      request,
    ).pipe(

      tap(
        result =>
          this.setLastResult(
            result,
          ),
      ),

    );
  }


  // =======================================================
  // Clean door
  // =======================================================

  cleanDoor(
    file: File,
    handing: string = 'right_hand',
  ): Observable<{
    clean_door_image: string;
    target_placement?:
      TargetPlacement | null;
  }> {

    const formData =
      new FormData();


    formData.append(
      'file',
      file,
      file.name,
    );


    formData.append(
      'handing',
      handing,
    );


    return this.http.post<{
      clean_door_image: string;
      target_placement?:
        TargetPlacement | null;
    }>(
      `${this.apiUrl}/clean-door`,
      formData,
    );
  }


  // =======================================================
  // Health check
  // =======================================================

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
