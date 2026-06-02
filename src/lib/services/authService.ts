import api from '@/lib/api';

export type AuthUser = {
  id: string;
  name: string;
  username?: string;
  mobile: string;
  role: 'admin' | 'user' | 'scorer';
  google_id?: string;
  email?: string;
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

  async register(name: string, mobile: string, username: string, password: string, passwordConfirmation: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/register', {
      name,
      mobile,
      username,
      password,
      password_confirmation: passwordConfirmation,
    });
    return data;
  },

  async registerAdmin(
    name: string,
    mobile: string,
    username: string,
    password: string,
    passwordConfirmation: string,
    developerPassword: string,
  ): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/register/admin', {
      name,
      mobile,
      username,
      password,
      password_confirmation: passwordConfirmation,
      developer_password: developerPassword,
    });
    return data;
  },

  async logout(): Promise<void> {
    await api.post('/logout');
  },

  async getMe(): Promise<AuthUser> {
    const { data } = await api.get<AuthUser>('/me');
    return data;
  },

  async loginWithGoogle(credential: string): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/auth/google/login', { credential });
    return data;
  },

  async linkGoogle(credential: string): Promise<{ success: boolean; message: string; user: AuthUser }> {
    const { data } = await api.post<{ success: boolean; message: string; user: AuthUser }>('/auth/google/link', { credential });
    return data;
  },
};
