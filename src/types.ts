export type NotationMode = 'short' | 'chinese' | 'scientific';
export type PlanStrategy = 'search' | 'online' | 'offline';
export type GlobalAdMultiplier = 1 | 2 | 4;

export interface Requirement {
  type: 'factory' | 'upgrade';
  id: string;
  /** 工厂前置要求的最少已拥有数量，默认 1。 */
  owned?: number;
}

export interface RawResource {
  id: string;
  emoji: string;
  name?: string;
  amount: string;
  baseRate: string;
}

export interface RawFactory {
  id: string;
  name: string;
  price: string;
  unit: string;
  growth: string;
  owned: string;
  outputResourceId: string;
  costResourceId: string;
  requires?: Requirement | null;
}

export interface RawUpgrade {
  id: string;
  name: string;
  cost: string;
  costResourceId: string;
  targetFactoryId: string;
  multiplier: string;
  purchased: boolean;
  requires?: Requirement | null;
}

export interface RawPreset {
  id: string;
  title: string;
  source: string;
  level: number;
  badgePercent: number;
  importedAt: number | null;
}

export interface RawStore {
  globalGrowth: string;
  asOf: number | null;
  resources: RawResource[];
  factories: RawFactory[];
  upgrades: RawUpgrade[];
  completedUpgrades: string[];
  plan: PlanResult | null;
  reminder: Reminder | null;
  preset: RawPreset | null;
  [key: string]: any;
}

export interface ResourceState {
  id: string;
  emoji: string;
  amount: number;
  baseRate: number;
  rate?: number;
  snapshotAmount?: number;
}

export interface FactoryState {
  id: string;
  label: string;
  price: number;
  unit: number;
  growth: number;
  owned: number;
  outputResourceId: string;
  costResourceId: string;
  requires?: Requirement | null;
  contributionMultiplier?: number;
}

export interface UpgradeState {
  id: string;
  label: string;
  cost: number;
  costResourceId: string;
  targetFactoryId: string;
  multiplier: number;
  purchased: boolean;
  requires?: Requirement | null;
}

export interface SimulationState {
  resources: ResourceState[];
  factories: FactoryState[];
  upgrades: UpgradeState[];
  completedUpgrades: Set<string>;
  globalAdMultiplier: number;
  invalidFactoryIds?: string[];
  ignoredUpgradeIds?: string[];
  time?: number;
}

export interface BuildStateOptions {
  now?: number;
  offlineRate?: number;
  globalAdMultiplier?: number;
}

export interface BuildStateResult {
  ok: boolean;
  hasInput: boolean;
  errors: string[];
  state: SimulationState;
  awaySec: number;
  offlineRate: number;
}

export interface PlanStep {
  type: 'buy' | 'upgrade';
  label: string;
  t: number;
  factoryId?: string;
  upgradeId?: string;
  nth?: number;
  price?: number;
  cost?: number;
  resourceId?: string;
  resourceName?: string;
  offline?: boolean;
  offlineBlock?: number;
  offlineWait?: number;
  [key: string]: any;
}

export interface PlanResult {
  steps: PlanStep[];
  complete: boolean;
  goal: 'new-factory' | 'upgrades' | 'unlock';
  goalLabel: string;
  total: number;
  strategy?: PlanStrategy;
  offlineBlocks?: number;
  onlineTime?: number;
  offlineTime?: number;
  baselineTotal?: number;
  adDoubled?: boolean;
  [key: string]: any;
}

export interface Reminder {
  kind: 'full' | 'half';
  title: string;
  body: string;
  endTime: number;
  durMs: number;
  fired: boolean;
  paused: boolean;
  remainMs?: number;
}

export interface Settings {
  volume: number;
  half: boolean;
  notation: NotationMode;
  offlineRate: number;
  hideLockedUpgrades: boolean;
  planStrategy: PlanStrategy;
  globalAdMultiplier: GlobalAdMultiplier;
}

export interface PlanStepInput {
  plan: PlanResult;
  [key: string]: any;
}

export type AnyRecord = Record<string, any>;
