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

function loadFallbackDb(): GameRecord[] {
  try {
    if (typeof window === 'undefined' && !process.env.DB) {
      const fs = require('fs');
      const fallbackFile = './db_fallback.json';
      if (fs.existsSync(fallbackFile)) {
        return JSON.parse(fs.readFileSync(fallbackFile, 'utf-8'));
      }
    }
  } catch (e) {
    // Ignore
  }
  return [];
}

function saveFallbackDb(db: GameRecord[]) {
  try {
    if (typeof window === 'undefined' && !process.env.DB) {
      const fs = require('fs');
      const fallbackFile = './db_fallback.json';
      fs.writeFileSync(fallbackFile, JSON.stringify(db, null, 2), 'utf-8');
    }
  } catch (e) {
    // Ignore
  }
}

// Fetch database D1 binding or fallback
export async function getDb() {
  if ((process.env as any).DB) {
    return (process.env as any).DB;
  }
  return null;
}

// Get game by hashid
export async function getGameRecord(hashid: string): Promise<GameRecord | null> {
  const db = await getDb();
  if (db) {
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
    return null;
  } else {
    // Local fallback
    const fallbackDb = loadFallbackDb();
    const found = fallbackDb.find(r => r.hashid === hashid);
    if (found) {
      return {
        ...found,
        analysis_json: expandAnalysisJson(found.analysis_json)
      };
    }
    return null;
  }
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
    // 1. Check for duplicates (same move sequence)
    const existing = await db.prepare("SELECT hashid FROM games WHERE moves_sequence = ?").bind(movesSequence).first();
    if (existing) {
      return existing.hashid as string;
    }

    // 2. Insert temporary record to generate AutoIncrement ID
    const insertResult = await db.prepare(
      "INSERT INTO games (hashid, moves_sequence, pgn, analysis_json) VALUES (?, ?, ?, ?)"
    )
    .bind("TEMP_HASHID", movesSequence, pgn, minifiedAnalysisJson)
    .run();

    const insertId = insertResult.meta.last_row_id;
    const finalHashid = hashids.encode(insertId);

    // 3. Update with the generated Hashid
    await db.prepare("UPDATE games SET hashid = ? WHERE id = ?").bind(finalHashid, insertId).run();
    return finalHashid;
  } else {
    // Local fallback
    const fallbackDb = loadFallbackDb();
    
    // Check duplication
    const existing = fallbackDb.find(r => r.moves_sequence === movesSequence);
    if (existing) {
      return existing.hashid;
    }

    // Generate id and hashid
    const nextId = fallbackDb.length + 1;
    const finalHashid = hashids.encode(nextId);

    const newRecord: GameRecord = {
      hashid: finalHashid,
      moves_sequence: movesSequence,
      pgn,
      analysis_json: minifiedAnalysisJson,
      created_at: new Date().toISOString()
    };

    fallbackDb.push(newRecord);
    saveFallbackDb(fallbackDb);
    return finalHashid;
  }
}

// Get all game records (or fallback)
export async function getAllGameRecords(): Promise<GameRecord[]> {
  const db = await getDb();
  if (db) {
    const { results } = await db.prepare("SELECT * FROM games ORDER BY id DESC").all();
    return (results || []).map((record: any) => ({
      hashid: record.hashid as string,
      moves_sequence: record.moves_sequence as string,
      pgn: record.pgn as string,
      analysis_json: expandAnalysisJson(record.analysis_json as string),
      created_at: record.created_at as string
    }));
  } else {
    return loadFallbackDb().slice().reverse().map(record => ({
      ...record,
      analysis_json: expandAnalysisJson(record.analysis_json)
    }));
  }
}

// User & Linked Accounts Fallback Cache
interface FallbackAuthStore {
  users: Record<string, UserRecord>;
  linkedAccounts: LinkedAccountRecord[];
}

function loadFallbackAuth(): FallbackAuthStore {
  try {
    if (typeof window === 'undefined' && !process.env.DB) {
      const fs = require('fs');
      const fallbackFile = './auth_fallback.json';
      if (fs.existsSync(fallbackFile)) {
        return JSON.parse(fs.readFileSync(fallbackFile, 'utf-8'));
      }
    }
  } catch (e) {}
  return { users: {}, linkedAccounts: [] };
}

function saveFallbackAuth(store: FallbackAuthStore) {
  try {
    if (typeof window === 'undefined' && !process.env.DB) {
      const fs = require('fs');
      const fallbackFile = './auth_fallback.json';
      fs.writeFileSync(fallbackFile, JSON.stringify(store, null, 2), 'utf-8');
    }
  } catch (e) {}
}

// 1. Upsert User on Lichess Login
export async function upsertUser(user: { id: string; username: string; access_token?: string; avatar_url?: string }): Promise<UserRecord> {
  const db = await getDb();
  const now = new Date().toISOString();
  if (db) {
    await db.prepare(`
      INSERT INTO users (id, username, access_token, avatar_url, last_login_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        access_token = COALESCE(excluded.access_token, users.access_token),
        avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
        last_login_at = excluded.last_login_at
    `).bind(user.id.toLowerCase(), user.username, user.access_token || null, user.avatar_url || null, now).run();

    // Auto-link primary Lichess account
    await db.prepare(`
      INSERT OR IGNORE INTO linked_accounts (user_id, platform, platform_username, is_primary)
      VALUES (?, 'lichess', ?, 1)
    `).bind(user.id.toLowerCase(), user.username).run();

    const record = await getUser(user.id.toLowerCase());
    return record || { id: user.id.toLowerCase(), username: user.username, access_token: user.access_token, avatar_url: user.avatar_url, created_at: now, last_login_at: now };
  } else {
    const store = loadFallbackAuth();
    const existing = store.users[user.id.toLowerCase()];
    const updated: UserRecord = {
      id: user.id.toLowerCase(),
      username: user.username,
      access_token: user.access_token || existing?.access_token,
      avatar_url: user.avatar_url || existing?.avatar_url,
      created_at: existing?.created_at || now,
      last_login_at: now
    };
    store.users[user.id.toLowerCase()] = updated;
    
    // Auto-link primary account in fallback
    const hasPrimary = store.linkedAccounts.some(a => a.user_id === user.id.toLowerCase() && a.platform === 'lichess' && a.platform_username.toLowerCase() === user.username.toLowerCase());
    if (!hasPrimary) {
      store.linkedAccounts.push({
        user_id: user.id.toLowerCase(),
        platform: 'lichess',
        platform_username: user.username,
        is_primary: true,
        created_at: now
      });
    }
    saveFallbackAuth(store);
    return updated;
  }
}

// 2. Get User by ID
export async function getUser(id: string): Promise<UserRecord | null> {
  const db = await getDb();
  if (db) {
    const record = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id.toLowerCase()).first();
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
    return null;
  } else {
    const store = loadFallbackAuth();
    return store.users[id.toLowerCase()] || null;
  }
}

// 3. Get Linked Accounts for User
export async function getLinkedAccounts(userId: string): Promise<LinkedAccountRecord[]> {
  const db = await getDb();
  if (db) {
    const { results } = await db.prepare("SELECT * FROM linked_accounts WHERE user_id = ? ORDER BY is_primary DESC, id ASC").bind(userId.toLowerCase()).all();
    return (results || []).map((r: any) => ({
      id: r.id as number,
      user_id: r.user_id as string,
      platform: r.platform as 'lichess' | 'chesscom',
      platform_username: r.platform_username as string,
      is_primary: Boolean(r.is_primary),
      created_at: r.created_at as string
    }));
  } else {
    const store = loadFallbackAuth();
    return store.linkedAccounts.filter(a => a.user_id === userId.toLowerCase());
  }
}

// 4. Add Linked Account (Chess.com or secondary Lichess)
export async function addLinkedAccount(userId: string, platform: 'lichess' | 'chesscom', platformUsername: string, isPrimary: boolean = false): Promise<boolean> {
  const db = await getDb();
  const trimmed = platformUsername.trim();
  if (!trimmed) return false;

  if (db) {
    try {
      await db.prepare(`
        INSERT INTO linked_accounts (user_id, platform, platform_username, is_primary)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, platform, platform_username) DO NOTHING
      `).bind(userId.toLowerCase(), platform, trimmed, isPrimary ? 1 : 0).run();
      return true;
    } catch (e) {
      console.error("Failed to add linked account:", e);
      return false;
    }
  } else {
    const store = loadFallbackAuth();
    const exists = store.linkedAccounts.some(
      a => a.user_id === userId.toLowerCase() && a.platform === platform && a.platform_username.toLowerCase() === trimmed.toLowerCase()
    );
    if (!exists) {
      store.linkedAccounts.push({
        id: store.linkedAccounts.length + 1,
        user_id: userId.toLowerCase(),
        platform,
        platform_username: trimmed,
        is_primary: isPrimary,
        created_at: new Date().toISOString()
      });
      saveFallbackAuth(store);
    }
    return true;
  }
}

// 5. Remove Linked Account
export async function removeLinkedAccount(userId: string, platform: string, platformUsername: string): Promise<boolean> {
  const db = await getDb();
  const trimmed = platformUsername.trim();
  if (db) {
    try {
      await db.prepare("DELETE FROM linked_accounts WHERE user_id = ? AND platform = ? AND platform_username = ? AND is_primary = 0")
        .bind(userId.toLowerCase(), platform, trimmed).run();
      return true;
    } catch (e) {
      return false;
    }
  } else {
    const store = loadFallbackAuth();
    store.linkedAccounts = store.linkedAccounts.filter(
      a => !(a.user_id === userId.toLowerCase() && a.platform === platform && a.platform_username.toLowerCase() === trimmed.toLowerCase() && !a.is_primary)
    );
    saveFallbackAuth(store);
    return true;
  }
}

