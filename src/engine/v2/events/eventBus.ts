export type EngineEventMap = {
  BallAdded: { matchId: string; ballUuid: string };
  BallUpdated: { matchId: string; ballUuid: string };
  BallDeleted: { matchId: string; ballUuid: string };
  SnapshotUpdated: { matchId: string };
  InningsCompleted: { matchId: string; inningsNo: number };
  MatchCompleted: { matchId: string; result: string };
  BatterMilestoneReached: { matchId: string; playerId: string; milestone: number };
  BowlerMilestoneReached: { matchId: string; playerId: string; milestone: number };
  PartnershipMilestoneReached: { matchId: string; runs: number };
  StatisticsUpdated: { matchId: string };
  OverCompleted: { matchId: string; overNo: number };
  InningsStarted: { matchId: string; inningsNo: number };
  TargetGenerated: { matchId: string };
  ChaseUpdated: { matchId: string };
  BallUndone: { matchId: string };
  BallCorrected: { matchId: string };
  ReplayCompleted: { matchId: string };
  FinalSnapshotGenerated: { matchId: string };
  MatchLocked: { matchId: string };
  AwardsCalculated: { matchId: string };
};

export type EngineEventName = keyof EngineEventMap;
export type EngineEventListener<T extends EngineEventName> = (payload: EngineEventMap[T]) => void | Promise<void>;

class EngineEventBus {
  private listeners: { [K in EngineEventName]?: EngineEventListener<K>[] } = {};

  subscribe<T extends EngineEventName>(event: T, listener: EngineEventListener<T>): () => void {
    const listeners = this.listeners as any;
    if (!listeners[event]) {
      listeners[event] = [];
    }
    listeners[event].push(listener);

    return () => {
      listeners[event] = listeners[event].filter((l: any) => l !== listener);
    };
  }

  publish<T extends EngineEventName>(event: T, payload: EngineEventMap[T]): void {
    const list = (this.listeners as any)[event];
    if (list) {
      for (const listener of list) {
        try {
          listener(payload);
        } catch (err) {
          console.error(`Error in event bus listener for ${event}:`, err);
        }
      }
    }
  }
}

export const eventBus = new EngineEventBus();
