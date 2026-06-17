import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import JSZip from 'jszip';
import { sqliteService } from './sqliteService';
import api from '../api';

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
        // Clear all relevant tables
        await db.run('DELETE FROM ball_events;');
        await db.run('DELETE FROM overs;');
        await db.run('DELETE FROM innings;');
        await db.run('DELETE FROM match_squads;');
        await db.run('DELETE FROM matches;');
        await db.run('DELETE FROM players;');
        await db.run('DELETE FROM teams;');
        await db.run('DELETE FROM users;');
        await db.run('DELETE FROM batting_stats;');
        await db.run('DELETE FROM bowling_stats;');
        await db.run('DELETE FROM fielding_stats;');
        await db.run('DELETE FROM partnerships;');
        await db.run('DELETE FROM fall_of_wickets;');
        await db.run('DELETE FROM extras;');
        await db.run('DELETE FROM match_results;');

        // Insert Users
        for (const u of users) {
          await db.run(
            `INSERT INTO users (
              id, name, username, mobile, role, password, email, must_change_password, is_profile_setup_completed, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              u.id,
              u.name || null,
              u.username || null,
              u.mobile || null,
              u.role || 'user',
              u.password || null,
              u.email || null,
              u.must_change_password ? 1 : 0,
              u.is_profile_setup_completed ? 1 : 0,
              u.created_at || new Date().toISOString()
            ]
          );
        }

        // Insert Teams
        for (const t of teams) {
          await db.run(
            `INSERT INTO teams (
              id, name, created_by, created_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?);`,
            [
              t.id,
              t.name,
              t.created_by || null,
              t.created_at || null,
              t.deleted_at || null
            ]
          );
        }

        // Insert Players
        for (const p of players) {
          const avatarUrl = getAvatarUrl(p.avatar || p.photo || null);
          await db.run(
            `INSERT INTO players (
              id, name, team_id, mobile, avatar, role, batting_style, bowling_style, jersey_number, catches, run_outs, age, city, created_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              p.id,
              p.name,
              p.team_id || null,
              p.mobile || null,
              avatarUrl,
              p.role || null,
              p.batting_style || null,
              p.bowling_style || null,
              p.jersey_number || null,
              p.catches ?? 0,
              p.run_outs ?? 0,
              p.age ?? null,
              p.city || null,
              p.created_at || null,
              p.deleted_at || null
            ]
          );
        }

        // Insert Matches
        for (const m of matches) {
          await db.run(
            `INSERT INTO matches (
              id, team_a_id, team_b_id, overs, wide_run, noball_run, match_type, ground, match_date, status, result, batting_first_id, current_innings, last_man_batting, squad_a_ids, squad_b_ids, man_of_the_match_id, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              m.id,
              m.team_a_id,
              m.team_b_id,
              m.overs ?? 6,
              m.wide_run ?? 1,
              m.noball_run ?? 1,
              m.match_type || null,
              m.ground || null,
              m.match_date,
              m.status || 'upcoming',
              m.result || null,
              m.batting_first_id || null,
              m.current_innings ?? 1,
              m.last_man_batting ? 1 : 0,
              safeJsonStringify(m.squad_a_ids),
              safeJsonStringify(m.squad_b_ids),
              m.man_of_the_match_id || null,
              m.created_by || null,
              m.created_at || null
            ]
          );
        }

        // Insert Match Squads
        for (const ms of matchSquads) {
          await db.run(
            `INSERT INTO match_squads (
              id, match_id, player_id, team_id, display_name, role, jersey_number, captain, wicket_keeper, is_guest, nickname
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              ms.id,
              ms.match_id,
              ms.player_id,
              ms.team_id,
              ms.display_name || 'Player',
              ms.role || null,
              ms.jersey_number || null,
              ms.captain ? 1 : 0,
              ms.wicket_keeper ? 1 : 0,
              ms.is_guest ? 1 : 0,
              ms.nickname || null
            ]
          );
        }

        // Insert Innings
        for (const inn of innings) {
          await db.run(
            `INSERT INTO innings (
              id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              inn.id,
              inn.match_id,
              inn.innings_no,
              inn.batting_team_id,
              inn.bowling_team_id,
              inn.runs ?? 0,
              inn.wickets ?? 0,
              inn.legal_balls ?? 0,
              inn.is_closed ? 1 : 0
            ]
          );
        }

        // Insert Ball Events
        for (const e of ballEvents) {
          await db.run(
            `INSERT INTO ball_events (
              event_uuid, event_type, sequence_number, match_id, innings_no, over_no, ball_no,
              striker_id, non_striker_id, bowler_id, batting_team_id, bowling_team_id,
              runs_off_bat, extras, extra_type, wicket, wicket_type, dismissed_player_id,
              legal_delivery, scorer_id, device_timestamp, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              e.event_uuid,
              e.event_type,
              e.sequence_number,
              e.match_id,
              e.innings_no,
              e.over_no ?? null,
              e.ball_no ?? null,
              e.striker_id ?? null,
              e.non_striker_id ?? null,
              e.bowler_id ?? null,
              e.batting_team_id ?? null,
              e.bowling_team_id ?? null,
              e.runs_off_bat ?? 0,
              e.extras ?? 0,
              e.extra_type || null,
              e.wicket ? 1 : 0,
              e.wicket_type || null,
              e.dismissed_player_id || null,
              e.legal_delivery ? 1 : 0,
              e.scorer_id || null,
              e.device_timestamp,
              safeJsonStringify(e.metadata)
            ]
          );
        }
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
        // Clear all relevant tables
        await db.run('DELETE FROM ball_events;');
        await db.run('DELETE FROM overs;');
        await db.run('DELETE FROM innings;');
        await db.run('DELETE FROM match_squads;');
        await db.run('DELETE FROM matches;');
        await db.run('DELETE FROM players;');
        await db.run('DELETE FROM teams;');
        await db.run('DELETE FROM users;');
        await db.run('DELETE FROM batting_stats;');
        await db.run('DELETE FROM bowling_stats;');
        await db.run('DELETE FROM fielding_stats;');
        await db.run('DELETE FROM partnerships;');
        await db.run('DELETE FROM fall_of_wickets;');
        await db.run('DELETE FROM extras;');
        await db.run('DELETE FROM match_results;');

        // Insert Users
        for (const u of users) {
          await db.run(
            `INSERT INTO users (
              id, name, username, mobile, role, password, email, must_change_password, is_profile_setup_completed, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              u.id,
              u.name || null,
              u.username || null,
              u.mobile || null,
              u.role || 'user',
              u.password || null,
              u.email || null,
              u.must_change_password ? 1 : 0,
              u.is_profile_setup_completed ? 1 : 0,
              u.created_at || new Date().toISOString()
            ]
          );
        }

        // Insert Teams
        for (const t of teams) {
          await db.run(
            `INSERT INTO teams (
              id, name, created_by, created_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?);`,
            [
              t.id,
              t.name,
              t.created_by || null,
              t.created_at || null,
              t.deleted_at || null
            ]
          );
        }

        // Insert Players
        for (const p of players) {
          await db.run(
            `INSERT INTO players (
              id, name, team_id, mobile, avatar, role, batting_style, bowling_style, jersey_number, catches, run_outs, age, city, created_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              p.id,
              p.name,
              p.team_id || null,
              p.mobile || null,
              p.avatar || null,
              p.role || null,
              p.batting_style || null,
              p.bowling_style || null,
              p.jersey_number || null,
              p.catches ?? 0,
              p.run_outs ?? 0,
              p.age ?? null,
              p.city || null,
              p.created_at || null,
              p.deleted_at || null
            ]
          );
        }

        // Insert Matches
        for (const m of matches) {
          await db.run(
            `INSERT INTO matches (
              id, team_a_id, team_b_id, overs, wide_run, noball_run, match_type, ground, match_date, status, result, batting_first_id, current_innings, last_man_batting, squad_a_ids, squad_b_ids, man_of_the_match_id, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              m.id,
              m.team_a_id,
              m.team_b_id,
              m.overs ?? 6,
              m.wide_run ?? 1,
              m.noball_run ?? 1,
              m.match_type || null,
              m.ground || null,
              m.match_date,
              m.status || 'upcoming',
              m.result || null,
              m.batting_first_id || null,
              m.current_innings ?? 1,
              m.last_man_batting ? 1 : 0,
              safeJsonStringify(m.squad_a_ids),
              safeJsonStringify(m.squad_b_ids),
              m.man_of_the_match_id || null,
              m.created_by || null,
              m.created_at || null
            ]
          );
        }

        // Insert Match Squads
        for (const ms of matchSquads) {
          await db.run(
            `INSERT INTO match_squads (
              id, match_id, player_id, team_id, display_name, role, jersey_number, captain, wicket_keeper, is_guest, nickname
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              ms.id,
              ms.match_id,
              ms.player_id,
              ms.team_id,
              ms.display_name || 'Player',
              ms.role || null,
              ms.jersey_number || null,
              ms.captain ? 1 : 0,
              ms.wicket_keeper ? 1 : 0,
              ms.is_guest ? 1 : 0,
              ms.nickname || null
            ]
          );
        }

        // Insert Innings
        for (const inn of innings) {
          await db.run(
            `INSERT INTO innings (
              id, match_id, innings_no, batting_team_id, bowling_team_id, runs, wickets, legal_balls, is_closed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              inn.id,
              inn.match_id,
              inn.innings_no,
              inn.batting_team_id,
              inn.bowling_team_id,
              inn.runs ?? 0,
              inn.wickets ?? 0,
              inn.legal_balls ?? 0,
              inn.is_closed ? 1 : 0
            ]
          );
        }

        // Insert Ball Events
        for (const e of ballEvents) {
          await db.run(
            `INSERT INTO ball_events (
              event_uuid, event_type, sequence_number, match_id, innings_no, over_no, ball_no,
              striker_id, non_striker_id, bowler_id, batting_team_id, bowling_team_id,
              runs_off_bat, extras, extra_type, wicket, wicket_type, dismissed_player_id,
              legal_delivery, scorer_id, device_timestamp, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              e.event_uuid,
              e.event_type,
              e.sequence_number,
              e.match_id,
              e.innings_no,
              e.over_no ?? null,
              e.ball_no ?? null,
              e.striker_id ?? null,
              e.non_striker_id ?? null,
              e.bowler_id ?? null,
              e.batting_team_id ?? null,
              e.bowling_team_id ?? null,
              e.runs_off_bat ?? 0,
              e.extras ?? 0,
              e.extra_type || null,
              e.wicket ? 1 : 0,
              e.wicket_type || null,
              e.dismissed_player_id || null,
              e.legal_delivery ? 1 : 0,
              e.scorer_id || null,
              e.device_timestamp,
              safeJsonStringify(e.metadata)
            ]
          );
        }
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
