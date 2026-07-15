import { Chess, Square } from 'chess.js';

export interface MoveAnalysis {
  san: string;
  from: string;
  to: string;
  evaluation: number; // in centipawns
  classification: 'Brilliant' | 'Great' | 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder' | 'Book' | 'Forced';
  accuracy: number;
  bestMove?: string;
}

export interface GameAnalysis {
  moves: MoveAnalysis[];
  whiteAccuracy: number;
  blackAccuracy: number;
  whitePerformance: number;
  blackPerformance: number;
  evaluationHistory: number[];
  classificationTally: {
    white: Record<string, number>;
    black: Record<string, number>;
  };
  whiteElo: number;
  blackElo: number;
}

// Converts centipawn evaluation to a win probability (0 to 1)
function evalToWinProb(evalCp: number): number {
  return 0.5 + 0.5 * (2 / (1 + Math.exp(-0.00368208 * evalCp)) - 1);
}

// Calculates accuracy percentage based on win probability difference
function calculateAccuracy(beforeProb: number, afterProb: number): number {
  const diff = beforeProb - afterProb; // difference in win probability (from player's perspective)
  let accuracy = 103.1668 * Math.exp(-0.04354 * diff * 100) - 3.1669;
  return Math.max(0, Math.min(100, Math.round(accuracy * 10) / 10)); // Clamp between 0 and 100, round to 1 decimal
}

// WTF Algorithm: Get the maximum evaluation loss for a classification to be applied
function getEvaluationLossThreshold(classif: string, prevEval: number): number {
  const absEval = Math.abs(prevEval);
  let threshold = 0;
  switch (classif) {
    case 'Best':
      threshold = 0.0001 * Math.pow(absEval, 2) + (0.0236 * absEval) - 3.7143;
      break;
    case 'Excellent':
      threshold = 0.0002 * Math.pow(absEval, 2) + (0.1231 * absEval) + 27.5455;
      break;
    case 'Good':
      threshold = 0.0002 * Math.pow(absEval, 2) + (0.2643 * absEval) + 60.5455;
      break;
    case 'Inaccuracy':
      threshold = 0.0002 * Math.pow(absEval, 2) + (0.3624 * absEval) + 108.0909;
      break;
    case 'Mistake':
      threshold = 0.0003 * Math.pow(absEval, 2) + (0.4027 * absEval) + 225.8182;
      break;
    default:
      threshold = Infinity;
  }
  return Math.max(threshold, 0);
}

// --- Chess.js Board Helper Functions for Sacrifice / Hanging Detection ---

interface InfluencingPiece {
  square: Square;
  color: 'w' | 'b';
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
}

const pieceValues: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: Infinity,
};

const promotions = [undefined, 'b', 'n', 'r', 'q'];

interface Coordinate {
  x: number;
  y: number;
}

function getBoardCoordinates(square: string): Coordinate {
  return {
    x: 'abcdefgh'.indexOf(square[0]),
    y: parseInt(square[1], 10) - 1,
  };
}

function getSquare(coordinate: Coordinate): Square {
  return ('abcdefgh'[coordinate.x] + (coordinate.y + 1)) as Square;
}

export function getAttackers(fen: string, square: Square): InfluencingPiece[] {
  const attackers: InfluencingPiece[] = [];
  const board = new Chess(fen);
  const piece = board.get(square);
  if (!piece) return [];

  // Set turn to opposite of the attacked piece's color and clear en-passant
  const parts = fen.split(' ');
  parts[1] = piece.color === 'w' ? 'b' : 'w';
  parts[3] = '-';
  board.load(parts.join(' '));

  // Find legal moves that capture the attacked piece
  const legalMoves = board.moves({ verbose: true });
  for (const move of legalMoves) {
    if (move.to === square) {
      attackers.push({
        square: move.from as Square,
        color: move.color,
        type: move.piece,
      });
    }
  }

  // Handle king nearby (since king captures might be legal or illegal depending on check)
  let oppositeKing: InfluencingPiece | undefined;
  const oppositeColor = piece.color === 'w' ? 'b' : 'w';
  const pieceCoordinate = getBoardCoordinates(square);

  for (let xOffset = -1; xOffset <= 1; xOffset++) {
    for (let yOffset = -1; yOffset <= 1; yOffset++) {
      if (xOffset === 0 && yOffset === 0) continue;
      const targetX = pieceCoordinate.x + xOffset;
      const targetY = pieceCoordinate.y + yOffset;
      if (targetX < 0 || targetX > 7 || targetY < 0 || targetY > 7) continue;

      const offsetSquare = getSquare({ x: targetX, y: targetY });
      const offsetPiece = board.get(offsetSquare);
      if (offsetPiece && offsetPiece.color === oppositeColor && offsetPiece.type === 'k') {
        oppositeKing = {
          color: offsetPiece.color,
          square: offsetSquare,
          type: offsetPiece.type,
        };
        break;
      }
    }
    if (oppositeKing) break;
  }

  if (!oppositeKing) return attackers;

  let kingCaptureLegal = false;
  try {
    board.move({
      from: oppositeKing.square,
      to: square,
    });
    kingCaptureLegal = true;
  } catch {
    // King capture illegal (square defended)
  }

  if (oppositeKing && (attackers.length > 0 || kingCaptureLegal)) {
    attackers.push(oppositeKing);
  }

  return attackers;
}

export function getDefenders(fen: string, square: Square): InfluencingPiece[] {
  const board = new Chess(fen);
  const piece = board.get(square);
  if (!piece) return [];
  const testAttacker = getAttackers(fen, square)[0];

  if (testAttacker) {
    // Set turn to the attacker's color and clear en-passant
    const parts = fen.split(' ');
    parts[1] = testAttacker.color;
    parts[3] = '-';
    board.load(parts.join(' '));

    for (const promotion of promotions) {
      try {
        board.move({
          from: testAttacker.square,
          to: square,
          promotion: promotion,
        });
        return getAttackers(board.fen(), square);
      } catch {
        // Failed
      }
    }
  } else {
    // No attacker: set player to move to the defended piece color
    const parts = fen.split(' ');
    parts[1] = piece.color;
    parts[3] = '-';
    board.load(parts.join(' '));

    // Put an enemy queen there
    board.put({
      color: piece.color === 'w' ? 'b' : 'w',
      type: 'q',
    }, square);

    // Return the attackers of that piece (which are friendly defenders)
    return getAttackers(board.fen(), square);
  }

  return [];
}

export function isPieceHanging(lastFen: string, fen: string, square: Square): boolean {
  const lastBoard = new Chess(lastFen);
  const board = new Chess(fen);

  const lastPiece = lastBoard.get(square);
  const piece = board.get(square);
  if (!piece) return false;

  const attackers = getAttackers(fen, square);
  const defenders = getDefenders(fen, square);

  // If piece was just traded equally or better, it's not hanging
  if (lastPiece && pieceValues[lastPiece.type] >= pieceValues[piece.type] && lastPiece.color !== piece.color) {
    return false;
  }

  // Rook favorable exchange
  if (
    piece.type === 'r' &&
    lastPiece &&
    pieceValues[lastPiece.type] === 3 &&
    attackers.every((atk) => pieceValues[atk.type] === 3) &&
    attackers.length === 1
  ) {
    return false;
  }

  // Lower value attacker
  if (attackers.some((atk) => pieceValues[atk.type] < pieceValues[piece.type])) {
    return true;
  }

  // More attackers than defenders
  if (attackers.length > defenders.length) {
    let minAttackerValue = Infinity;
    for (const attacker of attackers) {
      minAttackerValue = Math.min(pieceValues[attacker.type], minAttackerValue);
    }

    if (pieceValues[piece.type] < minAttackerValue && defenders.some((dfn) => pieceValues[dfn.type] < minAttackerValue)) {
      return false;
    }

    if (defenders.some((dfn) => pieceValues[dfn.type] === 1)) {
      return false;
    }

    return true;
  }

  return false;
}

class PooledEngine {
  private worker: Worker | null = null;
  private isReady = false;
  private readyPromise: Promise<void>;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((err: any) => void) | null = null;
  private currentTaskResolve: ((res: { evalCp: number; bestMove: string; secondEvalCp?: number; secondBestMove?: string }) => void) | null = null;
  private isBusy = false;

  // State for current evaluation
  private evalCp = 0;
  private bestMove = '';
  private secondEvalCp: number | undefined;
  private secondBestMove: string | undefined;

  constructor() {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    if (typeof window === 'undefined') {
      if (this.readyReject) this.readyReject(new Error('Window is undefined (SSR)'));
      return;
    }

    try {
      this.worker = new Worker('/stockfish-18-lite-single.js');
      
      this.worker.onmessage = (e) => {
        this.handleMessage(e.data);
      };

      this.worker.onerror = (err) => {
        if (this.readyReject) this.readyReject(err);
        if (this.currentTaskResolve) {
          this.currentTaskResolve({ evalCp: 0, bestMove: '' });
          this.currentTaskResolve = null;
        }
        this.isBusy = false;
      };

      this.worker.postMessage('uci');
    } catch (err) {
      if (this.readyReject) this.readyReject(err);
    }
  }

  public ready(): Promise<void> {
    return this.readyPromise;
  }

  public getBusy(): boolean {
    return this.isBusy;
  }

  public evaluate(fen: string, depth: number): Promise<{ evalCp: number; bestMove: string; secondEvalCp?: number; secondBestMove?: string }> {
    this.isBusy = true;
    return new Promise((resolve) => {
      try {
        const tempChess = new Chess(fen);
        if (tempChess.isGameOver()) {
          this.isBusy = false;
          if (tempChess.isCheckmate()) {
            return resolve({ evalCp: -10000, bestMove: '(none)' });
          }
          return resolve({ evalCp: 0, bestMove: '(none)' });
        }
      } catch (err) {
        // Fallback
      }

      if (!this.worker) {
        this.isBusy = false;
        return resolve({ evalCp: 0, bestMove: '' });
      }

      this.currentTaskResolve = resolve;

      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.postMessage('quit');
      this.worker.terminate();
      this.worker = null;
    }
  }

  private handleMessage(msg: string): void {
    if (msg === 'uciok') {
      if (this.worker) {
        this.worker.postMessage('setoption name MultiPV value 2');
        this.worker.postMessage('setoption name Hash value 32');
        this.worker.postMessage('isready');
      }
    } else if (msg === 'readyok') {
      this.isReady = true;
      if (this.readyResolve) {
        this.readyResolve();
        this.readyResolve = null;
      }
    } else {
      // Parse evaluation lines
      this.parseLine(msg);
    }
  }

  private parseLine(msg: string): void {
    const matchMultiPV = msg.match(/multipv (\d+)/);
    if (matchMultiPV) {
      const pvId = parseInt(matchMultiPV[1], 10);
      const matchEval = msg.match(/score cp (-?\d+)/);
      const matchMate = msg.match(/score mate (-?\d+)/);
      const matchPv = msg.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
      
      let score = 0;
      if (matchEval) {
        score = parseInt(matchEval[1], 10);
      } else if (matchMate) {
        score = parseInt(matchMate[1], 10) > 0 ? 10000 : -10000;
      }
      
      let pvMove = '';
      if (matchPv) {
        pvMove = matchPv[1];
      }
      
      if (pvId === 1) {
        this.evalCp = score;
        if (pvMove) this.bestMove = pvMove;
      } else if (pvId === 2) {
        this.secondEvalCp = score;
        if (pvMove) this.secondBestMove = pvMove;
      }
    }
    
    if (msg.startsWith('bestmove')) {
      const bm = msg.split(' ')[1];
      if (bm && bm !== '(none)') {
        this.bestMove = bm;
      }
      const resolve = this.currentTaskResolve;
      this.currentTaskResolve = null;
      
      const evalCp = this.evalCp;
      const bestMove = this.bestMove;
      const secondEvalCp = this.secondEvalCp;
      const secondBestMove = this.secondBestMove;

      // Reset state for next evaluation
      this.evalCp = 0;
      this.bestMove = '';
      this.secondEvalCp = undefined;
      this.secondBestMove = undefined;

      this.isBusy = false;

      if (resolve) {
        resolve({ evalCp, bestMove, secondEvalCp, secondBestMove });
      }
    }
  }
}

class EnginePool {
  private engines: PooledEngine[] = [];
  private taskQueue: {
    fen: string;
    depth: number;
    resolve: (res: { evalCp: number; bestMove: string; secondEvalCp?: number; secondBestMove?: string }) => void;
  }[] = [];

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      this.engines.push(new PooledEngine());
    }
  }

  public async ready(): Promise<void> {
    const results = await Promise.allSettled(this.engines.map((e) => e.ready()));
    const anyAlive = results.some((r) => r.status === 'fulfilled');
    if (!anyAlive) {
      throw new Error('All engines failed to initialize');
    }
  }

  public analyze(fen: string, depth: number): Promise<{ evalCp: number; bestMove: string; secondEvalCp?: number; secondBestMove?: string }> {
    return new Promise((resolve) => {
      this.taskQueue.push({ fen, depth, resolve });
      this.dispatch();
    });
  }

  public destroy(): void {
    for (const engine of this.engines) {
      engine.terminate();
    }
    this.engines = [];
    this.taskQueue = [];
  }

  private dispatch(): void {
    if (this.taskQueue.length === 0) return;

    const idleEngine = this.engines.find((e) => !e.getBusy());
    if (!idleEngine) return;

    const task = this.taskQueue.shift();
    if (!task) return;

    idleEngine.evaluate(task.fen, task.depth).then((result) => {
      task.resolve(result);
      this.dispatch();
    });
  }
}

export class ChessAnalyzer {
  private pool: EnginePool | null = null;

  init() {
    if (typeof window === 'undefined') return;
    if (this.pool) return;
    
    // Core check (min 2, max 4)
    const cores = navigator.hardwareConcurrency || 2;
    const poolSize = Math.max(2, Math.min(cores, 4));
    this.pool = new EnginePool(poolSize);
  }

  private evaluateFen(fen: string, depth: number = 10): Promise<{ evalCp: number; bestMove: string; secondEvalCp?: number; secondBestMove?: string }> {
    if (!this.pool) this.init();
    if (!this.pool) return Promise.resolve({ evalCp: 0, bestMove: '' });
    return this.pool.analyze(fen, depth);
  }

  async analyzeGame(pgn: string, onProgress?: (progress: number) => void, depth: number = 10): Promise<GameAnalysis> {
    if (!this.pool) this.init();
    if (this.pool) {
      await this.pool.ready();
    }
    
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    
    const headers = chess.header();
    
    // Parse Elo ratings
    const parseRawElo = (val: string | null | undefined): number | null => {
      if (!val) return null;
      const num = parseInt(val, 10);
      return isNaN(num) ? null : num;
    };
    const rawWhiteElo = parseRawElo(headers.WhiteElo);
    const rawBlackElo = parseRawElo(headers.BlackElo);

    const parseTimeControl = (val: string | null | undefined, defaultSeconds: number = 300): number => {
      if (!val || val === '-' || val === '?') return defaultSeconds;
      const parts = val.split('+');
      const base = parseInt(parts[0], 10);
      if (isNaN(base)) return defaultSeconds;
      const inc = parts[1] ? parseInt(parts[1], 10) : 0;
      const increment = isNaN(inc) ? 0 : inc;
      return base + 60 * increment;
    };
    const rawT = parseTimeControl(headers.TimeControl);
    const T = Math.max(30, Math.min(18000, rawT));

    let timeControlCat: 'Bullet' | 'Blitz' | 'Rapid' = 'Blitz';
    if (T < 180) {
      timeControlCat = 'Bullet';
    } else if (T >= 600) {
      timeControlCat = 'Rapid';
    }

    const site = (headers.Site || headers.Event || "").toLowerCase();
    const isLichess = site.includes("lichess");

    const convertRating = (rating: number): number => {
      if (isLichess) {
        if (timeControlCat === 'Bullet') return Math.round(0.82 * rating + 50);
        if (timeControlCat === 'Blitz') return Math.round(0.85 * rating - 10);
        return Math.round(0.80 * rating + 100);
      } else {
        if (timeControlCat === 'Bullet') return Math.round(0.85 * rating + 200);
        if (timeControlCat === 'Blitz') return Math.round(0.88 * rating + 150);
        return Math.round(0.90 * rating - 50);
      }
    };

    let whiteElo = rawWhiteElo !== null ? convertRating(rawWhiteElo) : null;
    let blackElo = rawBlackElo !== null ? convertRating(rawBlackElo) : null;
    
    // Build list of all FENs to analyze.
    // There are history.length + 1 positions (initial position + positions after each move).
    const fensToAnalyze: string[] = [];
    const tempChess = new Chess();
    fensToAnalyze.push(tempChess.fen()); // Initial position
    for (const move of history) {
      tempChess.move(move);
      fensToAnalyze.push(tempChess.fen());
    }

    const totalFens = fensToAnalyze.length;
    let completedFens = 0;

    // Dispatch all analyses in parallel using EnginePool
    const analysisPromises = fensToAnalyze.map((fen) => {
      if (!this.pool) return Promise.resolve<{ evalCp: number; bestMove: string; secondEvalCp?: number; secondBestMove?: string }>({ evalCp: 0, bestMove: '' });
      return this.pool.analyze(fen, depth).then((res) => {
        completedFens++;
        if (onProgress) {
          onProgress((completedFens / totalFens) * 100);
        }
        return res;
      });
    });

    const evaluatedFens = await Promise.all(analysisPromises);

    const moveAnalyses: MoveAnalysis[] = [];
    const currentChess = new Chess();
    
    let prevEval = evaluatedFens[0].evalCp;
    let prevSecondEval = evaluatedFens[0].secondEvalCp !== undefined ? evaluatedFens[0].secondEvalCp : prevEval;
    let currentBestMove = evaluatedFens[0].bestMove;
    let currentSecondBestMove = evaluatedFens[0].secondBestMove;
    
    let whiteAccuracySum = 0;
    let blackAccuracySum = 0;
    let whiteCpLossSum = 0;
    let blackCpLossSum = 0;
    
    const evaluationHistory: number[] = [0];
    const tallyTemplate = () => ({
      'Brilliant': 0, 'Great': 0, 'Best': 0, 'Excellent': 0, 'Good': 0,
      'Inaccuracy': 0, 'Mistake': 0, 'Blunder': 0, 'Book': 0, 'Forced': 0
    });
    const classificationTally = {
      white: tallyTemplate(),
      black: tallyTemplate()
    };

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const isWhiteTurn = currentChess.turn() === 'w';
      const playerStr = move.from + move.to;
      const isBestMove = currentBestMove.startsWith(playerStr);
      
      const lastFen = currentChess.fen();
      currentChess.move(move);
      const currentFen = currentChess.fen();
      
      // Index in evaluatedFens for the state AFTER this move is i + 1
      const evalResult = evaluatedFens[i + 1];
      const evalCp = evalResult.evalCp;
      const bestMove = evalResult.bestMove;
      const secondEvalCp = evalResult.secondEvalCp;
      const secondBestMove = evalResult.secondBestMove;
      
      const currentEvalForPlayer = -evalCp;
      
      const evalDiffCp = currentEvalForPlayer - prevEval;

      const beforeProb = evalToWinProb(prevEval);
      const afterProb = evalToWinProb(currentEvalForPlayer);
      const accuracy = calculateAccuracy(beforeProb, afterProb);

      if (isWhiteTurn) whiteAccuracySum += accuracy;
      else blackAccuracySum += accuracy;

      const cpLoss = Math.max(0, -evalDiffCp);
      if (isWhiteTurn) whiteCpLossSum += cpLoss;
      else blackCpLossSum += cpLoss;

      // --- WintrChess/freechess Move Classification Algorithm ---
      let classification: MoveAnalysis['classification'] = 'Excellent';
      const isBook = i < 10;
      
      if (isBook) {
        classification = 'Book';
      } else if (secondBestMove === undefined && currentSecondBestMove === undefined) {
        classification = 'Forced';
      } else {
        const evalLoss = prevEval - currentEvalForPlayer;
        const isPrevMate = Math.abs(prevEval) >= 9000;
        const isCurrentMate = Math.abs(currentEvalForPlayer) >= 9000;

        if (isPrevMate && isCurrentMate) {
          if (prevEval > 0 && currentEvalForPlayer < 0) {
            classification = Math.abs(currentEvalForPlayer) < 9996 ? 'Mistake' : 'Blunder';
          } else {
            classification = 'Best';
          }
        } else if (isPrevMate && !isCurrentMate) {
          if (currentEvalForPlayer >= 400) classification = 'Good';
          else if (currentEvalForPlayer >= 150) classification = 'Inaccuracy';
          else if (currentEvalForPlayer >= -100) classification = 'Mistake';
          else classification = 'Blunder';
        } else if (!isPrevMate && isCurrentMate) {
          if (currentEvalForPlayer > 0) classification = 'Best';
          else if (currentEvalForPlayer >= -200) classification = 'Blunder';
          else if (currentEvalForPlayer >= -500) classification = 'Mistake';
          else classification = 'Inaccuracy';
        } else {
          // Centipawn to Centipawn WTF Algorithm
          if (isBestMove || evalLoss <= getEvaluationLossThreshold('Best', prevEval)) {
            classification = 'Best';
          } else if (evalLoss <= getEvaluationLossThreshold('Excellent', prevEval)) {
            classification = 'Excellent';
          } else if (evalLoss <= getEvaluationLossThreshold('Good', prevEval)) {
            classification = 'Good';
          } else if (evalLoss <= getEvaluationLossThreshold('Inaccuracy', prevEval)) {
            classification = 'Inaccuracy';
          } else if (evalLoss <= getEvaluationLossThreshold('Mistake', prevEval)) {
            classification = 'Mistake';
          } else {
            classification = 'Blunder';
          }
        }
      }

      // Check for Brilliant Move
      const winningAnyways = prevSecondEval >= 700;
      if (classification === 'Best' && currentEvalForPlayer >= 0 && !winningAnyways && !move.san.includes('=')) {
        const lastBoard = new Chess(lastFen);
        if (!lastBoard.isCheck()) {
          const currentBoard = new Chess(currentFen);
          const toSquare = move.to as Square;
          const lastPiece = lastBoard.get(toSquare) || { type: 'm', color: 'w' };

          const sacrificedPieces: InfluencingPiece[] = [];
          const files = 'abcdefgh';
          const moveColorChar = move.color;
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const piece = currentBoard.board()[r][c];
              if (!piece) continue;
              if (piece.color !== moveColorChar) continue;
              if (piece.type === 'k' || piece.type === 'p') continue;

              if (pieceValues[lastPiece.type] >= pieceValues[piece.type]) {
                continue;
              }

              const pieceSquare = (files[c] + (8 - r)) as Square;
              if (isPieceHanging(lastFen, currentFen, pieceSquare)) {
                classification = 'Brilliant';
                sacrificedPieces.push({
                  square: pieceSquare,
                  color: piece.color,
                  type: piece.type,
                });
              }
            }
          }

          if (classification === 'Brilliant' && sacrificedPieces.length > 0) {
            let anyPieceViablyCapturable = false;
            const captureTestBoard = new Chess(currentFen);

            for (const piece of sacrificedPieces) {
              const attackers = getAttackers(currentFen, piece.square);

              for (const attacker of attackers) {
                for (const promotion of promotions) {
                  try {
                    captureTestBoard.move({
                      from: attacker.square,
                      to: piece.square,
                      promotion: promotion,
                    });

                    let attackerPinned = false;
                    for (let r = 0; r < 8; r++) {
                      for (let c = 0; c < 8; c++) {
                        const enemyPiece = captureTestBoard.board()[r][c];
                        if (!enemyPiece) continue;
                        if (enemyPiece.color === captureTestBoard.turn()) continue;
                        if (enemyPiece.type === 'k' || enemyPiece.type === 'p') continue;

                        const enemySquare = (files[c] + (8 - r)) as Square;
                        const maxSackValue = Math.max(...sacrificedPieces.map((sack) => pieceValues[sack.type]));
                        if (
                          isPieceHanging(currentFen, captureTestBoard.fen(), enemySquare) &&
                          pieceValues[enemyPiece.type] >= maxSackValue
                        ) {
                          attackerPinned = true;
                          break;
                        }
                      }
                      if (attackerPinned) break;
                    }

                    if (pieceValues[piece.type] >= 5) {
                      if (!attackerPinned) {
                        anyPieceViablyCapturable = true;
                        break;
                      }
                    } else if (
                      !attackerPinned &&
                      !captureTestBoard.moves().some((m) => m.endsWith('#'))
                    ) {
                      anyPieceViablyCapturable = true;
                      break;
                    }

                    captureTestBoard.undo();
                  } catch {
                    // illegal
                  }
                }
                if (anyPieceViablyCapturable) break;
              }
              if (anyPieceViablyCapturable) break;
            }

            if (!anyPieceViablyCapturable) {
              classification = 'Best';
            }
          }
        }
      }

      // Check for Great Move
      const noMate = Math.abs(prevEval) < 9000 && Math.abs(currentEvalForPlayer) < 9000;
      const lastClassification = i > 0 ? moveAnalyses[i - 1].classification : 'Book';
      if (
        classification === 'Best' &&
        noMate &&
        lastClassification === 'Blunder' &&
        Math.abs(prevEval - prevSecondEval) >= 150 &&
        !isPieceHanging(lastFen, currentFen, move.to as Square)
      ) {
        classification = 'Great';
      }

      // Do not allow blunder if move still completely winning
      if (classification === 'Blunder' && currentEvalForPlayer >= 600) {
        classification = 'Good';
      }

      if (isWhiteTurn) {
        classificationTally.white[classification]++;
      } else {
        classificationTally.black[classification]++;
      }

      const evalFromWhitePerspective = isWhiteTurn ? currentEvalForPlayer : -currentEvalForPlayer;
      evaluationHistory.push(evalFromWhitePerspective);

      moveAnalyses.push({
        san: move.san,
        from: move.from,
        to: move.to,
        evaluation: currentEvalForPlayer,
        classification,
        accuracy,
        bestMove: currentBestMove
      });

      prevEval = evalCp;
      prevSecondEval = secondEvalCp !== undefined ? secondEvalCp : evalCp;
      currentBestMove = bestMove;
      currentSecondBestMove = secondBestMove;
    }
    
    const totalWhiteMoves = Math.ceil(history.length / 2);
    const totalBlackMoves = Math.floor(history.length / 2);
    
    const whiteAccuracy = totalWhiteMoves > 0 ? Math.round(whiteAccuracySum / totalWhiteMoves * 10) / 10 : 100;
    const blackAccuracy = totalBlackMoves > 0 ? Math.round(blackAccuracySum / totalBlackMoves * 10) / 10 : 100;

    const whiteACPL = totalWhiteMoves > 0 ? (whiteCpLossSum / totalWhiteMoves) : 0;
    const blackACPL = totalBlackMoves > 0 ? (blackCpLossSum / totalBlackMoves) : 0;

    const timeWeight = 13 + 3.5 * Math.log(T);
    const finalWhiteElo = whiteElo !== null ? whiteElo : Math.max(100, Math.min(3200, Math.round(2900 - timeWeight * whiteACPL)));
    const finalBlackElo = blackElo !== null ? blackElo : Math.max(100, Math.min(3200, Math.round(2900 - timeWeight * blackACPL)));

    const b = 0.8;
    const beta = 136.67;
    const gamma = 16.67;

    const denominator = Math.max(5, beta - gamma * Math.log(T));
    const W_t = (b * T) / denominator;

    const whitePerformanceRaw = (finalBlackElo + b * T) - (whiteACPL * W_t);
    const blackPerformanceRaw = (finalWhiteElo + b * T) - (blackACPL * W_t);

    const whitePerformance = Math.max(600, Math.min(3200, Math.round(whitePerformanceRaw)));
    const blackPerformance = Math.max(600, Math.min(3200, Math.round(blackPerformanceRaw)));

    return {
      moves: moveAnalyses,
      whiteAccuracy,
      blackAccuracy,
      whitePerformance,
      blackPerformance,
      evaluationHistory,
      classificationTally,
      whiteElo: finalWhiteElo,
      blackElo: finalBlackElo
    };
  }

  destroy() {
    if (this.pool) {
      this.pool.destroy();
      this.pool = null;
    }
  }
}
