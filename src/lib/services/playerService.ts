import api from '@/lib/api';

export type PlayerStats = {
  matches: number;
  runs: number;
  wickets: number;
  sr: string;
  econ: string;
};

export type Player = {
  id: string;
  name: string;
  team_id: string;
  team_name?: string;
  stats?: PlayerStats;
  created_at?: string;
};

export const playerService = {
  async getPlayers(): Promise<Player[]> {
    const { data } = await api.get<Player[]>('/players');
    return data;
  },

  async createPlayer(playerData: { name: string; team_id: string }): Promise<Player> {
    const { data } = await api.post<Player>('/players', playerData);
    return data;
  },

  async deletePlayer(id: string): Promise<void> {
    await api.delete(`/players/${id}`);
  },
};
