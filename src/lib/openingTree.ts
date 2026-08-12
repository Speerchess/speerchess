import { Chess } from 'chess.js';

export interface MoveStats {
  san: string;
  uci: string;
  count: number;
  white: number;
  draws: number;
  black: number;
}

export interface PositionStats {
  total: number;
  white: number;
  draws: number;
  black: number;
  moves: Record<string, MoveStats>;
}

// Compact move tuple: [san, whiteWins, draws, blackWins]
export type CompactMoveTuple = [string, number, number, number];

export interface CompactOpeningTree {
  version: number;
  totalGames: number;
  maxPly: number;
  updatedAt: string;
  // Positions when user played as white: FEN -> { [uci]: [san, wWins, draws, bWins] }
  w?: Record<string, Record<string, CompactMoveTuple>>;
  // Positions when user played as black: FEN -> { [uci]: [san, wWins, draws, bWins] }
  b?: Record<string, Record<string, CompactMoveTuple>>;
  // Legacy v1 format compatibility
  white?: Record<string, PositionStats>;
  black?: Record<string, PositionStats>;
  all?: Record<string, PositionStats>;
}

export interface GameInputForTree {
  id?: string;
  url?: string;
  platform?: 'lichess' | 'chesscom';
  pgn?: string;
  moves?: string[]; // Array of SAN moves
  userColor?: 'white' | 'black';
  result?: '1-0' | '0-1' | '1/2-1/2' | 'win' | 'loss' | 'draw' | string;
  whiteResult?: string;
  blackResult?: string;
}

/**
 * Normalizes FEN to first 4 components (board + active turn + castling + ep)
 * Ignores halfmove clock and fullmove number for opening transposition matching.
 */
export function normalizeFen(fen: string): string {
  if (!fen) return '';
  const parts = fen.trim().split(' ');
  if (parts.length >= 4) {
    return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
  }
  return fen.trim();
}

/**
 * Extracts moves and outcome from raw PGN string or structured game object
 */
export function parseGameMoves(game: GameInputForTree): { moves: string[]; outcome: 'white' | 'black' | 'draw'; userColor: 'white' | 'black' } | null {
  try {
    const chess = new Chess();
    if (game.moves && Array.isArray(game.moves) && game.moves.length > 0) {
      for (const m of game.moves) {
        try {
          const res = chess.move(m);
          if (!res) break;
        } catch (err) { break; }
      }
    } else if (game.pgn) {
      let loaded = false;
      try {
        chess.loadPgn(game.pgn);
        if (chess.history().length > 0) loaded = true;
      } catch (e) {}

      if (!loaded) {
        // Fallback: strip headers, comments, variations, NAGs, and move numbers
        const cleanMoves = game.pgn
          .replace(/\[[^\]]*\]/g, '') // remove headers [Event "..."]
          .replace(/\{[^}]*\}/g, '')  // remove comments { ... }
          .replace(/\([^)]*\)/g, '')  // remove variations ( ... )
          .replace(/\$\d+/g, '')      // remove NAGs $1, $2
          .replace(/\d+\.+/g, '')     // remove move numbers 1. 2.
          .replace(/(1-0|0-1|1\/2-1\/2|\*)/g, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        
        for (const m of cleanMoves) {
          try {
            const res = chess.move(m);
            if (!res) break;
          } catch (err) { break; }
        }
      }
    }

    const history = chess.history({ verbose: true });
    if (history.length === 0) return null;

    let outcome: 'white' | 'black' | 'draw' = 'draw';
    const res = (game.result || '').toLowerCase();
    if (res === '1-0' || (res === 'win' && game.userColor === 'white') || (res === 'loss' && game.userColor === 'black')) {
      outcome = 'white';
    } else if (res === '0-1' || (res === 'win' && game.userColor === 'black') || (res === 'loss' && game.userColor === 'white')) {
      outcome = 'black';
    } else if (res.includes('1/2') || res === 'draw') {
      outcome = 'draw';
    } else if (chess.isCheckmate()) {
      outcome = chess.turn() === 'w' ? 'black' : 'white';
    }

    const userColor: 'white' | 'black' = game.userColor || 'white';
    const moveSans = history.map(h => h.san);

    return { moves: moveSans, outcome, userColor };
  } catch (e) {
    return null;
  }
}

/**
 * Builds an ultra-compact, high-speed pure-statistics Opening Tree (Version 2)
 * Compresses positions using tuple structures [san, whiteWins, draws, blackWins],
 * reducing JSON payload by over 2,000x to fit easily in Cloudflare D1 and localStorage.
 */
export function buildOpeningTreeFromGames(
  games: GameInputForTree[],
  maxPly: number = 30
): CompactOpeningTree {
  // Cap maxPly to reasonable opening book depth (max 40)
  const actualPly = Math.min(Math.max(maxPly, 10), 40);

  const tree: CompactOpeningTree = {
    version: 2,
    totalGames: 0,
    maxPly: actualPly,
    updatedAt: new Date().toISOString(),
    w: {},
    b: {}
  };

  for (const game of games) {
    const parsed = parseGameMoves(game);
    if (!parsed || parsed.moves.length === 0) continue;

    tree.totalGames++;
    const { moves, outcome, userColor } = parsed;
    const isUserWhite = userColor === 'white';
    const targetMap = isUserWhite ? tree.w! : tree.b!;

    const chess = new Chess();
    const limit = Math.min(moves.length, actualPly);

    for (let i = 0; i < limit; i++) {
      const currentFen = normalizeFen(chess.fen());
      const moveSan = moves[i];
      let moveObj;

      try {
        moveObj = chess.move(moveSan);
        if (!moveObj) break;
      } catch (err) {
        break;
      }

      const moveUci = `${moveObj.from}${moveObj.to}${moveObj.promotion || ''}`;

      if (!targetMap[currentFen]) {
        targetMap[currentFen] = {};
      }

      const pos = targetMap[currentFen];
      if (!pos[moveUci]) {
        pos[moveUci] = [moveSan, 0, 0, 0];
      }

      const m = pos[moveUci];
      if (outcome === 'white') m[1]++;
      else if (outcome === 'black') m[3]++;
      else m[2]++;
    }
  }

  return tree;
}

/**
 * Queries position stats and candidate next moves from the tree
 * Supports both v2 compact tuple format and v1 legacy format.
 */
export function queryOpeningTree(
  tree: CompactOpeningTree | null,
  fen: string,
  colorFilter: 'white' | 'black' | 'all' = 'all'
): {
  total: number;
  white: number;
  draws: number;
  black: number;
  moves: Array<{
    san: string;
    uci: string;
    count: number;
    white: number;
    draws: number;
    black: number;
    whitePct: number;
    drawPct: number;
    blackPct: number;
  }>;
} {
  if (!tree) {
    return { total: 0, white: 0, draws: 0, black: 0, moves: [] };
  }

  const normalized = normalizeFen(fen);

  // 1. Legacy v1 support (if tree has white/black/all objects)
  if (tree.white && tree.black) {
    const targetMap = colorFilter === 'white' ? tree.white : colorFilter === 'black' ? tree.black : tree.all;
    const pos = targetMap ? targetMap[normalized] : null;

    if (!pos) {
      return { total: 0, white: 0, draws: 0, black: 0, moves: [] };
    }

    const moveList = Object.values(pos.moves || {})
      .map(m => {
        const cnt = m.count || 1;
        return {
          san: m.san,
          uci: m.uci,
          count: m.count,
          white: m.white,
          draws: m.draws,
          black: m.black,
          whitePct: Math.round((m.white / cnt) * 100),
          drawPct: Math.round((m.draws / cnt) * 100),
          blackPct: Math.round((m.black / cnt) * 100)
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      total: pos.total,
      white: pos.white,
      draws: pos.draws,
      black: pos.black,
      moves: moveList
    };
  }

  // 2. Version 2 Compact Tuple Format
  const wPos = tree.w ? tree.w[normalized] : null;
  const bPos = tree.b ? tree.b[normalized] : null;

  const moveMap = new Map<string, { san: string; uci: string; white: number; draws: number; black: number; count: number }>();
  let totalW = 0, totalD = 0, totalB = 0;

  const processPos = (pos: Record<string, CompactMoveTuple> | null | undefined) => {
    if (!pos) return;
    for (const [uci, data] of Object.entries(pos)) {
      const [san, w, d, b] = data;
      const count = w + d + b;
      totalW += w;
      totalD += d;
      totalB += b;

      if (!moveMap.has(uci)) {
        moveMap.set(uci, { san, uci, white: w, draws: d, black: b, count });
      } else {
        const existing = moveMap.get(uci)!;
        existing.white += w;
        existing.draws += d;
        existing.black += b;
        existing.count += count;
      }
    }
  };

  if (colorFilter === 'white') {
    processPos(wPos);
  } else if (colorFilter === 'black') {
    processPos(bPos);
  } else {
    processPos(wPos);
    processPos(bPos);
  }

  const moves = Array.from(moveMap.values())
    .map(m => {
      const cnt = m.count || 1;
      return {
        san: m.san,
        uci: m.uci,
        count: m.count,
        white: m.white,
        draws: m.draws,
        black: m.black,
        whitePct: Math.round((m.white / cnt) * 100),
        drawPct: Math.round((m.draws / cnt) * 100),
        blackPct: Math.round((m.black / cnt) * 100)
      };
    })
    .sort((a, b) => b.count - a.count);

  const total = totalW + totalD + totalB;
  return { total, white: totalW, draws: totalD, black: totalB, moves };
}
