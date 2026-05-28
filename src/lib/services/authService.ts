import api from '@/lib/api';

export type AuthUser = {
  id: string;
  name: string;
  mobile: string;
  role: 'admin' | 'user';
};

export type LoginResponse = {
  user: AuthUser;
  token: string;
};

export const authService = {
  async login(mobile: string, password: string, expectedRole: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/login', { mobile, password, expected_role: expectedRole });
    return data;
  },

  async logout(): Promise<void> {
    await api.post('/logout');
  },

  async getMe(): Promise<AuthUser> {
    const { data } = await api.get<AuthUser>('/me');
    return data;
  },
};
