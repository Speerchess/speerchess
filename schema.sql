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
    is_vip BOOLEAN DEFAULT 0,            -- VIP status (5,000 games & 30 moves)
    vip_key TEXT,                        -- Applied VIP activation key
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

-- 4. User Opening Trees Table (Compressed FEN Trees for 1,000 / 5,000 games)
CREATE TABLE IF NOT EXISTS user_opening_trees (
    user_id TEXT PRIMARY KEY,            -- Foreign key to users.id
    is_vip BOOLEAN DEFAULT 0,            -- 1: VIP 5000 games / 30 moves, 0: Regular 1000 games / 15 moves
    max_ply INTEGER DEFAULT 30,          -- Max half-moves recorded (30 ply or 60 ply)
    total_games INTEGER DEFAULT 0,       -- Number of games indexed
    tree_json TEXT NOT NULL,             -- Compressed Opening Tree Dictionary JSON
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_opening_trees_user ON user_opening_trees(user_id);
