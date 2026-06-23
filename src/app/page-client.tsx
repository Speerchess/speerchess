'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Play, Download, Settings, Loader2, ChevronLeft, ChevronRight, CheckCircle2, Layers, Globe, Star, Info, Menu, X } from 'lucide-react';
import { ChessAnalyzer, GameAnalysis, MoveAnalysis } from '../lib/analyzer';
import { generateGifClient } from '../lib/gifGeneratorClient';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

type ViewState = 'INPUT' | 'LOADING' | 'SUMMARY' | 'REVIEW';
type ReviewTabState = 'MOVES' | 'ENGINE'; // MOVES: 감상모드, ENGINE: 분석모드

const SPECIAL_CLASSIFICATIONS = ['Brilliant', 'Great', 'Inaccuracy', 'Mistake', 'Blunder'];

const quotes = [
  "핀에 묶인 기물의 방어력은 환상에 불과하다. — 지크베르트 타라시",
  "체스는 마음의 훈련장이다. — 블레즈 파스칼",
  "좋은 수를 찾았다고 생각한다면, 더 좋은 수를 찾아라. — 에마누엘 라스커",
  "전술은 무엇을 해야 할지 알 때 하는 것이고, 전략은 무엇을 해야 할지 모를 때 하는 것이다. — 사비엘리 타르타코어",
  "체스판은 64개의 사각형으로 이루어진 세계이며, 나는 그 세계의 창조주이자 지배자다. — 가리 카스파로프",
  "체스는 비극이 아니라 지적 투쟁이다. — 알렉산더 알레힌"
];

// Speerchess Custom Board Themes
const boardThemes = {
  slate: { dark: '#475569', light: '#e2e8f0', name: '스피어 슬레이트' },
  emerald: { dark: '#0f5132', light: '#d1fae5', name: '스피어 에메랄드' },
  cobalt: { dark: '#1e3a8a', light: '#dbeafe', name: '스피어 코발트' }
};

// Convert Stockfish UCI PV moves (e.g. "g2d5 e6d5") into Standard Algebraic Notation (SAN) (e.g. "1... Bxd5 2. exd5")
const uciPvToSan = (fen: string, pv: string): string => {
  try {
    const chess = new Chess(fen);
    const uciMoves = pv.trim().split(/\s+/);
    
    // Parse FEN fullmove count
    const fenParts = fen.split(' ');
    let fullmoveNumber = parseInt(fenParts[5] || '1', 10);
    
    let formatted = '';
    for (let i = 0; i < uciMoves.length; i++) {
      const uci = uciMoves[i];
      if (!uci) continue;
      
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.slice(4, 5) || undefined;
      
      const activeColor = chess.turn();
      const moveObj = chess.move({ from, to, promotion });
      const san = moveObj.san;
      
      if (i === 0) {
        if (activeColor === 'w') {
          formatted += `${fullmoveNumber}. ${san}`;
        } else {
          formatted += `${fullmoveNumber}... ${san}`;
        }
      } else {
        if (activeColor === 'w') {
          fullmoveNumber++;
          formatted += ` ${fullmoveNumber}. ${san}`;
        } else {
          formatted += ` ${san}`;
        }
      }
    }
    return formatted;
  } catch (err) {
    return pv;
  }
};

const SAMPLE_PGN_FULL = `[Event "Fried Liver Attack"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nce7 9. d4 c6 10. Bg5 h6 11. Bxe7 Bxe7 12. O-O-O Rf8 13. Qe4 Bg5+ 14. Kb1 Rf4 15. Qxe5+ Kf7 16. Nxd5 cxd5 17. Bxd5+ Kf8 18. Rhe1 Rf5 19. Qe4 Rxd5 20. Qh7 Bf5 21. Qh8+ Kf7 22. Qxd8 Raxd8`;

// Standard Chess Symbols for speerchess
const classificationSymbols: Record<string, string> = {
  'Brilliant': '!!',
  'Great': '!',
  'Best': '★',
  'Excellent': '●',
  'Good': '✓',
  'Inaccuracy': '!?',
  'Mistake': '?',
  'Blunder': '??',
  'Book': '◆',
  'Forced': '🔒'
};

const getClassificationStyle = (classification: string, isCurrent: boolean) => {
  if (isCurrent) {
    return 'bg-slate-800 text-white shadow-md ring-2 ring-slate-800 ring-offset-1 border-transparent';
  }
  switch (classification) {
    case 'Brilliant': return 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200';
    case 'Great': return 'bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200';
    case 'Inaccuracy': return 'bg-yellow-50 hover:bg-yellow-100 text-yellow-800 border border-yellow-250';
    case 'Mistake': return 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200';
    case 'Blunder': return 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200';
    default: return 'bg-white hover:bg-stone-50 text-slate-855 border border-stone-200/60';
  }
};

const getBadgeStyle = (classification: string) => {
  switch (classification) {
    case 'Brilliant': return 'bg-cyan-500 text-white';
    case 'Great': return 'bg-sky-500 text-white';
    case 'Best': return 'bg-green-600 text-white';
    case 'Excellent': return 'bg-emerald-500 text-white';
    case 'Good': return 'bg-slate-500 text-white';
    case 'Book': return 'bg-amber-700 text-white';
    case 'Forced': return 'bg-slate-600 text-white';
    case 'Inaccuracy': return 'bg-yellow-500 text-slate-900';
    case 'Mistake': return 'bg-orange-500 text-white';
    case 'Blunder': return 'bg-red-500 text-white';
    default: return 'bg-slate-500 text-white';
  }
};

const getEvalStr = (evaluation: number) => {
  if (Math.abs(evaluation) >= 9000) {
    return evaluation > 0 ? 'M' : '-M';
  }
  const score = evaluation / 100;
  return score > 0 ? `+${score.toFixed(1)}` : score.toFixed(1);
};

const getEvalPercent = (evaluation: number) => {
  if (Math.abs(evaluation) >= 9000) {
    return evaluation > 0 ? 100 : 0;
  }
  const clamped = Math.max(-800, Math.min(800, evaluation));
  return ((clamped + 800) / 1600) * 100;
};

const getPgnFromUrl = async (url: string): Promise<string> => {
  const cleanUrl = url.trim();
  if (cleanUrl.includes('lichess.org')) {
    const match = cleanUrl.match(/lichess\.org\/([a-zA-Z0-9]{8,12})/);
    if (match && match[1]) {
      const gameId = match[1];
      const res = await fetch(`https://lichess.org/game/export/${gameId}?clocks=false&evals=false`);
      if (!res.ok) {
        throw new Error('Lichess 게임 데이터를 가져오는데 실패했습니다.');
      }
      return await res.text();
    }
  }
  if (cleanUrl.includes('chess.com')) {
    throw new Error('Chess.com 링크는 CORS 보안 정책으로 인해 직접 불러올 수 없습니다. 아래 기보(PGN) 입력창에 PGN 텍스트를 직접 붙여넣어 주세요.');
  }
  throw new Error('올바른 Lichess 링크 또는 PGN 기보를 입력해 주세요.');
};

const getGameResult = (pgnText: string) => {
  if (pgnText.includes('[Result "1-0"]')) return '백 (White) 승리';
  if (pgnText.includes('[Result "0-1"]')) return '흑 (Black) 승리';
  if (pgnText.includes('[Result "1/2-1/2"]')) return '무승부 (Draw)';
  return '분석 완료';
};

// Custom Speer Logo (Minimalist spear head representation)
const SpeerLogo = ({ className = "w-6 h-6 text-slate-800" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 2 11 6 11 9 14 9 18 5 22 2" fill="currentColor" />
    <path d="M9 15l-1 4-5 5 5-5 4-1z" />
  </svg>
);

// Board Annotation Badges mapping (Only show !!, !, !?, ?, ??)
const getBoardBadge = (classification: string) => {
  let symbol = '';
  let color = '';
  switch (classification) {
    case 'Brilliant':
      symbol = '!!';
      color = 'bg-cyan-500';
      break;
    case 'Great':
      symbol = '!';
      color = 'bg-sky-500';
      break;
    case 'Inaccuracy':
      symbol = '!?';
      color = 'bg-yellow-500 text-slate-900';
      break;
    case 'Mistake':
      symbol = '?';
      color = 'bg-orange-500';
      break;
    case 'Blunder':
      symbol = '??';
      color = 'bg-red-500';
      break;
  }
  if (!symbol) return null;
  return (
    <div className={`absolute top-0 right-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white ${color} border border-white shadow-md z-30 select-none`}>
      {symbol}
    </div>
  );
};

// Converts Stockfish PV string (e.g. e2e4 g7g6) to standard human-readable PGN notation
const formatPv = (fen: string, pvString: string): string => {
  try {
    const temp = new Chess(fen);
    const uciMoves = pvString.split(' ');
    const sanMoves: string[] = [];
    for (const uci of uciMoves) {
      if (!uci) continue;
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
      const move = temp.move({ from, to, promotion });
      if (move) {
        sanMoves.push(move.san);
      } else {
        break;
      }
    }
    
    if (sanMoves.length === 0) return pvString;
    
    const tokens = fen.split(' ');
    let moveNum = parseInt(tokens[5] || '1', 10);
    const turn = tokens[1] || 'w';
    
    let formatted = '';
    let isWhite = turn === 'w';
    
    sanMoves.forEach((san, index) => {
      if (index === 0) {
        formatted += isWhite ? `${moveNum}. ${san}` : `${moveNum}... ${san}`;
      } else {
        if (isWhite) {
          formatted += ` ${moveNum}. ${san}`;
        } else {
          formatted += ` ${san}`;
        }
      }
      if (!isWhite) {
        moveNum++;
      }
      isWhite = !isWhite;
    });
    return formatted;
  } catch (e) {
    return pvString;
  }
};

interface EngineLine {
  multipv: number;
  score: number;
  isMate: boolean;
  pv: string;
}

export default function Home() {
  const [view, setView] = useState<ViewState>('INPUT');
  const [pgn, setPgn] = useState('');
  const [progress, setProgress] = useState(0);
  const [quote, setQuote] = useState('');
  const [isLoadingPgn, setIsLoadingPgn] = useState(false);
  const [isExportingGif, setIsExportingGif] = useState(false);
  
  // Settings
  const [depth, setDepth] = useState<12 | 14 | 16>(14);
  const [boardTheme, setBoardTheme] = useState<'slate' | 'emerald' | 'cobalt'>('slate');

  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const analyzerRef = useRef<ChessAnalyzer | null>(null);

  // Review state
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [reviewChess] = useState(new Chess());
  const [fen, setFen] = useState(reviewChess.fen());
  const fenRef = useRef(fen);
  useEffect(() => {
    fenRef.current = fen;
  }, [fen]);

  // Review view tab state (MOVES: 감상모드, ENGINE: 분석모드)
  const [reviewTab, setReviewTab] = useState<ReviewTabState>('MOVES');
  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  const reviewWorkerRef = useRef<Worker | null>(null);
  const tempLinesRef = useRef<Record<number, EngineLine>>({});

  // Self analysis custom moves path (Side line variations)
  const [analysisPath, setAnalysisPath] = useState<string[]>([]);
  const [variationStartMoveIndex, setVariationStartMoveIndex] = useState<number | null>(null);
  const [activeVariationIndex, setActiveVariationIndex] = useState<number | null>(null);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [analysisDepth, setAnalysisDepth] = useState<number>(16);

  const [isSharing, setIsSharing] = useState(false);
  const [sharedHashid, setSharedHashid] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Memoized move pairs for the appreciation mode list to avoid calculating on every single board render
  const movePairs = useMemo(() => {
    if (!analysis) return [];
    return analysis.moves.reduce((pairs, move, index) => {
      if (index % 2 === 0) pairs.push([{ move, index }]);
      else pairs[pairs.length - 1].push({ move, index });
      return pairs;
    }, [] as { move: MoveAnalysis; index: number }[][]);
  }, [analysis]);

  const params = useParams();
  const hashid = params?.hashid as string | undefined;

  useEffect(() => {
    if (!hashid) return;

    const loadSharedGame = async () => {
      setView('LOADING');
      setProgress(0);
      setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
      try {
        const res = await fetch(`/api/games?hashid=${hashid}`);
        if (!res.ok) {
          throw new Error('공유된 게임 데이터를 불러오지 못했습니다.');
        }
        const data = await res.json();
        
        // Load the game data
        const gameAnalysis = JSON.parse(data.analysis_json);
        setAnalysis(gameAnalysis);
        reviewChess.loadPgn(data.pgn);
        setFen(new Chess().fen());
        setCurrentMoveIndex(-1);
        
        // Set shared hashid state
        setSharedHashid(hashid);
        
        // Go straight to review analysis mode
        setView('REVIEW');
        setReviewTab('ENGINE');
      } catch (e: any) {
        alert(e.message || '게임 로딩 중 오류가 발생했습니다.');
        setView('INPUT');
      }
    };

    loadSharedGame();
  }, [hashid]);

  useEffect(() => {
    analyzerRef.current = new ChessAnalyzer();
    analyzerRef.current.init();
    return () => {
      analyzerRef.current?.destroy();
    };
  }, []);

  // Initialize background review analyzer worker
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const worker = new Worker('/stockfish.js');
    reviewWorkerRef.current = worker;
    
    worker.postMessage('uci');
    worker.postMessage('setoption name MultiPV value 3');
    
    worker.onmessage = (e) => {
      const msg = e.data as string;
      if (msg.startsWith('info') && msg.includes('multipv')) {
        const depthMatch = msg.match(/depth (\d+)/);
        const multipvMatch = msg.match(/multipv (\d+)/);
        const pvMatch = msg.match(/ pv (.*)$/);
        
        if (multipvMatch && pvMatch) {
          const multipv = parseInt(multipvMatch[1], 10);
          const pv = pvMatch[1];
          
          let score = 0;
          let isMate = false;
          
          const cpMatch = msg.match(/score cp (-?\d+)/);
          if (cpMatch) {
            score = parseInt(cpMatch[1], 10);
          }
          const mateMatch = msg.match(/score mate (-?\d+)/);
          if (mateMatch) {
            score = parseInt(mateMatch[1], 10);
            isMate = true;
          }
          
          // Only update if it is a meaningful search depth
          const currentDepth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
          if (currentDepth >= 4) {
            // Convert coordinate PV to algebraic notation (SAN) using active FEN
            const sanPv = uciPvToSan(fenRef.current, pv);
            tempLinesRef.current[multipv] = {
              multipv,
              score,
              isMate,
              pv: sanPv
            };
            const sortedLines = Object.values(tempLinesRef.current).sort((a, b) => a.multipv - b.multipv);
            setEngineLines(sortedLines);
          }
        }
      }
    };
    
    return () => {
      worker.postMessage('quit');
      worker.terminate();
    };
  }, []);

  // Trigger real-time Stockfish engine calculation when navigating FEN (Runs in both 감상모드 and 분석모드)
  useEffect(() => {
    if (!reviewWorkerRef.current || view !== 'REVIEW') return;
    
    setEngineLines([]);
    tempLinesRef.current = {};
    
    reviewWorkerRef.current.postMessage('stop');
    reviewWorkerRef.current.postMessage(`position fen ${fen}`);
    reviewWorkerRef.current.postMessage(`go depth ${analysisDepth}`);
  }, [fen, view, analysisDepth]);

  // Auto-scroll move list to active move in Appreciation Mode (감상모드)
  useEffect(() => {
    if (currentMoveIndex >= 0 && reviewTab === 'MOVES') {
      const element = document.getElementById(`move-btn-${currentMoveIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentMoveIndex, reviewTab]);

  const handleAnalyze = async () => {
    let pgnToUse = pgn.trim();
    if (!pgnToUse) return;

    setView('LOADING');
    setProgress(0);
    setAnalysis(null);
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);

    try {
      if (pgnToUse.startsWith('http') || pgnToUse.includes('lichess.org')) {
        setIsLoadingPgn(true);
        try {
          pgnToUse = await getPgnFromUrl(pgnToUse);
          setPgn(pgnToUse);
        } catch (urlErr: any) {
          setIsLoadingPgn(false);
          alert(urlErr.message || 'URL에서 PGN을 가져오는데 실패했습니다.');
          setView('INPUT');
          return;
        }
        setIsLoadingPgn(false);
      }

      if (!analyzerRef.current) throw new Error("Analyzer가 초기화되지 않았습니다.");
      
      const gameAnalysis = await analyzerRef.current.analyzeGame(pgnToUse, (p) => {
        setProgress(p);
      }, depth);
      
      setAnalysis(gameAnalysis);
      reviewChess.loadPgn(pgnToUse);
      setFen(new Chess().fen()); // Reset board to initial state
      setCurrentMoveIndex(-1);
      setAnalysisPath([]);
      setVariationStartMoveIndex(null);
      setActiveVariationIndex(null);
      setView('SUMMARY');
    } catch (err: any) {
      console.error(err);
      alert(err.message || '분석 중 오류가 발생했습니다.');
      setView('INPUT');
    }
  };

  const startReview = () => {
    setView('REVIEW');
    setReviewTab('MOVES');
    setAnalysisPath([]);
    setVariationStartMoveIndex(null);
    setActiveVariationIndex(null);
  };

  const goToMove = (index: number) => {
    if (!analysis) return;
    setActiveVariationIndex(null);
    const tempChess = new Chess();
    for (let i = 0; i <= index; i++) {
      tempChess.move(analysis.moves[i].san);
    }
    setFen(tempChess.fen());
    setCurrentMoveIndex(index);
  };

  // Toggle tab view: handles resetting the board position when switching back to the moves list view
  const handleTabToggle = () => {
    setReviewTab(prev => {
      const nextTab = prev === 'MOVES' ? 'ENGINE' : 'MOVES';
      if (nextTab === 'MOVES') {
        setAnalysisPath([]);
        setVariationStartMoveIndex(null);
        setActiveVariationIndex(null);
        if (analysis) {
          const tempChess = new Chess();
          for (let i = 0; i <= currentMoveIndex; i++) {
            tempChess.move(analysis.moves[i].san);
          }
          setFen(tempChess.fen());
        }
      }
      return nextTab;
    });
  };

  // Drag and drop piece handler during Self-Analysis mode
  const handlePieceDrop = (args: { piece: any; sourceSquare: string; targetSquare: string | null }): boolean => {
    const { sourceSquare, targetSquare } = args;
    if (!targetSquare) return false;

    try {
      const tempChess = new Chess(fen);
      
      // Auto promote to queen if a pawn reaches the ends
      const pieceType = tempChess.get(sourceSquare as any)?.type;
      const isPawn = pieceType === 'p';
      const isPromotionRank = targetSquare[1] === '8' || targetSquare[1] === '1';
      const promotion = (isPawn && isPromotionRank) ? 'q' : undefined;

      const move = tempChess.move({
        from: sourceSquare as any,
        to: targetSquare as any,
        promotion
      });

      if (move) {
        // Check if this move matches the next move in the main line
        const nextGameMove = analysis?.moves[currentMoveIndex + 1];
        const isNextGameMove = nextGameMove && (
          nextGameMove.san === move.san ||
          (nextGameMove.from === sourceSquare && nextGameMove.to === targetSquare)
        );

        if (isNextGameMove) {
          // Just advance along the main line
          goToMove(currentMoveIndex + 1);
          return true;
        }

        // It is a deviation!
        // If we are currently on the main line (either because variationStartMoveIndex is null, or activeVariationIndex is null)
        if (variationStartMoveIndex === null || activeVariationIndex === null) {
          setVariationStartMoveIndex(currentMoveIndex);
          setAnalysisPath([move.san]);
          setActiveVariationIndex(0);
          setFen(tempChess.fen());
          return true;
        } else {
          // We are in a variation
          const currentPath = analysisPath.slice(0, activeVariationIndex + 1);
          const newPath = [...currentPath, move.san];
          setAnalysisPath(newPath);
          setActiveVariationIndex(newPath.length - 1);
          setFen(tempChess.fen());
          return true;
        }
      }
    } catch (e) {
      return false;
    }
    return false;
  };

  const resetSelfAnalysis = () => {
    setAnalysisPath([]);
    setVariationStartMoveIndex(null);
    setActiveVariationIndex(null);
    if (!analysis) return;
    const tempChess = new Chess();
    for (let i = 0; i <= currentMoveIndex; i++) {
      tempChess.move(analysis.moves[i].san);
    }
    setFen(tempChess.fen());
  };

  const goToVariationMove = (varIdx: number) => {
    if (!analysis || variationStartMoveIndex === null) return;
    
    // Calculate FEN at variationStartMoveIndex + variation moves up to varIdx
    const tempChess = new Chess();
    for (let i = 0; i <= variationStartMoveIndex; i++) {
      tempChess.move(analysis.moves[i].san);
    }
    for (let i = 0; i <= varIdx; i++) {
      tempChess.move(analysisPath[i]);
    }
    setFen(tempChess.fen());
    setActiveVariationIndex(varIdx);
  };

  const handlePrevMove = () => {
    if (!analysis) return;
    if (activeVariationIndex !== null) {
      if (activeVariationIndex === 0) {
        goToMove(variationStartMoveIndex!);
      } else {
        goToVariationMove(activeVariationIndex - 1);
      }
    } else {
      goToMove(Math.max(-1, currentMoveIndex - 1));
    }
  };

  const handleNextMove = () => {
    if (!analysis) return;
    if (activeVariationIndex !== null) {
      if (activeVariationIndex < analysisPath.length - 1) {
        goToVariationMove(activeVariationIndex + 1);
      }
    } else {
      goToMove(Math.min(analysis.moves.length - 1, currentMoveIndex + 1));
    }
  };

  const getCurrentEvaluation = (): number => {
    if (activeVariationIndex !== null) {
      if (engineLines.length > 0) {
        const topLine = engineLines[0];
        const tempChess = new Chess(fen);
        const isWhiteTurn = tempChess.turn() === 'w';
        return isWhiteTurn ? topLine.score : -topLine.score;
      }
      return 0;
    }
    if (currentMoveIndex >= 0 && analysis) {
      return analysis.evaluationHistory ? analysis.evaluationHistory[currentMoveIndex + 1] : 0;
    }
    return (analysis && analysis.evaluationHistory) ? analysis.evaluationHistory[0] : 0;
  };

  const handleDownloadGif = async () => {
    if (!analysis) return;
    setIsExportingGif(true);
    try {
      const themeColors = boardThemes[boardTheme];
      const gifBlob = await generateGifClient(pgn, analysis, {
        darkColor: themeColors.dark,
        lightColor: themeColors.light,
        orientation: boardOrientation,
        onProgress: () => {}
      });
      const gifUrl = URL.createObjectURL(gifBlob);
      const a = document.createElement('a');
      a.href = gifUrl;
      a.download = 'speerchess-review.gif';
      a.click();
    } catch (e) {
      alert("GIF 생성에 실패했습니다.");
    } finally {
      setIsExportingGif(false);
    }
  };

  const generateCurrentPgn = () => {
    if (!analysis) return pgn;
    let pgnResult = '';
    
    pgnResult += `[Event "Speerchess Analysis"]\n`;
    pgnResult += `[Site "speerchess.com"]\n`;
    pgnResult += `[Date "${new Date().toISOString().split('T')[0].replace(/-/g, '.')}"]\n\n`;

    analysis.moves.forEach((move, index) => {
      const isWhite = index % 2 === 0;
      const moveNum = Math.floor(index / 2) + 1;
      
      const evalFromWhite = analysis.evaluationHistory ? analysis.evaluationHistory[index + 1] : 0;
      const score = evalFromWhite / 100;
      const evalStr = Math.abs(evalFromWhite) >= 9000
        ? (evalFromWhite > 0 ? '#M' : '#-M')
        : score.toFixed(2);
      const comment = `{ [%eval ${evalStr}] }`;
      
      if (isWhite) {
        pgnResult += `${moveNum}. ${move.san} ${comment} `;
      } else {
        pgnResult += `${move.san} ${comment} `;
      }
      
      const shouldRenderVar = (variationStartMoveIndex !== null && analysisPath.length > 0) && (
        index === variationStartMoveIndex + 1 ||
        (variationStartMoveIndex === analysis.moves.length - 1 && index === analysis.moves.length - 1)
      );
      
      if (shouldRenderVar) {
        const varStartIdx = variationStartMoveIndex! + 1;
        const varIsWhite = varStartIdx % 2 === 0;
        const varStartMoveNumber = Math.floor(varStartIdx / 2) + 1;
        
        let varStr = '(';
        analysisPath.forEach((varMove, i) => {
          const currentIdx = varStartIdx + i;
          const currentMoveNumber = Math.floor(currentIdx / 2) + 1;
          const currentIsWhite = currentIdx % 2 === 0;
          
          if (i === 0) {
            varStr += varIsWhite ? `${varStartMoveNumber}. ${varMove}` : `${varStartMoveNumber}... ${varMove}`;
          } else {
            varStr += currentIsWhite ? ` ${currentMoveNumber}. ${varMove}` : ` ${varMove}`;
          }
        });
        varStr += ') ';
        pgnResult += varStr;
      }
    });
    
    return pgnResult.trim();
  };

  const handleCopyPgn = () => {
    try {
      const currentPgn = generateCurrentPgn();
      navigator.clipboard.writeText(currentPgn);
      alert("PGN이 클립보드에 복사되었습니다!");
    } catch (e) {
      alert("PGN 복사에 실패했습니다.");
    }
  };

  const handleShareGame = async () => {
    if (!analysis) return;
    setIsSharing(true);
    try {
      const movesSequence = analysis.moves.map(m => m.san).join(' ');
      const pgnData = generateCurrentPgn();
      const analysisJson = JSON.stringify(analysis);

      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pgn: pgnData,
          analysisJson,
          movesSequence
        })
      });

      if (!res.ok) {
        throw new Error('게임 공유 요청 실패');
      }

      const data = await res.json();
      if (data.hashid) {
        setSharedHashid(data.hashid);
        const link = `${window.location.origin}/${data.hashid}`;
        navigator.clipboard.writeText(link);
        alert(`공유 링크가 클립보드에 복사되었습니다!\n코드: ${data.hashid}`);
      } else {
        throw new Error(data.error || '올바르지 않은 응답');
      }
    } catch (e: any) {
      alert(e.message || '공유 링크 생성 중 오류가 발생했습니다.');
    } finally {
      setIsSharing(false);
    }
  };

  const loadSample = () => {
    setPgn(SAMPLE_PGN_FULL);
  };

  const themeColors = boardThemes[boardTheme];

  // --- Views ---

  return (
    <div className="h-screen sm:h-auto sm:min-h-screen bg-stone-900 text-slate-800 flex justify-center items-center p-0 sm:p-4 font-sans selection:bg-slate-200 selection:text-slate-900 antialiased">
      <div className="w-full max-w-md h-screen sm:h-[880px] sm:min-h-[850px] sm:max-h-[900px] sm:rounded-3xl sm:shadow-2xl sm:border border-stone-800 bg-[#fafaf9] flex flex-col overflow-hidden relative">
        
        {/* VIEW: LOADING */}
        {view === 'LOADING' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-stone-50 text-slate-800 text-center">
            <div className="w-full max-w-sm space-y-8">
              <div className="space-y-4">
                <div className="flex justify-center animate-bounce">
                  <SpeerLogo className="w-12 h-12 text-slate-800" />
                </div>
                <h3 className="text-xs font-black tracking-widest text-slate-800 uppercase">SPEERCHESS ENGINE ANALYZING</h3>
                <p className="text-sm font-medium text-slate-600 max-w-xs mx-auto leading-relaxed italic">
                  "{quote}"
                </p>
              </div>
              <div className="space-y-2">
                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-800 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs font-black tracking-wider text-slate-500">{Math.round(progress)}% COMPLETE</p>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: SUMMARY */}
        {view === 'SUMMARY' && analysis && (
          <div className="flex-1 flex flex-col bg-stone-50 overflow-y-auto no-scrollbar">
            <header className="flex items-center justify-between p-4 bg-white border-b border-stone-200/60 sticky top-0 z-10 shadow-sm">
              <button onClick={() => setView('INPUT')} className="p-2 hover:bg-stone-50 rounded-full transition-colors text-slate-600">
                <ChevronLeft size={22} />
              </button>
              <div className="flex items-center gap-1.5">
                <SpeerLogo className="w-5 h-5 text-slate-800" />
                <span className="font-black text-base tracking-tight text-slate-800">speerchess</span>
              </div>
              <div className="w-10"></div>
            </header>

            <main className="p-4 space-y-4 flex-1">
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-5 space-y-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">경기 결과</span>
                <h2 className="text-2xl font-black text-slate-850">{getGameResult(pgn)}</h2>
              </div>

              {/* Graph Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-4 h-56 flex flex-col justify-between">
                <div className="text-xs font-black text-slate-400 uppercase tracking-wider">평가 그래프 (Speer Flow)</div>
                <div className="flex-1 w-full h-full min-h-[140px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <AreaChart 
                      data={analysis.evaluationHistory.map((evalCp, index) => ({
                        move: index,
                        evaluation: Math.max(-800, Math.min(800, evalCp)) / 100
                      }))} 
                      margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="colorEval" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#475569" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#475569" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="move" hide />
                      <YAxis domain={[-8, 8]} hide />
                      <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="evaluation" stroke="#334155" strokeWidth={2} fillOpacity={1} fill="url(#colorEval)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-stone-100 mt-1 font-bold">
                  <span>백 유리 (+)</span>
                  <span>균형 (0.0)</span>
                  <span>흑 유리 (-)</span>
                </div>
              </div>

              {/* Accuracy Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-5 space-y-4">
                <div className="text-xs font-black text-slate-400 uppercase tracking-wider">정확도 분석 (Accuracy)</div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-800"></span> 백 (White)</span>
                      <span className="font-extrabold">{analysis.whiteAccuracy}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-800 rounded-full transition-all duration-1000" style={{ width: `${analysis.whiteAccuracy}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400"></span> 흑 (Black)</span>
                      <span className="font-extrabold text-slate-600">{analysis.blackAccuracy}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-400 rounded-full transition-all duration-1000" style={{ width: `${analysis.blackAccuracy}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance Card */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-stone-200/50 text-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">백 퍼포먼스</div>
                  <div className="text-xl font-black text-slate-850 mt-1">{analysis.whitePerformance} <span className="text-xs font-normal text-slate-500">Elo</span></div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-stone-200/50 text-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">흑 퍼포먼스</div>
                  <div className="text-xl font-black text-slate-700 mt-1">{analysis.blackPerformance} <span className="text-xs font-normal text-slate-500">Elo</span></div>
                </div>
              </div>

              {/* Classification Summary Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-5 space-y-4">
                <div className="text-xs font-black text-slate-400 uppercase tracking-wider">수 분류 통계 (Move Stats)</div>
                <div className="grid grid-cols-3 text-center border-b border-stone-100 pb-2 text-[10px] font-black text-slate-400">
                  <div className="text-left">분류</div>
                  <div>백</div>
                  <div>흑</div>
                </div>
                <div className="space-y-2.5">
                  {[
                    { label: '탁월함 (Brilliant)', key: 'Brilliant', symbol: '!!', color: 'text-cyan-600' },
                    { label: '훌륭한 수 (Great)', key: 'Great', symbol: '!', color: 'text-sky-600' },
                    { label: '최고의 수 (Best)', key: 'Best', symbol: '★', color: 'text-green-650' },
                    { label: '우수함 (Excellent)', key: 'Excellent', symbol: '●', color: 'text-emerald-600' },
                    { label: '좋음 (Good)', key: 'Good', symbol: '✓', color: 'text-slate-700' },
                    { label: '북 오프닝 (Book)', key: 'Book', symbol: '◆', color: 'text-amber-800' },
                    { label: '부정확함 (Inaccuracy)', key: 'Inaccuracy', symbol: '!?', color: 'text-yellow-655 font-bold' },
                    { label: '실수 (Mistake)', key: 'Mistake', symbol: '?', color: 'text-orange-500 font-bold' },
                    { label: '블런더 (Blunder)', key: 'Blunder', symbol: '??', color: 'text-red-500 font-bold' },
                  ].map((stat) => (
                    <div key={stat.key} className="grid grid-cols-3 text-center items-center text-xs">
                      <div className="flex items-center gap-2 text-left font-medium text-slate-600">
                        <span className={`w-5 text-center text-[10px] font-black px-1 py-0.5 rounded ${
                          stat.key === 'Blunder' ? 'bg-red-100 text-red-700' :
                          stat.key === 'Brilliant' ? 'bg-cyan-100 text-cyan-700' :
                          stat.key === 'Mistake' ? 'bg-orange-100 text-orange-700' :
                          stat.key === 'Inaccuracy' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {stat.symbol}
                        </span>
                        <span>{stat.label}</span>
                      </div>
                      <div className={`font-semibold ${stat.color}`}>{analysis.classificationTally.white[stat.key]}</div>
                      <div className={`font-semibold ${stat.color}`}>{analysis.classificationTally.black[stat.key]}</div>
                    </div>
                  ))}
                </div>
              </div>
            </main>

            <div className="p-4 bg-white border-t border-stone-200/60">
              <button 
                onClick={startReview}
                className="w-full bg-slate-800 hover:bg-slate-750 text-white font-bold py-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                첫 수부터 복기 시작 <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* VIEW: REVIEW */}
        {view === 'REVIEW' && analysis && (
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            <header className="flex items-center justify-between py-2 px-4 bg-white border-b border-stone-200/60 shadow-sm z-10">
              <button onClick={() => setView('SUMMARY')} className="p-2 hover:bg-stone-50 rounded-full transition-colors text-slate-600">
                <ChevronLeft size={22} />
              </button>
              <div className="flex items-center gap-1.5">
                <SpeerLogo className="w-5 h-5 text-slate-800" />
                <span className="font-black text-base tracking-tight text-slate-800">speerchess</span>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 hover:bg-stone-50 rounded-full transition-colors text-slate-600 relative"
                title="메뉴"
              >
                <Menu size={22} />
              </button>
            </header>

            {/* Chessboard & Eval Bar Container */}
            <div className="flex flex-col p-4 bg-stone-50/50 border-b border-stone-200/60 items-center">
              
              {/* Sleek Horizontal Eval Slider (Unique design distinct from Chess.com) */}
              <div className="w-full max-w-[360px] flex flex-col gap-1 mb-1.5">
                <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <span>백 (White) {getEvalStr(getCurrentEvaluation())}</span>
                  <span>흑 (Black)</span>
                </div>
                <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden relative flex border border-stone-200 shadow-inner">
                  <div 
                    className="bg-slate-100 transition-all duration-500 ease-out h-full" 
                    style={{ width: `${getEvalPercent(getCurrentEvaluation())}%` }}
                  />
                  <div className="bg-slate-900 flex-1 h-full" />
                </div>
              </div>

              {/* Horizontal Engine Lines (compact, visible in ALL modes) */}
              <div className="w-full max-w-[360px] flex justify-between items-center text-[9px] font-bold text-slate-500 mb-1">
                <span>실시간 추천 분석 (Stockfish PV)</span>
                <div className="flex items-center gap-1 bg-stone-150 p-0.5 rounded-lg border border-stone-200/60 shadow-sm">
                  <span className="text-[8px] text-slate-400 font-black uppercase mr-1 pl-1">깊이 (Depth):</span>
                  {[14, 16, 18, 20].map((d) => (
                    <button
                      key={d}
                      onClick={() => setAnalysisDepth(d)}
                      className={`px-1.5 py-0.5 rounded transition-all text-[8px] font-black ${
                        analysisDepth === d ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-full max-w-[360px] h-[54px] min-h-[54px] space-y-1 mb-2 flex flex-col justify-center">
                {engineLines.length > 0 ? (
                  engineLines.slice(0, 2).map((line) => {
                    const tempChess = new Chess(fen);
                    const isWhiteTurn = tempChess.turn() === 'w';
                    const displayScore = isWhiteTurn ? line.score : -line.score;
                    
                    const scoreStr = line.isMate 
                      ? (displayScore > 0 ? `M${Math.abs(displayScore)}` : `-M${Math.abs(displayScore)}`)
                      : (displayScore > 0 ? `+${(displayScore/100).toFixed(1)}` : (displayScore/100).toFixed(1));
                      
                    const badgeColor = line.isMate || displayScore > 100 
                      ? 'bg-green-600 text-white animate-pulse' 
                      : displayScore < -100 ? 'bg-red-700 text-white' : 'bg-slate-700 text-slate-100';
                    
                    return (
                      <div key={line.multipv} className="flex items-center gap-2 text-[10px] font-mono leading-none bg-slate-900 text-slate-200 p-1.5 rounded-lg border border-slate-800 shadow-sm">
                        <span className={`${badgeColor} px-1.5 py-0.5 rounded font-black shrink-0 text-[8px]`}>
                          {scoreStr}
                        </span>
                        <span className="truncate select-text select-none text-slate-200">
                          {formatPv(fen, line.pv)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-2 bg-slate-900 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                    <span>실시간 추천 분석 가동 중...</span>
                  </div>
                )}
              </div>

              {/* Chessboard Container */}
              <div className="w-full aspect-square max-w-[360px] overflow-hidden rounded-2xl shadow-md border border-stone-200/60 bg-white">
                <Chessboard 
                  options={{
                    position: fen,
                    boardOrientation: boardOrientation,
                    allowDragging: reviewTab === 'ENGINE',
                    onPieceDrop: handlePieceDrop,
                    darkSquareStyle: { backgroundColor: themeColors.dark },
                    lightSquareStyle: { backgroundColor: themeColors.light },
                    squareRenderer: ({ piece, square, children }) => {
                      const currentMove = currentMoveIndex >= 0 ? analysis.moves[currentMoveIndex] : null;
                      const isTargetSquare = currentMove && currentMove.to === square;
                      
                      return (
                        <div className="relative w-full h-full flex items-center justify-center">
                          {children}
                          {isTargetSquare && getBoardBadge(currentMove.classification)}
                        </div>
                      );
                    }
                  }} 
                />
              </div>
            </div>

            {/* Navigation Controls (positioned above the Active Move Display) */}
            <div className="grid grid-cols-4 gap-1 p-2 bg-stone-50/30 border-b border-stone-200/40 text-center">
              <button 
                onClick={() => goToMove(-1)}
                className="py-2 hover:bg-white rounded-lg text-slate-600 font-bold transition-all text-xs border border-transparent hover:border-stone-200 active:scale-95"
              >
                처음
              </button>
              <button 
                onClick={handlePrevMove}
                className="py-2 hover:bg-white rounded-lg text-slate-600 font-bold transition-all text-xs border border-transparent hover:border-stone-200 active:scale-95 flex items-center justify-center gap-1"
              >
                <ChevronLeft size={16} /> 이전
              </button>
              <button 
                onClick={handleNextMove}
                className="py-2 hover:bg-white rounded-lg text-slate-600 font-bold transition-all text-xs border border-transparent hover:border-stone-200 active:scale-95 flex items-center justify-center gap-1"
              >
                다음 <ChevronRight size={16} />
              </button>
              <button 
                onClick={() => goToMove(analysis.moves.length - 1)}
                className="py-2 hover:bg-white rounded-lg text-slate-600 font-bold transition-all text-xs border border-transparent hover:border-stone-200 active:scale-95"
              >
                마지막
              </button>
            </div>

            {/* Active Move Display & Mode Tab Toggle Button */}
            <div className="px-4 py-1.5 border-b border-stone-200/40 bg-stone-50/40 flex items-center justify-between min-h-[46px]">
              {activeVariationIndex !== null ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-slate-400 text-xs">
                      {(() => {
                        const activeVarMoveIdx = variationStartMoveIndex! + 1 + activeVariationIndex;
                        const isWhite = activeVarMoveIdx % 2 === 0;
                        const moveNum = Math.floor(activeVarMoveIdx / 2) + 1;
                        return `${moveNum}. ${isWhite ? '백' : '흑'}`;
                      })()}
                    </span>
                    <span className="font-black text-xl text-slate-800">{analysisPath[activeVariationIndex]}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      분석 수 (Variation)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                      className="p-1.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1 bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      title="보드 뒤집기"
                    >
                      <span className="font-black text-xs">⇅</span>
                      <span className="text-[10px] font-black uppercase tracking-wider">뒤집기</span>
                    </button>
                    <button 
                      onClick={handleTabToggle}
                      className={`p-1.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1.5 bg-white text-slate-700 border-slate-200 hover:bg-slate-50`}
                      title={reviewTab === 'MOVES' ? "분석모드로 전환" : "감상모드로 전환"}
                    >
                      <span className="font-black text-lg leading-none">≡</span>
                      <span className="text-[10px] font-black uppercase tracking-wider">
                        {reviewTab === 'MOVES' ? '분석모드' : '감상모드'}
                      </span>
                    </button>
                  </div>
                </>
              ) : currentMoveIndex >= 0 ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-slate-400 text-xs">
                      {Math.floor(currentMoveIndex / 2) + 1}. {currentMoveIndex % 2 === 0 ? '백' : '흑'}
                    </span>
                    <span className="font-black text-xl text-slate-800">{analysis.moves[currentMoveIndex].san}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${getBadgeStyle(analysis.moves[currentMoveIndex].classification)}`}>
                      {classificationSymbols[analysis.moves[currentMoveIndex].classification] || ''} {analysis.moves[currentMoveIndex].classification}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                      className="p-1.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1 bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      title="보드 뒤집기"
                    >
                      <span className="font-black text-xs">⇅</span>
                      <span className="text-[10px] font-black uppercase tracking-wider">뒤집기</span>
                    </button>
                    {/* Congruent Menu symbol ≡ button displays the destination view state name to switch to */}
                    <button 
                      onClick={handleTabToggle}
                      className={`p-1.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1.5 bg-white text-slate-700 border-slate-200 hover:bg-slate-50`}
                      title={reviewTab === 'MOVES' ? "분석모드로 전환" : "감상모드로 전환"}
                    >
                      <span className="font-black text-lg leading-none">≡</span>
                      <span className="text-[10px] font-black uppercase tracking-wider">
                        {reviewTab === 'MOVES' ? '분석모드' : '감상모드'}
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="font-bold text-slate-400 text-xs uppercase tracking-wider">경기 시작 위치</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                      className="p-1.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1 bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      title="보드 뒤집기"
                    >
                      <span className="font-black text-xs">⇅</span>
                      <span className="text-[10px] font-black uppercase tracking-wider">뒤집기</span>
                    </button>
                    <button 
                      onClick={handleTabToggle}
                      className={`p-1.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1.5 bg-white text-slate-700 border-slate-200 hover:bg-slate-50`}
                    >
                      <span className="font-black text-lg leading-none">≡</span>
                      <span className="text-[10px] font-black uppercase tracking-wider">
                        {reviewTab === 'MOVES' ? '분석모드' : '감상모드'}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* TAB CONTENT: MOVES LIST (감상모드) */}
            {reviewTab === 'MOVES' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar bg-stone-50/10">
                {movePairs.map((pair, i) => (
                  <div key={i} className="flex gap-3 p-1 rounded hover:bg-slate-50 items-center text-xs">
                    <span className="text-slate-400 font-bold w-6 text-right">{i + 1}.</span>
                    {pair.map(({ move, index: moveIndex }) => {
                      const isCurrent = moveIndex === currentMoveIndex;
                      const style = getClassificationStyle(move.classification, isCurrent);
                      const symbol = classificationSymbols[move.classification];
                      
                      // Highlight ONLY special moves (Mistake, Blunder, Inaccuracy, Great, Brilliant)
                      const isSpecial = SPECIAL_CLASSIFICATIONS.includes(move.classification);
                      
                      return (
                        <button 
                          id={`move-btn-${moveIndex}`}
                          key={moveIndex}
                          onClick={() => goToMove(moveIndex)}
                          className={`flex-1 text-left px-3 py-2.5 rounded-xl font-bold transition-all flex justify-between items-center ${style}`}
                        >
                          <span>{move.san}</span>
                          {symbol && isSpecial && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ml-1 ${
                              isCurrent ? 'bg-white text-slate-800' : 'bg-black/5 text-slate-700'
                            }`}>
                              {symbol}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {pair.length === 1 && <div className="flex-1" />}
                  </div>
                ))}
              </div>
            )}

            {/* TAB CONTENT: REALTIME ENGINE PV ANALYSIS & FULL PGN FLOW (분석모드) */}
            {reviewTab === 'ENGINE' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50/10 no-scrollbar">
                
                {/* Full Inline PGN Text Flow (전체 기보 일렬 표시 + 인라인 사이드라인 표시) */}
                <div className="bg-white p-4 rounded-2xl border border-stone-200/50 shadow-sm space-y-2">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-stone-100 pb-1.5 flex justify-between items-center">
                    <span>전체 기보 흐름 (Full Game Score)</span>
                    {analysisPath.length > 0 && (
                      <button 
                        onClick={resetSelfAnalysis}
                        className="text-[10px] text-red-600 font-extrabold hover:underline active:scale-95"
                      >
                        분석 복원
                      </button>
                    )}
                  </div>
                  <div className="font-mono text-xs text-slate-750 leading-relaxed max-h-56 overflow-y-auto select-text pr-1 py-1">
                    {analysis.moves.map((move, index) => {
                      const isCurrent = index === currentMoveIndex;
                      const isSpecial = SPECIAL_CLASSIFICATIONS.includes(move.classification);
                      
                      // Text decoration style matching standard chess analysis inline lists
                      let inlineStyle = 'transition-all duration-200 px-1 py-0.5 rounded cursor-pointer font-bold mx-0.5 ';
                      if (isCurrent) {
                        inlineStyle += 'bg-slate-800 text-white shadow-sm ';
                      } else if (isSpecial) {
                        if (move.classification === 'Blunder') inlineStyle += 'text-red-700 bg-red-50 border border-red-200/50 ';
                        else if (move.classification === 'Mistake') inlineStyle += 'text-orange-700 bg-orange-50 border border-orange-200/50 ';
                        else if (move.classification === 'Inaccuracy') inlineStyle += 'text-yellow-800 bg-yellow-50 border border-yellow-200/50 ';
                        else if (move.classification === 'Brilliant') inlineStyle += 'text-cyan-700 bg-cyan-50 border border-cyan-200/50 ';
                        else if (move.classification === 'Great') inlineStyle += 'text-sky-700 bg-sky-50 border border-sky-200/50 ';
                      } else {
                        inlineStyle += 'text-slate-700 hover:bg-stone-100 ';
                      }
                      
                      return (
                        <span key={index} className="inline-block mr-1 my-0.5">
                          {index % 2 === 0 ? <span className="text-slate-400 font-bold mr-1">{Math.floor(index / 2) + 1}.</span> : null}
                          <button 
                            onClick={() => goToMove(index)}
                            className={inlineStyle}
                          >
                            {move.san}
                          </button>
                          
                          {/* Render the self-analysis side-line variation inline in parentheses right next to the starting move! */}
                          {(() => {
                            const shouldRenderVariation = (variationStartMoveIndex !== null && analysisPath.length > 0) && (
                              index === variationStartMoveIndex + 1 || 
                              (variationStartMoveIndex === analysis.moves.length - 1 && index === analysis.moves.length - 1)
                            );
                            if (!shouldRenderVariation) return null;
                            return (
                              <span className="ml-1.5 text-slate-400 font-black italic select-text">
                                {" ("}
                                {analysisPath.map((varMove, i) => {
                                  const varMoveIdx = variationStartMoveIndex! + 1 + i;
                                  const isWhite = varMoveIdx % 2 === 0;
                                  const moveNumber = Math.floor(varMoveIdx / 2) + 1;
                                  const isCurrentVar = activeVariationIndex === i;

                                  let varStyle = 'transition-all duration-200 px-1 py-0.5 rounded cursor-pointer font-bold mx-0.5 ';
                                  if (isCurrentVar) {
                                    varStyle += 'bg-slate-700 text-white shadow-sm ';
                                  } else {
                                    varStyle += 'text-slate-500 hover:bg-stone-100 ';
                                  }

                                  return (
                                    <span key={i} className="inline-block">
                                      {i === 0 ? (
                                        isWhite ? `${moveNumber}. ` : `${moveNumber}... `
                                      ) : (
                                        varMoveIdx % 2 === 0 ? ` ${moveNumber}. ` : ' '
                                      )}
                                      <button 
                                        onClick={() => goToVariationMove(i)}
                                        className={varStyle}
                                      >
                                        {varMove}
                                      </button>
                                    </span>
                                  );
                                })}
                                {")"}
                              </span>
                            );
                          })()}
                        </span>
                      );
                    })}
                  </div>
                </div>



              </div>
            )}
            
          </div>
        )}

        {/* VIEW: INPUT */}
        {view === 'INPUT' && (
          <div className="flex-1 flex flex-col bg-white overflow-y-auto no-scrollbar">
            {/* Header */}
            <div className="text-center py-8 px-6 space-y-2 border-b border-stone-200/40 bg-stone-50/20">
              <div className="flex justify-center">
                <SpeerLogo className="w-10 h-10 text-slate-800" />
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-800">speerchess</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chess game review & analysis</p>
            </div>

            <div className="p-6 space-y-6 flex-1">
              {/* Input Area */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 tracking-wider flex items-center gap-1.5 uppercase">
                  <Globe size={14} className="text-slate-450" /> 링크 또는 PGN 기보 입력
                </label>
                <div className="relative">
                  <textarea 
                    className="w-full h-36 p-4 bg-stone-50 border border-stone-250 rounded-2xl focus:ring-2 focus:ring-slate-800 focus:border-slate-800 focus:bg-white outline-none transition-all resize-none text-slate-700 font-mono text-xs placeholder:text-slate-400 leading-relaxed shadow-inner" 
                    placeholder="Lichess 게임 링크 (예: https://lichess.org/...)&#10;또는 체스 PGN 기보 텍스트를 입력해 주세요."
                    value={pgn}
                    onChange={(e) => setPgn(e.target.value)}
                  />
                  <button 
                    onClick={loadSample}
                    className="absolute bottom-3 right-3 text-[10px] bg-slate-50 hover:bg-slate-100 text-slate-850 font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 transition-all flex items-center gap-1 active:scale-95"
                  >
                    <Star size={10} className="fill-slate-700 text-slate-700" /> 샘플 경기 불러오기
                  </button>
                </div>
              </div>

              {/* Settings Area */}
              <div className="space-y-4 pt-2 border-t border-stone-200/40">
                <h3 className="text-xs font-black text-slate-500 tracking-wider uppercase flex items-center gap-1.5">
                  <Settings size={14} className="text-slate-450" /> 분석 설정
                </h3>
                
                {/* Depth setting */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-500">분석 수 깊이 (Depth)</span>
                    <span className="font-bold text-slate-800 bg-stone-100 px-2 py-0.5 rounded">
                      {depth === 12 ? '빠름 (12수)' : depth === 14 ? '보통 (14수)' : '정밀 (16수)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-stone-100 p-1 rounded-xl">
                    {[
                      { val: 12, label: '빠름' },
                      { val: 14, label: '보통' },
                      { val: 16, label: '정밀' }
                    ].map(d => (
                      <button 
                        key={d.val}
                        onClick={() => setDepth(d.val as any)}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${
                          depth === d.val ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-750'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Board Theme setting */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-500">체스판 테마 (Theme)</span>
                    <span className="font-bold text-slate-700">{boardThemes[boardTheme].name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-stone-100 p-1 rounded-xl">
                    {[
                      { val: 'slate', color: 'bg-[#475569]' },
                      { val: 'emerald', color: 'bg-[#0f5132]' },
                      { val: 'cobalt', color: 'bg-[#1e3a8a]' }
                    ].map(t => (
                      <button 
                        key={t.val}
                        onClick={() => setBoardTheme(t.val as any)}
                        className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          boardTheme === t.val ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-750'
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-full ${t.color} border border-black/10`} />
                        <span>{t.val === 'slate' ? '슬레이트' : t.val === 'emerald' ? '에메랄드' : '코발트'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Info Tips */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/50 text-xs text-slate-550 flex items-start gap-2.5">
                <Info size={16} className="text-slate-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Lichess 경기 URL을 복사하여 붙여넣으면 별도의 PGN 복사 없이 바로 자동 분석이 시작됩니다. Speerchess의 슬라이더 평가 바로 더욱 쾌적하게 복기하세요.
                </p>
              </div>

              {/* Start Button */}
              <button 
                className="w-full bg-slate-800 hover:bg-slate-750 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-slate-500/10 active:scale-98 disabled:opacity-50 disabled:active:scale-100"
                onClick={handleAnalyze} 
                disabled={!pgn.trim() || isLoadingPgn}
              >
                {isLoadingPgn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    경기 로딩 중...
                  </>
                ) : (
                  <>
                    <Play size={18} fill="currentColor" /> 리뷰 시작하기
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Sidebar Drawer Overlay */}
        {isSidebarOpen && (
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end transition-opacity duration-300"
            onClick={() => setIsSidebarOpen(false)}
          >
            <div 
              className="w-72 h-full bg-white shadow-2xl p-5 flex flex-col justify-between border-l border-stone-200 transition-transform duration-300 translate-x-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-6">
                {/* Sidebar Header */}
                <div className="flex justify-between items-center pb-4 border-b border-stone-100">
                  <h3 className="font-black text-sm text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <Settings size={16} /> 분석 도구 메뉴
                  </h3>
                  <button 
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-1.5 hover:bg-stone-100 rounded-full transition-colors text-slate-500"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Sidebar Actions */}
                <div className="space-y-3 pt-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">내보내기 & 공유</span>
                  
                  {/* GIF Export */}
                  <button 
                    onClick={() => {
                      setIsSidebarOpen(false);
                      handleDownloadGif();
                    }} 
                    disabled={isExportingGif}
                    className="w-full bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm text-xs active:scale-95 cursor-pointer"
                  >
                    {isExportingGif ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        생성 중...
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        GIF 내보내기
                      </>
                    )}
                  </button>

                  {/* PGN Copy */}
                  <button 
                    onClick={() => {
                      setIsSidebarOpen(false);
                      handleCopyPgn();
                    }}
                    className="w-full bg-white hover:bg-stone-50 text-slate-800 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all border border-stone-300 shadow-sm text-xs active:scale-95 cursor-pointer"
                  >
                    <Layers size={14} />
                    PGN 복사하기
                  </button>

                  {/* D1 Share Link */}
                  <button 
                    onClick={handleShareGame}
                    disabled={isSharing}
                    className="w-full bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm text-xs active:scale-95 cursor-pointer"
                  >
                    {isSharing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        생성 중...
                      </>
                    ) : sharedHashid ? (
                      <>
                        <CheckCircle2 size={14} className="text-green-400" />
                        공유 링크 복사 완료
                      </>
                    ) : (
                      <>
                        <Globe size={14} />
                        분석 게임 공유 링크 생성
                      </>
                    )}
                  </button>

                  {/* Shared link display */}
                  {sharedHashid && typeof window !== 'undefined' && (
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[10px] text-slate-600 text-center font-mono select-all mt-2">
                      공유 링크: {window.location.origin}/{sharedHashid}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Footer Info */}
              <div className="text-[9px] text-slate-400 font-bold text-center border-t border-stone-100 pt-4 leading-relaxed">
                speerchess analysis dashboard<br/>© 2026 speerchess
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
