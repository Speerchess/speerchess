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
function classifyMove(evalDiffCp: number, evalCpBefore: number, isBook: boolean, isBestMove: boolean): MoveAnalysis['classification'] {
  if (isBook) return 'Book';
  
  if (evalDiffCp <= -300) return 'Blunder';
  if (evalDiffCp <= -100) return 'Mistake';
  if (evalDiffCp <= -50) return 'Inaccuracy';
  
  if (evalDiffCp >= 200 && evalCpBefore < 0) return 'Brilliant';
  if (evalDiffCp >= 100) return 'Great';
  if (isBestMove) return 'Best';
  if (evalDiffCp > -20) return 'Excellent';
  return 'Good';
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
    
    const moveAnalyses: MoveAnalysis[] = [];
    const currentChess = new Chess();
    
    let prevEval = 0; // Starting position is roughly 0
    let whiteAccuracySum = 0;
    let blackAccuracySum = 0;
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
      
      // Stockfish always evaluates from the perspective of the player to move
      // If it's black's turn now (after white moved), the eval is black's perspective
      // Let's normalize it to the perspective of the player who just moved
      const { evalCp, bestMove } = await this.evaluateFen(currentChess.fen(), depth);
      
      // We want to calculate the difference from the perspective of the player who just moved
      // Before move: prevEval was from perspective of player who moved.
      // After move: evalCp is from perspective of the OTHER player.
      // So the new eval from the perspective of the player who moved is -evalCp
      const currentEvalForPlayer = -evalCp;
      
      const evalDiffCp = currentEvalForPlayer - prevEval;

      const beforeProb = evalToWinProb(prevEval);
      const afterProb = evalToWinProb(currentEvalForPlayer);
      const accuracy = calculateAccuracy(beforeProb, afterProb);

      if (isWhiteTurn) whiteAccuracySum += accuracy;
      else blackAccuracySum += accuracy;

      // Classify
      const classification = classifyMove(evalDiffCp, prevEval, i < 10, isBestMove);

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

      prevEval = evalCp; // Prepare for next iteration (perspective of other player)
      currentBestMove = bestMove;
      
      if (onProgress) onProgress(((i + 1) / history.length) * 100);
    }
    
    const totalWhiteMoves = Math.ceil(history.length / 2);
    const totalBlackMoves = Math.floor(history.length / 2);
    
    const whiteAccuracy = totalWhiteMoves > 0 ? Math.round(whiteAccuracySum / totalWhiteMoves * 10) / 10 : 100;
    const blackAccuracy = totalBlackMoves > 0 ? Math.round(blackAccuracySum / totalBlackMoves * 10) / 10 : 100;

    return {
      moves: moveAnalyses,
      whiteAccuracy,
      blackAccuracy,
      whitePerformance: Math.round(1000 + (whiteAccuracy - 50) * 35),
      blackPerformance: Math.round(1000 + (blackAccuracy - 50) * 35),
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
