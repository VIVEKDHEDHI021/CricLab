import { sqliteService } from './sqliteService';
import { v4 as uuidv4 } from 'uuid';

export type Team = {
  id: string;
  name: string;
  created_at?: string;
  deleted_at?: string | null;
};

export const teamService = {
  async getTeams(): Promise<Team[]> {
    const rows = await sqliteService.query("SELECT * FROM teams WHERE deleted_at IS NULL ORDER BY name ASC;");
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      deleted_at: r.deleted_at
    }));
  },

  async createTeam(name: string): Promise<Team> {
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    
    await sqliteService.run(
      "INSERT INTO teams (id, name, created_at) VALUES (?, ?, ?);",
      [id, name, createdAt]
    );

    return {
      id,
      name,
      created_at: createdAt
    };
  },

  async deleteTeam(id: string): Promise<void> {
    // Perform soft delete to protect historical data integrity
    await sqliteService.run(
      "UPDATE teams SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?;",
      [id]
    );
  },
};
