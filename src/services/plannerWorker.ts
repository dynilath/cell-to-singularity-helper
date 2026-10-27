import { planExploration, planOfflineExploration } from '../core/planner.ts';
import type { PlanResult, PlanStrategy, SimulationState } from '../types.ts';

export interface PlannerWorkerRequest {
  id: number;
  state: SimulationState;
  strategy: PlanStrategy;
  offlineRate: number;
  adDoubling: boolean;
}

export interface PlannerWorkerResponse {
  id: number;
  result?: PlanResult;
  error?: string;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PlannerWorkerRequest>) => void) | null;
  postMessage: (message: PlannerWorkerResponse) => void;
};

scope.onmessage = (event) => {
  const { id, state, strategy, offlineRate, adDoubling } = event.data;
  try {
    const result =
      strategy === 'offline'
        ? planOfflineExploration(state, offlineRate, { adDoubling })
        : planExploration(state);
    scope.postMessage({ id, result });
  } catch (cause) {
    scope.postMessage({
      id,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
