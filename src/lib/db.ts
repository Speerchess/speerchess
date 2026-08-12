import { Chess } from 'chess.js';

export interface GameRecord {
  hashid: string;
  moves_sequence: string;
  pgn: string;
  analysis_json: string;
  created_at?: string;
}

export interface UserRecord {
  id: string;
  username: string;
  access_token?: string;
  avatar_url?: string;
  role?: UserTier;
  is_vip?: boolean | number;
  vip_key?: string;
  created_at?: string;
  last_login_at?: string;
}

export interface LinkedAccountRecord {
  id?: number;
  user_id: string;
  platform: 'lichess' | 'chesscom';
  platform_username: string;
  is_primary?: boolean;
  created_at?: string;
}

// Simple Base62 Hashids generator helper (No dependencies, Cloudflare edge compatible)
export class SimpleHashids {
  private alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
  private salt: string;
  private minLength: number;

  constructor(salt: string, minLength: number = 6) {
    this.salt = salt || "speerchess-salt-secret";
    this.minLength = minLength;
  }

  encode(id: number): string {
    let saltHash = 0;
    for (let i = 0; i < this.salt.length; i++) {
      saltHash = (saltHash * 31 + this.salt.charCodeAt(i)) % 1000000007;
    }
    
    // Scramble the auto-increment ID
    const scrambled = (id ^ saltHash) >>> 0;
    
    let num = scrambled;
    let res = "";
    while (num > 0) {
      res = this.alphabet[num % 62] + res;
      num = Math.floor(num / 62);
    }
    
    // Pad to minLength
    while (res.length < this.minLength) {
      res = this.alphabet[(res.length * 17 + saltHash + id) % 62] + res;
    }
    return res;
  }
}

// Minify analysis_json to save database size
export function minifyAnalysisJson(analysisJsonStr: string): string {
  try {
    const data = JSON.parse(analysisJsonStr);
    if (!data.moves) return analysisJsonStr;

    // Check if it's already minified
    if (data.m && Array.isArray(data.m)) return analysisJsonStr;

    const minified = {
      m: data.moves.map((m: any) => ({
        s: m.san,
        e: m.evaluation,
        c: m.classification,
        a: m.accuracy
      })),
      wAc: data.whiteAccuracy,
      bAc: data.blackAccuracy,
      wPf: data.whitePerformance,
      bPf: data.blackPerformance,
      wElo: data.whiteElo ?? 1500,
      bElo: data.blackElo ?? 1500
    };
    return JSON.stringify(minified);
  } catch (e) {
    console.error("Failed to minify analysis_json:", e);
    return analysisJsonStr;
  }
}

// Reconstruct evaluationHistory, classificationTally and coordinate fields (from/to) from minified JSON
export function expandAnalysisJson(minifiedJsonStr: string): string {
  try {
    const data = JSON.parse(minifiedJsonStr);
    
    // Check if it is already expanded
    if (data.moves && Array.isArray(data.moves)) {
      return minifiedJsonStr;
    }

    if (!data.m || !Array.isArray(data.m)) {
      return minifiedJsonStr;
    }

    const chess = new Chess();
    const moves: any[] = [];
    const minifiedMoves: any[] = data.m;

    for (const mm of minifiedMoves) {
      let from = '';
      let to = '';
      try {
        const moveResult = chess.move(mm.s);
        from = moveResult.from;
        to = moveResult.to;
      } catch (err) {
        // Fallback for coordinate parsing issues
      }

      moves.push({
        san: mm.s,
        from,
        to,
        evaluation: mm.e,
        classification: mm.c,
        accuracy: mm.a
      });
    }

    const evaluationHistory: number[] = [0];
    moves.forEach((m, idx) => {
      const evalFromWhite = idx % 2 === 0 ? m.evaluation : -m.evaluation;
      evaluationHistory.push(evalFromWhite);
    });

    const tallyTemplate = () => ({
      'Brilliant': 0, 'Great': 0, 'Best': 0, 'Excellent': 0, 'Good': 0,
      'Inaccuracy': 0, 'Mistake': 0, 'Blunder': 0, 'Book': 0, 'Forced': 0
    });
    
    const classificationTally: any = {
      white: tallyTemplate(),
      black: tallyTemplate()
    };

    moves.forEach((m, idx) => {
      const isWhiteTurn = idx % 2 === 0;
      const cls = m.classification;
      if (isWhiteTurn) {
        if (classificationTally.white[cls] !== undefined) {
          classificationTally.white[cls]++;
        }
      } else {
        if (classificationTally.black[cls] !== undefined) {
          classificationTally.black[cls]++;
        }
      }
    });

    const expanded = {
      moves,
      whiteAccuracy: data.wAc,
      blackAccuracy: data.bAc,
      whitePerformance: data.wPf,
      blackPerformance: data.bPf,
      evaluationHistory,
      classificationTally,
      whiteElo: data.wElo,
      blackElo: data.bElo
    };

    return JSON.stringify(expanded);
  } catch (e) {
    console.error("Failed to expand analysis_json:", e);
    return minifiedJsonStr;
  }
}

function loadFallbackFile<T>(filename: string, fallback: T): T {
  try {
    if (typeof window === 'undefined' && !process.env.DB) {
      const fs = require('fs');
      if (fs.existsSync(filename)) {
        return JSON.parse(fs.readFileSync(filename, 'utf-8'));
      }
    }
  } catch (e) {}
  return fallback;
}

function saveFallbackFile<T>(filename: string, data: T) {
  try {
    if (typeof window === 'undefined' && !process.env.DB) {
      const fs = require('fs');
      fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf-8');
    }
  } catch (e) {}
}

function loadFallbackDb(): GameRecord[] {
  return loadFallbackFile<GameRecord[]>('./db_fallback.json', []);
}

function saveFallbackDb(db: GameRecord[]) {
  saveFallbackFile('./db_fallback.json', db);
}

// In-memory runtime cache with local file persistence for local dev
interface RuntimeMemoryStore {
  games: GameRecord[];
  users: Record<string, UserRecord>;
  linkedAccounts: LinkedAccountRecord[];
  openingTrees: Record<string, OpeningTreeRecord>;
  vipUsers: Record<string, { isVip: boolean | number; tier?: UserTier; vipKey?: string }>;
}

const memoryStore: RuntimeMemoryStore = {
  games: loadFallbackDb(),
  users: loadFallbackFile<Record<string, UserRecord>>('./users_fallback.json', {}),
  linkedAccounts: loadFallbackFile<LinkedAccountRecord[]>('./accounts_fallback.json', []),
  openingTrees: loadFallbackFile<Record<string, OpeningTreeRecord>>('./opening_trees_fallback.json', {}),
  vipUsers: loadFallbackFile<Record<string, any>>('./vip_fallback.json', {})
};

let schemaInitialized = false;

// Auto-bootstrap all missing tables on D1
export async function ensureSchema(db: any) {
  if (!db || schemaInitialized) return;
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hashid TEXT UNIQUE NOT NULL,
        moves_sequence TEXT UNIQUE NOT NULL,
        pgn TEXT NOT NULL,
        analysis_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        access_token TEXT,
        avatar_url TEXT,
        role TEXT DEFAULT 'free',
        is_vip INTEGER DEFAULT 0,
        vip_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS linked_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        platform_username TEXT NOT NULL,
        is_primary BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, platform, platform_username)
      );`,
      `CREATE TABLE IF NOT EXISTS user_opening_trees (
        user_id TEXT PRIMARY KEY,
        is_vip INTEGER DEFAULT 0,
        max_ply INTEGER DEFAULT 30,
        total_games INTEGER DEFAULT 0,
        tree_json TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`
    ];

    for (const sql of statements) {
      await db.prepare(sql).run();
    }

    // Try adding role column if old table exists
    try {
      await db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'free'").run();
    } catch (e) {}

    schemaInitialized = true;
  } catch (e) {
    console.error("Auto ensureSchema error:", e);
  }
}

// Fetch database D1 binding or fallback
export async function getDb() {
  const db = (process.env as any).DB || null;
  if (db && !schemaInitialized) {
    await ensureSchema(db);
  }
  return db;
}

// Get game by hashid
export async function getGameRecord(hashid: string): Promise<GameRecord | null> {
  const db = await getDb();
  if (db) {
    try {
      const record = await db.prepare("SELECT * FROM games WHERE hashid = ?").bind(hashid).first();
      if (record) {
        return {
          hashid: record.hashid as string,
          moves_sequence: record.moves_sequence as string,
          pgn: record.pgn as string,
          analysis_json: expandAnalysisJson(record.analysis_json as string),
          created_at: record.created_at as string
        };
      }
    } catch (e) {
      await ensureSchema(db);
    }
  }
  
  const found = memoryStore.games.find(r => r.hashid === hashid);
  if (found) {
    return {
      ...found,
      analysis_json: expandAnalysisJson(found.analysis_json)
    };
  }
  return null;
}

// Save game record and return hashid
export async function saveGameRecord(
  pgn: string,
  analysisJson: string,
  movesSequence: string,
  salt: string
): Promise<string> {
  const db = await getDb();
  const hashids = new SimpleHashids(salt, 6);
  const minifiedAnalysisJson = minifyAnalysisJson(analysisJson);

  if (db) {
    try {
      const existing = await db.prepare("SELECT hashid FROM games WHERE moves_sequence = ?").bind(movesSequence).first();
      if (existing) {
        return existing.hashid as string;
      }

      const insertResult = await db.prepare(
        "INSERT INTO games (hashid, moves_sequence, pgn, analysis_json) VALUES (?, ?, ?, ?)"
      )
      .bind("TEMP_HASHID", movesSequence, pgn, minifiedAnalysisJson)
      .run();

      const insertId = insertResult.meta.last_row_id;
      const finalHashid = hashids.encode(insertId);

      await db.prepare("UPDATE games SET hashid = ? WHERE id = ?").bind(finalHashid, insertId).run();
      return finalHashid;
    } catch (e) {
      await ensureSchema(db);
    }
  }

  // Memory fallback
  const existing = memoryStore.games.find(r => r.moves_sequence === movesSequence);
  if (existing) return existing.hashid;

  const nextId = memoryStore.games.length + 1;
  const finalHashid = hashids.encode(nextId);
  const newRecord: GameRecord = {
    hashid: finalHashid,
    moves_sequence: movesSequence,
    pgn,
    analysis_json: minifiedAnalysisJson,
    created_at: new Date().toISOString()
  };
  memoryStore.games.push(newRecord);
  return finalHashid;
}

// Get all game records
export async function getAllGameRecords(): Promise<GameRecord[]> {
  const db = await getDb();
  if (db) {
    try {
      const { results } = await db.prepare("SELECT * FROM games ORDER BY id DESC").all();
      return (results || []).map((record: any) => ({
        hashid: record.hashid as string,
        moves_sequence: record.moves_sequence as string,
        pgn: record.pgn as string,
        analysis_json: expandAnalysisJson(record.analysis_json as string),
        created_at: record.created_at as string
      }));
    } catch (e) {
      await ensureSchema(db);
    }
  }

  return memoryStore.games.slice().reverse().map(record => ({
    ...record,
    analysis_json: expandAnalysisJson(record.analysis_json)
  }));
}

// 1. Upsert User on Lichess Login
export async function upsertUser(user: { id: string; username: string; access_token?: string; avatar_url?: string }): Promise<UserRecord> {
  const db = await getDb();
  const now = new Date().toISOString();
  const userId = user.id.toLowerCase();

  if (db) {
    try {
      await db.prepare(`
        INSERT INTO users (id, username, access_token, avatar_url, last_login_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          username = excluded.username,
          access_token = COALESCE(excluded.access_token, users.access_token),
          avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
          last_login_at = excluded.last_login_at
      `).bind(userId, user.username, user.access_token || null, user.avatar_url || null, now).run();

      // Auto-link primary Lichess account
      await db.prepare(`
        INSERT OR IGNORE INTO linked_accounts (user_id, platform, platform_username, is_primary)
        VALUES (?, 'lichess', ?, 1)
      `).bind(userId, user.username).run();

      const record = await getUser(userId);
      if (record) return record;
    } catch (e) {
      console.error("upsertUser D1 error, ensuring schema:", e);
      await ensureSchema(db);
    }
  }

  // Memory fallback
  const existing = memoryStore.users[userId];
  const updated: UserRecord = {
    id: userId,
    username: user.username,
    access_token: user.access_token || existing?.access_token,
    avatar_url: user.avatar_url || existing?.avatar_url,
    created_at: existing?.created_at || now,
    last_login_at: now
  };
  memoryStore.users[userId] = updated;

  const hasPrimary = memoryStore.linkedAccounts.some(a => a.user_id === userId && a.platform === 'lichess' && a.platform_username.toLowerCase() === user.username.toLowerCase());
  if (!hasPrimary) {
    memoryStore.linkedAccounts.push({
      user_id: userId,
      platform: 'lichess',
      platform_username: user.username,
      is_primary: true,
      created_at: now
    });
  }
  return updated;
}

// 2. Get User by ID
export async function getUser(id: string): Promise<UserRecord | null> {
  const db = await getDb();
  const userId = id.toLowerCase();
  if (db) {
    try {
      const record = await db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
      if (record) {
        return {
          id: record.id as string,
          username: record.username as string,
          access_token: record.access_token as string,
          avatar_url: record.avatar_url as string,
          created_at: record.created_at as string,
          last_login_at: record.last_login_at as string
        };
      }
    } catch (e) {
      await ensureSchema(db);
    }
  }
  return memoryStore.users[userId] || null;
}

// 3. Get Linked Accounts for User
export async function getLinkedAccounts(userId: string): Promise<LinkedAccountRecord[]> {
  const db = await getDb();
  const uid = userId.toLowerCase();
  if (db) {
    try {
      const { results } = await db.prepare("SELECT * FROM linked_accounts WHERE user_id = ? ORDER BY is_primary DESC, id ASC").bind(uid).all();
      if (results && results.length > 0) {
        return results.map((r: any) => ({
          id: r.id as number,
          user_id: r.user_id as string,
          platform: r.platform as 'lichess' | 'chesscom',
          platform_username: r.platform_username as string,
          is_primary: Boolean(r.is_primary),
          created_at: r.created_at as string
        }));
      }
    } catch (e) {
      console.error("getLinkedAccounts D1 error:", e);
      await ensureSchema(db);
    }
  }

  const inMem = memoryStore.linkedAccounts.filter(a => a.user_id === uid);
  if (inMem.length > 0) return inMem;

  // If none exists yet, default to user itself
  return [
    {
      user_id: uid,
      platform: 'lichess',
      platform_username: uid,
      is_primary: true,
      created_at: new Date().toISOString()
    }
  ];
}

// 4. Add Linked Account (Supports unlimited Lichess or Chess.com accounts)
export async function addLinkedAccount(userId: string, platform: 'lichess' | 'chesscom', platformUsername: string, isPrimary: boolean = false): Promise<boolean> {
  const db = await getDb();
  const uid = userId.toLowerCase();
  const trimmed = platformUsername.trim();
  if (!trimmed) return false;

  if (db) {
    try {
      await db.prepare(`
        INSERT INTO linked_accounts (user_id, platform, platform_username, is_primary)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, platform, platform_username) DO NOTHING
      `).bind(uid, platform, trimmed, isPrimary ? 1 : 0).run();
      return true;
    } catch (e) {
      console.error("addLinkedAccount D1 error, retrying with schema:", e);
      await ensureSchema(db);
      try {
        await db.prepare(`
          INSERT INTO linked_accounts (user_id, platform, platform_username, is_primary)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, platform, platform_username) DO NOTHING
        `).bind(uid, platform, trimmed, isPrimary ? 1 : 0).run();
        return true;
      } catch (retryErr) {
        console.error("addLinkedAccount retry failed:", retryErr);
      }
    }
  }

  // Memory fallback
  const exists = memoryStore.linkedAccounts.some(
    a => a.user_id === uid && a.platform === platform && a.platform_username.toLowerCase() === trimmed.toLowerCase()
  );
  if (!exists) {
    memoryStore.linkedAccounts.push({
      id: memoryStore.linkedAccounts.length + 1,
      user_id: uid,
      platform,
      platform_username: trimmed,
      is_primary: isPrimary,
      created_at: new Date().toISOString()
    });
  }
  return true;
}

// 5. Remove Linked Account
export async function removeLinkedAccount(userId: string, platform: string, platformUsername: string): Promise<boolean> {
  const db = await getDb();
  const uid = userId.toLowerCase();
  const trimmed = platformUsername.trim();

  if (db) {
    try {
      await db.prepare("DELETE FROM linked_accounts WHERE user_id = ? AND platform = ? AND platform_username = ? AND is_primary = 0")
        .bind(uid, platform, trimmed).run();
      return true;
    } catch (e) {
      console.error("removeLinkedAccount D1 error:", e);
      await ensureSchema(db);
    }
  }

  memoryStore.linkedAccounts = memoryStore.linkedAccounts.filter(
    a => !(a.user_id === uid && a.platform === platform && a.platform_username.toLowerCase() === trimmed.toLowerCase() && !a.is_primary)
  );
  return true;
}

// 6. User Opening Tree & VIP / VVIP Helpers
export type UserTier = 'free' | 'vip' | 'vvip';

export interface OpeningTreeRecord {
  user_id: string;
  is_vip: boolean | number;
  tier?: UserTier;
  max_ply: number;
  total_games: number;
  tree_json: string;
  updated_at: string;
}

export async function saveOpeningTree(
  userId: string,
  tier: UserTier | boolean | number,
  maxPly: number,
  totalGames: number,
  treeJson: string
): Promise<boolean> {
  const db = await getDb();
  const uid = userId.toLowerCase();
  const now = new Date().toISOString();
  
  let vipInt = 0;
  if (typeof tier === 'string') {
    vipInt = tier === 'vvip' ? 2 : (tier === 'vip' ? 1 : 0);
  } else if (typeof tier === 'number') {
    vipInt = tier;
  } else if (tier === true) {
    vipInt = 1;
  }

  if (db) {
    try {
      try {
        await db.prepare("INSERT OR IGNORE INTO users (id, username, is_vip) VALUES (?, ?, ?)").bind(uid, uid, vipInt).run();
      } catch (e) {}

      await db.prepare(`
        INSERT INTO user_opening_trees (user_id, is_vip, max_ply, total_games, tree_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          is_vip = excluded.is_vip,
          max_ply = excluded.max_ply,
          total_games = excluded.total_games,
          tree_json = excluded.tree_json,
          updated_at = excluded.updated_at
      `).bind(uid, vipInt, maxPly, totalGames, treeJson, now).run();
      return true;
    } catch (e) {
      console.error("Failed to save opening tree in D1, ensuring schema:", e);
      await ensureSchema(db);
      try {
        await db.prepare(`
          INSERT INTO user_opening_trees (user_id, is_vip, max_ply, total_games, tree_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            is_vip = excluded.is_vip,
            max_ply = excluded.max_ply,
            total_games = excluded.total_games,
            tree_json = excluded.tree_json,
            updated_at = excluded.updated_at
        `).bind(uid, vipInt, maxPly, totalGames, treeJson, now).run();
        return true;
      } catch (retryErr) {
        console.error("saveOpeningTree retry failed:", retryErr);
      }
    }
  }
  
  memoryStore.openingTrees[uid] = {
    user_id: uid,
    is_vip: vipInt > 0,
    tier: vipInt === 2 ? 'vvip' : (vipInt === 1 ? 'vip' : 'free'),
    max_ply: maxPly,
    total_games: totalGames,
    tree_json: treeJson,
    updated_at: now
  };
  saveFallbackFile('./opening_trees_fallback.json', memoryStore.openingTrees);
  return true;
}

export async function getOpeningTreeRecord(userId: string): Promise<OpeningTreeRecord | null> {
  const db = await getDb();
  const uid = userId.toLowerCase();
  if (db) {
    try {
      const record = await db.prepare("SELECT * FROM user_opening_trees WHERE user_id = ?").bind(uid).first();
      if (record && record.tree_json) {
        const rawVip = Number(record.is_vip) || 0;
        return {
          user_id: record.user_id as string,
          is_vip: rawVip > 0,
          tier: rawVip === 2 ? 'vvip' : (rawVip === 1 ? 'vip' : 'free'),
          max_ply: (record.max_ply as number) || 30,
          total_games: (record.total_games as number) || 0,
          tree_json: record.tree_json as string,
          updated_at: record.updated_at as string
        };
      }
    } catch (e) {
      console.error("Failed to get opening tree from D1:", e);
      await ensureSchema(db);
    }
  }
  
  if (!memoryStore.openingTrees[uid]) {
    memoryStore.openingTrees = loadFallbackFile<Record<string, OpeningTreeRecord>>('./opening_trees_fallback.json', {});
  }
  return memoryStore.openingTrees[uid] || null;
}

export async function getUserTier(userId: string): Promise<UserTier> {
  const db = await getDb();
  const uid = userId.toLowerCase();
  if (db) {
    try {
      const record = await db.prepare("SELECT is_vip, role FROM users WHERE id = ?").bind(uid).first();
      if (record) {
        if (record.role === 'vvip' || record.is_vip === 2) return 'vvip';
        if (record.role === 'vip' || record.is_vip === 1 || Boolean(record.is_vip)) return 'vip';
      }
    } catch (e) {}
  }

  if (!memoryStore.users[uid]) {
    memoryStore.users = loadFallbackFile<Record<string, UserRecord>>('./users_fallback.json', {});
  }
  const memUser = memoryStore.users[uid];
  if (memUser?.role === 'vvip' || memUser?.is_vip === 2) return 'vvip';
  if (memUser?.role === 'vip' || memUser?.is_vip === 1 || Boolean(memUser?.is_vip)) return 'vip';

  const vipEntry = memoryStore.vipUsers[uid];
  if (vipEntry?.tier) return vipEntry.tier;
  if (vipEntry?.isVip === 2) return 'vvip';
  if (vipEntry?.isVip === 1 || vipEntry?.isVip === true) return 'vip';

  return 'free';
}

export async function setUserTier(userId: string, tier: UserTier, key?: string): Promise<boolean> {
  const db = await getDb();
  const uid = userId.toLowerCase();
  const vipInt = tier === 'vvip' ? 2 : (tier === 'vip' ? 1 : 0);
  if (db) {
    try {
      await db.prepare("UPDATE users SET is_vip = ?, role = ?, vip_key = ? WHERE id = ?").bind(vipInt, tier, key || '', uid).run();
      return true;
    } catch (e) {
      console.error("Failed to set tier in D1:", e);
      await ensureSchema(db);
      try {
        await db.prepare("UPDATE users SET is_vip = ?, vip_key = ? WHERE id = ?").bind(vipInt, key || '', uid).run();
        return true;
      } catch (err2) {}
    }
  }
  memoryStore.vipUsers[uid] = { isVip: vipInt > 0, tier, vipKey: key };
  return true;
}

export async function setUserVip(userId: string, vipKey: string): Promise<boolean> {
  return setUserTier(userId, 'vip', vipKey);
}

export async function getUserVipStatus(userId: string): Promise<boolean> {
  const tier = await getUserTier(userId);
  return tier !== 'free';
}



