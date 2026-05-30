import api from '@/lib/api';

export type Innings = {
  id: string;
  match_id: string;
  innings_no: number;
  batting_team_id: string;
  bowling_team_id: string;
  runs: number;
  wickets: number;
  legal_balls: number;
  is_closed: boolean;
};

export const inningsService = {
  async startInnings(
    matchId: string,
    data: { batting_team_id: string; bowling_team_id: string; innings_no: number }
  ): Promise<Innings> {
    const { data: result } = await api.post<Innings>(`/matches/${matchId}/innings`, data);
    return result;
  },

  async closeInnings(id: string): Promise<void> {
    await api.patch(`/innings/${id}/close`);
  },
};
