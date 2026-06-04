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
  mobile?: string;
  user_id?: string;
  avatar?: string;
  role?: string;
  batting_style?: string;
  bowling_style?: string;
  jersey_number?: string;
  catches?: number;
  run_outs?: number;
  age?: number;
  city?: string;
  stats?: PlayerStats;
  created_at?: string;
};

export type PlayerMatchHistory = {
  match_id: string;
  match_date: string;
  opponent: string;
  runs: number;
  balls: number;
  is_out: boolean;
  wickets: number;
  bowling_runs: number;
  bowling_overs: string;
  result: string;
};

export type PlayerProfile = {
  player: Player;
  career: {
    matches: number;
    innings: number;
    runs: number;
    highest_score: number;
    average: string;
    strike_rate: string;
    fours: number;
    sixes: number;
    wickets: number;
    bowling_average: string;
    economy: string;
    best_bowling: string;
    maidens: number;
    catches: number;
    run_outs: number;
  };
  tournament: {
    runs: number;
    wickets: number;
    average: string;
    strike_rate: string;
  };
  recent: PlayerMatchHistory[];
  history: PlayerMatchHistory[];
  teams: { id: string; name: string }[];
};

export type RankingItem = {
  id: string;
  name: string;
  team_name: string;
  avatar?: string;
  runs: number;
  wickets: number;
  sixes: number;
  sr: string;
  mvp: number;
};

export type PlayerRankings = {
  batters: RankingItem[];
  bowlers: RankingItem[];
  sixes: RankingItem[];
  strike_rates: RankingItem[];
  mvp: RankingItem[];
};

export const playerService = {
  async getPlayers(): Promise<Player[]> {
    const { data } = await api.get<Player[]>('/players');
    return data;
  },

  async createPlayer(playerData: { name: string; team_id: string; mobile?: string }): Promise<Player> {
    const { data } = await api.post<Player>('/players', playerData);
    return data;
  },

  async deletePlayer(id: string): Promise<void> {
    await api.delete(`/players/${id}`);
  },

  async getPlayerProfile(id: string): Promise<PlayerProfile> {
    const { data } = await api.get<PlayerProfile>(`/players/${id}`);
    return data;
  },

  async updatePlayerProfile(id: string, profileData: Partial<Player>): Promise<Player> {
    const { data } = await api.put<Player>(`/players/${id}`, profileData);
    return data;
  },

  async getPlayerRankings(): Promise<PlayerRankings> {
    const { data } = await api.get<PlayerRankings>('/players/rankings');
    return data;
  },

  async searchPlayers(query: string): Promise<Player[]> {
    const { data } = await api.get<Player[]>('/players/search', { params: { query } });
    return data;
  },
};

