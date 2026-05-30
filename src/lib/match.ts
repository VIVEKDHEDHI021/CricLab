import { matchService } from "@/lib/services/matchService";
import type { MatchSummary } from "@/components/MatchCard";

export async function fetchMatchSummaries(): Promise<MatchSummary[]> {
  return matchService.getMatches();
}