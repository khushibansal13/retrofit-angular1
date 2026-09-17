export interface Product {
  id: string;
  name: string;
  brand: 'SALTO';
  tagline: string;
  badge?: string;
  category: 'door';
  doorProfile: 'Wood' | 'Glass' | 'Both';
  thicknessRange: string;
  thicknessMin: number;
  thicknessMax: number;
  compatible: ('Wood' | 'Glass')[];
  features: string[];
  finishes: string[];
  aiQuestions: string[];
  specLabel: string;
  imageUrl: string;
  bomAccessories: string[];
  color: string;
  handleColor: string;
}

export const ALL_PRODUCTS: Product[] = [
  {
    id: 'salto_dlok_euro',
    name: 'SALTO D-Lok Euro',
    brand: 'SALTO',
    tagline:
      'Euro profile electronic lock for doors with a visible Euro cylinder.',
    badge: 'Euro Profile',
    category: 'door',
    doorProfile: 'Wood',
    thicknessRange: '30–120mm',
    thicknessMin: 30,
    thicknessMax: 120,
    compatible: ['Wood'],
    features: [
      'Euro profile compatible',
      'Cylinder-based retrofit',
      'SALTO electronic access',
      'Designed for retrofit applications',
    ],
    finishes: ['Satin Chrome', 'Matte Black'],
    aiQuestions: [
      'Is a Euro profile cylinder visible?',
      'What is the door thickness?',
    ],
    specLabel: 'D-Lok Euro Specs',
    imageUrl: '/locks/salto_dlok_euro.png',
    bomAccessories: [
      'D-Lok Escutcheon',
      'Handle Set',
      'AA Batteries × 4',
      'Mounting Hardware Kit',
    ],
    color: '#e8eaf6',
    handleColor: '#5c6bc0',
  },

  {
    id: 'salto_xs4_original_plus_euro',
    name: 'SALTO XS4 Original+ Euro',
    brand: 'SALTO',
    tagline:
      'XS4 Original+ electronic lock for Euro-profile door preparations.',
    badge: 'Best Match',
    category: 'door',
    doorProfile: 'Wood',
    thicknessRange: '30–120mm',
    thicknessMin: 30,
    thicknessMax: 120,
    compatible: ['Wood'],
    features: [
      'Euro profile compatible',
      'High-traffic electronic lock',
      'RFID + BLE access',
      'Retrofit-friendly design',
    ],
    finishes: ['Satin Chrome', 'Matte Black'],
    aiQuestions: [
      'Does the door use a Euro profile preparation?',
      'What is the exact door thickness?',
    ],
    specLabel: 'XS4 Original+ Euro Specs',
    imageUrl: '/locks/salto_xs4_original_plus_euro.png',
    bomAccessories: [
      'Lock Escutcheon (pair)',
      'Handle Set',
      'AA Batteries × 4',
      'Mounting Hardware Kit',
      'Strike Plate',
    ],
    color: '#e0f2f1',
    handleColor: '#00897b',
  },

  {
    id: 'salto_dbolt_touch',
    name: 'SALTO DBolt Touch',
    brand: 'SALTO',
    tagline:
      'Smart deadbolt solution for compatible US deadbolt preparations.',
    badge: 'Deadbolt',
    category: 'door',
    doorProfile: 'Wood',
    thicknessRange: '35–85mm',
    thicknessMin: 35,
    thicknessMax: 85,
    compatible: ['Wood'],
    features: [
      'US deadbolt compatible',
      'Touch access',
      'Electronic retrofit',
      '35–85mm door thickness',
    ],
    finishes: ['Satin Chrome', 'Matte Black'],
    aiQuestions: [
      'Is the existing lock a standard US deadbolt?',
      'What is the exact door thickness?',
    ],
    specLabel: 'DBolt Touch Specs',
    imageUrl: '/locks/salto_dbolt_touch.png',
    bomAccessories: [
      'DBolt Touch Body',
      'Interior Escutcheon',
      'AA Batteries × 4',
      'Mounting Hardware Kit',
    ],
    color: '#fff8e1',
    handleColor: '#f9a825',
  },

  {
    id: 'salto_dbolt_touch_ic',
    name: 'SALTO DBolt Touch IC',
    brand: 'SALTO',
    tagline:
      'Smart interconnected deadbolt solution for compatible US doors.',
    badge: 'Interconnected',
    category: 'door',
    doorProfile: 'Wood',
    thicknessRange: '40–85mm',
    thicknessMin: 40,
    thicknessMax: 85,
    compatible: ['Wood'],
    features: [
      'US interconnected lock compatible',
      'Touch access',
      'Electronic retrofit',
      '40–85mm door thickness',
    ],
    finishes: ['Satin Chrome', 'Matte Black'],
    aiQuestions: [
      'Is the existing lock interconnected?',
      'What is the exact door thickness?',
    ],
    specLabel: 'DBolt Touch IC Specs',
    imageUrl: '/locks/salto_dbolt_touch_ic.png',
    bomAccessories: [
      'DBolt Touch IC Body',
      'Interior Escutcheon',
      'AA Batteries × 4',
      'Mounting Hardware Kit',
    ],
    color: '#e3f2fd',
    handleColor: '#1565c0',
  },

  {
    id: 'salto_xs4_original_plus_ansi',
    name: 'SALTO XS4 Original+ ANSI',
    brand: 'SALTO',
    tagline:
      'XS4 Original+ solution for ANSI and compatible cylindrical preparations.',
    badge: 'ANSI',
    category: 'door',
    doorProfile: 'Wood',
    thicknessRange: '30–120mm',
    thicknessMin: 30,
    thicknessMax: 120,
    compatible: ['Wood'],
    features: [
      'ANSI compatible',
      'Cylindrical preparation compatible',
      'RFID + BLE access',
      'Retrofit-ready electronic lock',
    ],
    finishes: ['Satin Chrome', 'Matte Black'],
    aiQuestions: [
      'Is the door prepared for ANSI or cylindrical hardware?',
      'What is the exact door thickness?',
    ],
    specLabel: 'XS4 Original+ ANSI Specs',
    imageUrl: '/locks/salto_xs4_original_plus_ansi.png',
    bomAccessories: [
      'Lock Escutcheon (pair)',
      'Handle Set',
      'AA Batteries × 4',
      'Mounting Hardware Kit',
      'Strike Plate',
    ],
    color: '#b2dfdb',
    handleColor: '#00796b',
  },
];

export const COMMON_BOM: Record<'Wood' | 'Glass', string[]> = {
  Wood: [
    'Lock Escutcheon (pair)',
    'Handle Set',
    'AA Batteries × 4',
    'Mounting Hardware Kit',
    'Strike Plate',
  ],
  Glass: [
    'Glass Mounting Kit',
    'DIN Lock Housing',
    'Clamp Hardware (pair)',
    'Cylinder Knobs (pair)',
    'AA Batteries × 4',
  ],
};

export const FINISH_COLORS: Record<string, string> = {
  'Satin Chrome': '#c4c6cc',
  'Matte Black': '#2a2a2a',
  'Polished Brass': '#c9a44a',
  'Polished Chrome': '#d2dae2',
};
