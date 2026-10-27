import { planStateSpace } from '../core/statePlanner.ts';
import type { PlanResult, SimulationState } from '../types.ts';

export interface PlannerWorkerRequest {
  id: number;
  state: SimulationState;
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
  const { id, state, offlineRate, adDoubling } = event.data;
  try {
    const result = planStateSpace(state, offlineRate, { adDoubling });
    scope.postMessage({ id, result });
  } catch (cause) {
    scope.postMessage({
      id,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
};
