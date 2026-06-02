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

  async undoBall(ballId: string): Promise<void> {
    await api.delete(`/balls/${ballId}`);
  },
};
