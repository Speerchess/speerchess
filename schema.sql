-- D1 Database Schema for speerchess

CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hashid TEXT UNIQUE NOT NULL,
    moves_sequence TEXT UNIQUE NOT NULL, -- Pure moves sequence without comments/headers (e.g. "e4 e5 Nf3 Nc6")
    pgn TEXT NOT NULL,                   -- Full analyzed PGN containing evaluations
    analysis_json TEXT NOT NULL,         -- GameAnalysis JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_games_hashid ON games(hashid);
CREATE INDEX IF NOT EXISTS idx_games_moves ON games(moves_sequence);
