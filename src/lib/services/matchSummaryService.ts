import type { MatchSummary } from '@/components/MatchCard';
import { sqliteService } from './sqliteService';

type MatchRow = {
  id: string;
  status: string;
  created_by?: string;
  match_date: string;
  ground: string | null;
  match_type: string | null;
  overs: number;
  result: string | null;
  team_a_id: string;
  team_b_id: string;
  team_a_name?: string;
  team_b_name?: string;
  batting_first_id?: string | null;
  wide_run?: number;
  noball_run?: number;
  last_man_batting?: number;
};

function mapInningsRows(
  rows: Array<{
    innings_no: number;
    runs?: number | null;
    wickets?: number | null;
    legal_balls?: number | null;
    batting_team_id?: string | null;
  }>
): MatchSummary['innings'] {
  return rows.map((i) => ({
    innings_no: i.innings_no,
    runs: i.runs ?? 0,
    wickets: i.wickets ?? 0,
    legal_balls: i.legal_balls ?? 0,
    batting_team_id: i.batting_team_id ?? '',
  }));
}

/**
 * Builds the authoritative local match summary by reading innings data from v2_innings.
 */
export async function buildLocalMatchSummary(row: MatchRow): Promise<MatchSummary> {
  const inningsRows = await sqliteService.query(
    'SELECT innings_no, runs, wickets, legal_balls, batting_team_id FROM v2_innings WHERE match_id = ? ORDER BY innings_no ASC;',
    [row.id]
  );

  return {
    id: row.id,
    status: row.status,
    created_by: row.created_by,
    match_date: row.match_date,
    ground: row.ground,
    match_type: row.match_type,
    overs: row.overs,
    result: row.result,
    team_a: { id: row.team_a_id, name: row.team_a_name || 'Team A' },
    team_b: { id: row.team_b_id, name: row.team_b_name || 'Team B' },
    innings: mapInningsRows(inningsRows),
  };
}
