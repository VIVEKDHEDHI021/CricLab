import api from '@/lib/api';
import type { MatchSummary } from '@/components/MatchCard';

export type MatchDetail = {
  m: any;
  teams: any[];
  innings: any[];
  players: any[];
  balls: any[];
};

export type MatchSquadPlayer = {
  player_id: string;
  display_name: string;
  role?: string | null;
  jersey_number?: string | null;
  captain?: boolean;
  wicket_keeper?: boolean;
  is_guest?: boolean;
  nickname?: string | null;
};

export const matchService = {
  async getMatches(): Promise<MatchSummary[]> {
    const { data } = await api.get<MatchSummary[]>('/matches');
    return data;
  },

  async getMatch(id: string): Promise<MatchDetail> {
    const { data } = await api.get<MatchDetail>(`/matches/${id}`);
    return data;
  },

  async createMatch(matchData: {
    team_a_id: string;
    team_b_id: string;
    overs: number;
    wide_run: number;
    noball_run: number;
    match_type: string;
    ground: string;
    match_date: string;
    last_man_batting?: boolean;
    batting_first_id?: string;
    squad_a_ids?: string[];
    squad_b_ids?: string[];
  }): Promise<{ id: string }> {
    const { data } = await api.post<{ id: string }>('/matches', {
      ...matchData,
      match_date: new Date(matchData.match_date).toISOString(),
      batting_first_id: matchData.batting_first_id || matchData.team_a_id,
      status: 'upcoming',
      last_man_batting: matchData.last_man_batting ?? false,
    });
    return data;
  },

  async deleteMatch(id: string): Promise<void> {
    await api.delete(`/matches/${id}`);
  },

  async endMatch(id: string): Promise<{ result: string }> {
    const { data } = await api.patch<{ result: string }>(`/matches/${id}/end`);
    return data;
  },

  async updateMatch(
    id: string,
    matchData: {
      man_of_the_match_id?: string | null;
      result?: string;
      ground?: string;
      match_type?: string;
      overs?: number;
      status?: string;
    }
  ): Promise<any> {
    const { data } = await api.put<any>(`/matches/${id}`, matchData);
    return data;
  },

  async replacePlayer(
    matchId: string,
    oldPlayerId: string,
    newPlayerId: string
  ): Promise<any> {
    const { data } = await api.post<any>(`/matches/${matchId}/replace-player`, {
      old_player_id: oldPlayerId,
      new_player_id: newPlayerId,
    });
    return data;
  },

  async updateSquad(
    id: string,
    squadA: MatchSquadPlayer[],
    squadB: MatchSquadPlayer[]
  ): Promise<{ message: string }> {
    const { data } = await api.put<{ message: string }>(`/matches/${id}/squad`, {
      squad_a: squadA,
      squad_b: squadB,
    });
    return data;
  },

  async syncAuditLogs(matchId: string, logs: any[]): Promise<void> {
    await api.post(`/matches/${matchId}/audit-logs/sync`, { logs });
  },

  async getAuditLogs(matchId: string): Promise<any[]> {
    const { data } = await api.get<any[]>(`/matches/${matchId}/audit-logs`);
    return data;
  },
};
