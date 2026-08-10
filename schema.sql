-- D1 Database Schema for speerchess

-- 1. Analyzed Games Table
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

-- 2. Authenticated Users Table (Lichess OAuth)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                 -- Lichess User ID (lowercase, e.g. 'weeekly_chess')
    username TEXT NOT NULL,              -- Display username
    access_token TEXT,                   -- Lichess OAuth Access Token
    avatar_url TEXT,                     -- Profile avatar URL
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Linked Accounts Table (Chess.com or Sub-accounts)
CREATE TABLE IF NOT EXISTS linked_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,               -- Foreign key to users.id
    platform TEXT NOT NULL,              -- 'lichess' or 'chesscom'
    platform_username TEXT NOT NULL,     -- Username on that platform
    is_primary BOOLEAN DEFAULT 0,        -- Whether this is the primary login account
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, platform, platform_username)
);

CREATE INDEX IF NOT EXISTS idx_linked_accounts_user ON linked_accounts(user_id);
