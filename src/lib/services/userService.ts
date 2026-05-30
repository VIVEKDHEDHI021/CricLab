import api from '@/lib/api';

export type User = {
  id: string;
  name: string;
  mobile: string;
  role: 'admin' | 'user';
};

export const userService = {
  async getUsers(): Promise<User[]> {
    const { data } = await api.get<User[]>('/users');
    return data;
  },

  async createUser(userData: { name: string; mobile: string; password: string; role: string }): Promise<User> {
    const { data } = await api.post<User>('/users', userData);
    return data;
  },

  async resetPassword(id: string, password: string): Promise<void> {
    await api.patch(`/users/${id}/password`, { password });
  },

  async deleteUser(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },
};
