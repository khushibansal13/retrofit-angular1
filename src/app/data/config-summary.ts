import { DoorConfig } from '../app';

function formatValue(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export const ACCESS_METHOD_LABELS: Record<string, string> = {
  phone: 'Phone (Bluetooth/App)',
  card: 'Key card / fob',
  pin: 'PIN code',
  key: 'Physical key (backup)',
};

export const ACCESS_METHOD_BOM_ITEMS: Record<string, string> = {
  phone: 'Mobile Credential License',
  card: 'RFID Key Cards (pack of 5)',
  pin: 'PIN Keypad Module',
  key: 'Mechanical Override Key (pair)',
};

// Single source of truth for "everything the customer actually told us" —
// used by both the wizard's own review screen and the Quotes tab that
// Sales looks at, so the two never drift out of sync again.
export function getConfigSummaryChips(config: DoorConfig): string[] {
  const chips: string[] = [];

  if (config.environment) chips.push(`Business: ${config.environment}`);
  if (config.budget) chips.push(`Budget: ${config.budget}`);
  if (config.usageTraffic) chips.push(`${formatValue(config.usageTraffic)} traffic`);
  if (config.direction) chips.push(`Opening: ${config.direction}`);
  if (config.leafCount) chips.push(`${config.leafCount} leaf`);
  if (config.frameType) chips.push(`Frame: ${config.frameType}`);
  if (config.existingLock) chips.push(`Existing lock: ${formatValue(config.existingLock)}`);
  if (config.currentMortiseType) chips.push(`Current mortise: ${config.currentMortiseType}`);
  if (config.backsetMm) chips.push(`Backset ${config.backsetMm}mm`);
  if (config.centerToCenterMm) chips.push(`Center-to-center ${config.centerToCenterMm}mm`);
  if (config.handlePosition) chips.push(`Handle position: ${formatValue(config.handlePosition)}`);
  if (config.handleType) chips.push(`Handle type: ${formatValue(config.handleType)}`);
  if (config.needsDeadbolt) chips.push('Wants thumb-turn deadbolt');
  if (config.needsKeyholeFailover) chips.push('Wants mechanical key backup');
  if (config.doubleSidedLock) chips.push('Double-sided locking');
  if (config.waterResistant) chips.push('Exterior / weather-exposed');
  if (config.hostingPreference) {
    chips.push(config.hostingPreference === 'on_premise' ? 'On-premise hosting' : 'SALTO cloud platform');
  }
  if (config.connectivity) chips.push(formatValue(config.connectivity));
  if (config.readerColor) chips.push(`Reader color: ${config.readerColor}`);
  if (config.spindleMm && config.spindleMm !== '8') chips.push(`Spindle ${config.spindleMm}mm`);
  if (config.cylinderToHandleMm) chips.push(`Cylinder-to-handle ${config.cylinderToHandleMm}mm`);

  return chips;
}

export function getAccessMethodLabels(config: DoorConfig): string[] {
  return (config.accessMethods ?? []).map(id => ACCESS_METHOD_LABELS[id] ?? id);
}

export function getAccessMethodBomItems(config: DoorConfig): string[] {
  return (config.accessMethods ?? [])
    .map(id => ACCESS_METHOD_BOM_ITEMS[id])
    .filter((item): item is string => !!item);
}

interface DownloadableProduct {
  name: string;
  thicknessRange: string;
  bomAccessories: string[];
}

// Plain-text export so a quote can be attached to an email without any new
// PDF/export library — every browser can download a Blob with zero extra
// dependencies.
export function buildQuoteTextSummary(
  quotationName: string,
  createdAt: string,
  quantity: number,
  config: DoorConfig,
  product: DownloadableProduct | undefined,
): string {
  const lines: string[] = [];

  lines.push(`SALTO RETROFIT QUOTE — ${quotationName}`);
  lines.push(`Generated: ${new Date(createdAt).toLocaleString()}`);
  lines.push('');

  lines.push('--- CUSTOMER CONFIGURATION ---');
  lines.push(`Material: ${config.material || 'Not specified'}`);
  lines.push(`Door thickness: ${config.thickness ? config.thickness + 'mm' : 'Not specified'}`);

  getConfigSummaryChips(config).forEach(chip => lines.push(chip));

  const methods = getAccessMethodLabels(config);
  if (methods.length) {
    lines.push('');
    lines.push(`Preferred unlock methods: ${methods.join(', ')}`);
  }

  lines.push('');
  lines.push('--- SELECTED PRODUCT ---');

  if (product) {
    lines.push(`${product.name} (${product.thicknessRange})`);
    lines.push(`Finish: ${config.finish || 'Not specified'}`);
  } else {
    lines.push('No product selected yet.');
  }

  lines.push('');
  lines.push(`--- BILL OF MATERIALS (× ${quantity} door${quantity !== 1 ? 's' : ''}) ---`);

  if (product) {
    product.bomAccessories.forEach(item => lines.push(`- ${item} × ${quantity}`));
    getAccessMethodBomItems(config).forEach(item => lines.push(`- ${item} × ${quantity}`));
  }

  lines.push('');
  lines.push('Final BOM reviewed by a Sales Engineer before order confirmation.');

  return lines.join('\n');
}
