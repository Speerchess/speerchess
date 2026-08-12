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

export interface CompactOpeningTree {
  version: number;
  totalGames: number;
  maxPly: number;
  updatedAt: string;
  white: Record<string, PositionStats>;
  black: Record<string, PositionStats>;
  all: Record<string, PositionStats>;
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
    if (game.pgn) {
      try {
        chess.loadPgn(game.pgn);
      } catch (e) {
        // Fallback: extract moves directly from PGN text
        const cleanMoves = game.pgn
          .replace(/\{[^}]*\}/g, '') // remove comments
          .replace(/\([^)]*\)/g, '') // remove variations
          .replace(/\$\d+/g, '')     // remove NAGs
          .replace(/\d+\.+/g, '')    // remove move numbers
          .replace(/(1-0|0-1|1\/2-1\/2|\*)/g, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        
        for (const m of cleanMoves) {
          try { chess.move(m); } catch (err) { break; }
        }
      }
    } else if (game.moves && Array.isArray(game.moves)) {
      for (const m of game.moves) {
        try { chess.move(m); } catch (err) { break; }
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
 * Builds an ultra-compact, high-speed pure-statistics Opening Tree
 * (Zero extra storage - all games matched on client side in real-time)
 */
export function buildOpeningTreeFromGames(
  games: GameInputForTree[],
  maxPly: number = 30
): CompactOpeningTree {
  const tree: CompactOpeningTree = {
    version: 1,
    totalGames: 0,
    maxPly,
    updatedAt: new Date().toISOString(),
    white: {},
    black: {},
    all: {}
  };

  for (const game of games) {
    const parsed = parseGameMoves(game);
    if (!parsed || parsed.moves.length === 0) continue;

    tree.totalGames++;
    const { moves, outcome, userColor } = parsed;
    const isUserWhite = userColor === 'white';

    const chess = new Chess();
    const limit = Math.min(moves.length, maxPly);

    for (let i = 0; i < limit; i++) {
      const currentFen = normalizeFen(chess.fen());
      const moveSan = moves[i];
      let moveUci = '';

      try {
        const moveObj = chess.move(moveSan);
        if (!moveObj) break;
        moveUci = `${moveObj.from}${moveObj.to}${moveObj.promotion || ''}`;
      } catch (err) {
        break;
      }

      // Record in 'all' tree
      recordPositionMove(tree.all, currentFen, moveSan, moveUci, outcome);

      // Record in user's color-specific tree
      if (isUserWhite) {
        recordPositionMove(tree.white, currentFen, moveSan, moveUci, outcome);
      } else {
        recordPositionMove(tree.black, currentFen, moveSan, moveUci, outcome);
      }
    }
  }

  return tree;
}

function recordPositionMove(
  treeMap: Record<string, PositionStats>,
  fen: string,
  san: string,
  uci: string,
  outcome: 'white' | 'black' | 'draw'
) {
  if (!treeMap[fen]) {
    treeMap[fen] = {
      total: 0,
      white: 0,
      draws: 0,
      black: 0,
      moves: {}
    };
  }

  const pos = treeMap[fen];
  pos.total++;
  if (outcome === 'white') pos.white++;
  else if (outcome === 'black') pos.black++;
  else pos.draws++;

  if (!pos.moves[uci]) {
    pos.moves[uci] = {
      san,
      uci,
      count: 0,
      white: 0,
      draws: 0,
      black: 0
    };
  }

  const m = pos.moves[uci];
  m.count++;
  if (outcome === 'white') m.white++;
  else if (outcome === 'black') m.black++;
  else m.draws++;
}

/**
 * Queries position stats and candidate next moves from the tree
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

  const targetMap = colorFilter === 'white' ? tree.white : colorFilter === 'black' ? tree.black : tree.all;
  const normalized = normalizeFen(fen);
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
