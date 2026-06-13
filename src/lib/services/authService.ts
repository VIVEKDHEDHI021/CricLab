import api from '@/lib/api';

export type AuthUser = {
  id: string;
  name: string;
  username?: string;
  mobile: string;
  role: 'admin' | 'user' | 'scorer';
  email?: string;
  must_change_password?: boolean;
  is_profile_setup_completed?: boolean;
};

export type LoginResponse = {
  user: AuthUser;
  token: string;
};

export interface AdminUserListItem {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  role: string;
  must_change_password: boolean;
}

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

  async forgotPassword(mobile: string): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>('/forgot-password', { mobile });
    return data;
  },

  async changePassword(currentPassword: string, newPassword: string, newPasswordConfirmation: string): Promise<{ message: string }> {
    const { data } = await api.post<{ message: string }>('/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirmation: newPasswordConfirmation,
    });
    return data;
  },

  async adminListUsers(): Promise<AdminUserListItem[]> {
    const { data } = await api.get<AdminUserListItem[]>('/admin/users');
    return data;
  },

  async adminResetPassword(userId: string): Promise<{ message: string; temporary_password: string }> {
    const { data } = await api.post<{ message: string; temporary_password: string }>(`/admin/users/${userId}/reset-password`);
    return data;
  },
};
