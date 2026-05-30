import api from '@/lib/api';

export type Friend = {
  id: string;
  profile?: {
    id: string;
    name: string;
    mobile: string;
  };
};

export const friendService = {
  async getFriends(): Promise<Friend[]> {
    const { data } = await api.get<Friend[]>('/friends');
    return data;
  },

  async addFriend(mobile: string): Promise<Friend> {
    const { data } = await api.post<Friend>('/friends', { mobile });
    return data;
  },

  async removeFriend(id: string): Promise<void> {
    await api.delete(`/friends/${id}`);
  },
};
