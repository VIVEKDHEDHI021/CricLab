export const V2_SCHEMA_QUERIES = [
  // 1. Matches table
  `CREATE TABLE IF NOT EXISTS v2_matches (
    id TEXT PRIMARY KEY,
    team_a_id TEXT,
    team_b_id TEXT,
    overs INTEGER DEFAULT 6,
    wide_run INTEGER DEFAULT 1,
    noball_run INTEGER DEFAULT 1,
    match_type TEXT,
    ground TEXT,
    match_date TEXT NOT NULL,
    status TEXT DEFAULT 'upcoming',
    result TEXT,
    batting_first_id TEXT,
    current_innings INTEGER DEFAULT 1,
    last_man_batting INTEGER DEFAULT 0,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`,

  // 2. Innings table
  `CREATE TABLE IF NOT EXISTS v2_innings (
    id TEXT PRIMARY KEY,
    match_id TEXT REFERENCES v2_matches(id) ON DELETE CASCADE,
    innings_no INTEGER NOT NULL,
    batting_team_id TEXT,
    bowling_team_id TEXT,
    runs INTEGER DEFAULT 0,
    wickets INTEGER DEFAULT 0,
    legal_balls INTEGER DEFAULT 0,
    is_closed INTEGER DEFAULT 0,
    UNIQUE(match_id, innings_no)
  );`,

  // 3. Ball Events table
  `CREATE TABLE IF NOT EXISTS v2_ball_events (
    event_uuid TEXT PRIMARY KEY,
    match_id TEXT REFERENCES v2_matches(id) ON DELETE CASCADE,
    innings_no INTEGER NOT NULL,
    over_no INTEGER NOT NULL,
    ball_no INTEGER NOT NULL,
    striker_id TEXT NOT NULL,
    non_striker_id TEXT NOT NULL,
    bowler_id TEXT NOT NULL,
    runs_off_bat INTEGER DEFAULT 0,
    extras INTEGER DEFAULT 0,
    extra_type TEXT,
    wicket INTEGER DEFAULT 0,
    wicket_type TEXT,
    dismissed_player_id TEXT,
    timestamp INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    sequence_number INTEGER NOT NULL,
    version INTEGER DEFAULT 1,
    metadata TEXT,
    superseded_by TEXT,
    is_superseded INTEGER DEFAULT 0
  );`,

  // 4. Match Snapshot table
  `CREATE TABLE IF NOT EXISTS v2_match_snapshots (
    match_id TEXT PRIMARY KEY REFERENCES v2_matches(id) ON DELETE CASCADE,
    innings_no INTEGER DEFAULT 1,
    team_score INTEGER DEFAULT 0,
    wickets INTEGER DEFAULT 0,
    overs INTEGER DEFAULT 0,
    balls INTEGER DEFAULT 0,
    legal_deliveries INTEGER DEFAULT 0,
    extras INTEGER DEFAULT 0,
    boundaries INTEGER DEFAULT 0,
    sixes INTEGER DEFAULT 0,
    current_batter_id TEXT,
    non_striker_id TEXT,
    current_bowler_id TEXT,
    partnership_runs INTEGER DEFAULT 0,
    partnership_balls INTEGER DEFAULT 0,
    current_over_no INTEGER DEFAULT 0,
    balls_remaining_in_over INTEGER DEFAULT 6,
    current_run_rate REAL DEFAULT 0.0,
    required_run_rate REAL,
    target INTEGER,
    runs_required INTEGER,
    balls_remaining INTEGER,
    projected_score INTEGER DEFAULT 0,
    innings_status TEXT DEFAULT 'active',
    match_status TEXT DEFAULT 'upcoming',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`,

  // 5. Player Match Stats table (Batting)
  `CREATE TABLE IF NOT EXISTS v2_player_match_stats (
    id TEXT PRIMARY KEY,
    match_id TEXT REFERENCES v2_matches(id) ON DELETE CASCADE,
    innings_no INTEGER DEFAULT 1,
    player_id TEXT NOT NULL,
    runs INTEGER DEFAULT 0,
    balls INTEGER DEFAULT 0,
    fours INTEGER DEFAULT 0,
    sixes INTEGER DEFAULT 0,
    strike_rate REAL DEFAULT 0.0,
    dot_balls INTEGER DEFAULT 0,
    singles INTEGER DEFAULT 0,
    doubles INTEGER DEFAULT 0,
    triples INTEGER DEFAULT 0,
    highest_score INTEGER DEFAULT 0,
    is_out INTEGER DEFAULT 0,
    dismissal_type TEXT,
    bowler_id TEXT,
    UNIQUE(match_id, player_id)
  );`,

  // 6. Bowler Match Stats table
  `CREATE TABLE IF NOT EXISTS v2_bowler_match_stats (
    id TEXT PRIMARY KEY,
    match_id TEXT REFERENCES v2_matches(id) ON DELETE CASCADE,
    innings_no INTEGER DEFAULT 1,
    player_id TEXT NOT NULL,
    overs TEXT DEFAULT '0.0',
    runs_conceded INTEGER DEFAULT 0,
    wickets INTEGER DEFAULT 0,
    economy REAL DEFAULT 0.0,
    maidens INTEGER DEFAULT 0,
    dot_balls INTEGER DEFAULT 0,
    wides INTEGER DEFAULT 0,
    noballs INTEGER DEFAULT 0,
    fours_conceded INTEGER DEFAULT 0,
    sixes_conceded INTEGER DEFAULT 0,
    bowling_average REAL DEFAULT 0.0,
    strike_rate REAL DEFAULT 0.0,
    UNIQUE(match_id, player_id)
  );`,

  // 7. Fielding Stats table
  `CREATE TABLE IF NOT EXISTS v2_fielding_match_stats (
    id TEXT PRIMARY KEY,
    match_id TEXT REFERENCES v2_matches(id) ON DELETE CASCADE,
    innings_no INTEGER DEFAULT 1,
    player_id TEXT NOT NULL,
    catches INTEGER DEFAULT 0,
    run_outs INTEGER DEFAULT 0,
    stumpings INTEGER DEFAULT 0,
    direct_hits INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    UNIQUE(match_id, player_id)
  );`,

  // 8. Partnerships table
  `CREATE TABLE IF NOT EXISTS v2_partnerships (
    id TEXT PRIMARY KEY,
    match_id TEXT REFERENCES v2_matches(id) ON DELETE CASCADE,
    innings_no INTEGER NOT NULL,
    batsman1_id TEXT NOT NULL,
    batsman2_id TEXT NOT NULL,
    runs INTEGER DEFAULT 0,
    balls INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1
  );`,

  // 10. Audit Logs table
  `CREATE TABLE IF NOT EXISTS v2_audit_logs (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT,
    timestamp INTEGER NOT NULL
  );`,

  // 11. Milestone Events table
  `CREATE TABLE IF NOT EXISTS v2_milestone_events (
    id TEXT PRIMARY KEY,
    match_id TEXT REFERENCES v2_matches(id) ON DELETE CASCADE,
    innings_no INTEGER NOT NULL,
    player_id TEXT,
    milestone_type TEXT NOT NULL,
    value INTEGER NOT NULL,
    timestamp INTEGER NOT NULL
  );`,

  // 12. Match Awards table
  `CREATE TABLE IF NOT EXISTS v2_match_awards (
    match_id TEXT PRIMARY KEY REFERENCES v2_matches(id) ON DELETE CASCADE,
    player_of_match TEXT,
    best_batter TEXT,
    best_bowler TEXT,
    best_partnership TEXT,
    most_sixes_player TEXT,
    most_fours_player TEXT,
    best_economy_player TEXT
  );`,

  // Indexes for fast lookup
  `CREATE INDEX IF NOT EXISTS idx_v2_ball_events_match ON v2_ball_events(match_id);`,
  `CREATE INDEX IF NOT EXISTS idx_v2_ball_events_seq ON v2_ball_events(match_id, sequence_number);`,
  `CREATE INDEX IF NOT EXISTS idx_v2_ball_events_is_superseded ON v2_ball_events(match_id, innings_no, is_superseded);`,
  `CREATE INDEX IF NOT EXISTS idx_v2_ball_events_striker ON v2_ball_events(match_id, innings_no, striker_id);`,
  `CREATE INDEX IF NOT EXISTS idx_v2_ball_events_bowler ON v2_ball_events(match_id, innings_no, bowler_id);`,
  `CREATE INDEX IF NOT EXISTS idx_v2_innings_match ON v2_innings(match_id);`,
  `CREATE INDEX IF NOT EXISTS idx_v2_player_stats_match ON v2_player_match_stats(match_id);`,
  `CREATE INDEX IF NOT EXISTS idx_v2_bowler_stats_match ON v2_bowler_match_stats(match_id);`,
  `CREATE INDEX IF NOT EXISTS idx_v2_fielding_stats_match ON v2_fielding_match_stats(match_id);`,
  `CREATE INDEX IF NOT EXISTS idx_v2_partnerships_match ON v2_partnerships(match_id);`,
  `CREATE INDEX IF NOT EXISTS idx_v2_milestones_match ON v2_milestone_events(match_id);`
];
