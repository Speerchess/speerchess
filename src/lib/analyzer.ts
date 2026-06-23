import { Chess } from 'chess.js';

export interface MoveAnalysis {
  san: string;
  from: string;
  to: string;
  evaluation: number; // in centipawns
  classification: 'Brilliant' | 'Great' | 'Best' | 'Excellent' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder' | 'Book' | 'Forced';
  accuracy: number;
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

// freechess-style classification (simplified)
function classifyMove(
  beforeProb: number,
  afterProb: number,
  evalDiffCp: number,
  evalCpBefore: number,
  isBook: boolean,
  isBestMove: boolean
): MoveAnalysis['classification'] {
  if (isBook) return 'Book';
  
  const winProbLoss = beforeProb - afterProb;
  
  // 1. If it is the engine's recommended best move, prevent blunder/mistake classification
  if (isBestMove) {
    if (evalDiffCp >= 200 && evalCpBefore < 0) return 'Brilliant';
    if (evalDiffCp >= 100) return 'Great';
    return 'Best';
  }
  
  // 2. Win probability loss thresholds (Freechess / Chess.com style)
  if (winProbLoss >= 0.20) return 'Blunder';
  if (winProbLoss >= 0.10) return 'Mistake';
  if (winProbLoss >= 0.05) return 'Inaccuracy';
  if (winProbLoss >= 0.02) return 'Good';
  if (winProbLoss > -0.02) return 'Excellent';
  
  // Fallbacks for positive eval differences
  if (evalDiffCp >= 200 && evalCpBefore < 0) return 'Brilliant';
  if (evalDiffCp >= 100) return 'Great';
  
  return 'Excellent';
}

export class ChessAnalyzer {
  private worker: Worker | null = null;
  private isReady = false;
  private messageCallback: ((msg: string) => void) | null = null;

  init() {
    if (typeof window === 'undefined') return;
    if (this.worker) return;
    
    // Load the WASM stockfish from the public folder
    this.worker = new Worker('/stockfish.js');
    
    this.worker.onmessage = (e) => {
      if (e.data === 'uciok') {
        this.isReady = true;
      }
      if (this.messageCallback) {
        this.messageCallback(e.data);
      }
    };
    
    this.worker.postMessage('uci');
  }

  private evaluateFen(fen: string, depth: number = 10): Promise<{ evalCp: number; bestMove: string }> {
    return new Promise((resolve) => {
      if (!this.worker) return resolve({ evalCp: 0, bestMove: '' });
      
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
      
      let evalCp = 0;
      let bestMove = '';
      
      this.messageCallback = (msg: string) => {
        const matchEval = msg.match(/score cp (-?\d+)/);
        if (matchEval) {
          evalCp = parseInt(matchEval[1], 10);
        }
        const matchMate = msg.match(/score mate (-?\d+)/);
        if (matchMate) {
          evalCp = parseInt(matchMate[1], 10) > 0 ? 10000 : -10000;
        }
        
        if (msg.startsWith('bestmove')) {
          bestMove = msg.split(' ')[1];
          this.messageCallback = null; // Clear callback
          resolve({ evalCp, bestMove });
        }
      };
    });
  }

  async analyzeGame(pgn: string, onProgress?: (progress: number) => void, depth: number = 10): Promise<GameAnalysis> {
    if (!this.worker) this.init();
    
    // Initialize new game once per analysis to keep the engine search state & transposition cache warm
    if (this.worker) {
      this.worker.postMessage('ucinewgame');
    }
    
    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    
    const headers = chess.header();
    
    // Parse Elo ratings from PGN headers
    const parseElo = (val: string | null | undefined, defaultElo: number = 1500): number => {
      if (!val) return defaultElo;
      const num = parseInt(val, 10);
      return isNaN(num) ? defaultElo : num;
    };
    const whiteElo = parseElo(headers.WhiteElo);
    const blackElo = parseElo(headers.BlackElo);

    // Parse TimeControl to get T (effective time budget in seconds)
    const parseTimeControl = (val: string | null | undefined, defaultSeconds: number = 600): number => {
      if (!val || val === '-' || val === '?') return defaultSeconds;
      const parts = val.split('+');
      const base = parseInt(parts[0], 10);
      if (isNaN(base)) return defaultSeconds;
      const inc = parts[1] ? parseInt(parts[1], 10) : 0;
      const increment = isNaN(inc) ? 0 : inc;
      // T = base + 40 * increment
      return base + 40 * increment;
    };
    const rawT = parseTimeControl(headers.TimeControl);
    const T = Math.max(30, Math.min(18000, rawT));
    
    const moveAnalyses: MoveAnalysis[] = [];
    const currentChess = new Chess();
    
    let prevEval = 0; // Starting position is roughly 0
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

    // Evaluate opening position
    const { evalCp: initialEval, bestMove: initialBest } = await this.evaluateFen(currentChess.fen(), depth);
    prevEval = initialEval;
    let currentBestMove = initialBest;

    for (let i = 0; i < history.length; i++) {
      const move = history[i];
      const isWhiteTurn = currentChess.turn() === 'w';
      const playerStr = move.from + move.to;
      const isBestMove = currentBestMove.startsWith(playerStr);
      
      currentChess.move(move);
      
      const { evalCp, bestMove } = await this.evaluateFen(currentChess.fen(), depth);
      const currentEvalForPlayer = -evalCp;
      
      const evalDiffCp = currentEvalForPlayer - prevEval;

      const beforeProb = evalToWinProb(prevEval);
      const afterProb = evalToWinProb(currentEvalForPlayer);
      const accuracy = calculateAccuracy(beforeProb, afterProb);

      if (isWhiteTurn) whiteAccuracySum += accuracy;
      else blackAccuracySum += accuracy;

      // Track Centipawn Loss (for ACPL calculation)
      const cpLoss = Math.max(0, -evalDiffCp);
      if (isWhiteTurn) whiteCpLossSum += cpLoss;
      else blackCpLossSum += cpLoss;

      // Classify using win probability difference
      const classification = classifyMove(beforeProb, afterProb, evalDiffCp, prevEval, i < 10, isBestMove);

      if (isWhiteTurn) {
        classificationTally.white[classification]++;
      } else {
        classificationTally.black[classification]++;
      }

      // Add to evaluation history from white's perspective
      const evalFromWhitePerspective = isWhiteTurn ? currentEvalForPlayer : -currentEvalForPlayer;
      evaluationHistory.push(evalFromWhitePerspective);

      moveAnalyses.push({
        san: move.san,
        from: move.from,
        to: move.to,
        evaluation: currentEvalForPlayer,
        classification,
        accuracy
      });

      prevEval = evalCp;
      currentBestMove = bestMove;
      
      if (onProgress) onProgress(((i + 1) / history.length) * 100);
    }
    
    const totalWhiteMoves = Math.ceil(history.length / 2);
    const totalBlackMoves = Math.floor(history.length / 2);
    
    const whiteAccuracy = totalWhiteMoves > 0 ? Math.round(whiteAccuracySum / totalWhiteMoves * 10) / 10 : 100;
    const blackAccuracy = totalBlackMoves > 0 ? Math.round(blackAccuracySum / totalBlackMoves * 10) / 10 : 100;

    const whiteACPL = totalWhiteMoves > 0 ? (whiteCpLossSum / totalWhiteMoves) : 0;
    const blackACPL = totalBlackMoves > 0 ? (blackCpLossSum / totalBlackMoves) : 0;

    // Ultimate Continuous Model rating constants
    const b = 0.8;
    const beta = 136.67;
    const gamma = 16.67;

    const denominator = Math.max(5, beta - gamma * Math.log(T));
    const W_t = (b * T) / denominator;

    const whitePerformanceRaw = (blackElo + b * T) - (whiteACPL * W_t);
    const blackPerformanceRaw = (whiteElo + b * T) - (blackACPL * W_t);

    const whitePerformance = Math.max(600, Math.min(3200, Math.round(whitePerformanceRaw)));
    const blackPerformance = Math.max(600, Math.min(3200, Math.round(blackPerformanceRaw)));

    return {
      moves: moveAnalyses,
      whiteAccuracy,
      blackAccuracy,
      whitePerformance,
      blackPerformance,
      evaluationHistory,
      classificationTally
    };
  }

  destroy() {
    if (this.worker) {
      this.worker.postMessage('quit');
      this.worker.terminate();
      this.worker = null;
    }
  }
}
