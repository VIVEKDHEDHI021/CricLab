import api from '@/lib/api';

export type MatchDetail = {
  m: any;
  teams: any[];
  innings: any[];
  players: any[];
  balls: any[];
};

export type BackupRegistryEntry = {
  matchId: string;
  date: string;
  teams: string;
  result: string;
  version: number;
  status: 'Exported' | 'Pending';
};

// Deterministic hashing/checksum function for data integrity verification
export function generateChecksum(data: any): string {
  const dataCopy = { ...data };
  dataCopy.backupMetadata = undefined;
  dataCopy.checksum = undefined;
  const str = JSON.stringify(dataCopy);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

export const backupService = {
  async exportBackup(): Promise<any> {
    const { data } = await api.get('/backup/export');
    return data;
  },

  async importBackup(file: File): Promise<{ status: string; message: string }> {
    const formData = new FormData();
    formData.append('backup_file', file);
    const { data } = await api.post('/backup/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },

  // Generates single-match JSON payload directly on the client side
  generateSingleMatchBackupJSON(matchId: string, detail: MatchDetail): any {
    const localVersion = parseInt(localStorage.getItem(`criclab_match_local_version_${matchId}`) || '1', 10);
    const cloudVersion = parseInt(localStorage.getItem(`criclab_match_cloud_version_${matchId}`) || '1', 10);
    const correctionVersion = parseInt(localStorage.getItem(`criclab_match_correction_version_${matchId}`) || '1', 10);
    const backupVersion = Math.max(localVersion, cloudVersion, correctionVersion);

    const match = detail.m;
    const teams = detail.teams || [];
    const players = detail.players || [];
    const innings = detail.innings || [];
    const balls = detail.balls || [];

    // Calculate Batting Statistics
    const battingStatistics = players.map((p: any) => {
      const batBalls = balls.filter((b: any) => b.batter_id === p.id);
      const runs = batBalls.reduce((sum: number, b: any) => sum + (b.runs || 0), 0);
      const ballsFaced = batBalls.filter((b: any) => b.extra_type !== "wide").length;
      const fours = batBalls.filter((b: any) => b.runs === 4).length;
      const sixes = batBalls.filter((b: any) => b.runs === 6).length;
      const strikeRate = ballsFaced > 0 ? (runs / ballsFaced) * 100 : 0;
      const isOut = balls.some((b: any) => b.is_wicket && b.batter_id === p.id && b.wicket_type !== "retired_hurt");
      return {
        playerId: p.id,
        playerName: p.name,
        runs,
        ballsFaced,
        fours,
        sixes,
        strikeRate,
        isOut
      };
    });

    // Calculate Bowling Statistics
    const bowlingStatistics = players.map((p: any) => {
      const bowlBalls = balls.filter((b: any) => b.bowler_id === p.id);
      const wickets = bowlBalls.filter((b: any) => b.is_wicket && b.wicket_type !== "run_out" && b.wicket_type !== "retired_hurt").length;
      const runsConceded = bowlBalls.reduce((sum: number, b: any) => sum + (b.runs || 0), 0) + 
                            bowlBalls.filter((b: any) => b.extra_type === "wide" || b.extra_type === "no_ball")
                                     .reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
      const legalBallsBowled = bowlBalls.filter((b: any) => b.is_legal).length;
      const economy = legalBallsBowled > 0 ? (runsConceded / (legalBallsBowled / 6)) : 0;

      // Calculate Maidens
      const oversGrouped = bowlBalls.reduce((acc: any, b: any) => {
        const key = `${b.innings_id}_${b.over_number}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(b);
        return acc;
      }, {});
      
      let maidens = 0;
      Object.values(oversGrouped).forEach((overBalls: any) => {
        const legalInOver = overBalls.filter((b: any) => b.is_legal).length;
        if (legalInOver >= 6) {
          const overRuns = overBalls.reduce((sum: number, b: any) => sum + (b.runs || 0), 0) + 
                           overBalls.filter((b: any) => b.extra_type === "wide" || b.extra_type === "no_ball")
                                    .reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
          if (overRuns === 0) {
            maidens++;
          }
        }
      });

      return {
        playerId: p.id,
        playerName: p.name,
        overs: `${Math.floor(legalBallsBowled / 6)}.${legalBallsBowled % 6}`,
        runsConceded,
        wickets,
        economy,
        maidens
      };
    }).filter(b => parseFloat(b.overs) > 0);

    // Calculate Extras
    const extras = innings.map((inn: any) => {
      const innBalls = balls.filter((b: any) => b.innings_id === inn.id);
      const wides = innBalls.filter((b: any) => b.extra_type === "wide").reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
      const noBalls = innBalls.filter((b: any) => b.extra_type === "no_ball").reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
      const byes = innBalls.filter((b: any) => b.extra_type === "bye").reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
      const legByes = innBalls.filter((b: any) => b.extra_type === "leg_bye").reduce((sum: number, b: any) => sum + (b.extra_runs || 0), 0);
      return {
        inningsId: inn.id,
        inningsNo: inn.innings_no,
        wides,
        noBalls,
        byes,
        legByes,
        total: wides + noBalls + byes + legByes
      };
    });

    // Calculate partnerships
    const partnerships: any[] = [];
    innings.forEach((inn: any) => {
      const innBalls = balls.filter((b: any) => b.innings_id === inn.id);
      // Simple partnership aggregator based on wicket events
      let currentRuns = 0;
      let currentBalls = 0;
      let p1Id = '';
      let p2Id = '';
      innBalls.forEach((b: any) => {
        if (!p1Id) p1Id = b.batter_id;
        if (!p2Id && b.non_striker_id !== p1Id) p2Id = b.non_striker_id;

        currentRuns += (b.runs || 0) + (b.extra_type === 'wide' || b.extra_type === 'no_ball' ? (b.extra_runs || 0) : 0);
        if (b.is_legal) currentBalls++;

        if (b.is_wicket) {
          const p1 = players.find((p: any) => p.id === p1Id)?.name || 'Unknown';
          const p2 = players.find((p: any) => p.id === p2Id)?.name || 'Unknown';
          partnerships.push({
            inningsId: inn.id,
            batsman1: p1,
            batsman2: p2,
            runs: currentRuns,
            balls: currentBalls
          });
          currentRuns = 0;
          currentBalls = 0;
          p1Id = '';
          p2Id = '';
        }
      });
      if (currentBalls > 0 || currentRuns > 0) {
        const p1 = players.find((p: any) => p.id === p1Id)?.name || 'Unknown';
        const p2 = players.find((p: any) => p.id === p2Id)?.name || 'Unknown';
        partnerships.push({
          inningsId: inn.id,
          batsman1: p1,
          batsman2: p2,
          runs: currentRuns,
          balls: currentBalls
        });
      }
    });

    // MVP / Impact Scores
    const impactScores = battingStatistics.map((bat: any) => {
      const bowl = bowlingStatistics.find(b => b.playerId === bat.playerId) || { wickets: 0, maidens: 0 };
      const catches = balls.filter((b: any) => b.is_wicket && b.wicket_type === "caught" && b.caught_by_id === bat.playerId).length;
      const impactScore = bat.runs + (bowl.wickets * 20) + (catches * 10) + (bat.sixes * 5) + (bat.fours * 2) + (bowl.maidens * 25);
      return {
        playerId: bat.playerId,
        playerName: bat.playerName,
        score: impactScore
      };
    }).sort((a, b) => b.score - a.score);

    // Awards
    const sortedBatters = [...battingStatistics].sort((a, b) => b.runs - a.runs);
    const sortedBowlers = [...bowlingStatistics].sort((a, b) => b.wickets - a.wickets);
    const awards = {
      manOfTheMatch: impactScores[0]?.playerName || 'N/A',
      bestBatsman: sortedBatters[0]?.playerName || 'N/A',
      bestBatsmanRuns: sortedBatters[0]?.runs || 0,
      bestBowler: sortedBowlers[0]?.playerName || 'N/A',
      bestBowlerWickets: sortedBowlers[0]?.wickets || 0
    };

    const backupData: any = {
      backupVersion,
      generatedAt: new Date().toISOString(),
      appVersion: "1.1.0",
      serverVersion: 12,
      matches: [match],
      teams,
      players,
      innings,
      balls,
      battingStatistics,
      bowlingStatistics,
      partnerships,
      extras,
      matchSettings: {
        overs: match.overs,
        wide_run: match.wide_run,
        noball_run: match.noball_run,
        match_type: match.match_type,
        ground: match.ground,
        last_man_batting: match.last_man_batting
      },
      awards,
      impactScores,
      appreciations: [],
      heroCarouselData: {},
      notifications: [],
      correctionHistory: [],
      activityLogs: []
    };

    // Deterministic checksum generation
    const checksum = generateChecksum(backupData);
    backupData.backupMetadata = {
      backupVersion,
      generatedAt: backupData.generatedAt,
      appVersion: "1.1.0",
      serverVersion: 12,
      checksum
    };
    backupData.checksum = checksum;

    return backupData;
  },

  // Validates backup file content and checksum
  validateBackupJSON(data: any): { valid: boolean; error?: string } {
    try {
      if (!data || typeof data !== 'object') {
        return { valid: false, error: 'Invalid JSON format or empty file' };
      }

      // Check required entities lists
      const requiredKeys = ['teams', 'players', 'matches', 'innings', 'balls'];
      for (const key of requiredKeys) {
        if (!data[key] || !Array.isArray(data[key])) {
          return { valid: false, error: `Missing or invalid required data collection: '${key}'` };
        }
      }

      // Check checksum and metadata block
      if (!data.backupMetadata || !data.backupMetadata.checksum) {
        return { valid: false, error: 'Backup metadata or security integrity checksum is missing' };
      }

      const fileChecksum = data.backupMetadata.checksum;
      const computedChecksum = generateChecksum(data);

      if (fileChecksum !== computedChecksum) {
        return { valid: false, error: 'File integrity validation failed (checksum mismatch). This backup cannot be restored.' };
      }

      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: e.message || 'Error occurred during backup verification' };
    }
  },

  // Download logic using Blob and URL creation
  downloadBackupFile(filename: string, data: any): void {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Local storage management of backups and registry
  getBackupRegistry(): BackupRegistryEntry[] {
    const raw = localStorage.getItem('criclab_backup_registry');
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  },

  saveLocalBackup(matchId: string, data: any): void {
    // Save backup file data
    localStorage.setItem(`criclab_backup_data_${matchId}`, JSON.stringify(data));

    // Update Registry status to 'Exported'
    const registry = this.getBackupRegistry();
    const existingIdx = registry.findIndex(e => e.matchId === matchId);
    
    const match = data.matches[0];
    const teamA = data.teams.find((t: any) => t.id === match.team_a_id)?.name || 'Team A';
    const teamB = data.teams.find((t: any) => t.id === match.team_b_id)?.name || 'Team B';
    const dateStr = new Date(match.match_date).toISOString().split('T')[0];
    const version = data.backupVersion || 1;

    const entry: BackupRegistryEntry = {
      matchId,
      date: dateStr,
      teams: `${teamA} vs ${teamB}`,
      result: match.result || 'Match Completed',
      version,
      status: 'Exported'
    };

    if (existingIdx > -1) {
      registry[existingIdx] = entry;
    } else {
      registry.push(entry);
    }

    localStorage.setItem('criclab_backup_registry', JSON.stringify(registry));
  },

  markBackupPending(matchId: string, metadata: { date: string; teams: string; result: string; version: number }): void {
    const registry = this.getBackupRegistry();
    const existingIdx = registry.findIndex(e => e.matchId === matchId);

    const entry: BackupRegistryEntry = {
      matchId,
      date: metadata.date,
      teams: metadata.teams,
      result: metadata.result,
      version: metadata.version,
      status: 'Pending'
    };

    if (existingIdx > -1) {
      // Keep Exported if it is already Exported, otherwise update
      if (registry[existingIdx].status !== 'Exported') {
        registry[existingIdx] = entry;
      }
    } else {
      registry.push(entry);
    }

    localStorage.setItem('criclab_backup_registry', JSON.stringify(registry));
  },

  deleteLocalBackup(matchId: string): void {
    localStorage.removeItem(`criclab_backup_data_${matchId}`);
    
    // Mark as pending in registry
    const registry = this.getBackupRegistry();
    const entry = registry.find(e => e.matchId === matchId);
    if (entry) {
      entry.status = 'Pending';
      localStorage.setItem('criclab_backup_registry', JSON.stringify(registry));
    }
  },

  getLocalBackup(matchId: string): any | null {
    const raw = localStorage.getItem(`criclab_backup_data_${matchId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
};
