import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import JSZip from 'jszip';
import { sqliteService } from './sqliteService';
import api from '../api';

function sqlVal(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'boolean') return val ? '1' : '0';
  const escaped = val.toString().replace(/'/g, "''");
  return `'${escaped}'`;
}

async function executeBulkSql(db: any, sqls: string[]) {
  const chunkSize = 200;
  for (let i = 0; i < sqls.length; i += chunkSize) {
    const chunk = sqls.slice(i, i + chunkSize).join('\n');
    if (chunk.trim()) {
      await db.execute(chunk);
    }
  }
}


export class MigrationImportService {
  /**
   * Imports CricLab migration ZIP package.
   */
  async importPackage(
    file: File,
    onProgress: (progress: number, status: string) => void
  ): Promise<void> {
    try {
      onProgress(5, 'Reading migration zip file...');
      const arrayBuffer = await file.arrayBuffer();

      onProgress(15, 'Parsing zip structure...');
      const zip = await JSZip.loadAsync(arrayBuffer);

      // 1. Load migration.json
      onProgress(25, 'Loading migration data...');
      const jsonFile = zip.file('migration.json');
      if (!jsonFile) {
        throw new Error('Invalid migration package: migration.json not found.');
      }
      const jsonText = await jsonFile.async('text');
      const data = JSON.parse(jsonText);

      const version = data.version || '1.0.0';
      const users = data.users || [];
      const teams = data.teams || [];
      const players = data.players || [];
      const matches = data.matches || [];
      const matchSquads = data.match_squads || [];
      const innings = data.innings || [];
      const ballEvents = data.ball_events || [];

      onProgress(35, `Migration version ${version} parsed. Extracting media files...`);

      // 2. Extract media folder files
      const mediaMap: Record<string, string> = {};
      const mediaFolder = zip.folder('media');
      if (mediaFolder) {
        const fileNames = Object.keys(mediaFolder.files).filter(name => !mediaFolder.files[name].dir);
        let completedFiles = 0;

        for (const path of fileNames) {
          const fileEntry = mediaFolder.file(path);
          if (fileEntry) {
            const fileName = path.substring(path.indexOf('/') + 1);
            const base64Data = await fileEntry.async('base64');
            const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
            const dataUrl = `data:${mimeType};base64,${base64Data}`;

            try {
              // Write to Capacitor Filesystem
              const writeResult = await Filesystem.writeFile({
                path: `media/${fileName}`,
                data: base64Data,
                directory: Directory.Data,
                recursive: true
              });

              // Convert native URI to web-compatible local file URL
              const localUrl = Capacitor.convertFileSrc(writeResult.uri);
              mediaMap[fileName] = localUrl;
            } catch (fsErr) {
              console.warn(`Filesystem write failed for ${fileName}, falling back to base64 data URL:`, fsErr);
              mediaMap[fileName] = dataUrl;
            }

            completedFiles++;
            const progressRange = 35 + Math.round((completedFiles / fileNames.length) * 15);
            onProgress(progressRange, `Extracting media file: ${fileName}`);
          }
        }
      }

      onProgress(50, 'Inserting data records into SQLite...');

      // Safe JSON stringify helper
      const safeJsonStringify = (val: any) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'string') return val;
        try {
          return JSON.stringify(val);
        } catch {
          return null;
        }
      };

      // Extract filename helper
      const getAvatarUrl = (avatarStr: string | null) => {
        if (!avatarStr) return null;
        if (avatarStr.startsWith('data:') || avatarStr.startsWith('http')) return avatarStr;
        const baseName = avatarStr.split('/').pop() || '';
        return mediaMap[baseName] || avatarStr;
      };

      // 3. Clear existing and run bulk inserts inside a single database transaction
      await sqliteService.executeTransaction(async (db) => {
        const sqls: string[] = [];

        // Clear all relevant tables
        sqls.push('DELETE FROM ball_events;');
        sqls.push('DELETE FROM overs;');
        sqls.push('DELETE FROM innings;');
        sqls.push('DELETE FROM match_squads;');
        sqls.push('DELETE FROM matches;');
        sqls.push('DELETE FROM players;');
        sqls.push('DELETE FROM teams;');
        sqls.push('DELETE FROM users;');
        sqls.push('DELETE FROM batting_stats;');
        sqls.push('DELETE FROM bowling_stats;');
        sqls.push('DELETE FROM fielding_stats;');
        sqls.push('DELETE FROM partnerships;');
        sqls.push('DELETE FROM fall_of_wickets;');
        sqls.push('DELETE FROM extras;');
        sqls.push('DELETE FROM match_results;');

        // Insert Users
        for (const u of users) {
          sqls.push(
            `INSERT INTO users (id, name, username, mobile, role, password, email, must_change_password, is_profile_setup_completed, created_at)
             VALUES (${sqlVal(u.id)}, ${sqlVal(u.name)}, ${sqlVal(u.username)}, ${sqlVal(u.mobile)}, ${sqlVal(u.role || 'user')}, ${sqlVal(u.password)}, ${sqlVal(u.email)}, ${u.must_change_password ? 1 : 0}, ${u.is_profile_setup_completed ? 1 : 0}, ${sqlVal(u.created_at || new Date().toISOString())});`
          );
        }

        // Insert Teams
        for (const t of teams) {
          sqls.push(
            `INSERT INTO teams (id, name, created_by, created_at, deleted_at)
             VALUES (${sqlVal(t.id)}, ${sqlVal(t.name)}, ${sqlVal(t.created_by)}, ${sqlVal(t.created_at)}, ${sqlVal(t.deleted_at)});`
          );
        }

        // Insert Players
        for (const p of players) {
          const avatarUrl = getAvatarUrl(p.avatar || p.photo || null);
          const mappedRow: Record<string, any> = {
            id: p.id,
            name: p.name || p.full_name,
            full_name: p.full_name || p.name,
            mobile: p.mobile,
            email: p.email,
            dob: p.dob,
            city: p.city,
            state: p.state,
            country: p.country,
            profile_photo: avatarUrl,
            avatar: avatarUrl,
            bio: p.bio,
            primary_role: p.primary_role || p.role,
            role: p.role || p.primary_role,
            batting_style: p.batting_style,
            bowling_style: p.bowling_style,
            bowling_type: p.bowling_type,
            jersey_number: p.jersey_number,
            preferred_team_id: p.preferred_team_id || p.team_id,
            team_id: p.team_id || p.preferred_team_id,
            catches: p.catches ?? 0,
            run_outs: p.run_outs ?? 0,
            age: p.age,
            created_by: p.created_by,
            created_at: p.created_at || new Date().toISOString(),
            deleted_at: p.deleted_at
          };

          const insertSql = await sqliteService.buildInsertSqlSchemaSafe('players', mappedRow);
          if (insertSql) sqls.push(insertSql);
        }

        // Insert Matches
        for (const m of matches) {
          sqls.push(
            `INSERT INTO matches (id, team_a_id, team_b_id, overs, wide_run, noball_run, match_type, ground, match_date, status, result, batting_first_id, current_innings, last_man_batting, squad_a_ids, squad_b_ids, man_of_the_match_id, created_by, created_at)
             VALUES (${sqlVal(m.id)}, ${sqlVal(m.team_a_id)}, ${sqlVal(m.team_b_id)}, ${m.overs ?? 6}, ${m.wide_run ?? 1}, ${m.noball_run ?? 1}, ${sqlVal(m.match_type)}, ${sqlVal(m.ground)}, ${sqlVal(m.match_date)}, ${sqlVal(m.status || 'upcoming')}, ${sqlVal(m.result)}, ${sqlVal(m.batting_first_id)}, ${m.current_innings ?? 1}, ${m.last_man_batting ? 1 : 0}, ${sqlVal(safeJsonStringify(m.squad_a_ids))}, ${sqlVal(safeJsonStringify(m.squad_b_ids))}, ${sqlVal(m.man_of_the_match_id)}, ${sqlVal(m.created_by)}, ${sqlVal(m.created_at)});`
          );
        }

        // Insert Match Squads
        for (const ms of matchSquads) {
          sqls.push(
            `INSERT INTO match_squads (id, match_id, player_id, team_id, display_name, role, jersey_number, captain, wicket_keeper, is_guest, nickname)
             VALUES (${sqlVal(ms.id)}, ${sqlVal(ms.match_id)}, ${sqlVal(ms.player_id)}, ${sqlVal(ms.team_id)}, ${sqlVal(ms.display_name || 'Player')}, ${sqlVal(ms.role)}, ${sqlVal(ms.jersey_number)}, ${ms.captain ? 1 : 0}, ${ms.wicket_keeper ? 1 : 0}, ${ms.is_guest ? 1 : 0}, ${sqlVal(ms.nickname)});`
          );
        }

        // Insert Innings
        for (const inn of innings) {
          sqls.push(
            `INSERT INTO innings (id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed)
             VALUES (${sqlVal(inn.id)}, ${sqlVal(inn.match_id)}, ${inn.innings_no}, ${sqlVal(inn.batting_team_id)}, ${sqlVal(inn.bowling_team_id)}, ${inn.runs ?? 0}, ${inn.wickets ?? 0}, ${inn.legal_balls ?? 0}, ${inn.is_closed ? 1 : 0});`
          );
        }

        // Insert Ball Events
        for (const e of ballEvents) {
          sqls.push(
            `INSERT INTO ball_events (event_uuid, event_type, sequence_number, match_id, innings_no, over_no, ball_no, striker_id, non_striker_id, bowler_id, batting_team_id, bowling_team_id, runs_off_bat, extras, extra_type, wicket, wicket_type, dismissed_player_id, legal_delivery, scorer_id, device_timestamp, metadata)
             VALUES (${sqlVal(e.event_uuid)}, ${sqlVal(e.event_type)}, ${e.sequence_number}, ${sqlVal(e.match_id)}, ${e.innings_no}, ${e.over_no ?? 'NULL'}, ${e.ball_no ?? 'NULL'}, ${sqlVal(e.striker_id)}, ${sqlVal(e.non_striker_id)}, ${sqlVal(e.bowler_id)}, ${sqlVal(e.batting_team_id)}, ${sqlVal(e.bowling_team_id)}, ${e.runs_off_bat ?? 0}, ${e.extras ?? 0}, ${sqlVal(e.extra_type)}, ${e.wicket ? 1 : 0}, ${sqlVal(e.wicket_type)}, ${sqlVal(e.dismissed_player_id)}, ${e.legal_delivery ? 1 : 0}, ${sqlVal(e.scorer_id)}, ${e.device_timestamp}, ${sqlVal(safeJsonStringify(e.metadata))});`
          );
        }

        // Execute bulk inserts
        await executeBulkSql(db, sqls);
      });

      onProgress(75, 'Replaying and reconstructing derived match statistics...');

      // 4. Reconstruct statistics for each match (this is crucial since we didn't import derived tables)
      let completedReplays = 0;
      for (const m of matches) {
        onProgress(
          75 + Math.round((completedReplays / matches.length) * 20),
          `Reconstructing statistics for match: ${m.id}`
        );
        try {
          await sqliteService.recalculateMatchStats(m.id);
        } catch (replayErr) {
          console.error(`Failed to reconstruct match stats for match ${m.id}:`, replayErr);
        }
        completedReplays++;
      }

      onProgress(100, 'Migration completed successfully!');

      // Set setup completion flag
      localStorage.setItem('criclab_setup_completed', 'true');

    } catch (error) {
      console.error('Migration Import Service Failed:', error);
      throw error;
    }
  }

  /**
   * Automatically downloads migration data from production backend API and updates local SQLite cache.
   */
  async importFromApi(
    onProgress: (progress: number, status: string) => void
  ): Promise<void> {
    try {
      onProgress(10, 'Fetching sync data from production database...');
      const response = await api.get('/migration/data');
      const data = response.data;
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response from sync API');
      }

      const version = data.version || '1.0.0';
      const users = data.users || [];
      const teams = data.teams || [];
      const players = data.players || [];
      const matches = data.matches || [];
      const matchSquads = data.match_squads || [];
      const innings = data.innings || [];
      const ballEvents = data.ball_events || [];

      onProgress(40, `Sync data received (version ${version}). Caching records to local SQLite...`);

      // Safe JSON stringify helper
      const safeJsonStringify = (val: any) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'string') return val;
        try {
          return JSON.stringify(val);
        } catch {
          return null;
        }
      };

      // 3. Clear existing and run bulk inserts inside a single database transaction
      await sqliteService.executeTransaction(async (db) => {
        const sqls: string[] = [];

        // Clear all relevant tables
        sqls.push('DELETE FROM ball_events;');
        sqls.push('DELETE FROM overs;');
        sqls.push('DELETE FROM innings;');
        sqls.push('DELETE FROM match_squads;');
        sqls.push('DELETE FROM matches;');
        sqls.push('DELETE FROM players;');
        sqls.push('DELETE FROM teams;');
        sqls.push('DELETE FROM users;');
        sqls.push('DELETE FROM batting_stats;');
        sqls.push('DELETE FROM bowling_stats;');
        sqls.push('DELETE FROM fielding_stats;');
        sqls.push('DELETE FROM partnerships;');
        sqls.push('DELETE FROM fall_of_wickets;');
        sqls.push('DELETE FROM extras;');
        sqls.push('DELETE FROM match_results;');

        // Insert Users
        for (const u of users) {
          sqls.push(
            `INSERT INTO users (id, name, username, mobile, role, password, email, must_change_password, is_profile_setup_completed, created_at)
             VALUES (${sqlVal(u.id)}, ${sqlVal(u.name)}, ${sqlVal(u.username)}, ${sqlVal(u.mobile)}, ${sqlVal(u.role || 'user')}, ${sqlVal(u.password)}, ${sqlVal(u.email)}, ${u.must_change_password ? 1 : 0}, ${u.is_profile_setup_completed ? 1 : 0}, ${sqlVal(u.created_at || new Date().toISOString())});`
          );
        }

        // Insert Teams
        for (const t of teams) {
          sqls.push(
            `INSERT INTO teams (id, name, created_by, created_at, deleted_at)
             VALUES (${sqlVal(t.id)}, ${sqlVal(t.name)}, ${sqlVal(t.created_by)}, ${sqlVal(t.created_at)}, ${sqlVal(t.deleted_at)});`
          );
        }

        // Insert Players
        for (const p of players) {
          const mappedRow: Record<string, any> = {
            id: p.id,
            name: p.name || p.full_name,
            full_name: p.full_name || p.name,
            mobile: p.mobile,
            email: p.email,
            dob: p.dob,
            city: p.city,
            state: p.state,
            country: p.country,
            profile_photo: p.profile_photo || p.avatar,
            avatar: p.avatar || p.profile_photo,
            bio: p.bio,
            primary_role: p.primary_role || p.role,
            role: p.role || p.primary_role,
            batting_style: p.batting_style,
            bowling_style: p.bowling_style,
            bowling_type: p.bowling_type,
            jersey_number: p.jersey_number,
            preferred_team_id: p.preferred_team_id || p.team_id,
            team_id: p.team_id || p.preferred_team_id,
            catches: p.catches ?? 0,
            run_outs: p.run_outs ?? 0,
            age: p.age,
            created_by: p.created_by,
            created_at: p.created_at || new Date().toISOString(),
            deleted_at: p.deleted_at
          };

          const insertSql = await sqliteService.buildInsertSqlSchemaSafe('players', mappedRow);
          if (insertSql) sqls.push(insertSql);
        }

        // Insert Matches
        for (const m of matches) {
          sqls.push(
            `INSERT INTO matches (id, team_a_id, team_b_id, overs, wide_run, noball_run, match_type, ground, match_date, status, result, batting_first_id, current_innings, last_man_batting, squad_a_ids, squad_b_ids, man_of_the_match_id, created_by, created_at)
             VALUES (${sqlVal(m.id)}, ${sqlVal(m.team_a_id)}, ${sqlVal(m.team_b_id)}, ${m.overs ?? 6}, ${m.wide_run ?? 1}, ${m.noball_run ?? 1}, ${sqlVal(m.match_type)}, ${sqlVal(m.ground)}, ${sqlVal(m.match_date)}, ${sqlVal(m.status || 'upcoming')}, ${sqlVal(m.result)}, ${sqlVal(m.batting_first_id)}, ${m.current_innings ?? 1}, ${m.last_man_batting ? 1 : 0}, ${sqlVal(safeJsonStringify(m.squad_a_ids))}, ${sqlVal(safeJsonStringify(m.squad_b_ids))}, ${sqlVal(m.man_of_the_match_id)}, ${sqlVal(m.created_by)}, ${sqlVal(m.created_at)});`
          );
        }

        // Insert Match Squads
        for (const ms of matchSquads) {
          sqls.push(
            `INSERT INTO match_squads (id, match_id, player_id, team_id, display_name, role, jersey_number, captain, wicket_keeper, is_guest, nickname)
             VALUES (${sqlVal(ms.id)}, ${sqlVal(ms.match_id)}, ${sqlVal(ms.player_id)}, ${sqlVal(ms.team_id)}, ${sqlVal(ms.display_name || 'Player')}, ${sqlVal(ms.role)}, ${sqlVal(ms.jersey_number)}, ${ms.captain ? 1 : 0}, ${ms.wicket_keeper ? 1 : 0}, ${ms.is_guest ? 1 : 0}, ${sqlVal(ms.nickname)});`
          );
        }

        // Insert Innings
        for (const inn of innings) {
          sqls.push(
            `INSERT INTO innings (id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed)
             VALUES (${sqlVal(inn.id)}, ${sqlVal(inn.match_id)}, ${inn.innings_no}, ${sqlVal(inn.batting_team_id)}, ${sqlVal(inn.bowling_team_id)}, ${inn.runs ?? 0}, ${inn.wickets ?? 0}, ${inn.legal_balls ?? 0}, ${inn.is_closed ? 1 : 0});`
          );
        }

        // Insert Ball Events
        for (const e of ballEvents) {
          sqls.push(
            `INSERT INTO ball_events (event_uuid, event_type, sequence_number, match_id, innings_no, over_no, ball_no, striker_id, non_striker_id, bowler_id, batting_team_id, bowling_team_id, runs_off_bat, extras, extra_type, wicket, wicket_type, dismissed_player_id, legal_delivery, scorer_id, device_timestamp, metadata)
             VALUES (${sqlVal(e.event_uuid)}, ${sqlVal(e.event_type)}, ${e.sequence_number}, ${sqlVal(e.match_id)}, ${e.innings_no}, ${e.over_no ?? 'NULL'}, ${e.ball_no ?? 'NULL'}, ${sqlVal(e.striker_id)}, ${sqlVal(e.non_striker_id)}, ${sqlVal(e.bowler_id)}, ${sqlVal(e.batting_team_id)}, ${sqlVal(e.bowling_team_id)}, ${e.runs_off_bat ?? 0}, ${e.extras ?? 0}, ${sqlVal(e.extra_type)}, ${e.wicket ? 1 : 0}, ${sqlVal(e.wicket_type)}, ${sqlVal(e.dismissed_player_id)}, ${e.legal_delivery ? 1 : 0}, ${sqlVal(e.scorer_id)}, ${e.device_timestamp}, ${sqlVal(safeJsonStringify(e.metadata))});`
          );
        }

        // Execute bulk inserts
        await executeBulkSql(db, sqls);
      });

      onProgress(80, 'Recalculating statistics for all synced matches...');

      // 4. Reconstruct statistics for each match
      let completedReplays = 0;
      for (const m of matches) {
        onProgress(
          80 + Math.round((completedReplays / matches.length) * 20),
          `Reconstructing statistics for match: ${m.id}`
        );
        try {
          await sqliteService.recalculateMatchStats(m.id);
        } catch (replayErr) {
          console.error(`Failed to reconstruct match stats for match ${m.id}:`, replayErr);
        }
        completedReplays++;
      }

      onProgress(100, 'Database synchronization completed successfully!');

      // Set setup completion flag
      localStorage.setItem('criclab_setup_completed', 'true');
      localStorage.setItem('criclab_initial_sync_done', 'true');
    } catch (error) {
      console.error('Database Sync API Failed:', error);
      throw error;
    }
  }
}

export const migrationImportService = new MigrationImportService();
