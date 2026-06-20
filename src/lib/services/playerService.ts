import { sqliteService } from './sqliteService';
import { v4 as uuidv4 } from 'uuid';

export type PlayerStats = {
  matches: number;
  runs: number;
  wickets: number;
  sr: string;
  econ: string;
};

export type Player = {
  id: string;
  name: string;
  full_name?: string;
  mobile?: string;
  email?: string;
  user_id?: string;
  dob?: string;
  city?: string;
  state?: string;
  country?: string;
  profile_photo?: string;
  avatar?: string;
  bio?: string;
  primary_role?: string;
  role?: string;
  batting_style?: string;
  bowling_style?: string;
  bowling_type?: string;
  jersey_number?: string;
  preferred_team_id?: string | null;
  team_id?: string | null;
  team_name?: string;
  team?: { id: string; name: string };
  created_by?: string;
  catches?: number;
  run_outs?: number;
  age?: number | null;
  stats?: PlayerStats;
  created_at?: string;
  deleted_at?: string | null;
};

export type PlayerMatchHistory = {
  match_id: string;
  match_date: string;
  opponent: string;
  runs: number;
  balls: number;
  is_out: boolean;
  wickets: number;
  bowling_runs: number;
  bowling_overs: string;
  result: string;
};

export type PlayerProfile = {
  player: Player;
  awards: {
    man_of_the_match: number;
    best_batsman: number;
    best_bowler: number;
  };
  career: {
    matches: number;
    innings: number;
    runs: number;
    highest_score: number;
    average: string;
    strike_rate: string;
    fours: number;
    sixes: number;
    wickets: number;
    bowling_average: string;
    economy: string;
    best_bowling: string;
    maidens: number;
    catches: number;
    run_outs: number;
  };
  tournament: {
    runs: number;
    wickets: number;
    average: string;
    strike_rate: string;
  };
  recent: PlayerMatchHistory[];
  history: PlayerMatchHistory[];
  teams: { id: string; name: string }[];
};

export type RankingItem = {
  id: string;
  name: string;
  team_name: string;
  avatar?: string;
  runs: number;
  wickets: number;
  sixes: number;
  sr: string;
  mvp: number;
};

export type PlayerRankings = {
  batters: RankingItem[];
  bowlers: RankingItem[];
  sixes: RankingItem[];
  strike_rates: RankingItem[];
  mvp: RankingItem[];
};

export const playerService = {
  async getPlayers(): Promise<Player[]> {
    const meta = await sqliteService.getPlayerQueryMeta();
    const rows = await sqliteService.query(
      `SELECT p.*, ${meta.nameExpr} as resolved_name, ${meta.photoExpr} as resolved_photo, t.name as team_name
       FROM players p
       LEFT JOIN teams t ON ${meta.teamIdExpr} = t.id
       WHERE p.deleted_at IS NULL
       ORDER BY COALESCE(${meta.nameExpr}, '') ASC;`
    );
    return rows.map(r => {
      const nameVal = r.resolved_name || '';
      const roleVal = r.primary_role || r.role || '';
      const photoVal = r.resolved_photo || '';

      return {
        id: r.id,
        name: nameVal,
        full_name: r.full_name || nameVal,
        preferred_team_id: r.preferred_team_id || r.team_id,
        team_id: r.preferred_team_id || r.team_id,
        team_name: r.team_name,
        team: (r.preferred_team_id || r.team_id) ? { id: (r.preferred_team_id || r.team_id), name: r.team_name } : undefined,
        mobile: r.mobile,
        email: r.email,
        dob: r.dob,
        city: r.city,
        state: r.state,
        country: r.country,
        profile_photo: photoVal,
        avatar: photoVal,
        bio: r.bio,
        primary_role: roleVal,
        role: roleVal,
        batting_style: r.batting_style,
        bowling_style: r.bowling_style,
        bowling_type: r.bowling_type,
        jersey_number: r.jersey_number,
        created_by: r.created_by,
        created_at: r.created_at
      };
    });
  },

  async createPlayer(playerData: Partial<Player>): Promise<Player> {
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const dbTeamId = playerData.preferred_team_id && playerData.preferred_team_id.trim() !== "" ? playerData.preferred_team_id : null;
    const name = playerData.full_name || playerData.name || '';
    const role = playerData.primary_role || playerData.role || '';
    const photo = playerData.profile_photo || playerData.avatar || null;

    await sqliteService.run(
      `INSERT INTO players (
         id, name, mobile, email, dob, city, state, country, profile_photo, bio,
         primary_role, batting_style, bowling_style, bowling_type, jersey_number,
         preferred_team_id, created_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id, name, playerData.mobile || null, playerData.email || null,
        playerData.dob || null, playerData.city || null, playerData.state || null,
        playerData.country || null, photo, playerData.bio || null,
        role, playerData.batting_style || null, playerData.bowling_style || null,
        playerData.bowling_type || null, playerData.jersey_number || null,
        dbTeamId, playerData.created_by || null, createdAt
      ]
    );

    let teamName = '';
    if (dbTeamId) {
      const teams = await sqliteService.query("SELECT name FROM teams WHERE id = ?;", [dbTeamId]);
      teamName = teams.length > 0 ? teams[0].name : '';
    }

    return {
      ...playerData,
      id,
      name,
      full_name: name,
      preferred_team_id: dbTeamId,
      team_id: dbTeamId,
      team_name: teamName,
      team: dbTeamId ? { id: dbTeamId, name: teamName } : undefined,
      role,
      primary_role: role,
      profile_photo: photo || undefined,
      avatar: photo || undefined,
      created_at: createdAt
    };
  },

  async deletePlayer(id: string): Promise<void> {
    await sqliteService.run(
      "UPDATE players SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?;",
      [id]
    );
  },

  async getPlayerProfile(id: string): Promise<PlayerProfile> {
    const meta = await sqliteService.getPlayerQueryMeta();
    let players = await sqliteService.query(
      `SELECT p.*, ${meta.nameExpr} as resolved_name, ${meta.photoExpr} as resolved_photo, t.name as team_name
       FROM players p
       LEFT JOIN teams t ON ${meta.teamIdExpr} = t.id
       WHERE p.id = ?;`,
      [id]
    );

    let playerObj: Player;
    if (players.length === 0) {
      const guests = await sqliteService.query(
        `SELECT player_id as id, display_name as name, team_id, role, jersey_number, is_guest
         FROM match_squads
         WHERE player_id = ?
         LIMIT 1;`,
        [id]
      );
      if (guests.length === 0) {
        throw new Error("Player not found");
      }
      const g = guests[0];
      const teams = await sqliteService.query("SELECT name FROM teams WHERE id = ?;", [g.team_id]);
      playerObj = {
        id: g.id,
        name: g.name,
        full_name: g.name,
        preferred_team_id: g.team_id,
        team_id: g.team_id,
        team_name: teams.length > 0 ? teams[0].name : '',
        role: g.role,
        primary_role: g.role,
        jersey_number: g.jersey_number,
        avatar: undefined
      };
    } else {
      const r = players[0];
      const nameVal = r.resolved_name || '';
      const roleVal = r.primary_role || r.role || '';
      const photoVal = r.resolved_photo || '';

      playerObj = {
        id: r.id,
        name: nameVal,
        full_name: r.full_name || nameVal,
        preferred_team_id: r.preferred_team_id || r.team_id,
        team_id: r.preferred_team_id || r.team_id,
        team_name: r.team_name,
        team: (r.preferred_team_id || r.team_id) ? { id: (r.preferred_team_id || r.team_id), name: r.team_name } : undefined,
        mobile: r.mobile,
        email: r.email,
        dob: r.dob,
        city: r.city,
        state: r.state,
        country: r.country,
        profile_photo: photoVal,
        avatar: photoVal,
        bio: r.bio,
        primary_role: roleVal,
        role: roleVal,
        batting_style: r.batting_style,
        bowling_style: r.bowling_style,
        bowling_type: r.bowling_type,
        jersey_number: r.jersey_number,
        catches: r.catches,
        run_outs: r.run_outs,
        age: r.age,
        created_at: r.created_at
      };
    }

    const matchesCountRows = await sqliteService.query(
      "SELECT COUNT(DISTINCT match_id) as cnt FROM match_squads WHERE player_id = ?;",
      [id]
    );
    const matchesCount = matchesCountRows[0]?.cnt || 0;

    const inningsCountRows = await sqliteService.query(
      "SELECT COUNT(*) as cnt FROM v2_player_match_stats WHERE player_id = ?;",
      [id]
    );
    const inningsCount = inningsCountRows[0]?.cnt || 0;

    const runsRows = await sqliteService.query(
      "SELECT SUM(runs) as runs, SUM(balls) as balls, SUM(fours) as fours, SUM(sixes) as sixes, MAX(runs) as hs FROM v2_player_match_stats WHERE player_id = ?;",
      [id]
    );
    const totalRuns = runsRows[0]?.runs || 0;
    const totalBalls = runsRows[0]?.balls || 0;
    const totalFours = runsRows[0]?.fours || 0;
    const totalSixes = runsRows[0]?.sixes || 0;
    const highestScore = runsRows[0]?.hs || 0;

    const outsRows = await sqliteService.query(
      "SELECT COUNT(*) as cnt FROM v2_player_match_stats WHERE player_id = ? AND is_out = 1;",
      [id]
    );
    const totalOuts = outsRows[0]?.cnt || 0;

    const bowlingRows = await sqliteService.query(
      "SELECT SUM(runs_conceded) as runs, SUM(wickets) as wickets, SUM(maidens) as maidens FROM v2_bowler_match_stats WHERE player_id = ?;",
      [id]
    );
    const bowlingRuns = bowlingRows[0]?.runs || 0;
    const bowlingWickets = bowlingRows[0]?.wickets || 0;
    const bowlingMaidens = bowlingRows[0]?.maidens || 0;

    const fieldingRows = await sqliteService.query(
      "SELECT SUM(catches) as catches, SUM(run_outs) as run_outs FROM v2_fielding_match_stats WHERE player_id = ?;",
      [id]
    );
    const catches = fieldingRows[0]?.catches || 0;
    const runOuts = fieldingRows[0]?.run_outs || 0;

    const oversRows = await sqliteService.query("SELECT overs FROM v2_bowler_match_stats WHERE player_id = ?;", [id]);
    let totalLegalBalls = 0;
    for (const row of oversRows) {
      if (row.overs) {
        const parts = row.overs.split('.');
        const overs = parseInt(parts[0]) || 0;
        const balls = parseInt(parts[1]) || 0;
        totalLegalBalls += (overs * 6) + balls;
      }
    }

    const bestBowlingRows = await sqliteService.query(
      "SELECT wickets, runs_conceded FROM v2_bowler_match_stats WHERE player_id = ? ORDER BY wickets DESC, runs_conceded ASC LIMIT 1;",
      [id]
    );
    const bestBowling = bestBowlingRows.length > 0 
      ? `${bestBowlingRows[0].wickets}/${bestBowlingRows[0].runs_conceded}` 
      : '-';

    const momCountRows = await sqliteService.query(
      "SELECT COUNT(*) as cnt FROM v2_match_awards WHERE player_of_match = ?;",
      [id]
    );
    const momCount = momCountRows[0]?.cnt || 0;

    const bestBatCountRows = await sqliteService.query(
      `SELECT COUNT(*) as cnt FROM v2_player_match_stats b1
       WHERE b1.player_id = ?
         AND b1.runs > 0
         AND b1.runs = (SELECT MAX(runs) FROM v2_player_match_stats b2 WHERE b2.match_id = b1.match_id);`,
      [id]
    );
    const bestBatCount = bestBatCountRows[0]?.cnt || 0;

    const bestBowlCountRows = await sqliteService.query(
      `SELECT COUNT(*) as cnt FROM v2_bowler_match_stats b1
       WHERE b1.player_id = ?
         AND b1.wickets > 0
         AND b1.wickets = (SELECT MAX(wickets) FROM v2_bowler_match_stats b2 WHERE b2.match_id = b1.match_id);`,
      [id]
    );
    const bestBowlCount = bestBowlCountRows[0]?.cnt || 0;

    const historyRows = await sqliteService.query(
      `SELECT
         ms.match_id,
         m.match_date,
         o.name as opponent,
         COALESCE(bat.runs, 0) as runs,
         COALESCE(bat.balls, 0) as balls,
         COALESCE(bat.is_out, 0) as is_out,
         COALESCE(bowl.wickets, 0) as wickets,
         COALESCE(bowl.runs_conceded, 0) as bowling_runs,
         COALESCE(bowl.overs, '0.0') as bowling_overs,
         m.result
       FROM match_squads ms
       JOIN v2_matches m ON ms.match_id = m.id
       JOIN teams o ON (o.id = CASE WHEN ms.team_id = m.team_a_id THEN m.team_b_id ELSE m.team_a_id END)
       LEFT JOIN v2_player_match_stats bat ON (bat.match_id = ms.match_id AND bat.player_id = ms.player_id)
       LEFT JOIN v2_bowler_match_stats bowl ON (bowl.match_id = ms.match_id AND bowl.player_id = ms.player_id)
       WHERE ms.player_id = ?
       ORDER BY m.match_date DESC;`,
      [id]
    );

    const history: PlayerMatchHistory[] = historyRows.map(r => ({
      match_id: r.match_id,
      match_date: r.match_date,
      opponent: r.opponent,
      runs: r.runs,
      balls: r.balls,
      is_out: r.is_out === 1,
      wickets: r.wickets,
      bowling_runs: r.bowling_runs,
      bowling_overs: r.bowling_overs,
      result: r.result || 'Live'
    }));

    const teamRows = await sqliteService.query(
      `SELECT DISTINCT t.id, t.name
       FROM match_squads ms
       JOIN teams t ON ms.team_id = t.id
       WHERE ms.player_id = ?;`,
      [id]
    );

    const teamList = teamRows.map(t => ({ id: t.id, name: t.name }));
    if (playerObj.preferred_team_id && !teamList.some(t => t.id === playerObj.preferred_team_id)) {
      teamList.push({ id: playerObj.preferred_team_id, name: playerObj.team_name || '' });
    }

    return {
      player: playerObj,
      awards: {
        man_of_the_match: momCount,
        best_batsman: bestBatCount,
        best_bowler: bestBowlCount
      },
      career: {
        matches: matchesCount,
        innings: inningsCount,
        runs: totalRuns,
        highest_score: highestScore,
        average: totalOuts > 0 ? (totalRuns / totalOuts).toFixed(2) : totalRuns.toFixed(2),
        strike_rate: totalBalls > 0 ? ((totalRuns / totalBalls) * 100).toFixed(2) : '0.00',
        fours: totalFours,
        sixes: totalSixes,
        wickets: bowlingWickets,
        bowling_average: bowlingWickets > 0 ? (bowlingRuns / bowlingWickets).toFixed(2) : '-',
        economy: totalLegalBalls > 0 ? (bowlingRuns / (totalLegalBalls / 6)).toFixed(2) : '0.00',
        best_bowling: bestBowling,
        maidens: bowlingMaidens,
        catches: catches + (playerObj.catches || 0),
        run_outs: runOuts + (playerObj.run_outs || 0)
      },
      tournament: {
        runs: totalRuns,
        wickets: bowlingWickets,
        average: totalOuts > 0 ? (totalRuns / totalOuts).toFixed(2) : totalRuns.toFixed(2),
        strike_rate: totalBalls > 0 ? ((totalRuns / totalBalls) * 100).toFixed(2) : '0.00'
      },
      recent: history.slice(0, 5),
      history: history,
      teams: teamList
    };
  },

  async updatePlayerProfile(id: string, profileData: Partial<Player>): Promise<Player> {
    const original = await sqliteService.query("SELECT name, mobile FROM players WHERE id = ?;", [id]);
    const cols = await sqliteService.getTableColumns('players');
    
    const updateFields: string[] = [];
    const bindings: any[] = [];

    const addFieldIfExist = (colName: string, value: any) => {
      if (cols.includes(colName)) {
        updateFields.push(`${colName} = COALESCE(?, ${colName})`);
        bindings.push(value);
      }
    };

    const name = profileData.full_name || profileData.name || null;
    const role = profileData.primary_role || profileData.role || null;
    const photo = profileData.profile_photo || profileData.avatar || null;
    const dbTeamId = profileData.preferred_team_id && profileData.preferred_team_id.trim() !== "" ? profileData.preferred_team_id : null;

    addFieldIfExist('name', name);
    addFieldIfExist('full_name', name);
    addFieldIfExist('mobile', profileData.mobile || null);
    addFieldIfExist('email', profileData.email || null);
    addFieldIfExist('dob', profileData.dob || null);
    addFieldIfExist('city', profileData.city || null);
    addFieldIfExist('state', profileData.state || null);
    addFieldIfExist('country', profileData.country || null);
    addFieldIfExist('profile_photo', photo);
    addFieldIfExist('avatar', photo);
    addFieldIfExist('bio', profileData.bio || null);
    addFieldIfExist('primary_role', role);
    addFieldIfExist('role', role);
    addFieldIfExist('batting_style', profileData.batting_style || null);
    addFieldIfExist('bowling_style', profileData.bowling_style || null);
    addFieldIfExist('bowling_type', profileData.bowling_type || null);
    addFieldIfExist('jersey_number', profileData.jersey_number || null);
    addFieldIfExist('preferred_team_id', dbTeamId);
    addFieldIfExist('team_id', dbTeamId);
    addFieldIfExist('age', profileData.age ?? null);

    if (updateFields.length > 0) {
      bindings.push(id);
      await sqliteService.run(
        `UPDATE players SET ${updateFields.join(', ')} WHERE id = ?;`,
        bindings
      );
    }

    if (original.length > 0) {
      const origMobile = original[0].mobile;
      await sqliteService.run(
        `UPDATE users
         SET name = COALESCE(?, name),
             mobile = COALESCE(?, mobile)
         WHERE mobile = ?;`,
        [name, profileData.mobile || null, origMobile]
      );

      try {
        const { Preferences } = await import('@capacitor/preferences');
        const sessionVal = await Preferences.get({ key: 'criclab_user_session' });
        if (sessionVal.value) {
          const parsed = JSON.parse(sessionVal.value);
          if (parsed.name === name || parsed.mobile === origMobile) {
            parsed.name = name || parsed.name;
            parsed.mobile = profileData.mobile || parsed.mobile;
            await Preferences.set({
              key: 'criclab_user_session',
              value: JSON.stringify(parsed)
            });
          }
        }
      } catch (err) {
        console.error("Failed to sync updated profile to session Preferences", err);
      }
    }

    const updated = await this.getPlayerProfile(id);
    return updated.player;
  },

  async getPlayerRankings(): Promise<PlayerRankings> {
    try {
      const meta = await sqliteService.getPlayerQueryMeta();

      const battersRaw = await sqliteService.query(
        `SELECT p.id, ${meta.nameExpr} as name, t.name as team_name, ${meta.photoExpr} as avatar, SUM(b.runs) as runs, SUM(b.sixes) as sixes,
                CASE WHEN SUM(b.balls) > 0 THEN (CAST(SUM(b.runs) AS REAL) / SUM(b.balls)) * 100 ELSE 0.0 END as sr
         FROM v2_player_match_stats b
         JOIN players p ON b.player_id = p.id
         LEFT JOIN teams t ON ${meta.teamIdExpr} = t.id
         WHERE p.deleted_at IS NULL
         GROUP BY p.id
         ORDER BY runs DESC
         LIMIT 5;`
      );
      const batters: RankingItem[] = battersRaw.map(r => ({
        id: r.id,
        name: r.name || 'Unknown',
        team_name: r.team_name || 'Free Agent',
        avatar: r.avatar,
        runs: r.runs,
        wickets: 0,
        sixes: r.sixes,
        sr: Number(r.sr || 0).toFixed(2),
        mvp: 0
      }));

      const bowlersRaw = await sqliteService.query(
        `SELECT p.id, ${meta.nameExpr} as name, t.name as team_name, ${meta.photoExpr} as avatar, SUM(b.wickets) as wickets
         FROM v2_bowler_match_stats b
         JOIN players p ON b.player_id = p.id
         LEFT JOIN teams t ON ${meta.teamIdExpr} = t.id
         WHERE p.deleted_at IS NULL
         GROUP BY p.id
         ORDER BY wickets DESC
         LIMIT 5;`
      );
      const bowlers: RankingItem[] = bowlersRaw.map(r => ({
        id: r.id,
        name: r.name || 'Unknown',
        team_name: r.team_name || 'Free Agent',
        avatar: r.avatar,
        runs: 0,
        wickets: r.wickets,
        sixes: 0,
        sr: '0.00',
        mvp: 0
      }));

      const sixesRaw = await sqliteService.query(
        `SELECT p.id, ${meta.nameExpr} as name, t.name as team_name, ${meta.photoExpr} as avatar, SUM(b.sixes) as sixes
         FROM v2_player_match_stats b
         JOIN players p ON b.player_id = p.id
         LEFT JOIN teams t ON ${meta.teamIdExpr} = t.id
         WHERE p.deleted_at IS NULL
         GROUP BY p.id
         ORDER BY sixes DESC
         LIMIT 5;`
      );
      const sixes: RankingItem[] = sixesRaw.map(r => ({
        id: r.id,
        name: r.name || 'Unknown',
        team_name: r.team_name || 'Free Agent',
        avatar: r.avatar,
        runs: 0,
        wickets: 0,
        sixes: r.sixes,
        sr: '0.00',
        mvp: 0
      }));

      const srRaw = await sqliteService.query(
        `SELECT p.id, ${meta.nameExpr} as name, t.name as team_name, ${meta.photoExpr} as avatar, SUM(b.runs) as runs,
                (CAST(SUM(b.runs) AS REAL) / SUM(b.balls)) * 100 as sr
         FROM v2_player_match_stats b
         JOIN players p ON b.player_id = p.id
         LEFT JOIN teams t ON ${meta.teamIdExpr} = t.id
         WHERE p.deleted_at IS NULL
         GROUP BY p.id
         HAVING SUM(b.balls) >= 15
         ORDER BY sr DESC
         LIMIT 5;`
      );
      const strike_rates: RankingItem[] = srRaw.map(r => ({
        id: r.id,
        name: r.name || 'Unknown',
        team_name: r.team_name || 'Free Agent',
        avatar: r.avatar,
        runs: r.runs,
        wickets: 0,
        sixes: 0,
        sr: Number(r.sr || 0).toFixed(2),
        mvp: 0
      }));

      const mvpRaw = await sqliteService.query(
        `SELECT p.id, ${meta.nameExpr} as name, t.name as team_name, ${meta.photoExpr} as avatar,
                (COALESCE(bat.runs, 0) + COALESCE(bowl.wickets, 0) * 20 + COALESCE(fld.catches, 0) * 10 + COALESCE(bat.sixes, 0) * 5 + COALESCE(bat.fours, 0) * 2 + COALESCE(bowl.maidens, 0) * 25) as mvp,
                COALESCE(bat.runs, 0) as runs,
                COALESCE(bowl.wickets, 0) as wickets
         FROM players p
         LEFT JOIN teams t ON ${meta.teamIdExpr} = t.id
         LEFT JOIN (SELECT player_id, SUM(runs) as runs, SUM(sixes) as sixes, SUM(fours) as fours FROM v2_player_match_stats GROUP BY player_id) bat ON bat.player_id = p.id
         LEFT JOIN (SELECT player_id, SUM(wickets) as wickets, SUM(maidens) as maidens FROM v2_bowler_match_stats GROUP BY player_id) bowl ON bowl.player_id = p.id
         LEFT JOIN (SELECT player_id, SUM(catches) as catches FROM v2_fielding_match_stats GROUP BY player_id) fld ON fld.player_id = p.id
         WHERE p.deleted_at IS NULL
         ORDER BY mvp DESC
         LIMIT 5;`
      );
      const mvp: RankingItem[] = mvpRaw.map(r => ({
        id: r.id,
        name: r.name || 'Unknown',
        team_name: r.team_name || 'Free Agent',
        avatar: r.avatar,
        runs: r.runs,
        wickets: r.wickets,
        sixes: 0,
        sr: '0.00',
        mvp: Math.round(r.mvp || 0)
      }));

      return {
        batters,
        bowlers,
        sixes,
        strike_rates,
        mvp
      };
    } catch (err) {
      console.error("Failed to load rankings, returning fallback empty stats:", err);
      return {
        batters: [],
        bowlers: [],
        sixes: [],
        strike_rates: [],
        mvp: []
      };
    }
  },

  async searchPlayers(query: string): Promise<Player[]> {
    const meta = await sqliteService.getPlayerQueryMeta();
    
    // Build query using existing columns only
    const queryParts = [`SELECT p.*, ${meta.nameExpr} as resolved_name, ${meta.photoExpr} as resolved_photo, t.name as team_name
       FROM players p
       LEFT JOIN teams t ON ${meta.teamIdExpr} = t.id
       WHERE p.deleted_at IS NULL`];
    
    const bindings: any[] = [];
    if (meta.filterFields.length > 0) {
      queryParts.push(`AND (${meta.filterFields.join(' OR ')})`);
      meta.filterFields.forEach(() => {
        bindings.push(`%${query}%`);
      });
    }

    const rows = await sqliteService.query(queryParts.join(' '), bindings);
    return rows.map(r => {
      const nameVal = r.resolved_name || '';
      const roleVal = r.primary_role || r.role || '';
      const photoVal = r.resolved_photo || '';

      return {
        id: r.id,
        name: nameVal,
        full_name: r.full_name || nameVal,
        preferred_team_id: r.preferred_team_id || r.team_id,
        team_id: r.preferred_team_id || r.team_id,
        team_name: r.team_name,
        team: (r.preferred_team_id || r.team_id) ? { id: (r.preferred_team_id || r.team_id), name: r.team_name } : undefined,
        mobile: r.mobile,
        email: r.email,
        dob: r.dob,
        city: r.city,
        state: r.state,
        country: r.country,
        profile_photo: photoVal,
        avatar: photoVal,
        bio: r.bio,
        primary_role: roleVal,
        role: roleVal,
        batting_style: r.batting_style,
        bowling_style: r.bowling_style,
        bowling_type: r.bowling_type,
        jersey_number: r.jersey_number,
        created_by: r.created_by,
        created_at: r.created_at
      };
    });
  },

  async getManOfTheDay(): Promise<{
    player: Player | null;
    stats: {
      mvp: number;
      runs: number;
      wickets: number;
      catches: number;
    } | null;
    timeframe: string | null;
  }> {
    const mvpList = await this.getPlayerRankings();
    if (mvpList.mvp.length === 0) {
      return { player: null, stats: null, timeframe: null };
    }
    const top = mvpList.mvp[0];
    
    const fldRows = await sqliteService.query("SELECT SUM(catches) as catches FROM v2_fielding_match_stats WHERE player_id = ?;", [top.id]);
    const catches = fldRows[0]?.catches || 0;

    return {
      player: {
        id: top.id,
        name: top.name,
        full_name: top.name,
        preferred_team_id: '',
        team_id: '',
        team_name: top.team_name,
        avatar: top.avatar,
        profile_photo: top.avatar
      },
      stats: {
        mvp: top.mvp,
        runs: top.runs,
        wickets: top.wickets,
        catches
      },
      timeframe: 'Overall'
    };
  },
};
