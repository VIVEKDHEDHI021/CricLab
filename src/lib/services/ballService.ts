import api from '@/lib/api';

export type Ball = {
  id: string;
  innings_id: string;
  match_id: string;
  ball_index: number;
  over_number: number;
  ball_in_over: number;
  batter_id: string;
  non_striker_id: string | null;
  bowler_id: string;
  runs: number;
  extra_runs: number;
  extra_type: string | null;
  is_wicket: boolean;
  wicket_type: string | null;
  is_legal: boolean;
  caught_by_id: string | null;
};

export const ballService = {
  async addBall(
    inningsId: string,
    ballData: {
      match_id: string;
      ball_index: number;
      over_number: number;
      ball_in_over: number;
      batter_id: string;
      non_striker_id: string | null;
      bowler_id: string;
      runs: number;
      extra_runs: number;
      extra_type: string | null;
      is_wicket: boolean;
      wicket_type?: string | null;
      is_legal: boolean;
      caught_by_id?: string | null;
    }
  ): Promise<Ball> {
    const { data } = await api.post<Ball>(`/innings/${inningsId}/balls`, ballData);
    return data;
  },

  async updateBall(
    ballId: string,
    ballData: {
      batter_id: string;
      non_striker_id: string | null;
      bowler_id: string;
      runs: number;
      extra_runs: number;
      extra_type: string | null;
      is_wicket: boolean;
      wicket_type?: string | null;
      is_legal: boolean;
      caught_by_id?: string | null;
    }
  ): Promise<Ball> {
    const { data } = await api.put<Ball>(`/balls/${ballId}`, ballData);
    return data;
  },

  async undoBall(ballId: string): Promise<void> {
    await api.delete(`/balls/${ballId}`);
  },

  async syncOver(
    matchId: string,
    payload: {
      innings_no: number;
      over_no: number;
      bowler_id: string;
      deliveries: Array<{
        id: string;
        ball_index: number;
        ball_in_over: number;
        batter_id: string;
        non_striker_id: string | null;
        runs: number;
        extra_runs: number;
        extra_type: string | null;
        is_wicket: boolean;
        wicket_type: string | null;
        is_legal: boolean;
        caught_by_id: string | null;
      }>;
    }
  ): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>(`/matches/${matchId}/overs/sync`, payload);
    return data;
  },

  async syncStatus(
    matchId: string
  ): Promise<{
    match_id: string;
    status: string;
    current_innings: number;
    synced_overs: Array<{ innings_no: number; over_no: number }>;
  }> {
    const { data } = await api.get<any>(`/matches/${matchId}/sync-status`);
    return data;
  },

  async logEvent(
    matchId: string,
    eventData: any
  ): Promise<any> {
    const { data } = await api.post<any>(`/matches/${matchId}/events`, eventData);
    return data;
  },

  async getEvents(
    matchId: string
  ): Promise<any[]> {
    const { data } = await api.get<any[]>(`/matches/${matchId}/events`);
    return data;
  },

  async syncEvents(
    matchId: string,
    events: any[]
  ): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>(`/matches/${matchId}/events/sync`, { events });
    return data;
  },
};
