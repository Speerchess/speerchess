'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Play, Download, Settings, Loader2, ChevronLeft, ChevronRight, CheckCircle2, Layers, Globe, Star, Info, Menu, X } from 'lucide-react';
import { ChessAnalyzer, GameAnalysis, MoveAnalysis } from '../lib/analyzer';
import { generateGifClient } from '../lib/gifGeneratorClient';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { PRESET_GAMES } from '../lib/preset_games';

type ViewState = 'INPUT' | 'LOADING' | 'SUMMARY' | 'REVIEW' | 'EXPLORE' | 'BRILLIANT' | 'BLUNDER' | 'CHESSLE';
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
  const [settingsModalType, setSettingsModalType] = useState<'about' | 'privacy' | null>(null);

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

  // New States for Settings, Menu, and views
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  
  // Settings values
  const [language, setLanguage] = useState<'ko' | 'en'>('ko');
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<boolean>(false);
  
  // Game Explorer / Brilliant / Blunder lists
  const [dbGames, setDbGames] = useState<any[]>([]);
  const [loadingDbGames, setLoadingDbGames] = useState<boolean>(false);
  
  // Details Modal for Blunder/Brilliant
  const [selectedHighlight, setSelectedHighlight] = useState<{
    gameHashid: string;
    whitePlayer: string;
    blackPlayer: string;
    moveIndex: number;
    moveSan: string;
    classification: string;
    moveFrom: string;
    moveTo: string;
    evalBefore: number;
    evalAfter: number;
    beforeFen: string;
    afterFen: string;
    sarcasticComment: string;
    showAfterBoard: boolean;
  } | null>(null);

  // Chessle States
  const [chesslePuzzle, setChesslePuzzle] = useState<any | null>(null);
  const [chessleMoves, setChessleMoves] = useState<string[]>([]);
  const [chessleAttempts, setChessleAttempts] = useState<{ moves: string[]; feedback: string[] }[]>([]);
  const [chessleAttemptCount, setChessleAttemptCount] = useState<number>(0);
  const [chessleSolved, setChessleSolved] = useState<boolean>(false);
  const [chessleCorrectMoves, setChessleCorrectMoves] = useState<(string | null)[]>(new Array(10).fill(null));
  const [chessleAutofill, setChessleAutofill] = useState<boolean>(true);
  const [chessleFen, setChessleFen] = useState<string>('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [chessleBoardOrientation, setChessleBoardOrientation] = useState<'white' | 'black'>('white');
  const [showEndPositionHint, setShowEndPositionHint] = useState<boolean>(false);
  const [showMove7Hint, setShowMove7Hint] = useState<boolean>(false);

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
        const res = await fetch(`/api/games?hashid=${hashid}&t=${Date.now()}`, { cache: 'no-store' });
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

  // Load games from D1/API on startup
  const fetchGames = async () => {
    setLoadingDbGames(true);
    try {
      const res = await fetch('/api/games?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setDbGames(data);
      }
    } catch (e) {
      console.error('Error fetching games:', e);
    } finally {
      setLoadingDbGames(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, [view]);

  // Combined games list from database and static presets (unique by hashid)
  const allGames = useMemo(() => {
    const combined = [...dbGames];
    for (const pg of PRESET_GAMES) {
      if (!combined.some(g => g.hashid === pg.hashid)) {
        combined.push(pg);
      }
    }
    return combined.sort((a, b) => {
      const da = new Date(a.created_at || 0).getTime();
      const db = new Date(b.created_at || 0).getTime();
      return db - da;
    });
  }, [dbGames]);

  // Parse player names from PGN
  const getPlayersFromPgn = (pgn: string) => {
    const whiteMatch = pgn.match(/\[White\s+"([^"]+)"\]/);
    const blackMatch = pgn.match(/\[Black\s+"([^"]+)"\]/);
    return {
      white: whiteMatch ? whiteMatch[1] : 'White',
      black: blackMatch ? blackMatch[1] : 'Black'
    };
  };

  // Get FEN after playing moves sequence
  const getFinalFen = (movesSequence: string) => {
    const temp = new Chess();
    const moves = movesSequence.split(' ');
    for (const m of moves) {
      try { temp.move(m); } catch (e) {}
    }
    return temp.fen();
  };

  // Filter brilliant moves
  const brilliantItems = useMemo(() => {
    const items: any[] = [];
    for (const g of allGames) {
      try {
        const parsed = JSON.parse(g.analysis_json);
        parsed.moves.forEach((move: any, index: number) => {
          if (move.classification === 'Brilliant' || move.classification === 'Great') {
            const players = getPlayersFromPgn(g.pgn);
            items.push({
              game: g,
              gameHashid: g.hashid,
              whitePlayer: players.white,
              blackPlayer: players.black,
              moveIndex: index,
              moveSan: move.san,
              classification: move.classification,
              moveFrom: move.from,
              moveTo: move.to,
              evalBefore: parsed.evaluationHistory ? (index > 0 ? parsed.evaluationHistory[index] : parsed.evaluationHistory[0]) : 0,
              evalAfter: parsed.evaluationHistory ? parsed.evaluationHistory[index + 1] : 0,
              beforeFen: (() => {
                const temp = new Chess();
                for (let i = 0; i < index; i++) {
                  try { temp.move(parsed.moves[i].san); } catch (e) {}
                }
                return temp.fen();
              })(),
              afterFen: (() => {
                const temp = new Chess();
                for (let i = 0; i <= index; i++) {
                  try { temp.move(parsed.moves[i].san); } catch (e) {}
                }
                return temp.fen();
              })(),
            });
          }
        });
      } catch (e) {}
    }
    return items.slice(0, 20); // Top 20 brilliant moves (4x5 grid)
  }, [allGames]);

  // Filter blunder moves
  const blunderItems = useMemo(() => {
    const items: any[] = [];
    for (const g of allGames) {
      try {
        const parsed = JSON.parse(g.analysis_json);
        parsed.moves.forEach((move: any, index: number) => {
          if (move.classification === 'Blunder') {
            const players = getPlayersFromPgn(g.pgn);
            items.push({
              game: g,
              gameHashid: g.hashid,
              whitePlayer: players.white,
              blackPlayer: players.black,
              moveIndex: index,
              moveSan: move.san,
              classification: move.classification,
              moveFrom: move.from,
              moveTo: move.to,
              evalBefore: parsed.evaluationHistory ? (index > 0 ? parsed.evaluationHistory[index] : parsed.evaluationHistory[0]) : 0,
              evalAfter: parsed.evaluationHistory ? parsed.evaluationHistory[index + 1] : 0,
              beforeFen: (() => {
                const temp = new Chess();
                for (let i = 0; i < index; i++) {
                  try { temp.move(parsed.moves[i].san); } catch (e) {}
                }
                return temp.fen();
              })(),
              afterFen: (() => {
                const temp = new Chess();
                for (let i = 0; i <= index; i++) {
                  try { temp.move(parsed.moves[i].san); } catch (e) {}
                }
                return temp.fen();
              })(),
              sarcasticComment: (() => {
                const comments = [
                  "상대방에게 대범하게 기물을 적선했군요. 혹시 체스판 위의 산타클로스인가요?",
                  "컴퓨터가 이 수를 연산하는 도중 칩셋에 불이 날 뻔했습니다.",
                  "엄청난 블런더입니다! 상대방이 기쁨의 춤을 추고 있겠네요.",
                  "기물을 고스란히 바치는 훌륭한 평화주의적인 플레이입니다.",
                  "마우스 미스가 아니라 인생 최고의 실수가 여기 등장했습니다.",
                  "체스판 위의 비극입니다. 두 눈을 뜨고 둔 것이 정말 맞습니까?",
                  "이 수는 체스 역사에 '가장 엉뚱한 수'로 기록될 가치가 있습니다."
                ];
                const hash = (g.hashid.charCodeAt(0) || 0) + index;
                return comments[hash % comments.length];
              })()
            });
          }
        });
      } catch (e) {}
    }
    return items.slice(0, 20); // Top 20 blunder moves (4x5 grid)
  }, [allGames]);

  // Load game instantly in SPA mode and update URL
  const loadGameByHashid = async (targetHashid: string) => {
    setView('LOADING');
    setProgress(0);
    setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
    
    // Check presets first
    const preset = PRESET_GAMES.find(g => g.hashid === targetHashid);
    if (preset) {
      const gameAnalysis = JSON.parse(preset.analysis_json);
      setAnalysis(gameAnalysis);
      reviewChess.loadPgn(preset.pgn);
      setFen(new Chess().fen());
      setCurrentMoveIndex(-1);
      setSharedHashid(targetHashid);
      window.history.pushState({}, '', `/${targetHashid}`);
      setView('SUMMARY');
      return;
    }

    try {
      const res = await fetch(`/api/games?hashid=${targetHashid}&t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const gameAnalysis = JSON.parse(data.analysis_json);
        setAnalysis(gameAnalysis);
        reviewChess.loadPgn(data.pgn);
        setFen(new Chess().fen());
        setCurrentMoveIndex(-1);
        setSharedHashid(targetHashid);
        window.history.pushState({}, '', `/${targetHashid}`);
        setView('SUMMARY');
      } else {
        throw new Error('Failed to load game');
      }
    } catch (e) {
      console.error(e);
      alert('게임을 로드하는 중 오류가 발생했습니다.');
      setView('INPUT');
    }
  };

  // Start Chessle Wordle game
  const startChessleGame = (puzzleGame: any) => {
    let movesList: string[] = [];
    try {
      const parsed = JSON.parse(puzzleGame.analysis_json);
      movesList = parsed.moves.slice(0, 10).map((m: any) => m.san);
    } catch (e) {
      movesList = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Nxd5"];
    }

    if (movesList.length < 10) {
      movesList = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Nxd5"];
    }

    const puzzle = {
      hashid: puzzleGame.hashid,
      moves: movesList,
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      endFen: (() => {
        const temp = new Chess();
        for (const m of movesList) {
          try { temp.move(m); } catch (e) {}
        }
        return temp.fen();
      })(),
      move7w: movesList[6] || null,
      move7b: movesList[7] || null,
      sourceUrl: `/${puzzleGame.hashid}`,
      fullPgn: puzzleGame.pgn
    };

    setChesslePuzzle(puzzle);
    setChessleMoves([]);
    setChessleAttempts([]);
    setChessleAttemptCount(0);
    setChessleSolved(false);
    setChessleCorrectMoves(new Array(10).fill(null));
    setChessleFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    setChessleBoardOrientation('white');
    setShowEndPositionHint(false);
    setShowMove7Hint(false);
    setView('CHESSLE');
  };

  // Trigger autofill of previously correct moves
  const triggerChessleAutofill = (puzzle: any, correctList: (string | null)[]) => {
    const tempChess = new Chess(puzzle.startFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const filledMoves: string[] = [];
    for (let i = 0; i < 10; i++) {
      const correctMove = correctList[i];
      if (!correctMove) break;
      try {
        tempChess.move(correctMove);
        filledMoves.push(correctMove);
      } catch (e) {
        break;
      }
    }
    setChessleMoves(filledMoves);
    setChessleFen(tempChess.fen());
  };

  // Chessle board move handler
  const handleChesslePieceDrop = (args: { piece: any; sourceSquare: string; targetSquare: string | null }): boolean => {
    const { sourceSquare, targetSquare } = args;
    if (!targetSquare) return false;
    if (chessleMoves.length >= 10 || chessleSolved || chessleAttemptCount >= 6 || !chesslePuzzle) return false;
    
    const tempChess = new Chess(chessleFen);
    try {
      const moveResult = tempChess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q'
      });
      
      if (moveResult) {
        const newMoves = [...chessleMoves, moveResult.san];
        setChessleMoves(newMoves);
        setChessleFen(tempChess.fen());
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  };

  // Chessle undo move
  const handleChessleUndo = () => {
    if (chessleMoves.length === 0 || !chesslePuzzle) return;
    const lastIdx = chessleMoves.length - 1;
    if (chessleAutofill && chessleCorrectMoves[lastIdx]) return; // Cannot undo correct autofilled moves
    
    const newMoves = chessleMoves.slice(0, -1);
    const tempChess = new Chess(chesslePuzzle.startFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    for (const m of newMoves) {
      try { tempChess.move(m); } catch (e) {}
    }
    setChessleMoves(newMoves);
    setChessleFen(tempChess.fen());
  };

  // Calculate Chessle Wordle feedback
  const calcChessleFeedback = (guess: string[], answer: string[]) => {
    const fb = new Array(10).fill('absent');
    const aUsed = new Array(10).fill(false);
    const gUsed = new Array(10).fill(false);

    // Pass 1: correct (green)
    for (let i = 0; i < 10; i++) {
      if (guess[i] === answer[i]) {
        fb[i] = 'correct';
        aUsed[i] = true;
        gUsed[i] = true;
      }
    }
    // Pass 2: present (yellow)
    for (let i = 0; i < 10; i++) {
      if (gUsed[i]) continue;
      for (let j = 0; j < 10; j++) {
        if (aUsed[j]) continue;
        if (guess[i] === answer[j]) {
          fb[i] = 'present';
          aUsed[j] = true;
          break;
        }
      }
    }
    return fb;
  };

  // Submit Chessle guess
  const handleChessleSubmit = () => {
    if (chessleMoves.length < 10 || !chesslePuzzle) return;
    
    const answer = chesslePuzzle.moves;
    const guess = chessleMoves;
    const fb = calcChessleFeedback(guess, answer);
    
    const newAttempt = { moves: [...guess], feedback: fb };
    const nextAttempts = [...chessleAttempts, newAttempt];
    setChessleAttempts(nextAttempts);
    
    const nextCount = chessleAttemptCount + 1;
    setChessleAttemptCount(nextCount);
    
    const nextCorrect = [...chessleCorrectMoves];
    for (let i = 0; i < 10; i++) {
      if (fb[i] === 'correct') {
        nextCorrect[i] = guess[i];
      }
    }
    setChessleCorrectMoves(nextCorrect);
    
    const won = fb.every(f => f === 'correct');
    if (won) {
      setChessleSolved(true);
    } else if (nextCount >= 6) {
      // Game over (failed)
    } else {
      // Setup board for next attempt, play autofill
      const startPos = chesslePuzzle.startFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const tempChess = new Chess(startPos);
      const filledMoves: string[] = [];
      if (chessleAutofill) {
        for (let i = 0; i < 10; i++) {
          if (!nextCorrect[i]) break;
          try {
            tempChess.move(nextCorrect[i]!);
            filledMoves.push(nextCorrect[i]!);
          } catch (e) {
            break;
          }
        }
      }
      setChessleMoves(filledMoves);
      setChessleFen(tempChess.fen());
    }
  };

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
        fetchGames();
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
                      const isSourceSquare = currentMove && currentMove.from === square;
                      
                      let highlightStyle = '';
                      if (currentMove) {
                        const isBrilliantOrGreat = currentMove.classification === 'Brilliant' || currentMove.classification === 'Great';
                        if (isTargetSquare || isSourceSquare) {
                          if (isBrilliantOrGreat) {
                            highlightStyle = 'bg-emerald-500/35'; // Greenish highlight
                          } else if (currentMove.classification === 'Inaccuracy' || currentMove.classification === 'Mistake' || currentMove.classification === 'Blunder') {
                            highlightStyle = 'bg-yellow-500/35'; // Yellowish highlight
                          } else {
                            highlightStyle = 'bg-yellow-500/20'; // Default move highlight
                          }
                        }
                      }
                      
                      return (
                        <div className={`relative w-full h-full flex items-center justify-center ${highlightStyle}`}>
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
          <div className="flex-1 flex flex-col bg-white overflow-y-auto no-scrollbar relative">
            {/* Home Top Bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-stone-200/40 bg-stone-50/25 shrink-0">
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors text-slate-600 cursor-pointer"
                title="설정"
              >
                <Settings size={20} />
              </button>
              <div className="flex items-center gap-1">
                <SpeerLogo className="w-4 h-4 text-slate-800" />
                <span className="font-extrabold text-sm tracking-tight text-slate-800">speerchess</span>
              </div>
              <button 
                onClick={() => setIsMenuOpen(true)}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors text-slate-600 cursor-pointer"
                title="메뉴"
              >
                <Menu size={20} />
              </button>
            </div>

            {/* Header */}
            <div className="text-center py-8 px-6 space-y-2 border-b border-stone-200/40 bg-stone-50/20 shrink-0">
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


        {/* Settings Sidebar */}
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 transition-opacity" onClick={() => setIsSettingsOpen(false)} />
        )}
        <div className={`fixed top-0 bottom-0 left-0 w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ${isSettingsOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
          <div className="flex items-center justify-between p-4 border-b border-stone-200/60 shrink-0">
            <h2 className="font-black text-lg text-slate-850 flex items-center gap-1.5">
              <Settings size={20} className="text-slate-700" />
              {language === 'ko' ? '설정' : 'Settings'}
            </h2>
            <button onClick={() => setIsSettingsOpen(false)} className="p-1.5 hover:bg-stone-100 rounded-full text-slate-500 cursor-pointer">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Language Selection */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider">
                {language === 'ko' ? '언어 설정' : 'Language'}
              </label>
              <div className="grid grid-cols-2 gap-2 bg-stone-100 p-1 rounded-xl">
                <button 
                  onClick={() => setLanguage('ko')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all ${language === 'ko' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  한국어
                </button>
                <button 
                  onClick={() => setLanguage('en')}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all ${language === 'en' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  English
                </button>
              </div>
            </div>

            {/* Feedback Form */}
            <div className="space-y-3 pt-4 border-t border-stone-100">
              <label className="text-xs font-black text-slate-500 uppercase tracking-wider block">
                {language === 'ko' ? '의견 및 피드백' : 'Send Feedback'}
              </label>
              {feedbackSubmitted ? (
                <div className="bg-green-50 border border-green-200 text-green-800 text-xs p-3 rounded-xl font-medium text-center">
                  {language === 'ko' ? '소중한 의견 감사드립니다!' : 'Thank you for your feedback!'}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-1 justify-center py-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button 
                        key={star}
                        onClick={() => setFeedbackRating(star)}
                        className="text-xl cursor-pointer transition-all active:scale-90"
                      >
                        {star <= feedbackRating ? '★' : '☆'}
                      </button>
                    ))}
                  </div>
                  <textarea 
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder={language === 'ko' ? '의견을 입력해 주세요...' : 'Write your comment...'}
                    className="w-full h-20 p-2.5 bg-stone-50 border border-stone-250 rounded-xl focus:ring-1 focus:ring-slate-800 focus:border-slate-800 outline-none text-xs text-slate-700 resize-none shadow-inner"
                  />
                  <button 
                    onClick={() => {
                      if (feedbackText.trim()) {
                        setFeedbackSubmitted(true);
                        setFeedbackText('');
                        setTimeout(() => setFeedbackSubmitted(false), 3000);
                      }
                    }}
                    className="w-full bg-slate-800 hover:bg-slate-750 text-white font-bold py-2 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                  >
                    {language === 'ko' ? '보내기' : 'Submit'}
                  </button>
                </div>
              )}
            </div>

            {/* About App Button */}
            <div className="pt-4 border-t border-stone-100">
              <button
                onClick={() => setSettingsModalType('about')}
                className="w-full flex items-center justify-between p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/85 rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-sm active:scale-98"
              >
                <span className="flex items-center gap-1.5">
                  ℹ️ {language === 'ko' ? '사이트 소개' : 'About Site'}
                </span>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            </div>

            {/* Privacy Policy Button */}
            <div className="pt-3">
              <button
                onClick={() => setSettingsModalType('privacy')}
                className="w-full flex items-center justify-between p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200/85 rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-sm active:scale-98"
              >
                <span className="flex items-center gap-1.5">
                  🔒 {language === 'ko' ? '개인정보 처리방침' : 'Privacy Policy'}
                </span>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
            </div>
          </div>
          <div className="p-4 border-t border-stone-100 text-center text-[10px] text-slate-400 font-bold shrink-0">
            speerchess v1.2.0
          </div>
        </div>

        {/* Menu Sidebar */}
        {isMenuOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 transition-opacity" onClick={() => setIsMenuOpen(false)} />
        )}
        <div className={`fixed top-0 bottom-0 right-0 w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
          <div className="flex items-center justify-between p-4 border-b border-stone-200/60 shrink-0">
            <h2 className="font-black text-lg text-slate-850 flex items-center gap-1.5">
              <Menu size={20} className="text-slate-700" />
              {language === 'ko' ? '메뉴' : 'Menu'}
            </h2>
            <button onClick={() => setIsMenuOpen(false)} className="p-1.5 hover:bg-stone-100 rounded-full text-slate-500 cursor-pointer">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Explore Games button */}
            <button 
              onClick={() => {
                setIsMenuOpen(false);
                setView('EXPLORE');
              }}
              className="w-full text-left p-4 rounded-xl border border-stone-200/60 hover:bg-stone-50 transition-all font-bold text-slate-800 flex justify-between items-center cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🎲</span>
                <span className="text-sm">{language === 'ko' ? '게임 탐색하기' : 'Explore Games'}</span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Brilliant Repository button */}
            <button 
              onClick={() => {
                setIsMenuOpen(false);
                setView('BRILLIANT');
              }}
              className="w-full text-left p-4 rounded-xl border border-stone-200/60 hover:bg-stone-50 transition-all font-bold text-slate-800 flex justify-between items-center cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">!!</span>
                <span className="text-sm">{language === 'ko' ? '탁월 저장소' : 'Brilliant Repository'}</span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Blunder Repository button */}
            <button 
              onClick={() => {
                setIsMenuOpen(false);
                setView('BLUNDER');
              }}
              className="w-full text-left p-4 rounded-xl border border-stone-200/60 hover:bg-stone-50 transition-all font-bold text-slate-800 flex justify-between items-center cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">??</span>
                <span className="text-sm">{language === 'ko' ? '블런더 저장소' : 'Blunder Repository'}</span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Chessle button */}
            <button 
              onClick={() => {
                setIsMenuOpen(false);
                const randomGame = allGames.length > 0 ? allGames[Math.floor(Math.random() * allGames.length)] : PRESET_GAMES[0];
                startChessleGame(randomGame);
              }}
              className="w-full text-left p-4 rounded-xl border border-stone-200/60 hover:bg-stone-50 transition-all font-bold text-slate-800 flex justify-between items-center cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🧩</span>
                <span className="text-sm">{language === 'ko' ? 'Chessle (체슬)' : 'Chessle (Puzzle)'}</span>
              </div>
              <ChevronRight size={18} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
          <div className="p-4 border-t border-stone-100 text-center text-[10px] text-slate-400 font-bold leading-relaxed shrink-0">
            speerchess menu panel<br/>© 2026 speerchess
          </div>
        </div>

        {/* VIEW: EXPLORE */}
        {view === 'EXPLORE' && (
          <div className="flex-1 flex flex-col bg-stone-50 overflow-hidden">
            <header className="flex items-center justify-between py-3 px-4 bg-white border-b border-stone-200/60 z-10 shadow-sm shrink-0">
              <button onClick={() => setView('INPUT')} className="p-2 hover:bg-stone-50 rounded-full transition-colors text-slate-600 cursor-pointer">
                <ChevronLeft size={22} />
              </button>
              <h2 className="font-black text-base text-slate-850">
                {language === 'ko' ? '게임 탐색하기' : 'Explore Games'}
              </h2>
              <div className="w-10"></div>
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
              {loadingDbGames ? (
                <div className="w-full h-64 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                  <span className="text-xs font-bold text-slate-500">데이터를 불러오는 중...</span>
                </div>
              ) : allGames.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-bold text-xs">
                  저장된 게임이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-12">
                  {allGames.slice(0, 20).map((game) => {
                    const players = getPlayersFromPgn(game.pgn);
                    const finalFen = getFinalFen(game.moves_sequence);
                    return (
                      <div 
                        key={game.hashid} 
                        onClick={() => loadGameByHashid(game.hashid)}
                        className="bg-white rounded-2xl border border-stone-200/60 p-3 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col items-center gap-2 hover:-translate-y-0.5 active:scale-98"
                      >
                        <div className="w-full aspect-square overflow-hidden rounded-xl border border-stone-150">
                          <Chessboard 
                            options={{
                              position: finalFen,
                              allowDragging: false
                            }}
                          />
                        </div>
                        <div className="w-full text-center space-y-0.5">
                          <div className="text-xs font-black text-slate-800 truncate px-1">
                            {players.white} vs {players.black}
                          </div>
                          <div className="text-[9px] text-slate-450 font-bold">
                            {new Date(game.created_at || '').toLocaleDateString(language === 'ko' ? 'ko-KR' : 'en-US', {
                              year: 'numeric', month: 'short', day: 'numeric'
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: BRILLIANT */}
        {view === 'BRILLIANT' && (
          <div className="flex-1 flex flex-col bg-stone-50 overflow-hidden">
            <header className="flex items-center justify-between py-3 px-4 bg-white border-b border-stone-200/60 z-10 shadow-sm shrink-0">
              <button onClick={() => setView('INPUT')} className="p-2 hover:bg-stone-50 rounded-full transition-colors text-slate-600 cursor-pointer">
                <ChevronLeft size={22} />
              </button>
              <h2 className="font-black text-base text-slate-850">
                {language === 'ko' ? '!! 탁월 저장소' : '!! Brilliant Repository'}
              </h2>
              <div className="w-10"></div>
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
              {brilliantItems.length === 0 ? (
                <div className="text-center py-20 text-slate-400 font-bold text-xs">
                  {language === 'ko' ? '저장된 탁월/우수 수가 없습니다. 경기를 분석해서 남겨보세요!' : 'No Brilliant or Great moves stored yet.'}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-12">
                  {brilliantItems.map((item, idx) => (
                    <div 
                      key={`${item.game.hashid}-${idx}`}
                      onClick={() => setSelectedHighlight({ ...item, showAfterBoard: false })}
                      className="bg-white rounded-2xl border border-stone-200/60 p-3 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col items-center gap-2 hover:-translate-y-0.5 active:scale-98 relative"
                    >
                      <span className={`absolute top-5 left-5 z-10 text-[9px] font-black px-2 py-0.5 rounded-full shadow-sm ${
                        item.classification === 'Brilliant' ? 'bg-cyan-500 text-white' : 'bg-sky-500 text-white'
                      }`}>
                        {item.classification === 'Brilliant' ? '!! Brilliant' : '! Great'}
                      </span>
                      <div className="w-full aspect-square overflow-hidden rounded-xl border border-stone-150 relative">
                        <Chessboard 
                          options={{
                            position: item.afterFen,
                            allowDragging: false
                          }}
                        />
                      </div>
                      <div className="w-full text-center space-y-0.5">
                        <div className="text-xs font-black text-slate-800 truncate">
                          {item.whitePlayer} vs {item.blackPlayer}
                        </div>
                        <div className="text-[10px] font-black text-cyan-600">
                          {Math.floor(item.moveIndex / 2) + 1}. {item.moveIndex % 2 === 0 ? 'W' : 'B'}: {item.moveSan}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: BLUNDER */}
        {view === 'BLUNDER' && (
          <div className="flex-1 flex flex-col bg-stone-50 overflow-hidden">
            <header className="flex items-center justify-between py-3 px-4 bg-white border-b border-stone-200/60 z-10 shadow-sm shrink-0">
              <button onClick={() => setView('INPUT')} className="p-2 hover:bg-stone-50 rounded-full transition-colors text-slate-600 cursor-pointer">
                <ChevronLeft size={22} />
              </button>
              <h2 className="font-black text-base text-slate-850">
                {language === 'ko' ? '?? 블런더 저장소' : '?? Blunder Repository'}
              </h2>
              <div className="w-10"></div>
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
              {blunderItems.length === 0 ? (
                <div className="text-center py-20 text-slate-400 font-bold text-xs">
                  {language === 'ko' ? '저장된 블런더 실수가 없습니다. 체스판의 평화가 유지되고 있습니다!' : 'No Blunders stored yet.'}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-12">
                  {blunderItems.map((item, idx) => (
                    <div 
                      key={`${item.game.hashid}-${idx}`}
                      onClick={() => setSelectedHighlight({ ...item, showAfterBoard: false })}
                      className="bg-white rounded-2xl border border-stone-200/60 p-3 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col items-center gap-2 hover:-translate-y-0.5 active:scale-98 relative"
                    >
                      <span className="absolute top-5 left-5 z-10 text-[9px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white shadow-sm">
                        ?? Blunder
                      </span>
                      <div className="w-full aspect-square overflow-hidden rounded-xl border border-stone-150 relative">
                        <Chessboard 
                          options={{
                            position: item.afterFen,
                            allowDragging: false
                          }}
                        />
                      </div>
                      <div className="w-full text-center space-y-0.5">
                        <div className="text-xs font-black text-slate-800 truncate">
                          {item.whitePlayer} vs {item.blackPlayer}
                        </div>
                        <div className="text-[10px] font-black text-red-600">
                          {Math.floor(item.moveIndex / 2) + 1}. {item.moveIndex % 2 === 0 ? 'W' : 'B'}: {item.moveSan}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Highlight Comparison Modal */}
        {selectedHighlight && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4 border border-stone-100 flex flex-col">
              <div className="flex justify-between items-center pb-2 border-b border-stone-100 shrink-0">
                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                  selectedHighlight.classification === 'Brilliant' ? 'bg-cyan-100 text-cyan-800' :
                  selectedHighlight.classification === 'Great' ? 'bg-sky-100 text-sky-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {selectedHighlight.classification === 'Brilliant' ? '!! Brilliant' :
                   selectedHighlight.classification === 'Great' ? '! Great' :
                   '?? Blunder'}
                </span>
                <button 
                  onClick={() => setSelectedHighlight(null)}
                  className="p-1 hover:bg-stone-100 rounded-full text-slate-500 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="w-full aspect-square overflow-hidden rounded-2xl border border-stone-200/80 shadow-md relative shrink-0">
                <Chessboard 
                  options={{
                    position: selectedHighlight.showAfterBoard ? selectedHighlight.afterFen : selectedHighlight.beforeFen,
                    allowDragging: false,
                    darkSquareStyle: { backgroundColor: themeColors.dark },
                    lightSquareStyle: { backgroundColor: themeColors.light },
                    squareRenderer: ({ piece, square, children }) => {
                      const isTargetSquare = selectedHighlight.showAfterBoard && selectedHighlight.moveTo === square;
                      const isSourceSquare = selectedHighlight.showAfterBoard && selectedHighlight.moveFrom === square;
                      
                      let highlightStyle = '';
                      if (selectedHighlight.showAfterBoard) {
                        const isBrilliantOrGreat = selectedHighlight.classification === 'Brilliant' || selectedHighlight.classification === 'Great';
                        if (isTargetSquare || isSourceSquare) {
                          if (isBrilliantOrGreat) {
                            highlightStyle = 'bg-emerald-500/35'; // Greenish highlight for brilliant/great
                          } else if (selectedHighlight.classification === 'Inaccuracy' || selectedHighlight.classification === 'Mistake' || selectedHighlight.classification === 'Blunder') {
                            highlightStyle = 'bg-yellow-500/35'; // Yellowish highlight for blunder/mistake/inaccuracy
                          } else {
                            highlightStyle = 'bg-yellow-500/20'; // Default move highlight
                          }
                        }
                      }
                      
                      return (
                        <div className={`relative w-full h-full flex items-center justify-center ${highlightStyle}`}>
                          {children}
                          {isTargetSquare && getBoardBadge(selectedHighlight.classification)}
                        </div>
                      );
                    }
                  }}
                />
              </div>

              <div className="w-full shrink-0">
                {!selectedHighlight.showAfterBoard ? (
                  selectedHighlight.classification === 'Blunder' ? (
                    <button 
                      onClick={() => setSelectedHighlight(prev => prev ? { ...prev, showAfterBoard: true } : null)}
                      className="w-full bg-red-600 hover:bg-red-550 text-white font-extrabold py-3.5 rounded-2xl text-xs transition-all shadow-md active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                    >
                      ❓ {language === 'ko' ? '블런더 확인하기' : 'Verify Blunder Move'}
                    </button>
                  ) : (
                    <button 
                      onClick={() => setSelectedHighlight(prev => prev ? { ...prev, showAfterBoard: true } : null)}
                      className="w-full bg-cyan-600 hover:bg-cyan-550 text-white font-extrabold py-3.5 rounded-2xl text-xs transition-all shadow-md active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                    >
                      ✨ {language === 'ko' ? '탁월 확인하기' : 'Verify Brilliant Move'}
                    </button>
                  )
                ) : (
                  <button 
                    onClick={() => setSelectedHighlight(prev => prev ? { ...prev, showAfterBoard: false } : null)}
                    className="w-full bg-stone-100 hover:bg-stone-200 text-slate-800 font-extrabold py-3.5 rounded-2xl text-xs transition-all active:scale-98 flex items-center justify-center gap-1.5 cursor-pointer font-sans shadow-inner border border-stone-200/50"
                  >
                    🔄 {language === 'ko' ? '다시 확인하기' : 'Replay Move'}
                  </button>
                )}
              </div>

              <div className="text-center space-y-1 font-bold">
                <div className="text-[10px] text-slate-400 uppercase tracking-widest truncate">
                  {selectedHighlight.whitePlayer} vs {selectedHighlight.blackPlayer}
                </div>
                <div className="text-base text-slate-850 font-black">
                  {Math.floor(selectedHighlight.moveIndex / 2) + 1}. {selectedHighlight.moveIndex % 2 === 0 ? '백' : '흑'} {selectedHighlight.moveSan}
                </div>
                <div className="text-xs text-slate-600 font-bold">
                  {language === 'ko' ? '평가치' : 'Evaluation'}: {' '}
                  <span className="font-extrabold">
                    {selectedHighlight.evalBefore > 0 ? `+${(selectedHighlight.evalBefore/100).toFixed(1)}` : (selectedHighlight.evalBefore/100).toFixed(1)}
                  </span>
                  {' → '}
                  <span className="font-extrabold text-slate-850">
                    {selectedHighlight.evalAfter > 0 ? `+${(selectedHighlight.evalAfter/100).toFixed(1)}` : (selectedHighlight.evalAfter/100).toFixed(1)}
                  </span>
                </div>
              </div>

              {selectedHighlight.classification === 'Blunder' && selectedHighlight.sarcasticComment && (
                <div className="bg-red-50/50 border border-red-150/40 p-3 rounded-2xl text-xs text-red-800 text-center leading-relaxed font-semibold">
                  😂 {selectedHighlight.sarcasticComment}
                </div>
              )}

              <button 
                onClick={() => {
                  const hash = selectedHighlight.gameHashid;
                  setSelectedHighlight(null);
                  loadGameByHashid(hash);
                }}
                className="w-full bg-slate-800 hover:bg-slate-750 text-white font-bold py-3 rounded-2xl text-xs transition-all shadow-md cursor-pointer shrink-0 active:scale-98 font-sans"
              >
                {language === 'ko' ? '전체 경기 분석 보기' : 'View Full Game Analysis'}
              </button>
            </div>
          </div>
        )}

        {/* VIEW: CHESSLE */}
        {view === 'CHESSLE' && chesslePuzzle && (
          <div className="flex-1 flex flex-col bg-stone-50 overflow-hidden">
            <header className="flex items-center justify-between py-2 px-4 bg-white border-b border-stone-200/60 z-10 shadow-sm shrink-0">
              <button onClick={() => setView('INPUT')} className="p-2 hover:bg-stone-50 rounded-full transition-colors text-slate-600 cursor-pointer">
                <ChevronLeft size={22} />
              </button>
              <div className="text-center">
                <h2 className="font-black text-sm text-slate-850">
                  {language === 'ko' ? '🧩 Chessle (체슬)' : '🧩 Chessle'}
                </h2>
                <div className="text-[9px] font-black text-slate-400 tracking-wider">
                  시도 {chessleAttemptCount}/6
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setChessleBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                  className="p-1.5 hover:bg-stone-100 rounded-lg text-slate-600 cursor-pointer font-bold text-xs"
                  title="보드 뒤집기"
                >
                  ⇅
                </button>
                <button 
                  onClick={() => setChessleAutofill(prev => !prev)}
                  className={`px-2 py-1 rounded-lg text-[9px] font-black border transition-all cursor-pointer ${
                    chessleAutofill ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-stone-50'
                  }`}
                  title="자동 채우기"
                >
                  {language === 'ko' ? '자동채움' : 'Autofill'}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar flex flex-col items-center justify-between">
              <div className="w-full aspect-square max-w-[340px] overflow-hidden rounded-2xl shadow-md border border-stone-200 bg-white shrink-0">
                <Chessboard 
                  options={{
                    position: chessleFen,
                    boardOrientation: chessleBoardOrientation,
                    onPieceDrop: handleChesslePieceDrop,
                    allowDragging: chessleMoves.length < 10 && !chessleSolved && chessleAttemptCount < 6
                  }}
                />
              </div>

              <div className="w-full max-w-[340px] space-y-1.5 shrink-0">
                <div className="text-[9px] font-black text-slate-450 uppercase tracking-widest text-center">
                  {language === 'ko' ? '현재 추측 중인 수 (10개 반수)' : 'Current Guess Sequence (10 half-moves)'}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {new Array(10).fill(null).map((_, i) => {
                    const move = chessleMoves[i];
                    const isCorrectAutofilled = chessleAutofill && chessleCorrectMoves[i];
                    return (
                      <div 
                        key={i} 
                        className={`h-9 border rounded-xl flex items-center justify-center font-extrabold text-xs transition-all ${
                          move ? (
                            isCorrectAutofilled ? 'bg-green-500 text-white border-green-500' :
                            i % 2 === 0 ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-100 text-slate-700 border-stone-200'
                          ) : (
                            i === chessleMoves.length ? 'border-slate-800 ring-2 ring-slate-800/20 bg-white' : 'border-dashed border-stone-250 bg-stone-50/50'
                          )
                        }`}
                      >
                        {move || ''}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="w-full max-w-[340px] grid grid-cols-2 gap-3 shrink-0">
                <button 
                  onClick={handleChessleUndo}
                  disabled={chessleMoves.length === 0 || (chessleAutofill && chessleCorrectMoves[chessleMoves.length - 1] !== null)}
                  className="bg-white hover:bg-stone-50 border border-stone-250 text-slate-700 font-bold py-3 rounded-2xl text-xs transition-all active:scale-95 disabled:opacity-40 cursor-pointer shadow-sm"
                >
                  {language === 'ko' ? '↩ 되돌리기' : '↩ Undo'}
                </button>
                <button 
                  onClick={handleChessleSubmit}
                  disabled={chessleMoves.length < 10}
                  className="bg-slate-800 hover:bg-slate-750 disabled:opacity-45 text-white font-bold py-3 rounded-2xl text-xs transition-all active:scale-95 cursor-pointer shadow-md"
                >
                  {language === 'ko' ? '추측 제출 (Submit)' : 'Submit Guess'}
                </button>
              </div>

              <div className="w-full max-w-[340px] flex-1 py-4 flex flex-col justify-start gap-2 overflow-y-auto">
                <div className="text-[9px] font-black text-slate-450 uppercase tracking-widest text-center border-b border-stone-200/50 pb-1 shrink-0">
                  {language === 'ko' ? '시도 기록 (Feedback)' : 'Attempts History'}
                </div>
                <div className="space-y-1.5 w-full">
                  {chessleAttempts.length === 0 ? (
                    <div className="text-center text-[10px] text-slate-400 font-bold py-4">
                      {language === 'ko' ? '상대방의 오프닝 5수(10개 반수)를 유추해보세요!' : 'Guess the opening moves sequence!'}
                    </div>
                  ) : (
                    chessleAttempts.map((att, attIdx) => (
                      <div key={attIdx} className="grid grid-cols-10 gap-1 text-[10px] font-black w-full">
                        {att.moves.map((move, moveIdx) => {
                          const status = att.feedback[moveIdx];
                          return (
                            <div 
                              key={moveIdx} 
                              className={`h-7 rounded-lg flex items-center justify-center text-white text-[9px] truncate ${
                                status === 'correct' ? 'bg-green-600 shadow-sm shadow-green-600/20' :
                                status === 'present' ? 'bg-yellow-500 shadow-sm shadow-yellow-500/20 text-slate-900' :
                                'bg-stone-400'
                              }`}
                              title={status}
                            >
                              {move}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="w-full max-w-[340px] grid grid-cols-2 gap-2 pt-2 border-t border-stone-200/40 shrink-0">
                <button 
                  onClick={() => setShowEndPositionHint(true)}
                  className="bg-stone-100 hover:bg-stone-200 text-slate-700 font-bold py-2 rounded-xl text-[10px] transition-all cursor-pointer"
                >
                  🏁 {language === 'ko' ? '종료 포지션 힌트' : 'End Position Hint'}
                </button>
                <button 
                  onClick={() => setShowMove7Hint(true)}
                  className="bg-stone-100 hover:bg-stone-200 text-slate-700 font-bold py-2 rounded-xl text-[10px] transition-all cursor-pointer"
                >
                  7️⃣ {language === 'ko' ? '7번째 수 힌트' : '7th Move Hint'}
                </button>
              </div>
            </div>

            {showEndPositionHint && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-sm p-5 shadow-2xl space-y-4 border border-stone-100 text-center flex flex-col animate-fade-in">
                  <div className="flex justify-between items-center pb-2 border-b border-stone-100 shrink-0">
                    <span className="text-xs font-black text-slate-800">🏁 {language === 'ko' ? '종료 포지션 힌트' : 'End Position Hint'}</span>
                    <button onClick={() => setShowEndPositionHint(false)} className="p-1 hover:bg-stone-100 rounded-full text-slate-500 cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="w-full aspect-square overflow-hidden rounded-2xl border border-stone-200 shadow-md">
                    <Chessboard options={{ position: chesslePuzzle.endFen, allowDragging: false }} />
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold">
                    {language === 'ko' ? '10개 반수(5수)가 모두 진행된 후의 보드 배치입니다.' : 'This is the position after all 10 moves.'}
                  </p>
                  <button 
                    onClick={() => setShowEndPositionHint(false)}
                    className="w-full bg-slate-800 hover:bg-slate-750 text-white font-bold py-2 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                  >
                    {language === 'ko' ? '닫기' : 'Close'}
                  </button>
                </div>
              </div>
            )}

            {showMove7Hint && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-xs p-5 shadow-2xl space-y-4 border border-stone-100 text-center flex flex-col animate-fade-in">
                  <div className="flex justify-between items-center pb-2 border-b border-stone-100 shrink-0">
                    <span className="text-xs font-black text-slate-800">7️⃣ {language === 'ko' ? '7번째 수 힌트' : '7th Move Hint'}</span>
                    <button onClick={() => setShowMove7Hint(false)} className="p-1 hover:bg-stone-100 rounded-full text-slate-500 cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="space-y-2 py-4">
                    <div className="flex justify-between items-center bg-stone-50 p-2.5 rounded-xl border border-stone-150">
                      <span className="text-xs font-bold text-slate-400">{language === 'ko' ? '7번째 수 (백)' : '7th Move (White)'}</span>
                      <span className="text-sm font-black text-slate-800">{chesslePuzzle.move7w}</span>
                    </div>
                    <div className="flex justify-between items-center bg-stone-50 p-2.5 rounded-xl border border-stone-150">
                      <span className="text-xs font-bold text-slate-400">{language === 'ko' ? '8번째 수 (흑)' : '8th Move (Black)'}</span>
                      <span className="text-sm font-black text-slate-800">{chesslePuzzle.move7b}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowMove7Hint(false)}
                    className="w-full bg-slate-800 hover:bg-slate-750 text-white font-bold py-2 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                  >
                    {language === 'ko' ? '닫기' : 'Close'}
                  </button>
                </div>
              </div>
            )}

            {(chessleSolved || chessleAttemptCount >= 6) && (
              <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center space-y-4 border border-stone-100 flex flex-col">
                  <div className="text-5xl animate-bounce">
                    {chessleSolved ? '🎉' : '😢'}
                  </div>
                  <h3 className="text-2xl font-black text-slate-855">
                    {chessleSolved ? (language === 'ko' ? '훌륭합니다!' : 'Brilliant!') : (language === 'ko' ? '아쉽습니다!' : 'Almost!')}
                  </h3>
                  <p className="text-xs font-bold text-slate-500">
                    {chessleSolved ? (
                      language === 'ko' ? `${chessleAttemptCount}회 시도만에 맞추셨습니다!` : `Solved in ${chessleAttemptCount}/6 attempts!`
                    ) : (
                      language === 'ko' ? '체슬을 풀지 못했습니다. 다음 기회에 도전하세요!' : 'Failed to solve this time!'
                    )}
                  </p>

                  <div className="space-y-1">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{language === 'ko' ? '정답 기보' : 'Correct Answer'}</div>
                    <div className="grid grid-cols-5 gap-1 text-[10px] font-black">
                      {chesslePuzzle.moves.map((m: string, i: number) => (
                        <div key={i} className="h-7 rounded-lg flex items-center justify-center bg-green-600 text-white font-extrabold text-[9px]">
                          {m}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button 
                      onClick={() => {
                        const randomGame = allGames.length > 0 ? allGames[Math.floor(Math.random() * allGames.length)] : PRESET_GAMES[0];
                        startChessleGame(randomGame);
                      }}
                      className="bg-stone-100 hover:bg-stone-200 text-slate-800 font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer shadow-sm"
                    >
                      🔄 {language === 'ko' ? '다시 플레이' : 'Play Again'}
                    </button>
                    <button 
                      onClick={() => {
                        const hash = chesslePuzzle.hashid;
                        setChesslePuzzle(null);
                        loadGameByHashid(hash);
                      }}
                      className="bg-slate-800 hover:bg-slate-750 text-white font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer shadow-md"
                    >
                      🔍 {language === 'ko' ? '복기하러 가기' : 'Review Game'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings Modal (About / Privacy) */}
        {settingsModalType && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={() => setSettingsModalType(null)}>
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-stone-100 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-stone-100 shrink-0">
                <h3 className="font-black text-slate-855 text-base">
                  {settingsModalType === 'about' 
                    ? (language === 'ko' ? '사이트 소개' : 'About Site')
                    : (language === 'ko' ? '개인정보 처리방침' : 'Privacy Policy')
                  }
                </h3>
                <button 
                  onClick={() => setSettingsModalType(null)} 
                  className="p-1.5 hover:bg-stone-100 rounded-full text-slate-500 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-600 leading-relaxed font-medium">
                {settingsModalType === 'about' ? (
                  language === 'ko' ? (
                    <>
                      <p className="font-bold text-slate-800 text-sm mb-1">👋 speerchess에 오신 것을 환영합니다!</p>
                      <p>
                        speerchess는 초경량 Stockfish 체스 엔진(WebAssembly)과 Cloudflare D1 엣지 데이터베이스 기술을 결합하여, 언제 어디서나 끊김 없이 나만의 기보를 복기하고 분석할 수 있는 차세대 웹 플랫폼입니다.
                      </p>
                      <p className="font-bold text-slate-800 mt-2">💡 주요 특징</p>
                      <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-500">
                        <li><b>실시간 Stockfish 분석</b>: 로컬 브라우저에서 Stockfish 엔진이 연동되어 즉시 최선의 수 추천과 평가지 슬라이더를 띄워줍니다.</li>
                        <li><b>원클릭 링크 공유</b>: 내 분석과 변수(Variation)들을 저장하고 고유 단축 공유 링크로 간편하게 타인에게 공유할 수 있습니다.</li>
                        <li><b>체슬 (Chessle) 퍼즐</b>: 저장된 PGN 기보 데이터를 바탕으로 진행되는 5수 오프닝 맞추기 미니게임을 제공합니다.</li>
                        <li><b>블런더 & 탁월 저장소</b>: 분석된 게임에서 묘수(Brilliant)와 최악의 수(Blunder)를 모아서 보드로 확인하고 위트 있는 조롱 코멘트를 즐길 수 있습니다.</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-slate-800 text-sm mb-1">👋 Welcome to speerchess!</p>
                      <p>
                        speerchess is a next-generation chess analysis web app combining Stockfish WASM engine and Cloudflare D1 edge database technologies.
                      </p>
                      <p className="font-bold text-slate-800 mt-2">💡 Key Features</p>
                      <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-500">
                        <li><b>Live Engine Analysis</b>: Client-side Stockfish evaluation with sliders.</li>
                        <li><b>Link Sharing</b>: Encoded, deduplicated D1 cloud backup of parsed PGN structures.</li>
                        <li><b>Chessle Game</b>: 5-move opening guessing game based on active chess games.</li>
                        <li><b>Brilliant / Blunder Repository</b>: Quick review grids for top moves and tactical mistakes.</li>
                      </ul>
                    </>
                  )
                ) : (
                  language === 'ko' ? (
                    <>
                      <p className="font-bold text-slate-800 text-sm mb-1">🔒 회원가입 없는 안전한 익명 서비스</p>
                      <p>
                        speerchess는 사용자의 어떤 개인 정보도 요구하거나 수집하지 않으며, 회원 가입 기능 자체가 존재하지 않는 순수 유틸리티 웹 서비스입니다.
                      </p>
                      <p className="font-bold text-slate-800 mt-2">🛡️ 데이터 보관 방침</p>
                      <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-500">
                        <li><b>PGN 데이터 저장</b>: 분석 공유 버튼을 눌렀을 때 생성되는 PGN 텍스트와 엔진 평가 결과값은 고유 해시 ID(Hashid) 생성을 위해 데이터베이스에 암호화 저장됩니다. 이는 누구나 볼 수 있는 오픈 링크 공유 목적으로만 사용됩니다.</li>
                        <li><b>쿠키 및 브라우저 저장소</b>: 사용자의 선택 언어 설정 등 로컬 테마/인터페이스 상태 유지를 위한 최소한의 데이터만 브라우저 LocalStorage에 보관하며, 마케팅/트래킹 쿠키는 사용하지 않습니다.</li>
                        <li><b>기기 정보</b>: 사이트 성능 모니터링 및 속도 조절 목적 이외의 어떠한 유저 행동 추적 도구도 내장하고 있지 않습니다.</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-slate-800 text-sm mb-1">🔒 Secure & Anonymous Service</p>
                      <p>
                        speerchess does not request, track, or store any personal data. There is no user registration or sign-in.
                      </p>
                      <p className="font-bold text-slate-800 mt-2">🛡️ Data Policy</p>
                      <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-500">
                        <li><b>PGN Game Data</b>: PGN text strings and computer evals are encrypted and cached in Cloudflare D1 databases for shared link generation.</li>
                        <li><b>Local Storage</b>: Standard key-values (e.g. language preferences) are stored strictly on your local browser. We do not use advertising or tracking cookies.</li>
                      </ul>
                    </>
                  )
                )}
              </div>
              <div className="p-4 border-t border-stone-100 bg-stone-50 shrink-0 text-right">
                <button 
                  onClick={() => setSettingsModalType(null)} 
                  className="bg-slate-800 hover:bg-slate-750 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                >
                  {language === 'ko' ? '닫기' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
