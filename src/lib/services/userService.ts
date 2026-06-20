import { sqliteService } from './sqliteService';
import { v4 as uuidv4 } from 'uuid';

export type User = {
  id: string;
  name: string;
  mobile: string;
  role: 'admin' | 'user' | 'scorer';
};

export const userService = {
  async getUsers(): Promise<User[]> {
    const rows = await sqliteService.query("SELECT id, name, mobile, role FROM users ORDER BY name ASC;");
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      mobile: r.mobile,
      role: r.role
    }));
  },

  async createUser(userData: { name: string; mobile: string; password: string; role: string }): Promise<User> {
    const id = uuidv4();
    // Use mobile as username for registration
    await sqliteService.run(
      `INSERT INTO users (id, name, username, mobile, role, password, must_change_password, is_profile_setup_completed)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1);`,
      [id, userData.name, userData.mobile, userData.mobile, userData.role, userData.password]
    );

    return {
      id,
      name: userData.name,
      mobile: userData.mobile,
      role: userData.role as any
    };
  },

  async resetPassword(id: string, password: string): Promise<void> {
    await sqliteService.run(
      "UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?;",
      [password, id]
    );
  },

  async deleteUser(id: string): Promise<void> {
    // Prevent deleting the primary admin account
    const adminRows = await sqliteService.query("SELECT username FROM users WHERE id = ?;", [id]);
    if (adminRows.length > 0 && adminRows[0].username === 'admin') {
      throw new Error("Cannot delete primary administrator account");
    }

    await sqliteService.run("DELETE FROM users WHERE id = ?;", [id]);
  },
};
