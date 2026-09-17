import { DoorConfig } from "../../app";

export interface InstallStep {
  title: string;
  description: string;
  icon: string;           // fallback if no imageUrl (or shown as a small badge over the image)
  imageUrl?: string;       // diagram from the manufacturer install guide
  warning?: string;
  /** Only show this step for configs where this returns true. Omit to always show. */
  when?: (config: DoorConfig) => boolean;
}

export interface InstallGuide {
  productId: string;
  /** Provenance — which manufacturer document this was digitized from, and when. */
  source: string;
  steps: InstallStep[];
}

// NOTE ON IMAGES: every guide below points at its own assets/install-guides/<slug>/
// folder, but all five folders currently contain the same eleven diagram images
// (copied from the original XS4 Original+ ANSI guide's cropped artwork:
// handing_1/2, install_1/2/3/4/7/8/9/10, battery). They're being reused as
// stand-in illustrations across product lines until each product gets its own
// digitized crops from its real manufacturer PDF. Swap the files inside a
// product's folder for real crops later — the step text and filenames below
// won't need to change.

// ---------------------------------------------------------------------------
// XS4 Original+ — ANSI (USA mortise, cylindrical & tubular latches)
// Text digitized from 226844-ED.3-24/02/2025
// ---------------------------------------------------------------------------
const ASSET_BASE_XS4_ANSI = 'assets/install-guides/xs4-original-plus-ansi';

export const XS4_ORIGINAL_PLUS_ANSI_GUIDE: InstallGuide = {
  productId: 'salto_xs4_original_plus_ansi',
  source: 'SALTO Installation Guide 226844-ED.3-24/02/2025',
  steps: [
    {
      title: 'Select handing',
      description:
        'Before mounting, set the lock handing to match your door swing. Remove the small handing screw shown in the callout and reposition it for left- or right-hand operation.',
      icon: 'swap_horiz',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/handing_1.jpg`,
    },
    {
      title: 'Connect the handing cable',
      description:
        'Reconnect the small ribbon cable inside the lock body after setting handing. This cable carries the handing signal to the electronics — do not disconnect it again after this step.',
      icon: 'cable',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/handing_2.jpg`,
      warning: 'Do not disconnect this cable once reconnected.',
    },
    {
      title: 'Secure the mortise lock body',
      description:
        'Position the mortise lock in the door edge prep and secure it with the two long screws through the faceplate, top and bottom.',
      icon: 'construction',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/install_1.jpg`,
    },
    {
      title: 'Drill through-holes',
      description:
        'Drill the through-holes at 90° to the door face: Ø9/16" (14mm) for the mounting bolts. Thumb-turn models need an additional Ø5/8" (16mm) hole on the inside only.',
      icon: 'straighten',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/install_2.jpg`,
      warning: 'Minimum door thickness for this hole pattern is 1-1/2" (38mm).',
    },
    {
      title: 'Mount the outside escutcheon',
      description:
        'Fit the outside reader/handle assembly onto the mortise lock spindle and locking pin, then secure with the two supplied screws through the faceplate.',
      icon: 'lock',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/install_3.jpg`,
    },
    {
      title: 'Mount the electronics module',
      description:
        'Slide the inside electronics/PCB module onto the spindle, reconnect the ribbon cable to the outside reader, and secure the mounting screws from below.',
      icon: 'memory',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/install_4.jpg`,
    },
    {
      title: 'Attach the inside lever',
      description:
        'Fit the inside lever handle onto the through-spindle and press it home until it seats fully against the escutcheon.',
      icon: 'panorama_fish_eye',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/install_7.jpg`,
    },
    {
      title: 'Fit the inside cover',
      description:
        'Slide the inside cover down over the electronics module from the top, then secure it with the bottom screw.',
      icon: 'inventory_2',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/install_8.jpg`,
    },
    {
      title: 'Tighten the lever set screw',
      description:
        'Using the supplied hex key, tighten the set screw that locks the inside lever onto the spindle.',
      icon: 'build',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/install_9.jpg`,
    },
    {
      title: 'Program the lock before closing the door',
      description:
        'Stop here. Follow your SALTO user manual to program the lock and confirm it reads credentials correctly, then secure the final screw with the allen key.',
      icon: 'warning',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/install_10.jpg`,
      warning: 'AT THIS POINT DO NOT CLOSE THE DOOR. Program the lock first — if it is not programmed you may be locked out.',
    },
    {
      title: 'Battery notes',
      description:
        'This lock uses LR06 (AA) batteries. Replace all batteries together, not individually, and complete a battery change within 40 seconds to avoid losing lock memory.',
      icon: 'battery_alert',
      imageUrl: `${ASSET_BASE_XS4_ANSI}/battery.jpg`,
      warning: 'Complete the battery swap within 40 seconds (MAX. 40") or the lock may lose its programming.',
    },
    {
      title: 'Connect and test',
      description:
        'Check lever movement, latch operation, and the electronic reader. Test the door several times with a valid credential before putting it into service.',
      icon: 'check_circle',
    },
  ],
};

// ---------------------------------------------------------------------------
// XS4 Original+ — EURO (mortise locks & tubular latches, narrow body)
// Text digitized from 226861-ED.2-13/02/2024
// ---------------------------------------------------------------------------
const ASSET_BASE_XS4_EURO = 'assets/install-guides/xs4-original-plus-euro';

export const XS4_ORIGINAL_PLUS_EURO_GUIDE: InstallGuide = {
  productId: 'salto_xs4_original_plus_euro',
  source: 'SALTO Installation Guide 226861-ED.2-13/02/2024',
  steps: [
    {
      title: 'Confirm door thickness and bolt length',
      description:
        'Measure your door thickness and match it against the sizing table (32–120mm range) to determine which bolt length and screw set to use before starting.',
      icon: 'straighten',
      imageUrl: `${ASSET_BASE_XS4_EURO}/install_1.jpg`,
    },
    {
      title: 'Select handing',
      description:
        'Push to release the handing selector inside the escutcheon and set it to match your door swing before final assembly.',
      icon: 'swap_horiz',
      imageUrl: `${ASSET_BASE_XS4_EURO}/handing_1.jpg`,
    },
    {
      title: 'Connect the handing cable',
      description:
        'Reconnect the internal ribbon cable after setting handing — do not disconnect it again once reconnected.',
      icon: 'cable',
      imageUrl: `${ASSET_BASE_XS4_EURO}/handing_2.jpg`,
      warning: 'Do not disconnect this cable once reconnected.',
    },
    {
      title: 'Prepare the mortise lock and latch',
      description:
        'Fit the SALTO-compatible Euro profile mortise lock and tubular latch (max 4° pre-turn). Doors thicker than 60mm (2-3/8") require the longer bolt supplied separately.',
      icon: 'construction',
      imageUrl: `${ASSET_BASE_XS4_EURO}/install_2.jpg`,
    },
    {
      title: 'Drill through-holes',
      description:
        'Drill the through-holes at 90° to the door face: Ø14mm (9/16") for the mounting bolts.',
      icon: 'build',
      imageUrl: `${ASSET_BASE_XS4_EURO}/install_3.jpg`,
      warning: 'Minimum door thickness for this hole pattern is 25mm (1").',
    },
    {
      title: 'Mount the outside escutcheon',
      description:
        'Fit the outside reader/handle assembly onto the mortise lock spindle, then secure through the faceplate.',
      icon: 'lock',
      imageUrl: `${ASSET_BASE_XS4_EURO}/install_4.jpg`,
    },
    {
      title: 'Mount the electronics module',
      description:
        'Slide the inside electronics module onto the spindle and reconnect the ribbon cable to the outside reader.',
      icon: 'memory',
      imageUrl: `${ASSET_BASE_XS4_EURO}/install_7.jpg`,
    },
    {
      title: 'Fit the inside cover and lever',
      description:
        'Fit the inside cover over the electronics module, then attach the inside lever and press it home.',
      icon: 'inventory_2',
      imageUrl: `${ASSET_BASE_XS4_EURO}/install_8.jpg`,
    },
    {
      title: 'Tighten the lever set screw',
      description:
        'Using the supplied hex key, tighten the set screw that locks the inside lever onto the spindle.',
      icon: 'build',
      imageUrl: `${ASSET_BASE_XS4_EURO}/install_9.jpg`,
    },
    {
      title: 'Program the lock before closing the door',
      description:
        'Stop here. Follow your SALTO user manual to program the lock and confirm it reads credentials correctly before closing the door.',
      icon: 'warning',
      imageUrl: `${ASSET_BASE_XS4_EURO}/install_10.jpg`,
      warning: 'AT THIS POINT DO NOT CLOSE THE DOOR. Program the lock first — if it is not programmed you may be locked out.',
    },
    {
      title: 'Battery notes',
      description:
        'This lock uses LR03 (AAA) batteries. Replace all batteries together, not individually, and complete the change within 40 seconds.',
      icon: 'battery_alert',
      imageUrl: `${ASSET_BASE_XS4_EURO}/battery.jpg`,
      warning: 'Complete the battery swap within 40 seconds (MAX. 40") or the lock may lose its programming.',
    },
    {
      title: 'Connect and test',
      description:
        'Check lever movement, latch operation, and the electronic reader. Test the door several times with a valid credential before putting it into service.',
      icon: 'check_circle',
    },
  ],
};

// ---------------------------------------------------------------------------
// DLok — European profile cylinder retrofit
// Text digitized from 230180-ED.A1-06/11/2025
// ---------------------------------------------------------------------------
const ASSET_BASE_DLOK = 'assets/install-guides/dlok-euro';

export const DLOK_EURO_GUIDE: InstallGuide = {
  productId: 'salto_dlok_euro',
  source: 'SALTO Installation Guide 230180-ED.A1-06/11/2025',
  steps: [
    {
      title: 'Confirm cylinder compatibility',
      description:
        'Check that your existing Euro profile cylinder is a compatible type (e.g. LINCE C Plus, M&C Color+) and measure the external (le) and internal (li) cylinder dimensions against the compatibility chart.',
      icon: 'straighten',
      imageUrl: `${ASSET_BASE_DLOK}/install_1.jpg`,
    },
    {
      title: 'Remove your existing cylinder',
      description:
        'Loosen the cylinder retaining screw on the door edge and pull the old cylinder out from the outside face.',
      icon: 'build',
      imageUrl: `${ASSET_BASE_DLOK}/install_2.jpg`,
    },
    {
      title: 'Fit the mounting plate onto the new cylinder',
      description:
        'Slide the DLok mounting plate onto the new Euro cylinder, checking the orientation mark against the keyway before proceeding.',
      icon: 'lock',
      imageUrl: `${ASSET_BASE_DLOK}/install_3.jpg`,
      warning: 'Check the plate orientation against the keyway — an incorrect fit is shown crossed out in the diagram.',
    },
    {
      title: 'Insert the cylinder and secure it to the door',
      description:
        'Insert the new cylinder with its plate into the door from the outside and tighten the retaining screw from the edge of the door.',
      icon: 'construction',
      imageUrl: `${ASSET_BASE_DLOK}/install_4.jpg`,
    },
    {
      title: 'Fit the DLok body',
      description:
        'Slide the DLok body over the mounting plate from the outside face of the door until it clicks into place.',
      icon: 'check_circle',
      imageUrl: `${ASSET_BASE_DLOK}/install_7.jpg`,
    },
    {
      title: 'Insert the pairing key',
      description:
        'Insert the supplied green pairing key into the back of the DLok body until it clicks.',
      icon: 'vpn_key',
      imageUrl: `${ASSET_BASE_DLOK}/install_8.jpg`,
    },
    {
      title: 'Insert batteries',
      description:
        'Fit 4x CR123A lithium batteries, following the polarity markings inside the battery compartment.',
      icon: 'battery_alert',
      imageUrl: `${ASSET_BASE_DLOK}/battery.jpg`,
      warning: 'Avoid installing right next to a large metallic surface — it can reduce Bluetooth range.',
    },
    {
      title: 'Finish setup in the app',
      description:
        'Continue the device configuration using the SALTO Homelok app to pair the lock and finish setup.',
      icon: 'smartphone',
      imageUrl: `${ASSET_BASE_DLOK}/install_9.jpg`,
    },
    {
      title: 'Connect and test',
      description:
        'Turn the outside knob to check the mechanism engages and disengages smoothly, then test the door several times before relying on the lock.',
      icon: 'check_circle',
      imageUrl: `${ASSET_BASE_DLOK}/install_10.jpg`,
    },
  ],
};

// ---------------------------------------------------------------------------
// DBolt Touch — US deadbolt retrofit
// Text digitized from 227144-ED.1-07/11/2024
// ---------------------------------------------------------------------------
const ASSET_BASE_DBOLT = 'assets/install-guides/dbolt-touch';

export const DBOLT_TOUCH_GUIDE: InstallGuide = {
  productId: 'salto_dbolt_touch',
  source: 'SALTO Installation Guide 227144-ED.1-07/11/2024',
  steps: [
    {
      title: 'Measure door thickness and backset',
      description:
        'Confirm your door thickness (35–85mm) and backset (60 or 70mm) using the supplied template before removing your existing deadbolt.',
      icon: 'straighten',
      imageUrl: `${ASSET_BASE_DBOLT}/install_1.jpg`,
    },
    {
      title: 'Install the latch',
      description:
        'Fit the deadbolt latch into the door edge prep and secure it with the mounting screws.',
      icon: 'construction',
      imageUrl: `${ASSET_BASE_DBOLT}/install_2.jpg`,
    },
    {
      title: 'Install the outside assembly',
      description:
        'Position the outside keypad assembly against the door face, feeding its cable through to the latch and inside.',
      icon: 'dialpad',
      imageUrl: `${ASSET_BASE_DBOLT}/install_3.jpg`,
    },
    {
      title: 'Connect the internal cable',
      description:
        'Route and connect the cable between the outside assembly and the latch. Only disconnect this cable if your model has a door detector.',
      icon: 'cable',
      imageUrl: `${ASSET_BASE_DBOLT}/install_4.jpg`,
    },
    {
      title: 'Install the inside assembly',
      description:
        'Fit the inside assembly over the mounting posts, connect the cable, and secure the fixing screws.',
      icon: 'lock',
      imageUrl: `${ASSET_BASE_DBOLT}/install_7.jpg`,
    },
    {
      title: 'Fit the inside cover',
      description:
        'Slide the inside cover into place to conceal the mounting hardware and electronics.',
      icon: 'inventory_2',
      imageUrl: `${ASSET_BASE_DBOLT}/install_8.jpg`,
    },
    {
      title: 'Set the handing',
      description:
        'Use the handing set-up procedure with the supplied reset tool, following the beep sequence to confirm the correct door swing.',
      icon: 'swap_horiz',
      imageUrl: `${ASSET_BASE_DBOLT}/install_9.jpg`,
    },
    {
      title: 'Insert batteries',
      description:
        'Fit 3x AA (LR6) batteries, following the polarity markings shown in the compartment.',
      icon: 'battery_alert',
      imageUrl: `${ASSET_BASE_DBOLT}/battery.jpg`,
      warning: 'Inside and outside assemblies are factory-paired — they will not work if swapped with parts from a different unit.',
    },
    {
      title: 'Connect and test',
      description:
        'Test the keypad, deadbolt throw, and manual thumb-turn several times before putting the door into service.',
      icon: 'check_circle',
      imageUrl: `${ASSET_BASE_DBOLT}/install_10.jpg`,
    },
  ],
};

// ---------------------------------------------------------------------------
// DBolt Touch Interconnected — US interconnected deadbolt retrofit
// Text digitized from 227321-ED.1-12/07/2024
// ---------------------------------------------------------------------------
const ASSET_BASE_DBOLT_IC = 'assets/install-guides/dbolt-touch-ic';

export const DBOLT_TOUCH_IC_GUIDE: InstallGuide = {
  productId: 'salto_dbolt_touch_ic',
  source: 'SALTO Installation Guide 227321-ED.1-12/07/2024',
  steps: [
    {
      title: 'Measure door thickness, backset and center-to-center',
      description:
        'Confirm door thickness (40–85mm), backset (60 or 70mm), and center-to-center spacing (4" or 5.5") before removing your existing hardware.',
      icon: 'straighten',
      imageUrl: `${ASSET_BASE_DBOLT_IC}/install_1.jpg`,
    },
    {
      title: 'Install latch and deadbolt units',
      description:
        'Fit both the latch and deadbolt units into their door edge preps and secure with mounting screws.',
      icon: 'construction',
      imageUrl: `${ASSET_BASE_DBOLT_IC}/install_2.jpg`,
    },
    {
      title: 'Set handing before assembly',
      description:
        'Use the hand selector on the outside spindle to set left- or right-hand operation before installing the lever assemblies.',
      icon: 'swap_horiz',
      imageUrl: `${ASSET_BASE_DBOLT_IC}/handing_1.jpg`,
    },
    {
      title: 'Install the outside lever assembly',
      description:
        'Fit the outside lever and spindle assembly, feeding the connecting cable through to the inside.',
      icon: 'lock',
      imageUrl: `${ASSET_BASE_DBOLT_IC}/install_3.jpg`,
    },
    {
      title: 'Connect the internal cable',
      description:
        'Connect the cable between outside and inside assemblies. Only disconnect if your model has a door detector.',
      icon: 'cable',
      imageUrl: `${ASSET_BASE_DBOLT_IC}/install_4.jpg`,
    },
    {
      title: 'Install the inside plate and spindle',
      description:
        'Fit the inside fixing plate and spindle, then tighten the lever set screw with the supplied hex key.',
      icon: 'build',
      imageUrl: `${ASSET_BASE_DBOLT_IC}/install_7.jpg`,
    },
    {
      title: 'Confirm handing setup',
      description:
        'Use the reset tool to run the handing confirmation sequence — listen for the beep pattern to confirm it registered correctly.',
      icon: 'settings_backup_restore',
      imageUrl: `${ASSET_BASE_DBOLT_IC}/handing_2.jpg`,
    },
    {
      title: 'Fit the inside cover',
      description:
        'Slide the inside cover into place over the mounting hardware and electronics.',
      icon: 'inventory_2',
      imageUrl: `${ASSET_BASE_DBOLT_IC}/install_8.jpg`,
    },
    {
      title: 'Insert batteries',
      description:
        'Fit 3x AA (LR6) batteries, following the polarity markings shown in the compartment.',
      icon: 'battery_alert',
      imageUrl: `${ASSET_BASE_DBOLT_IC}/battery.jpg`,
      warning: 'Inside and outside assemblies are factory-paired — they will not work if swapped with parts from a different unit.',
    },
    {
      title: 'Connect and test',
      description:
        'Test the lever, deadbolt throw, keypad, and manual thumb-turn several times before putting the door into service.',
      icon: 'check_circle',
      imageUrl: `${ASSET_BASE_DBOLT_IC}/install_9.jpg`,
    },
  ],
};

const GUIDES_BY_PRODUCT_ID: Record<string, InstallGuide> = {
  [XS4_ORIGINAL_PLUS_ANSI_GUIDE.productId]: XS4_ORIGINAL_PLUS_ANSI_GUIDE,
  [XS4_ORIGINAL_PLUS_EURO_GUIDE.productId]: XS4_ORIGINAL_PLUS_EURO_GUIDE,
  [DLOK_EURO_GUIDE.productId]: DLOK_EURO_GUIDE,
  [DBOLT_TOUCH_GUIDE.productId]: DBOLT_TOUCH_GUIDE,
  [DBOLT_TOUCH_IC_GUIDE.productId]: DBOLT_TOUCH_IC_GUIDE,
};

export function getInstallGuide(productId: string | undefined | null): InstallGuide | null {
  if (!productId) return null;
  return GUIDES_BY_PRODUCT_ID[productId] ?? null;
}
