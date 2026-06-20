import { sqliteService } from './sqliteService';
import { Preferences } from '@capacitor/preferences';
import { v4 as uuidv4 } from 'uuid';
import api from '../api';
import bcrypt from 'bcryptjs';
import { migrationImportService } from './migrationImportService';

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

const SESSION_KEY = 'criclab_user_session';

export const authService = {
  async login(
    mobile: string,
    password: string,
    expectedRole: string,
    onSyncProgress?: (progress: number, status: string) => void
  ): Promise<LoginResponse> {
    try {
      // 1. Attempt online authentication via Laravel API
      const response = await api.post('/login', {
        mobile,
        password,
        expected_role: expectedRole
      });

      if (response.data && response.data.success) {
        const { token, user } = response.data;

        // Persist the Sanctum token so all subsequent API calls are authenticated
        await Preferences.set({ key: 'criclab_token', value: token });

        // Run full sync database migration from API before logging the user in if the database is empty
        try {
          const matchCount = await sqliteService.query("SELECT COUNT(*) as cnt FROM matches;");
          const hasData = matchCount && matchCount[0]?.cnt > 0;
          if (!hasData) {
            if (onSyncProgress) {
              await migrationImportService.importFromApi(onSyncProgress);
            } else {
              await migrationImportService.importFromApi(() => {});
            }
          }
        } catch (syncErr) {
          console.error("Online database sync failed during login:", syncErr);
          // Rollback token if the initial sync fails so we don't end up in an invalid state
          await Preferences.remove({ key: 'criclab_token' });
          throw new Error("Login succeeded, but failed to sync database from production. Please check your internet connection.");
        }

        // Cache/save the user profile to local SQLite.
        // We store the plain-text password here so the user can also log in offline
        // via the local fallback (which does a plain-text or bcrypt check).
        // The bcrypt hash from the server is used if synced via syncAllUsersLocally().
        const existing = await sqliteService.query("SELECT id FROM users WHERE id = ?;", [user.id]);
        if (existing.length > 0) {
          await sqliteService.run(
            `UPDATE users SET name = ?, username = ?, mobile = ?, role = ?, password = ?, email = ?, must_change_password = ?
             WHERE id = ?;`,
            [user.name, user.username || null, user.mobile, user.role, password, user.email || null, user.must_change_password ? 1 : 0, user.id]
          );
        } else {
          await sqliteService.run(
            `INSERT INTO users (id, name, username, mobile, role, password, email, must_change_password, is_profile_setup_completed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [user.id, user.name, user.username || null, user.mobile, user.role, password, user.email || null, user.must_change_password ? 1 : 0, 1]
          );
        }

        const authUser: AuthUser = {
          id: user.id,
          name: user.name,
          username: user.username,
          mobile: user.mobile,
          role: user.role,
          email: user.email,
          must_change_password: !!user.must_change_password,
          is_profile_setup_completed: true
        };

        await Preferences.set({
          key: SESSION_KEY,
          value: JSON.stringify(authUser)
        });

        return {
          user: authUser,
          token
        };
      }
    } catch (apiErr: any) {
      if (apiErr.response && (apiErr.response.status === 401 || apiErr.response.status === 403)) {
        throw new Error(apiErr.response.data?.message || "Invalid credentials");
      }
      if (apiErr.message?.includes("sync database")) {
        throw apiErr;
      }
      console.warn("API login failed or offline. Falling back to local database:", apiErr.message);
    }

    // 3. Local SQLite Fallback
    let users;
    if (mobile.includes('@')) {
      users = await sqliteService.query(
        "SELECT * FROM users WHERE email = ?;",
        [mobile]
      );
    } else {
      users = await sqliteService.query(
        "SELECT * FROM users WHERE (mobile = ? OR username = ?);",
        [mobile, mobile]
      );
    }

    if (users.length === 0) {
      throw new Error("Invalid credentials or server offline");
    }

    const userRow = users[0];
    let isPasswordCorrect = false;
    // Check if the stored password looks like a bcrypt hash (starts with $2a$, $2y$, or $2b$)
    const isHash = typeof userRow.password === 'string' && /^\$2[ayb]\$\d+\$[./A-Za-z0-9]{53}$/.test(userRow.password);
    if (isHash) {
      try {
        isPasswordCorrect = await bcrypt.compare(password, userRow.password);
      } catch (err) {
        console.error("Bcrypt check failed:", err);
      }
    } else {
      isPasswordCorrect = userRow.password === password;
    }

    if (!isPasswordCorrect) {
      throw new Error("Invalid credentials");
    }

    if (userRow.role !== expectedRole) {
      const tabForRole: Record<string, string> = {
        admin: 'Admin',
        scorer: 'Scorer',
        user: 'User',
      };
      const requiredTab = tabForRole[userRow.role] || userRow.role;
      throw new Error(`This account is a ${requiredTab}. Use the ${requiredTab} login tab.`);
    }

    const authUser: AuthUser = {
      id: userRow.id,
      name: userRow.name,
      username: userRow.username,
      mobile: userRow.mobile,
      role: userRow.role,
      email: userRow.email,
      must_change_password: userRow.must_change_password === 1,
      is_profile_setup_completed: userRow.is_profile_setup_completed === 1
    };

    await Preferences.set({
      key: SESSION_KEY,
      value: JSON.stringify(authUser)
    });

    return {
      user: authUser,
      token: 'local-session-token'
    };
  },

  async register(
    name: string,
    mobile: string,
    username: string,
    password: string,
    passwordConfirmation: string
  ): Promise<LoginResponse> {
    if (password !== passwordConfirmation) {
      throw new Error("Passwords do not match");
    }

    try {
      // 1. Register on the Laravel backend API
      const response = await api.post('/register', {
        name,
        mobile,
        username,
        password,
        password_confirmation: passwordConfirmation
      });

      if (response.data && response.data.token) {
        const { token, user } = response.data;

        // 2. Cache/save the user locally in SQLite
        await sqliteService.run(
          `INSERT OR REPLACE INTO users (id, name, username, mobile, role, password, must_change_password, is_profile_setup_completed)
           VALUES (?, ?, ?, ?, ?, ?, 0, 1);`,
          [user.id, name, username, mobile, user.role || 'user', password]
        );

        const authUser: AuthUser = {
          id: user.id,
          name,
          username,
          mobile,
          role: user.role || 'user',
          must_change_password: false,
          is_profile_setup_completed: true
        };

        await Preferences.set({
          key: SESSION_KEY,
          value: JSON.stringify(authUser)
        });

        return { user: authUser, token };
      }
    } catch (apiErr: any) {
      if (apiErr.response && apiErr.response.data?.message) {
        throw new Error(apiErr.response.data.message);
      }
      console.warn("API registration failed or offline. Falling back to local registry:", apiErr.message);
    }

    // 3. Fallback: Register offline locally
    const existing = await sqliteService.query(
      "SELECT id FROM users WHERE mobile = ? OR username = ?;",
      [mobile, username]
    );
    if (existing.length > 0) {
      throw new Error("Username or mobile already registered locally");
    }

    const id = uuidv4();
    const role = 'scorer'; // Default offline role

    await sqliteService.run(
      `INSERT INTO users (id, name, username, mobile, role, password, must_change_password, is_profile_setup_completed)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1);`,
      [id, name, username, mobile, role, password]
    );

    const authUser: AuthUser = {
      id,
      name,
      username,
      mobile,
      role,
      must_change_password: false,
      is_profile_setup_completed: true
    };

    await Preferences.set({
      key: SESSION_KEY,
      value: JSON.stringify(authUser)
    });

    return {
      user: authUser,
      token: 'local-session-token'
    };
  },

  async registerAdmin(
    name: string,
    mobile: string,
    username: string,
    password: string,
    passwordConfirmation: string,
    developerPassword: string
  ): Promise<LoginResponse> {
    if (developerPassword !== 'criclab2026') {
      throw new Error("Invalid developer registration password");
    }

    if (password !== passwordConfirmation) {
      throw new Error("Passwords do not match");
    }

    try {
      // 1. Register on Laravel backend API
      const response = await api.post('/register/admin', {
        name,
        mobile,
        username,
        password,
        password_confirmation: passwordConfirmation,
        developer_password: developerPassword
      });

      if (response.data && response.data.token) {
        const { token, user } = response.data;

        // 2. Cache/save the user locally in SQLite
        await sqliteService.run(
          `INSERT OR REPLACE INTO users (id, name, username, mobile, role, password, must_change_password, is_profile_setup_completed)
           VALUES (?, ?, ?, ?, ?, ?, 0, 1);`,
          [user.id, name, username, mobile, 'admin', password]
        );

        const authUser: AuthUser = {
          id: user.id,
          name,
          username,
          mobile,
          role: 'admin',
          must_change_password: false,
          is_profile_setup_completed: true
        };

        await Preferences.set({
          key: SESSION_KEY,
          value: JSON.stringify(authUser)
        });

        return { user: authUser, token };
      }
    } catch (apiErr: any) {
      if (apiErr.response && apiErr.response.data?.message) {
        throw new Error(apiErr.response.data.message);
      }
      console.warn("API admin registration failed or offline. Falling back to local registry:", apiErr.message);
    }

    // 3. Fallback: Register offline locally
    const existing = await sqliteService.query(
      "SELECT id FROM users WHERE mobile = ? OR username = ?;",
      [mobile, username]
    );
    if (existing.length > 0) {
      throw new Error("Username or mobile already registered locally");
    }

    const id = uuidv4();
    const role = 'admin';

    await sqliteService.run(
      `INSERT INTO users (id, name, username, mobile, role, password, must_change_password, is_profile_setup_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [id, name, username, mobile, role, password, 0, 1]
    );

    const authUser: AuthUser = {
      id,
      name,
      username,
      mobile,
      role,
      must_change_password: false,
      is_profile_setup_completed: true
    };

    await Preferences.set({
      key: SESSION_KEY,
      value: JSON.stringify(authUser)
    });

    return {
      user: authUser,
      token: 'local-session-token'
    };
  },

  async logout(): Promise<void> {
    await Preferences.remove({ key: SESSION_KEY });
  },

  async getMe(): Promise<AuthUser> {
    const { value } = await Preferences.get({ key: SESSION_KEY });
    if (!value) {
      throw new Error("Not authenticated");
    }
    const parsedUser = JSON.parse(value);
    
    // Verify user still exists in the local database
    const dbUser = await sqliteService.query("SELECT * FROM users WHERE id = ?;", [parsedUser.id]);
    if (dbUser.length === 0) {
      await this.logout();
      throw new Error("User session invalid");
    }

    const userRow = dbUser[0];
    return {
      id: userRow.id,
      name: userRow.name,
      username: userRow.username,
      mobile: userRow.mobile,
      role: userRow.role,
      must_change_password: userRow.must_change_password === 1,
      is_profile_setup_completed: userRow.is_profile_setup_completed === 1
    };
  },

  async forgotPassword(mobile: string): Promise<{ message: string }> {
    const users = await sqliteService.query("SELECT id FROM users WHERE mobile = ?;", [mobile]);
    if (users.length === 0) {
      throw new Error("Mobile number not found");
    }
    return { message: "Security details matched. Please contact your local database administrator to reset your password." };
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
    newPasswordConfirmation: string
  ): Promise<{ message: string }> {
    if (newPassword !== newPasswordConfirmation) {
      throw new Error("New passwords do not match");
    }

    const currentMe = await this.getMe();
    const dbUser = await sqliteService.query("SELECT password FROM users WHERE id = ?;", [currentMe.id]);
    if (dbUser.length === 0) {
      throw new Error("Incorrect current password");
    }

    const storedPass = dbUser[0].password;
    let isPasswordCorrect = false;
    // Check if the stored password looks like a bcrypt hash (starts with $2a$, $2y$, or $2b$)
    const isHash = typeof storedPass === 'string' && /^\$2[ayb]\$\d+\$[./A-Za-z0-9]{53}$/.test(storedPass);
    if (isHash) {
      try {
        isPasswordCorrect = await bcrypt.compare(currentPassword, storedPass);
      } catch (err) {
        console.error("Bcrypt check failed:", err);
      }
    } else {
      isPasswordCorrect = storedPass === currentPassword;
    }

    if (!isPasswordCorrect) {
      throw new Error("Incorrect current password");
    }

    await sqliteService.run(
      "UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?;",
      [newPassword, currentMe.id]
    );

    return { message: "Password updated successfully" };
  },

  async adminListUsers(): Promise<AdminUserListItem[]> {
    try {
      // 1. Try to fetch all users from the Laravel backend API
      const response = await api.get('/admin/users');
      if (Array.isArray(response.data)) {
        const remoteUsers = response.data;
        
        // 2. Sync them to the local SQLite database
        for (const u of remoteUsers) {
          const existing = await sqliteService.query("SELECT id FROM users WHERE id = ?;", [u.id]);
          if (existing.length > 0) {
            await sqliteService.run(
              `UPDATE users SET name = ?, mobile = ?, role = ?, must_change_password = ? WHERE id = ?;`,
              [u.name, u.mobile, u.role, u.must_change_password ? 1 : 0, u.id]
            );
          } else {
            // Insert new users with a default blank password to prevent crash on local offline login
            await sqliteService.run(
              `INSERT INTO users (id, name, username, mobile, role, password, must_change_password, is_profile_setup_completed)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
              [u.id, u.name, u.username || u.mobile, u.mobile, u.role, '', u.must_change_password ? 1 : 0, 1]
            );
          }
        }
      }
    } catch (apiErr: any) {
      console.warn("Failed to fetch/sync users from backend API. Using local SQLite data:", apiErr.message);
    }

    const users = await sqliteService.query("SELECT id, name, mobile, role, must_change_password FROM users;");
    return users.map(u => ({
      id: u.id,
      name: u.name,
      mobile: u.mobile,
      role: u.role,
      must_change_password: u.must_change_password === 1
    }));
  },

  async adminResetPassword(userId: string): Promise<{ message: string; temporary_password: string }> {
    const temporary = 'reset123';
    await sqliteService.run(
      "UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?;",
      [temporary, userId]
    );
    return {
      message: "Password reset successfully",
      temporary_password: temporary
    };
  },

  /**
   * While connected to the web server, downloads ALL registered user accounts
   * (including their bcrypt password hashes) and saves/upserts them into the
   * local SQLite database. After this, every user can log in completely offline.
   */
  async syncAllUsersLocally(
    onProgress?: (current: number, total: number, name: string) => void
  ): Promise<{ synced: number; errors: number }> {
    let response: any;
    try {
      response = await api.get('/admin/users/sync');
    } catch (httpErr: any) {
      const status = httpErr.response?.status ?? 'no response';
      const body = JSON.stringify(httpErr.response?.data ?? httpErr.message);
      if (status === 401) {
        throw new Error('Session expired. Please log out and log in again, then retry Sync Users.');
      }
      if (status === 403) {
        throw new Error('Access denied. Only Admin accounts can sync users.');
      }
      throw new Error(`Server returned HTTP ${status}: ${body}`);
    }

    const remoteUsers = response.data;

    // Debug: log what we actually got back
    console.log('[syncAllUsers] response.data type:', typeof remoteUsers, Array.isArray(remoteUsers), remoteUsers);

    // Detect HTML response (happens when token is invalid/expired and server redirects)
    if (typeof remoteUsers === 'string' && remoteUsers.trim().startsWith('<!DOCTYPE')) {
      throw new Error('Session expired or unauthorized. Please log out and log in again, then retry Sync Users.');
    }

    if (!Array.isArray(remoteUsers)) {
      throw new Error(
        `Server did not return an array. Got: ${JSON.stringify(remoteUsers).substring(0, 200)}`
      );
    }

    let synced = 0;
    let errors = 0;

    for (let i = 0; i < remoteUsers.length; i++) {
      const u = remoteUsers[i];
      onProgress?.(i + 1, remoteUsers.length, u.name);
      try {
        const existing = await sqliteService.query('SELECT id FROM users WHERE id = ?;', [u.id]);
        if (existing.length > 0) {
          // Update everything including the hashed password so it stays current
          await sqliteService.run(
            `UPDATE users
             SET name = ?, username = ?, mobile = ?, role = ?,
                 password = ?, email = ?, must_change_password = ?, is_profile_setup_completed = 1
             WHERE id = ?;`,
            [
              u.name,
              u.username || u.mobile,
              u.mobile,
              u.role,
              u.password,          // bcrypt hash from the server
              u.email || null,
              u.must_change_password ? 1 : 0,
              u.id,
            ]
          );
        } else {
          await sqliteService.run(
            `INSERT INTO users
               (id, name, username, mobile, role, password, email, must_change_password, is_profile_setup_completed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1);`,
            [
              u.id,
              u.name,
              u.username || u.mobile,
              u.mobile,
              u.role,
              u.password,          // bcrypt hash from the server
              u.email || null,
              u.must_change_password ? 1 : 0,
            ]
          );
        }
        synced++;
      } catch (err) {
        console.error(`Failed to upsert user ${u.id} (${u.name}):`, err);
        errors++;
      }
    }

    return { synced, errors };
  },
};
