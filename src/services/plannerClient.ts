import { planStateSpace } from '../core/statePlanner.ts';
import type { PlanResult, SimulationState } from '../types.ts';
import PlannerWorker from './plannerWorker.ts?worker&inline';
import type {
  PlannerWorkerRequest,
  PlannerWorkerResponse,
} from './plannerWorker.ts';

export type PlanComputation = PlanResult | Promise<PlanResult>;

export interface PlannerClient {
  compute: (
    state: SimulationState,
    offlineRate: number,
    adDoubling: boolean,
  ) => PlanComputation;
  computeSync: (
    state: SimulationState,
    offlineRate: number,
    adDoubling: boolean,
  ) => PlanResult;
  dispose: () => void;
}

/**
 * 浏览器里把规划放到 inline Worker，避免长时间同步搜索卡住输入；
 * jsdom/测试环境没有 Worker 时退回同步计算。
 */
export function createPlannerClient(): PlannerClient {
  const canUseWorker = typeof Worker !== 'undefined';
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (result: PlanResult) => void; reject: (error: Error) => void }
  >();

  function computeSync(
    state: SimulationState,
    offlineRate: number,
    adDoubling: boolean,
  ) {
    return planStateSpace(state, offlineRate, { adDoubling });
  }

  function ensureWorker(): Worker | null {
    if (!canUseWorker) return null;
    if (worker) return worker;
    try {
      worker = new PlannerWorker();
      worker.addEventListener('message', (event: MessageEvent<PlannerWorkerResponse>) => {
        const { id, result, error } = event.data;
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        if (error || !result) entry.reject(new Error(error || '规划 Worker 返回空结果'));
        else entry.resolve(result);
      });
      worker.addEventListener('error', () => {
        for (const entry of pending.values()) {
          entry.reject(new Error('规划 Worker 运行失败'));
        }
        pending.clear();
        worker?.terminate();
        worker = null;
      });
      return worker;
    } catch {
      worker = null;
      return null;
    }
  }

  function compute(
    state: SimulationState,
    offlineRate: number,
    adDoubling: boolean,
  ): PlanComputation {
    const instance = ensureWorker();
    if (!instance) return computeSync(state, offlineRate, adDoubling);
    const id = nextId;
    nextId += 1;
    const request: PlannerWorkerRequest = {
      id,
      state,
      offlineRate,
      adDoubling,
    };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        instance.postMessage(request);
      } catch {
        pending.delete(id);
        worker?.terminate();
        worker = null;
        resolve(computeSync(state, offlineRate, adDoubling));
      }
    });
  }

  function dispose() {
    for (const entry of pending.values()) {
      entry.reject(new Error('规划已取消'));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  }

  return { compute, computeSync, dispose };
}
