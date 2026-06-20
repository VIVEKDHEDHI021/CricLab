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
    return [];
  },

  async addFriend(mobile: string): Promise<Friend> {
    return {
      id: 'mock-friend-id',
      profile: {
        id: 'mock-friend-id',
        name: 'Guest Friend',
        mobile
      }
    };
  },

  async removeFriend(id: string): Promise<void> {
    // Local no-op
  },
};
