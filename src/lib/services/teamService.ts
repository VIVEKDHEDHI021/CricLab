import api from '@/lib/api';

export type Team = {
  id: string;
  name: string;
  created_at?: string;
};

export const teamService = {
  async getTeams(): Promise<Team[]> {
    const { data } = await api.get<Team[]>('/teams');
    return data;
  },

  async createTeam(name: string): Promise<Team> {
    const { data } = await api.post<Team>('/teams', { name });
    return data;
  },

  async deleteTeam(id: string): Promise<void> {
    await api.delete(`/teams/${id}`);
  },
};
