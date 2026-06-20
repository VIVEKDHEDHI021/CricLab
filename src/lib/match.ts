import { matchService } from "@/lib/services/matchService";
import { eventBus } from "@/engine/v2/events/eventBus";
import type { MatchSummary } from "@/components/MatchCard";

export const MATCH_UPDATED_EVENT = "criclab_local_match_updated";

export async function fetchMatchSummaries(): Promise<MatchSummary[]> {
  return matchService.getMatches();
}

export function subscribeToLocalMatchUpdates(
  callback: (matchId?: string) => void
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const matchId = (event as CustomEvent<{ matchId?: string }>).detail?.matchId;
    callback(matchId);
  };

  window.addEventListener(MATCH_UPDATED_EVENT, handler);

  // Subscribe to CricEngine V2 eventBus to propagate events to window handlers
  const unsubV2 = eventBus.subscribe("SnapshotUpdated", (payload: any) => {
    notifyLocalMatchUpdated(payload?.matchId);
  });
  const unsubV2Complete = eventBus.subscribe("MatchCompleted", (payload: any) => {
    notifyLocalMatchUpdated(payload?.matchId);
  });
  const unsubV2Stats = eventBus.subscribe("StatisticsUpdated", (payload: any) => {
    notifyLocalMatchUpdated(payload?.matchId);
  });

  return () => {
    window.removeEventListener(MATCH_UPDATED_EVENT, handler);
    unsubV2();
    unsubV2Complete();
    unsubV2Stats();
  };
}

export function notifyLocalMatchUpdated(matchId?: string) {
  if (typeof window !== "undefined") {
    const event = new CustomEvent(MATCH_UPDATED_EVENT, { detail: { matchId } });
    window.dispatchEvent(event);
  }
}
