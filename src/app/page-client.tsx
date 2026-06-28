'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { Play, Download, Settings, Loader2, ChevronLeft, ChevronRight, CheckCircle2, Layers, Globe, Star, Info, Menu, X, Home as HomeIcon, Clock, BookOpen, GitBranch, HelpCircle, Send, Moon, Sun, ArrowUpRight, Shield, Award, MoreVertical } from 'lucide-react';
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

const getGameResult = (pgnText: string, lang: 'ko' | 'en' = 'ko') => {
  const match = pgnText.match(/\[Result\s+"([^"]+)"\]/i);
  let result = match ? match[1] : '';
  
  if (!result || result === '*' || result === '?') {
    const trimmed = pgnText.trim();
    if (trimmed.endsWith('1-0')) result = '1-0';
    else if (trimmed.endsWith('0-1')) result = '0-1';
    else if (trimmed.endsWith('1/2-1/2')) result = '1/2-1/2';
  }
  
  if (!result || result === '*' || result === '?') {
    try {
      const c = new Chess();
      c.loadPgn(pgnText);
      if (c.isGameOver()) {
        if (c.isCheckmate()) {
          result = c.turn() === 'w' ? '0-1' : '1-0';
        } else {
          result = '1/2-1/2';
        }
      }
    } catch (e) {}
  }

  if (result === '1-0') {
    return lang === 'ko' ? '백 (White) 승리' : 'White Won';
  }
  if (result === '0-1') {
    return lang === 'ko' ? '흑 (Black) 승리' : 'Black Won';
  }
  if (result === '1/2-1/2') {
    return lang === 'ko' ? '무승부 (Draw)' : 'Draw';
  }
  return lang === 'ko' ? '분석 완료' : 'Analysis Complete';
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
  const [gifAnnotationMode, setGifAnnotationMode] = useState<'all' | 'standard' | 'none'>('standard');
  const [gifOrientation, setGifOrientation] = useState<'white' | 'black'>('white');
  const [gifShowNames, setGifShowNames] = useState<boolean>(false);
  const [showGifSettings, setShowGifSettings] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [hyperlinks, setHyperlinks] = useState<{ text: string; url: string }[]>([]);

  useEffect(() => {
    setGifOrientation(boardOrientation);
  }, [boardOrientation]);

  useEffect(() => {
    fetch('/api/hyperlinks')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setHyperlinks(data);
        }
      })
      .catch((err) => console.error('Error fetching hyperlinks:', err));
  }, []);
  const [analysisDepth, setAnalysisDepth] = useState<number>(16);

  // Click-to-move state
  // Memoized source/target squares of the currently viewed move (handles both main line and variations)
  const activeHighlightedSquares = useMemo<{ from: string | null; to: string | null }>(() => {
    if (!analysis) return { from: null, to: null };
    
    // Case 1: We are in a variation
    if (activeVariationIndex !== null && variationStartMoveIndex !== null && analysisPath.length > 0) {
      try {
        const tempChess = new Chess();
        // Play main line up to variationStartMoveIndex
        for (let i = 0; i <= variationStartMoveIndex; i++) {
          tempChess.move(analysis.moves[i].san);
        }
        // Play variation moves up to activeVariationIndex - 1
        for (let i = 0; i < activeVariationIndex; i++) {
          if (analysisPath[i]) {
            tempChess.move(analysisPath[i]);
          }
        }
        // The move at activeVariationIndex is the last move played
        const lastMoveSan = analysisPath[activeVariationIndex];
        if (lastMoveSan) {
          const moveObj = tempChess.move(lastMoveSan);
          if (moveObj) {
            return { from: moveObj.from, to: moveObj.to };
          }
        }
      } catch (e) {
        console.error("Error parsing variation move highlight:", e);
      }
      return { from: null, to: null };
    }
    
    // Case 2: Main line
    if (currentMoveIndex >= 0 && currentMoveIndex < analysis.moves.length) {
      const currentMove = analysis.moves[currentMoveIndex];
      return { from: currentMove.from, to: currentMove.to };
    }
    
    return { from: null, to: null };
  }, [analysis, currentMoveIndex, activeVariationIndex, variationStartMoveIndex, analysisPath]);

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  
  // Board container ref for wheel scroll navigation
  const boardContainerRef = useRef<HTMLDivElement>(null);

  const [isSharing, setIsSharing] = useState(false);
  const [sharedHashid, setSharedHashid] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // New States for Settings, Menu, and views
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isAnalyzeSettingsOpen, setIsAnalyzeSettingsOpen] = useState<boolean>(false);
  const [isAnalyzeMenuOpen, setIsAnalyzeMenuOpen] = useState<boolean>(false);
  
  // Unified App Routing Tab
  const [activeTab, setActiveTab] = useState<'home' | 'review' | 'analyze' | 'chessle' | 'more'>('home');
  const [moreSubView, setMoreSubView] = useState<'menu' | 'clock' | 'ocr' | 'faq' | 'feedback' | 'proposal' | 'terms' | 'privacy' | 'credits' | 'blog' | 'about' | 'settings' | 'brilliant' | 'blunder'>('menu');

  // Custom Settings
  const [darkMode, setDarkMode] = useState<'light' | 'dark'>('dark');
  const [pieceSet, setPieceSet] = useState<'cburnett' | 'disguised' | 'blindfold'>('cburnett');
  const [arrowColor, setArrowColor] = useState<string>('#10b981');
  const [showCoordinates, setShowCoordinates] = useState<boolean>(true);
  const [showMoveDestinations, setShowMoveDestinations] = useState<boolean>(true);
  const [showBoardHighlights, setShowBoardHighlights] = useState<boolean>(true);
  const [showMaterialDifference, setShowMaterialDifference] = useState<boolean>(true);
  const [engineLinesCount, setEngineLinesCount] = useState<number>(2);
  const [explorerDb, setExplorerDb] = useState<'lichess' | 'masters'>('lichess');
  const [explorerSpeeds, setExplorerSpeeds] = useState<string[]>(['blitz', 'rapid', 'classical']);
  const [explorerRatings, setExplorerRatings] = useState<string[]>(['1600', '1800', '2000', '2200', '2500']);
  const [bestMoveArrowEnabled, setBestMoveArrowEnabled] = useState<boolean>(true);
  const [isAnalyzeEngineEnabled, setIsAnalyzeEngineEnabled] = useState<boolean>(true);
  const [analyzeSubTab, setAnalyzeSubTab] = useState<'BOOK' | 'TREE' | 'SETTINGS'>('BOOK');

  // Chess Clock States
  const [clockBaseTime, setClockBaseTime] = useState<number>(300); // in seconds
  const [clockIncrement, setClockIncrement] = useState<number>(2); // in seconds
  const [clockWhiteTime, setClockWhiteTime] = useState<number>(300);
  const [clockBlackTime, setClockBlackTime] = useState<number>(300);
  const [clockActive, setClockActive] = useState<boolean>(false);
  const [clockTurn, setClockTurn] = useState<'w' | 'b' | null>(null);

  // Analysis Move Tree
  const [moveTree, setMoveTree] = useState<Record<string, {
    id: string;
    san: string;
    from: string;
    to: string;
    fen: string;
    parentId: string | null;
    children: string[];
  }>>({
    'root': {
      id: 'root',
      san: '',
      from: '',
      to: '',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      parentId: null,
      children: []
    }
  });
  const [currentNodeId, setCurrentNodeId] = useState<string>('root');
  const [openingData, setOpeningData] = useState<any>(null);
  const [isLoadingOpening, setIsLoadingOpening] = useState<boolean>(false);
  const [bestMoveArrow, setBestMoveArrow] = useState<{ from: string; to: string } | null>(null);

  // Feedback & Proposals
  const [feedbackEmail, setFeedbackEmail] = useState<string>('');
  const [newProposalTitle, setNewProposalTitle] = useState<string>('');
  const [newProposalDesc, setNewProposalDesc] = useState<string>('');
  const [proposals, setProposals] = useState<{ title: string; desc: string; votes: number }[]>([
    { title: '실시간 체스닷컴 매치 연동', desc: '현재 진행 중인 체스닷컴 라이브 매치를 실시간으로 가져와 동시 분석하는 기능.', votes: 42 },
    { title: '스톡피시 18 모바일 최적화', desc: '네이티브 앱 수준의 연산 속도를 위해 WebAssembly 멀티스레딩 지원 추가.', votes: 29 },
    { title: '맞춤형 AI 피드백 음성 서비스', desc: '경기가 끝난 후 내 실수들을 오디오 브리핑으로 짚어주는 기능.', votes: 15 }
  ]);

  // Load proposals on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('speerchess_proposals');
      if (saved) {
        try { setProposals(JSON.parse(saved)); } catch (e) {}
      }
    }
  }, []);

  // Save proposals to localStorage
  const saveProposals = (newProposals: { title: string; desc: string; votes: number }[]) => {
    setProposals(newProposals);
    if (typeof window !== 'undefined') {
      localStorage.setItem('speerchess_proposals', JSON.stringify(newProposals));
    }
  };

  // Chessle
  const [chesslePuzzle, setChesslePuzzle] = useState<any | null>(null);
  const [chessleCodeInput, setChessleCodeInput] = useState<string>('');

  // Chess OCR States
  const [ocrModelLoaded, setOcrModelLoaded] = useState<boolean>(false);
  const [ocrModelLoading, setOcrModelLoading] = useState<boolean>(false);
  const [ocrImageSrc, setOcrImageSrc] = useState<string | null>(null);
  const [ocrBoardState, setOcrBoardState] = useState<string[][]>(
    Array(8).fill(null).map(() => Array(8).fill('1'))
  );
  const [ocrIsFlipped, setOcrIsFlipped] = useState<boolean>(false);
  const [ocrActiveEditSquare, setOcrActiveEditSquare] = useState<{ rank: number; file: number } | null>(null);
  const [ocrShowSelector, setOcrShowSelector] = useState<boolean>(false);
  const [ocrPredicting, setOcrPredicting] = useState<boolean>(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrScanMode, setOcrScanMode] = useState<'local' | 'cloud'>('local');
  const [ocrCloudUrl, setOcrCloudUrl] = useState<string>('');

  // Load OCR configurations from localStorage on start
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUrl = localStorage.getItem('speerchess_ocr_cloud_url');
      if (storedUrl) setOcrCloudUrl(storedUrl);
      const storedMode = localStorage.getItem('speerchess_ocr_scan_mode') as 'local' | 'cloud';
      if (storedMode) setOcrScanMode(storedMode);
    }
  }, []);

  // Chess OCR crop references
  const ocrCropRef = useRef<{ x: number; y: number; size: number }>({ x: 0, y: 0, size: 256 });
  const ocrPredictorRef = useRef<any>(null);
  const ocrImageRef = useRef<HTMLImageElement | null>(null);
  const ocrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ocrResultCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ocrCropOverlayRef = useRef<HTMLDivElement | null>(null);
  
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
    opponentLastMoveFrom?: string | null;
    opponentLastMoveTo?: string | null;
    evalBefore: number;
    evalAfter: number;
    beforeFen: string;
    afterFen: string;
    sarcasticComment: string;
    showAfterBoard: boolean;
  } | null>(null);

  // Chessle States
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
  
  // Chessle click-to-move states
  const [chessleSelectedSquare, setChessleSelectedSquare] = useState<string | null>(null);
  const [chesslePossibleMoves, setChesslePossibleMoves] = useState<string[]>([]);

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
  const pathname = usePathname();
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
        setPgn(data.pgn);
        setFen(new Chess().fen());
        setCurrentMoveIndex(-1);
        
        // Set shared hashid state
        setSharedHashid(hashid);
        
        // Go to Chessle view directly if URL matches Chessle path
        if (pathname?.startsWith('/chessle/')) {
          startChessleGame({
            hashid: hashid,
            analysis_json: data.analysis_json,
            pgn: data.pgn
          });
        } else {
          // Go straight to review analysis mode
          setView('REVIEW');
          setReviewTab('ENGINE');
        }
      } catch (e: any) {
        alert(e.message || '게임 로딩 중 오류가 발생했습니다.');
        setView('INPUT');
      }
    };

    loadSharedGame();
  }, [hashid, pathname]);

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
          if (move.classification === 'Brilliant') {
            const players = getPlayersFromPgn(g.pgn);
            const opponentLastMove = index > 0 ? parsed.moves[index - 1] : null;
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
              opponentLastMoveFrom: opponentLastMove ? opponentLastMove.from : null,
              opponentLastMoveTo: opponentLastMove ? opponentLastMove.to : null,
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
        if (!parsed.moves) continue;

        let worstWhiteBlunder: any = null;
        let worstBlackBlunder: any = null;

        parsed.moves.forEach((move: any, index: number) => {
          const moveNumber = Math.floor(index / 2) + 1;
          if (move.classification === 'Blunder' && moveNumber >= 15) {
            const isWhite = index % 2 === 0;
            if (isWhite) {
              if (!worstWhiteBlunder || move.accuracy < worstWhiteBlunder.move.accuracy) {
                worstWhiteBlunder = { move, index };
              }
            } else {
              if (!worstBlackBlunder || move.accuracy < worstBlackBlunder.move.accuracy) {
                worstBlackBlunder = { move, index };
              }
            }
          }
        });

        const players = getPlayersFromPgn(g.pgn);

        [worstWhiteBlunder, worstBlackBlunder].forEach((b) => {
          if (b) {
            const { move, index } = b;
            const opponentLastMove = index > 0 ? parsed.moves[index - 1] : null;
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
              opponentLastMoveFrom: opponentLastMove ? opponentLastMove.from : null,
              opponentLastMoveTo: opponentLastMove ? opponentLastMove.to : null,
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
      setPgn(preset.pgn);
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
        setPgn(data.pgn);
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

  // Reset Chessle click-to-move states
  useEffect(() => {
    setChessleSelectedSquare(null);
    setChesslePossibleMoves([]);
  }, [chessleFen, view]);

  const handleChessleSquareClick = (square: string) => {
    const allowMoves = chessleMoves.length < 10 && !chessleSolved && chessleAttemptCount < 6;
    if (!allowMoves) return;

    const tempChess = new Chess(chessleFen);
    
    if (chessleSelectedSquare) {
      if (chesslePossibleMoves.includes(square)) {
        handleChesslePieceDrop({
          piece: null,
          sourceSquare: chessleSelectedSquare,
          targetSquare: square
        });
        setChessleSelectedSquare(null);
        setChesslePossibleMoves([]);
        return;
      }
    }

    const piece = tempChess.get(square as any);
    const activeColor = tempChess.turn();
    
    if (piece && piece.color === activeColor) {
      setChessleSelectedSquare(square);
      const moves = tempChess.moves({ square: square as any, verbose: true }) as any[];
      setChesslePossibleMoves(moves.map(m => m.to));
    } else {
      setChessleSelectedSquare(null);
      setChesslePossibleMoves([]);
    }
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
    const worker = new Worker('/stockfish-18-lite-single.js');
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
          
          const currentDepth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
          if (currentDepth >= 4) {
            // Choose active FEN for SAN translation
            const activeFenVal = activeTab === 'analyze'
              ? (moveTreeRef.current[currentNodeIdRef.current]?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
              : fenRef.current;
            const sanPv = uciPvToSan(activeFenVal, pv);
            
            tempLinesRef.current[multipv] = {
              multipv,
              score,
              isMate,
              pv: sanPv
            };

            // Set engine best move arrow coord
            if (multipv === 1 && pv) {
              const firstMoveUci = pv.split(' ')[0];
              if (firstMoveUci && firstMoveUci.length >= 4) {
                setBestMoveArrow({
                  from: firstMoveUci.slice(0, 2),
                  to: firstMoveUci.slice(2, 4)
                });
              }
            }

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

  const activeAnalysisFen = useMemo(() => {
    if (activeTab === 'analyze') {
      return moveTree[currentNodeId]?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    }
    return '';
  }, [activeTab, moveTree, currentNodeId]);

  // Keep refs in sync for Web Worker onmessage closure
  const moveTreeRef = useRef(moveTree);
  const currentNodeIdRef = useRef(currentNodeId);
  useEffect(() => {
    moveTreeRef.current = moveTree;
    currentNodeIdRef.current = currentNodeId;
  }, [moveTree, currentNodeId]);

  // Trigger real-time Stockfish engine calculation when navigating FEN
  useEffect(() => {
    if (!reviewWorkerRef.current) return;
    
    setEngineLines([]);
    setBestMoveArrow(null);
    tempLinesRef.current = {};
    
    if (view === 'REVIEW') {
      reviewWorkerRef.current.postMessage('stop');
      reviewWorkerRef.current.postMessage('setoption name MultiPV value 3');
      reviewWorkerRef.current.postMessage(`position fen ${fen}`);
      reviewWorkerRef.current.postMessage(`go depth ${analysisDepth}`);
    } else if (activeTab === 'analyze' && isAnalyzeEngineEnabled && activeAnalysisFen) {
      reviewWorkerRef.current.postMessage('stop');
      reviewWorkerRef.current.postMessage(`setoption name MultiPV value ${engineLinesCount}`);
      reviewWorkerRef.current.postMessage(`position fen ${activeAnalysisFen}`);
      reviewWorkerRef.current.postMessage(`go depth ${depth}`);
    }
  }, [fen, view, activeAnalysisFen, activeTab, isAnalyzeEngineEnabled, engineLinesCount, depth, analysisDepth]);

  // Fetch opening book data from Lichess Explorer API
  useEffect(() => {
    if (activeTab !== 'analyze' || analyzeSubTab !== 'BOOK') return;
    
    const fetchOpeningData = async () => {
      const activeFen = moveTree[currentNodeId]?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      setIsLoadingOpening(true);
      setOpeningData(null);
      
      try {
        const dbParam = explorerDb === 'masters' ? 'masters' : 'lichess';
        let url = `/api/explorer?db=${dbParam}&fen=${encodeURIComponent(activeFen)}`;
        if (dbParam === 'lichess') {
          if (explorerSpeeds.length > 0) {
            url += `&speeds=${explorerSpeeds.join(',')}`;
          }
          if (explorerRatings.length > 0) {
            url += `&ratings=${explorerRatings.join(',')}`;
          }
        }
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setOpeningData(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoadingOpening(false);
      }
    };
    
    const debounce = setTimeout(fetchOpeningData, 300);
    return () => clearTimeout(debounce);
  }, [activeAnalysisFen, activeTab, analyzeSubTab, explorerDb, explorerSpeeds.join(','), explorerRatings.join(',')]);

  // Chess OCR: Load TensorFlow.js and Filters.js scripts dynamically
  useEffect(() => {
    if (activeTab !== 'more' || moreSubView !== 'ocr') return;

    let isSubscribed = true;

    const loadScripts = async () => {
      // 1. Load Filters.js if not already loaded
      if (!(window as any).Filters) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = '/filters.js';
          script.async = true;
          script.onload = () => resolve();
          document.body.appendChild(script);
        });
      }

      // If we are in cloud scanning mode, we don't need to load TFJS or the local model
      if (ocrScanMode === 'cloud') {
        if (isSubscribed) {
          setOcrModelLoaded(true);
        }
        return;
      }

      // 2. Load TFJS if not already loaded
      if (!(window as any).tf) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@0.12.5';
          script.async = true;
          script.onload = () => resolve();
          document.body.appendChild(script);
        });
      }

      if (!isSubscribed) return;

      // 3. Load TFJS model
      if (!ocrPredictorRef.current && !ocrModelLoading) {
        setOcrModelLoading(true);
        setOcrError(null);
        try {
          const tf = (window as any).tf;
          const model = await tf.loadFrozenModel('/model/tensorflowjs_model.pb', '/model/weights_manifest.json');
          ocrPredictorRef.current = model;
          setOcrModelLoaded(true);
        } catch (err: any) {
          console.error("Error loading TFJS model:", err);
          setOcrError(language === 'ko' ? "모델 파일 로딩에 실패했습니다. (public/model 경로 확인 요망)" : "Failed to load TFJS model files.");
        } finally {
          setOcrModelLoading(false);
        }
      } else if (ocrPredictorRef.current) {
        setOcrModelLoaded(true);
      }
    };

    loadScripts();

    return () => {
      isSubscribed = false;
    };
  }, [activeTab, moreSubView, language, ocrModelLoading, ocrScanMode]);

  // Chess OCR: Clipboard paste event listener
  useEffect(() => {
    if (activeTab !== 'more' || moreSubView !== 'ocr') return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = (e.clipboardData || (window as any).clipboardData)?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') === 0) {
          const blob = items[i].getAsFile();
          if (blob) {
            handleOcrFile(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [activeTab, moreSubView]);

  // Chess OCR: Bounding box UI visual sync
  const updateOcrCropOverlayVisual = () => {
    const overlay = ocrCropOverlayRef.current;
    const canvas = ocrCanvasRef.current;
    if (!overlay || !canvas) return;

    const visualWidth = canvas.clientWidth;
    const scale = visualWidth / 512;

    const { x, y, size } = ocrCropRef.current;
    overlay.style.left = `${x * scale}px`;
    overlay.style.top = `${y * scale}px`;
    overlay.style.width = `${size * scale}px`;
    overlay.style.height = `${size * scale}px`;
    overlay.style.display = 'block';
  };

  // Chess OCR: Handle Image File upload and run auto edge detection
  const handleOcrFile = (file: File) => {
    setOcrError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setOcrImageSrc(e.target.result as string);
        
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          ocrImageRef.current = img;
          processOcrImage(img);
        };
        img.onerror = () => {
          setOcrError(language === 'ko' ? "이미지를 로드하는 중 오류가 발생했습니다." : "Error loading image file.");
        };
        img.src = e.target.result as string;
      }
    };
    reader.onerror = (err) => {
      console.error("FileReader error:", err);
      setOcrError(language === 'ko' ? "파일을 읽는 도중 오류가 발생했습니다. 권한 설정이나 손상 여부를 확인하세요." : "Error reading file. Check file permissions.");
    };
    try {
      reader.readAsDataURL(file);
    } catch (e: any) {
      console.error("FileReader read error:", e);
      setOcrError(language === 'ko' ? "파일을 시작하는 데 실패했습니다." : "Failed to start reading file.");
    }
  };

  // Chess OCR: Sobel edge detection & auto-snapping grid coordinates
  const processOcrImage = (img: HTMLImageElement) => {
    const canvas = ocrCanvasRef.current;
    if (!canvas) return;

    const internalWidth = 512;
    const internalHeight = Math.floor((img.height * internalWidth) / img.width);

    canvas.width = internalWidth;
    canvas.height = internalHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(img, 0, 0, internalWidth, internalHeight);
    } catch (e: any) {
      console.error("Canvas drawImage error:", e);
      setOcrError(language === 'ko' ? "보안 정책(CORS)으로 인해 외부 도메인 이미지를 캔버스에 그릴 수 없습니다." : "Cannot draw external domain image to canvas due to CORS.");
      return;
    }

    const Filters = (window as any).Filters;
    if (!Filters) {
      const size = Math.min(internalWidth, internalHeight) * 0.8;
      ocrCropRef.current = {
        x: (internalWidth - size) / 2,
        y: (internalHeight - size) / 2,
        size
      };
      updateOcrCropOverlayVisual();
      cropAndPredictOcr();
      return;
    }

    try {
      let d = Filters.filterImage(Filters.gaussianBlur, canvas, 5);
      d = Filters.sobel(d);

      const w = d.width;
      const h = d.height;
      const pixelData = new Float32Array(d.data);
      const scoreX = new Float32Array(w);
      const scoreY = new Float32Array(h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const off = (y * w + x) * 4;
          scoreX[x] += Math.log(pixelData[off] + 1);
          scoreY[y] += Math.log(pixelData[off + 1] + 1);
        }
      }

      const winsize = 30;
      const ctrX = findOcrMax(scoreX, Math.floor(internalWidth / 2) - winsize, Math.floor(internalWidth / 2) + winsize);
      const leftX = findOcrMax(scoreX, ctrX.idx - 65, ctrX.idx - 31);
      const rightX = findOcrMax(scoreX, ctrX.idx + 31, ctrX.idx + 65);

      const ctrY = findOcrMax(scoreY, Math.floor(internalHeight / 2) - winsize, Math.floor(internalHeight / 2) + winsize);
      const botY = findOcrMax(scoreY, ctrY.idx + 31, ctrY.idx + 65);
      const topY = findOcrMax(scoreY, ctrY.idx - 65, ctrY.idx - 31);

      const deltaX = (rightX.idx - leftX.idx) / 2;
      const deltaY = (botY.idx - topY.idx) / 2;

      const startX = ctrX.idx - (4 * deltaX);
      const startY = ctrY.idx - (4 * deltaY);
      const endX = ctrX.idx + (4 * deltaX);
      const endY = ctrY.idx + (4 * deltaY);
      
      const widthX = endX - startX;
      const heightY = endY - startY;

      if (widthX > 150 && widthX <= internalWidth && heightY > 150 && heightY <= internalHeight && Math.abs(widthX - heightY) < 30) {
        ocrCropRef.current = {
          x: Math.max(0, startX),
          y: Math.max(0, startY),
          size: Math.min(widthX, heightY)
        };
      } else {
        const size = Math.min(internalWidth, internalHeight) * 0.8;
        ocrCropRef.current = {
          x: (internalWidth - size) / 2,
          y: (internalHeight - size) / 2,
          size
        };
      }
    } catch (err) {
      console.error("Sobel detection error:", err);
      const size = Math.min(internalWidth, internalHeight) * 0.8;
      ocrCropRef.current = {
        x: (internalWidth - size) / 2,
        y: (internalHeight - size) / 2,
        size
      };
    }

    updateOcrCropOverlayVisual();
    cropAndPredictOcr();
  };

  const findOcrMax = (arr: Float32Array, a: number, b: number) => {
    let maxVal = -1;
    let maxIdx = 0;
    for (let i = a; i < b; i++) {
      if (i >= 0 && i < arr.length) {
        if (arr[i] > maxVal) {
          maxVal = arr[i];
          maxIdx = i;
        }
      }
    }
    return { max: maxVal, idx: maxIdx };
  };

  // Chess OCR: Crop and perform model prediction
  const cropAndPredictOcr = async () => {
    const img = ocrImageRef.current;
    const resultCanvas = ocrResultCanvasRef.current;
    const predictor = ocrPredictorRef.current;
    if (!img || !resultCanvas) return;
    if (ocrScanMode === 'local' && !predictor) return;

    setOcrPredicting(true);
    setOcrError(null);

    const ctx = resultCanvas.getContext('2d');
    if (!ctx) {
      setOcrPredicting(false);
      return;
    }

    resultCanvas.width = 256;
    resultCanvas.height = 256;
    ctx.imageSmoothingQuality = "high";

    const scale = img.width / 512;
    const { x, y, size } = ocrCropRef.current;
    const sourceX = x * scale;
    const sourceY = y * scale;
    const sourceSize = size * scale;

    ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 256, 256);

    if (ocrScanMode === 'cloud') {
      resultCanvas.toBlob(async (blob) => {
        if (!blob) {
          setOcrPredicting(false);
          return;
        }

        const formData = new FormData();
        formData.append('file', blob, 'cropped_chessboard.png');

        try {
          if (!ocrCloudUrl || !ocrCloudUrl.trim()) {
            throw new Error(language === 'ko' ? "API URL 설정이 비어 있습니다." : "API URL setting is empty.");
          }
          const predictUrl = ocrCloudUrl.endsWith('/') ? `${ocrCloudUrl}predict` : `${ocrCloudUrl}/predict`;
          const response = await fetch(predictUrl, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          if (data.grid) {
            setOcrBoardState(data.grid);
          } else {
            throw new Error(language === 'ko' ? "올바른 FEN 데이터가 오지 않았습니다." : "Invalid FEN response format.");
          }
        } catch (err: any) {
          console.error("Cloud OCR prediction error:", err);
          setOcrError(err.message || (language === 'ko' ? "클라우드 스캔 서버 연결 실패" : "Cloud scan server connection failed"));
        } finally {
          setOcrPredicting(false);
        }
      }, 'image/png');
      return;
    }

    let imgData;
    try {
      imgData = ctx.getImageData(0, 0, 256, 256);
    } catch (e: any) {
      console.error("Canvas read security error:", e);
      setOcrError(language === 'ko' 
        ? "보안 정책(CORS)으로 인해 외부 이미지를 직접 스캔할 수 없습니다. 이미지를 PC에 저장한 후 업로드하거나, 스크린샷 복사 후 Ctrl+V로 붙여넣어주세요!" 
        : "Cannot read external web images due to CORS. Please save the image to your computer first, or paste it using Ctrl+V!");
      setOcrPredicting(false);
      return;
    }
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      data[i] = avg;
      data[i+1] = avg;
      data[i+2] = avg;
    }
    ctx.putImageData(imgData, 0, 0);

    try {
      const tf = (window as any).tf;
      
      const imgTensor = tf.fromPixels(resultCanvas).asType('float32');
      
      const files = [];
      for (let i = 0; i < 8; i++) {
        files[i] = imgTensor.slice([0, 32 * i, 0], [256, 32, 1]).reshape([8, 1024]);
      }
      const tiles = tf.concat(files);

      const output = predictor.execute({
        Input: tiles,
        KeepProb: tf.scalar(1.0)
      });

      const predictions = output.dataSync();

      const pieceMap = '1KQRBNPkqrbnp';
      const newBoardState = Array(8).fill(null).map(() => Array(8).fill('1'));
      for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
          const predIndex = rank + file * 8;
          newBoardState[rank][file] = pieceMap[predictions[predIndex]];
        }
      }

      setOcrBoardState(newBoardState);
      
      imgTensor.dispose();
      tiles.dispose();
      output.dispose();
    } catch (err: any) {
      console.error("TFJS prediction error:", err);
      setOcrError(language === 'ko' ? "기물 위치 인식 중 오류가 발생했습니다." : "Error occurred during piece prediction.");
    } finally {
      setOcrPredicting(false);
    }
  };

  // Convert OCR board array to FEN string
  const getOcrBoardFEN = () => {
    const fenRows = [];
    for (let rank = 0; rank < 8; rank++) {
      let emptyCount = 0;
      let rowStr = '';
      for (let file = 0; file < 8; file++) {
        const piece = ocrBoardState[rank][file];
        if (piece === '1') {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          rowStr += piece;
        }
      }
      if (emptyCount > 0) {
        rowStr += emptyCount;
      }
      fenRows.push(rowStr);
    }
    return fenRows.join('/') + " w KQkq - 0 1";
  };

  // Drag & Resize handles for Crop Overlay in React
  const handleOcrOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const overlay = ocrCropOverlayRef.current;
    if (!overlay) return;

    let isResizing = false;
    let activeHandle: string | null = null;

    const target = e.target as HTMLElement;
    if (target.classList.contains('ocr-crop-handle')) {
      isResizing = true;
      activeHandle = target.classList[1]; // tl, tr, bl, br
    }

    const startX = e.clientX;
    const startY = e.clientY;
    
    const startCropX = ocrCropRef.current.x;
    const startCropY = ocrCropRef.current.y;
    const startCropSize = ocrCropRef.current.size;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const canvas = ocrCanvasRef.current;
      if (!canvas) return;

      const visualWidth = canvas.clientWidth;
      const scale = 512 / visualWidth;

      const deltaX = (moveEvent.clientX - startX) * scale;
      const deltaY = (moveEvent.clientY - startY) * scale;

      if (!isResizing) {
        // Dragging crop box
        ocrCropRef.current.x = Math.max(0, Math.min(512 - ocrCropRef.current.size, startCropX + deltaX));
        ocrCropRef.current.y = Math.max(0, Math.min(canvas.height - ocrCropRef.current.size, startCropY + deltaY));
      } else {
        // Resizing crop box
        let sizeChange = 0;
        switch (activeHandle) {
          case 'br':
            sizeChange = Math.max(deltaX, deltaY);
            ocrCropRef.current.size = Math.max(80, Math.min(Math.min(512 - ocrCropRef.current.x, canvas.height - ocrCropRef.current.y), startCropSize + sizeChange));
            break;
          case 'bl':
            sizeChange = Math.max(-deltaX, deltaY);
            const newSizeBL = Math.max(80, Math.min(Math.min(startCropX + startCropSize, canvas.height - ocrCropRef.current.y), startCropSize + sizeChange));
            const diffBL = newSizeBL - startCropSize;
            ocrCropRef.current.x = startCropX - diffBL;
            ocrCropRef.current.size = newSizeBL;
            break;
          case 'tr':
            sizeChange = Math.max(deltaX, -deltaY);
            const newSizeTR = Math.max(80, Math.min(Math.min(512 - ocrCropRef.current.x, startCropY + startCropSize), startCropSize + sizeChange));
            const diffTR = newSizeTR - startCropSize;
            ocrCropRef.current.y = startCropY - diffTR;
            ocrCropRef.current.size = newSizeTR;
            break;
          case 'tl':
            sizeChange = Math.max(-deltaX, -deltaY);
            const newSizeTL = Math.max(80, Math.min(Math.min(startCropX + startCropSize, startCropY + startCropSize), startCropSize + sizeChange));
            const diffTL = newSizeTL - startCropSize;
            ocrCropRef.current.x = startCropX - diffTL;
            ocrCropRef.current.y = startCropY - diffTL;
            ocrCropRef.current.size = newSizeTL;
            break;
        }
      }
      updateOcrCropOverlayVisual();
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      cropAndPredictOcr();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  };

  // Chess Clock tick mechanism (Runs in tenths of a second)
  useEffect(() => {
    if (!clockActive || !clockTurn) return;
    
    const interval = setInterval(() => {
      if (clockTurn === 'w') {
        setClockWhiteTime((prev) => {
          if (prev <= 0.1) {
            setClockActive(false);
            setClockTurn(null);
            return 0;
          }
          return Number((prev - 0.1).toFixed(1));
        });
      } else {
        setClockBlackTime((prev) => {
          if (prev <= 0.1) {
            setClockActive(false);
            setClockTurn(null);
            return 0;
          }
          return Number((prev - 0.1).toFixed(1));
        });
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [clockActive, clockTurn]);

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
    setSharedHashid(null);
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

      // Auto save game if it exceeds 7 moves (14 plies)
      if (gameAnalysis.moves.length > 14) {
        autoSaveGame(pgnToUse, gameAnalysis);
      }

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
    setReviewTab(prev => prev === 'MOVES' ? 'ENGINE' : 'MOVES');
  };

  // Click-to-move state & helpers
  useEffect(() => {
    setSelectedSquare(null);
    setPossibleMoves([]);
  }, [fen, currentMoveIndex, reviewTab]);

  const handleSquareClick = (square: string) => {
    const tempChess = new Chess(fen);
    
    if (selectedSquare) {
      if (possibleMoves.includes(square)) {
        handlePieceDrop({
          piece: null,
          sourceSquare: selectedSquare,
          targetSquare: square
        });
        setSelectedSquare(null);
        setPossibleMoves([]);
        return;
      }
    }

    const piece = tempChess.get(square as any);
    const activeColor = tempChess.turn();
    
    if (piece && piece.color === activeColor) {
      setSelectedSquare(square);
      const moves = tempChess.moves({ square: square as any, verbose: true }) as any[];
      setPossibleMoves(moves.map(m => m.to));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
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

  // PC Scroll navigation effect
  const handlersRef = useRef({ handleNextMove, handlePrevMove });
  useEffect(() => {
    handlersRef.current = { handleNextMove, handlePrevMove };
  });

  useEffect(() => {
    const container = boardContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        handlersRef.current.handleNextMove();
      } else if (e.deltaY < 0) {
        handlersRef.current.handlePrevMove();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [view, analysis]);

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
        orientation: gifOrientation,
        annotationMode: gifAnnotationMode,
        showPlayerNames: gifShowNames,
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
    
    const getHeaderFromPgn = (pgnString: string, headerName: string): string => {
      const regex = new RegExp(`\\[${headerName}\\s+"([^"]*)"\\]`);
      const match = pgnString ? pgnString.match(regex) : null;
      return match ? match[1] : '';
    };

    const white = getHeaderFromPgn(pgn, 'White');
    const black = getHeaderFromPgn(pgn, 'Black');
    const whiteElo = (analysis && analysis.whiteElo) ? String(analysis.whiteElo) : getHeaderFromPgn(pgn, 'WhiteElo');
    const blackElo = (analysis && analysis.blackElo) ? String(analysis.blackElo) : getHeaderFromPgn(pgn, 'BlackElo');
    const rawTimeControl = getHeaderFromPgn(pgn, 'TimeControl');
    
    let result = getHeaderFromPgn(pgn, 'Result');
    if (!result || result === '*' || result === '?') {
      const trimmedPgn = pgn.trim();
      if (trimmedPgn.endsWith('1-0')) result = '1-0';
      else if (trimmedPgn.endsWith('0-1')) result = '0-1';
      else if (trimmedPgn.endsWith('1/2-1/2')) result = '1/2-1/2';
    }
    if (!result || result === '*' || result === '?') {
      try {
        const c = new Chess();
        analysis.moves.forEach(m => c.move(m.san));
        if (c.isGameOver()) {
          if (c.isCheckmate()) {
            result = c.turn() === 'w' ? '0-1' : '1-0';
          } else {
            result = '1/2-1/2';
          }
        }
      } catch (e) {}
    }
    if (!result) result = '*';
    
    let timeControl = '';
    if (rawTimeControl && rawTimeControl !== '-' && rawTimeControl !== '?') {
      const parts = rawTimeControl.split('+');
      const base = parseInt(parts[0], 10);
      if (!isNaN(base)) {
        const inc = parts[1] ? parseInt(parts[1], 10) : 0;
        const increment = isNaN(inc) ? 0 : inc;
        timeControl = String(base + 60 * increment);
      }
    }

    pgnResult += `[Event "Speerchess Analysis"]\n`;
    pgnResult += `[White "${white || ''}"]\n`;
    pgnResult += `[Black "${black || ''}"]\n`;
    pgnResult += `[WhiteElo "${whiteElo || ''}"]\n`;
    pgnResult += `[BlackElo "${blackElo || ''}"]\n`;
    pgnResult += `[TimeControl "${timeControl || ''}"]\n`;
    pgnResult += `[Result "${result}"]\n\n`;

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
    
    pgnResult += ` ${result}`;
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

  const autoSaveGame = async (pgnText: string, gameAnalysis: any) => {
    try {
      const movesSequence = gameAnalysis.moves.map((m: any) => m.san).join(' ');
      const analysisJson = JSON.stringify(gameAnalysis);

      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pgn: pgnText,
          analysisJson,
          movesSequence
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.hashid) {
          setSharedHashid(data.hashid);
          fetchGames();
        }
      }
    } catch (e) {
      console.error("Auto-save failed:", e);
    }
  };

  const handleShareGame = async () => {
    if (!analysis) return;

    if (analysis.moves.length <= 14) {
      alert("공유 링크는 7수가 넘는 경기만 생성할 수 있습니다.");
      return;
    }

    if (sharedHashid) {
      const link = `${window.location.origin}/${sharedHashid}`;
      try {
        await navigator.clipboard.writeText(link);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (e) {
        alert("링크 복사에 실패했습니다.");
      }
      return;
    }

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
        await navigator.clipboard.writeText(link);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
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

  const disguisedPieces = {
    wP: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#ffffff', border: '2px solid #000000', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    wN: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#ffffff', border: '2px solid #000000', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    wB: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#ffffff', border: '2px solid #000000', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    wR: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#ffffff', border: '2px solid #000000', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    wQ: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#ffffff', border: '2px solid #000000', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    wK: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#ffffff', border: '2px solid #000000', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    bP: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#2b2b2b', border: '2px solid #ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    bN: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#2b2b2b', border: '2px solid #ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    bB: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#2b2b2b', border: '2px solid #ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    bR: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#2b2b2b', border: '2px solid #ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    bQ: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#2b2b2b', border: '2px solid #ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />,
    bK: ({ squareWidth }: any) => <div style={{ width: squareWidth * 0.45, height: squareWidth * 0.45, borderRadius: '50%', backgroundColor: '#2b2b2b', border: '2px solid #ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
  };

  const getCustomPieces = () => {
    if (pieceSet === 'disguised') {
      return disguisedPieces;
    }
    if (pieceSet === 'blindfold') {
      return {
        wP: () => <div />, wN: () => <div />, wB: () => <div />, wR: () => <div />, wQ: () => <div />, wK: () => <div />,
        bP: () => <div />, bN: () => <div />, bB: () => <div />, bR: () => <div />, bQ: () => <div />, bK: () => <div />
      };
    }
    return undefined;
  };

  const getAnalyzeEvaluation = (): number => {
    if (engineLines.length > 0) {
      const topLine = engineLines[0];
      const activeFen = moveTree[currentNodeId]?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const tempChess = new Chess(activeFen);
      const isWhiteTurn = tempChess.turn() === 'w';
      
      let score = topLine.score;
      if (topLine.isMate) {
        score = topLine.score > 0 ? 10000 : -10000;
      }
      return isWhiteTurn ? score : -score;
    }
    return 0;
  };

  const evalToWinProb = (evalCp: number): number => {
    return 0.5 + 0.5 * (2 / (1 + Math.exp(-0.00368208 * evalCp)) - 1);
  };

  const handleAnalyzePieceDrop = (args: { piece: any; sourceSquare: string; targetSquare: string | null }): boolean => {
    const { piece, sourceSquare, targetSquare } = args;
    if (!targetSquare) return false;
    try {
      const activeFen = moveTree[currentNodeId]?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const tempChess = new Chess(activeFen);
      const moveResult = tempChess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: piece[1]?.toLowerCase() ?? 'q',
      });
      
      if (moveResult) {
        const nextFen = tempChess.fen();
        const currentNode = moveTree[currentNodeId];
        const existingChildId = currentNode.children.find(cid => moveTree[cid]?.san === moveResult.san);
        
        if (existingChildId) {
          setCurrentNodeId(existingChildId);
        } else {
          const newId = `node_${Math.random().toString(36).substring(2, 9)}`;
          const newNode = {
            id: newId,
            san: moveResult.san,
            from: moveResult.from,
            to: moveResult.to,
            fen: nextFen,
            parentId: currentNodeId,
            children: []
          };
          
          setMoveTree(prev => ({
            ...prev,
            [currentNodeId]: {
              ...prev[currentNodeId],
              children: [...prev[currentNodeId].children, newId]
            },
            [newId]: newNode
          }));
          setCurrentNodeId(newId);
        }
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  const renderMoveTree = (nodeId: string, isVariation: boolean = false): React.ReactNode[] => {
    const node = moveTree[nodeId];
    if (!node) return [];
    
    const elements: React.ReactNode[] = [];
    if (nodeId !== 'root') {
      const isWhite = node.fen.split(' ')[1] === 'b';
      const parts = node.fen.split(' ');
      const fullmove = parseInt(parts[5], 10);
      const moveNum = isWhite ? fullmove - 1 : fullmove;
      
      let label = '';
      if (isWhite) {
        label = `${moveNum}. ${node.san}`;
      } else if (isVariation) {
        label = `${moveNum}... ${node.san}`;
      } else {
        label = `${node.san}`;
      }

      elements.push(
        <span 
          key={node.id} 
          onClick={() => setCurrentNodeId(node.id)}
          className={`cursor-pointer px-1 rounded hover:bg-stone-250 transition-colors font-bold text-xs ${
            currentNodeId === node.id 
              ? 'bg-blue-600 text-white shadow-sm' 
              : (darkMode === 'dark' ? 'text-slate-300 hover:bg-stone-800' : 'text-slate-750 hover:bg-stone-150')
          }`}
        >
          {label}
        </span>
      );
    }

    if (node.children.length === 0) return elements;

    // First child is main line
    const mainChildId = node.children[0];
    elements.push(...renderMoveTree(mainChildId, false));

    // Other children are variations
    if (node.children.length > 1) {
      for (let i = 1; i < node.children.length; i++) {
        const varChildId = node.children[i];
        elements.push(
          <span key={`var-wrap-${varChildId}`} className="text-slate-400 text-[10px] italic mx-0.5">
            ({' '}
            {renderMoveTree(varChildId, true)}
            {' '})
          </span>
        );
      }
    }

    return elements;
  };

  const themeColors = boardThemes[boardTheme];

  const renderHomeTab = () => {
    const quoteIndex = Math.floor(Math.random() * quotes.length);
    const selectedQuote = quotes[quoteIndex];
    const isDark = darkMode === 'dark';
    return (
      <div className={`flex-1 flex flex-col p-5 overflow-y-auto no-scrollbar justify-between transition-all duration-300 ${
        isDark ? 'bg-stone-950 text-slate-100' : 'bg-[#fafaf9] text-slate-800'
      }`}>
        <div className="space-y-6 pt-4">
          <div className="flex items-center justify-between border-b pb-4 border-stone-850">
            <div className="flex items-center gap-2">
              <SpeerLogo className={`w-7 h-7 ${isDark ? 'text-slate-100' : 'text-slate-800'}`} />
              <span className="font-black text-xl tracking-tight">speerchess</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { setActiveTab('more'); setMoreSubView('settings'); }}
                className={`p-1.5 rounded-xl cursor-pointer transition-colors ${
                  isDark ? 'hover:bg-stone-900 text-slate-300' : 'hover:bg-stone-100 text-slate-600'
                }`}
                title={language === 'ko' ? '설정' : 'Settings'}
              >
                <Settings size={18} />
              </button>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isDark ? 'bg-stone-800 text-slate-350' : 'bg-stone-200 text-slate-650'
              }`}>
                v1.2.0 (Lite)
              </span>
            </div>
          </div>

          <div className={`rounded-3xl p-6 relative overflow-hidden shadow-lg border ${
            isDark 
              ? 'bg-gradient-to-br from-stone-900 to-stone-950 border-stone-850 text-slate-150' 
              : 'bg-gradient-to-br from-white to-stone-50 border-stone-200 text-slate-800'
          }`}>
            <div className="space-y-2 relative z-10">
              <h1 className="text-2xl font-black tracking-tight leading-tight">
                {language === 'ko' ? '체스 대국을 정교하게 분석해보세요' : 'Analyze your chess games with speed'}
              </h1>
              <p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'} max-w-[280px]`}>
                {language === 'ko' ? 'Stockfish 18 Lite 엔진과 Lichess 오프닝 탐색기가 내장된 초고속 로컬 분석 플랫폼.' : 'Built-in Stockfish 18 Lite and Lichess database.'}
              </p>
            </div>
            <div className="absolute right-4 bottom-2 opacity-10 shrink-0">
              <SpeerLogo className="w-28 h-28" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => { setActiveTab('review'); setView('INPUT'); }}
              className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-28 shadow-sm transition-all active:scale-95 cursor-pointer ${
                isDark ? 'bg-stone-900 border-stone-850 hover:bg-stone-850' : 'bg-white border-stone-200 hover:bg-stone-50'
              }`}
            >
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 w-fit">
                <Play size={18} fill="currentColor" />
              </div>
              <div>
                <div className="font-extrabold text-xs">{language === 'ko' ? '기보 리뷰/분석' : 'PGN Review'}</div>
                <div className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{language === 'ko' ? 'PGN 또는 리체스 주소 분석' : 'Analyze game or Lichess URL'}</div>
              </div>
            </button>

            <button 
              onClick={() => { setActiveTab('analyze'); }}
              className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-28 shadow-sm transition-all active:scale-95 cursor-pointer ${
                isDark ? 'bg-stone-900 border-stone-850 hover:bg-stone-850' : 'bg-white border-stone-200 hover:bg-stone-50'
              }`}
            >
              <div className="p-2 rounded-xl bg-green-500/10 text-green-500 w-fit">
                <GitBranch size={18} />
              </div>
              <div>
                <div className="font-extrabold text-xs">{language === 'ko' ? '자유 분석판' : 'Analyze Board'}</div>
                <div className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{language === 'ko' ? '자유롭게 두며 실시간 분석' : 'Play freely and analyze'}</div>
              </div>
            </button>

            <button 
              onClick={() => { setActiveTab('chessle'); setChesslePuzzle(null); }}
              className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-28 shadow-sm transition-all active:scale-95 cursor-pointer ${
                isDark ? 'bg-stone-900 border-stone-850 hover:bg-stone-850' : 'bg-white border-stone-200 hover:bg-stone-50'
              }`}
            >
              <div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-500 w-fit">
                <Award size={18} />
              </div>
              <div>
                <div className="font-extrabold text-xs">{language === 'ko' ? '오늘의 체슬' : 'Chessle'}</div>
                <div className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{language === 'ko' ? '오프닝 5수 맞추기 퀴즈' : 'Opening puzzle game'}</div>
              </div>
            </button>

            <button 
              onClick={() => { setActiveTab('more'); setMoreSubView('clock'); }}
              className={`p-4 rounded-2xl border text-left flex flex-col justify-between h-28 shadow-sm transition-all active:scale-95 cursor-pointer ${
                isDark ? 'bg-stone-900 border-stone-850 hover:bg-stone-850' : 'bg-white border-stone-200 hover:bg-stone-50'
              }`}
            >
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 w-fit">
                <Clock size={18} />
              </div>
              <div>
                <div className="font-extrabold text-xs">{language === 'ko' ? '체스 시계' : 'Chess Clock'}</div>
                <div className={`text-[9px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{language === 'ko' ? '오프라인 대국 타이머' : 'Timer for offline matches'}</div>
              </div>
            </button>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border border-dashed text-center italic text-[11px] font-medium leading-relaxed my-4 ${
          isDark ? 'bg-stone-950 border-stone-800 text-slate-400' : 'bg-stone-50 border-stone-200 text-slate-600'
        }`}>
          "{selectedQuote}"
        </div>
      </div>
    );
  };

  const renderChessClock = () => {
    const isDark = darkMode === 'dark';
    
    const presets = [
      { name: '1+0 (Bullet)', base: 60, inc: 0 },
      { name: '3+2 (Blitz)', base: 180, inc: 2 },
      { name: '5+0 (Blitz)', base: 300, inc: 0 },
      { name: '10+5 (Rapid)', base: 600, inc: 5 },
    ];
    
    const formatClockTime = (timeInSeconds: number) => {
      const minutes = Math.floor(timeInSeconds / 60);
      const seconds = Math.floor(timeInSeconds % 60);
      const tenths = Math.round((timeInSeconds % 1) * 10);
      
      const minStr = String(minutes).padStart(2, '0');
      const secStr = String(seconds).padStart(2, '0');
      
      if (timeInSeconds < 10 && timeInSeconds > 0) {
        return `${minutes}:${secStr}.${tenths}`;
      }
      return `${minStr}:${secStr}`;
    };
    
    const handleClockClick = (turn: 'w' | 'b') => {
      if (!clockActive) {
        setClockActive(true);
        setClockTurn(turn === 'w' ? 'b' : 'w');
        return;
      }
      if (clockTurn !== turn) return;
      
      if (turn === 'w') {
        setClockWhiteTime(prev => prev + clockIncrement);
        setClockTurn('b');
      } else {
        setClockBlackTime(prev => prev + clockIncrement);
        setClockTurn('w');
      }
    };
    
    const isWhiteTurn = clockTurn === 'w';
    const isBlackTurn = clockTurn === 'b';
    
    if (clockTurn === null) {
      return (
        <div className={`flex-1 flex flex-col p-5 overflow-y-auto justify-between ${
          isDark ? 'bg-stone-950 text-slate-100' : 'bg-[#fafaf9] text-slate-800'
        }`}>
          <div className="space-y-6 pt-4">
            <div className="flex items-center gap-2 border-b pb-4 border-stone-850">
              <button onClick={() => setMoreSubView('menu')} className="p-1 hover:bg-stone-800 rounded-full text-slate-500">
                <ChevronLeft size={20} />
              </button>
              <h3 className="font-black text-sm uppercase tracking-widest">{language === 'ko' ? '체스 시계 설정' : 'Chess Clock Setup'}</h3>
            </div>
            
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">{language === 'ko' ? '프리셋 선택' : 'Choose Preset'}</label>
              <div className="grid grid-cols-2 gap-3">
                {presets.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setClockBaseTime(p.base);
                      setClockIncrement(p.inc);
                      setClockWhiteTime(p.base);
                      setClockBlackTime(p.base);
                    }}
                    className={`p-3 rounded-xl border text-center font-extrabold text-xs transition-all active:scale-95 cursor-pointer ${
                      clockBaseTime === p.base && clockIncrement === p.inc
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : (isDark ? 'bg-stone-900 border-stone-850 hover:bg-stone-850 text-slate-350' : 'bg-white border-stone-250 hover:bg-stone-50 text-slate-700')
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              
              <div className="space-y-3 pt-3 border-t border-stone-805">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">{language === 'ko' ? '직접 입력' : 'Custom Setting'}</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-500 block">{language === 'ko' ? '기본 시간 (분)' : 'Base Time (min)'}</span>
                    <input 
                      type="number"
                      min={1}
                      max={180}
                      value={Math.round(clockBaseTime / 60)}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val > 0) {
                          setClockBaseTime(val * 60);
                          setClockWhiteTime(val * 60);
                          setClockBlackTime(val * 60);
                        }
                      }}
                      className={`w-full p-2.5 rounded-xl border font-bold text-center text-xs ${
                        isDark ? 'bg-stone-900 border-stone-800 text-white' : 'bg-white border-stone-200 text-slate-800'
                      }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-500 block">{language === 'ko' ? '추가 시간 (초)' : 'Increment (sec)'}</span>
                    <input 
                      type="number"
                      min={0}
                      max={60}
                      value={clockIncrement}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 0) {
                          setClockIncrement(val);
                        }
                      }}
                      className={`w-full p-2.5 rounded-xl border font-bold text-center text-xs ${
                        isDark ? 'bg-stone-900 border-stone-800 text-white' : 'bg-white border-stone-200 text-slate-800'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => {
              setClockWhiteTime(clockBaseTime);
              setClockBlackTime(clockBaseTime);
              setClockTurn('w');
              setClockActive(false);
            }}
            className="w-full bg-slate-800 hover:bg-slate-750 text-white font-black py-4 rounded-2xl text-sm transition-all shadow-md active:scale-95 cursor-pointer mt-8"
          >
            {language === 'ko' ? '시작하기' : 'Start'}
          </button>
        </div>
      );
    }
    
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-stone-950 text-white relative h-full">
        <button
          onClick={() => handleClockClick('b')}
          className={`flex-1 w-full flex items-center justify-center transition-all cursor-pointer ${
            isBlackTurn 
              ? 'bg-blue-650 text-white shadow-inner animate-pulse' 
              : 'bg-stone-900 text-stone-400'
          }`}
          style={{ transform: 'rotate(180deg)' }}
        >
          <div className="text-5xl font-mono font-black tracking-widest">{formatClockTime(clockBlackTime)}</div>
        </button>
        
        <div className="h-14 shrink-0 bg-stone-950 border-y border-stone-800 flex items-center justify-around px-4 z-10">
          <button 
            onClick={() => setClockActive(prev => !prev)}
            className="px-4 py-1.5 rounded-lg bg-stone-900 border border-stone-850 hover:bg-stone-800 font-bold text-xs cursor-pointer"
          >
            {clockActive ? (language === 'ko' ? '일시정지' : 'Pause') : (language === 'ko' ? '재개' : 'Resume')}
          </button>
          
          <button 
            onClick={() => {
              setClockTurn(null);
              setClockActive(false);
            }}
            className="px-4 py-1.5 rounded-lg bg-red-900/40 border border-red-800/40 hover:bg-red-900/60 font-bold text-xs text-red-300 cursor-pointer"
          >
            {language === 'ko' ? '재설정' : 'Reset'}
          </button>
        </div>
        
        <button
          onClick={() => handleClockClick('w')}
          className={`flex-1 w-full flex items-center justify-center transition-all cursor-pointer ${
            isWhiteTurn 
              ? 'bg-blue-650 text-white shadow-inner animate-pulse' 
              : 'bg-stone-900 text-stone-400'
          }`}
        >
          <div className="text-5xl font-mono font-black tracking-widest">{formatClockTime(clockWhiteTime)}</div>
        </button>
      </div>
    );
  };

  const renderMoreTab = () => {
    const isDark = darkMode === 'dark';
    
    const renderSubHeader = (title: string) => (
      <div className="flex items-center gap-2 border-b pb-4 border-stone-850 shrink-0">
        <button onClick={() => setMoreSubView('menu')} className={`p-1 rounded-full ${isDark ? 'hover:bg-stone-850 text-slate-400' : 'hover:bg-stone-150 text-slate-500'}`}>
          <ChevronLeft size={20} />
        </button>
        <h3 className="font-black text-sm uppercase tracking-widest">{title}</h3>
      </div>
    );

    if (moreSubView === 'menu') {
      return (
        <div className={`flex-1 flex flex-col p-5 overflow-y-auto no-scrollbar justify-between ${
          isDark ? 'bg-stone-950 text-slate-100' : 'bg-[#fafaf9] text-slate-800'
        }`}>
          <div className="space-y-6 pt-4">
            <div className="flex items-center gap-2 border-b pb-4 border-stone-850">
              <SpeerLogo className={`w-6 h-6 ${isDark ? 'text-slate-100' : 'text-slate-800'}`} />
              <h3 className="font-black text-sm uppercase tracking-widest">{language === 'ko' ? '더보기 및 지원' : 'More & Support'}</h3>
            </div>
            
            {/* Category: Features */}
            <div className="space-y-2">
              <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {language === 'ko' ? '주요 기능' : 'Features'}
              </span>
              <div className="space-y-1">
                <button 
                  onClick={() => setMoreSubView('brilliant')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">✨ {language === 'ko' ? '탁월 저장소' : 'Brilliant Repository'}</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => setMoreSubView('blunder')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">💀 {language === 'ko' ? '블런더 저장소' : 'Blunder Repository'}</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => setMoreSubView('clock')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">⏱️ {language === 'ko' ? '체스 시계' : 'Chess Clock'}</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => setMoreSubView('ocr')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">📷 {language === 'ko' ? 'Chess OCR (기보 판독)' : 'Chess OCR'}</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => setMoreSubView('settings')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">⚙️ {language === 'ko' ? '설정 페이지' : 'Settings'}</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Category: Support */}
            <div className="space-y-2 pt-2">
              <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {language === 'ko' ? '고객 지원' : 'Support'}
              </span>
              <div className="space-y-1">
                <button 
                  onClick={() => setMoreSubView('faq')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">❓ {language === 'ko' ? '자주 묻는 질문 (FAQ)' : 'FAQ'}</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => setMoreSubView('proposal')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">💡 {language === 'ko' ? '추가 기능 제안' : 'Suggest Features'}</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => setMoreSubView('terms')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">📄 {language === 'ko' ? '서비스 이용 약관' : 'Terms of Service'}</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => setMoreSubView('privacy')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">🔒 {language === 'ko' ? '개인정보 처리방침' : 'Privacy Policy'}</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => setMoreSubView('credits')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">💳 {language === 'ko' ? '오픈소스 크레딧' : 'Credits'}</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Category: Speerchess */}
            <div className="space-y-2 pt-2">
              <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                speerchess
              </span>
              <div className="space-y-1">
                <button 
                  onClick={() => setMoreSubView('blog')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">📰 {language === 'ko' ? '블로그 및 업데이트' : 'Blog & Updates'}</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => setMoreSubView('about')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">ℹ️ {language === 'ko' ? '서비스 소개 (About)' : 'About Speerchess'}</span>
                  <ChevronRight size={14} />
                </button>
                <button 
                  onClick={() => setMoreSubView('feedback')}
                  className={`w-full p-3 rounded-xl flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                    isDark ? 'bg-stone-900 hover:bg-stone-850 text-slate-200 shadow-inner' : 'bg-white hover:bg-stone-50 border border-stone-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">✉️ {language === 'ko' ? '문의 및 피드백' : 'Contact & Feedback'}</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
          
          <div className="text-center text-[10px] text-slate-500 font-bold py-4">
            speerchess &copy; 2026. All rights reserved.
          </div>
        </div>
      );
    }

    return (
      <div className={`flex-1 flex flex-col p-5 overflow-y-auto no-scrollbar ${
        isDark ? 'bg-stone-950 text-slate-100' : 'bg-[#fafaf9] text-slate-800'
      }`}>
        {/* Settings View */}
        {moreSubView === 'settings' && (
          <div className="space-y-5">
            {renderSubHeader(language === 'ko' ? '설정 페이지' : 'Settings')}
            
            {/* 1. Language Setting */}
            <div className="space-y-2">
              <span className={`text-[10px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{language === 'ko' ? '1. 언어 설정' : '1. Language Settings'}</span>
              <div className={`grid grid-cols-2 gap-2 p-1 rounded-xl border ${isDark ? 'bg-stone-900/40 border-stone-850' : 'bg-stone-100 border-stone-250'}`}>
                <button onClick={() => setLanguage('ko')} className={`py-2 rounded-lg font-bold text-xs cursor-pointer ${language === 'ko' ? 'bg-blue-600 text-white shadow-sm' : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>한국어</button>
                <button onClick={() => setLanguage('en')} className={`py-2 rounded-lg font-bold text-xs cursor-pointer ${language === 'en' ? 'bg-blue-600 text-white shadow-sm' : (isDark ? 'text-slate-400' : 'text-slate-600')}`}>English</button>
              </div>
            </div>

            {/* 2. Dark/Light Mode */}
            <div className="space-y-2">
              <span className={`text-[10px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{language === 'ko' ? '2. 사이트 배경 테마' : '2. Background Theme'}</span>
              <div className={`grid grid-cols-2 gap-2 p-1 rounded-xl border ${isDark ? 'bg-stone-900/40 border-stone-850' : 'bg-stone-100 border-stone-250'}`}>
                <button onClick={() => setDarkMode('light')} className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer ${darkMode === 'light' ? 'bg-blue-600 text-white shadow-sm' : (isDark ? 'text-slate-400' : 'text-slate-600')}`}><Sun size={12} /> {language === 'ko' ? '라이트' : 'Light'}</button>
                <button onClick={() => setDarkMode('dark')} className={`py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer ${darkMode === 'dark' ? 'bg-blue-600 text-white shadow-sm' : (isDark ? 'text-slate-400' : 'text-slate-600')}`}><Moon size={12} /> {language === 'ko' ? '다크' : 'Dark'}</button>
              </div>
            </div>

            {/* 3. Board & Piece Custom Theme */}
            <div className="space-y-2.5">
              <span className={`text-[10px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{language === 'ko' ? '3. 보드 및 기물 테마' : '3. Board & Piece Theme'}</span>
              <div className={`space-y-3 p-4 rounded-2xl border text-xs ${isDark ? 'bg-stone-900/40 border-stone-850' : 'bg-stone-100 border-stone-250'}`}>
                {/* Board Theme */}
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 block">{language === 'ko' ? '체스 보드 색상' : 'Board Color'}</span>
                  <div className="grid grid-cols-3 gap-1">
                    {Object.keys(boardThemes).map((key) => (
                      <button 
                        key={key}
                        onClick={() => setBoardTheme(key as any)}
                        className={`py-1.5 rounded-lg font-extrabold text-[10px] cursor-pointer ${boardTheme === key ? 'bg-blue-600 text-white shadow-sm' : (isDark ? 'bg-stone-800 text-slate-350 hover:bg-stone-750' : 'bg-stone-200 text-slate-700 hover:bg-stone-250')}`}
                      >
                        {boardThemes[key as keyof typeof boardThemes].name.replace('스피어 ', '')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Piece Set */}
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 block">{language === 'ko' ? '체스 기물 세트' : 'Piece Set'}</span>
                  <div className="grid grid-cols-3 gap-1">
                    <button onClick={() => setPieceSet('cburnett')} className={`py-1.5 rounded-lg font-extrabold text-[10px] cursor-pointer ${pieceSet === 'cburnett' ? 'bg-blue-600 text-white shadow-sm' : (isDark ? 'bg-stone-800 text-slate-350 hover:bg-stone-750' : 'bg-stone-200 text-slate-700 hover:bg-stone-250')}`}>{language === 'ko' ? '기본' : 'Standard'}</button>
                    <button onClick={() => setPieceSet('disguised')} className={`py-1.5 rounded-lg font-extrabold text-[10px] cursor-pointer ${pieceSet === 'disguised' ? 'bg-blue-600 text-white shadow-sm' : (isDark ? 'bg-stone-800 text-slate-350 hover:bg-stone-750' : 'bg-stone-200 text-slate-700 hover:bg-stone-250')}`}>{language === 'ko' ? '가면기물' : 'Disguised'}</button>
                    <button onClick={() => setPieceSet('blindfold')} className={`py-1.5 rounded-lg font-extrabold text-[10px] cursor-pointer ${pieceSet === 'blindfold' ? 'bg-blue-600 text-white shadow-sm' : (isDark ? 'bg-stone-800 text-slate-350 hover:bg-stone-750' : 'bg-stone-200 text-slate-700 hover:bg-stone-250')}`}>{language === 'ko' ? '눈가림' : 'Blindfold'}</button>
                  </div>
                </div>

                {/* Arrow Color */}
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-500 block">{language === 'ko' ? '추천수 화살표 색상' : 'Arrow Color'}</span>
                  <div className="flex gap-2.5">
                    {['#10b981', '#ef4444', '#3b82f6', '#eab308'].map(color => (
                      <button 
                        key={color}
                        onClick={() => setArrowColor(color)}
                        className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                          arrowColor === color ? 'border-white scale-110 shadow-md' : 'border-stone-800 hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Coordinates toggle */}
                <div className="flex justify-between items-center pt-1.5">
                  <span className={`text-[10px] font-bold ${isDark ? 'text-slate-350' : 'text-slate-700'}`}>{language === 'ko' ? '보드 외곽 좌표 표시 (a-h, 1-8)' : 'Show Board Coordinates'}</span>
                  <button
                    onClick={() => setShowCoordinates(prev => !prev)}
                    className={`w-8 h-4 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                      showCoordinates ? 'bg-blue-600 justify-end' : 'bg-stone-800 justify-start'
                    }`}
                  >
                    <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm" />
                  </button>
                </div>
              </div>
            </div>

            {/* 4. Chessboard settings */}
            <div className="space-y-2">
              <span className={`text-[10px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{language === 'ko' ? '4. 체스판 세부 설정' : '4. Chessboard Settings'}</span>
              <div className={`p-4 rounded-2xl border text-xs space-y-3 ${isDark ? 'bg-stone-900/40 border-stone-850' : 'bg-stone-100 border-stone-250'}`}>
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] font-bold ${isDark ? 'text-slate-350' : 'text-slate-700'}`}>{language === 'ko' ? '기물 착지점 표시 (이동 가능한 칸)' : 'Show Move Destinations'}</span>
                  <button onClick={() => setShowMoveDestinations(prev => !prev)} className={`w-8 h-4 rounded-full p-0.5 flex items-center cursor-pointer ${showMoveDestinations ? 'bg-blue-600 justify-end' : 'bg-stone-800 justify-start'}`}><div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm" /></button>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] font-bold ${isDark ? 'text-slate-350' : 'text-slate-700'}`}>{language === 'ko' ? '보드 하이라이트 (마지막 수 경로)' : 'Show Board Highlights'}</span>
                  <button onClick={() => setShowBoardHighlights(prev => !prev)} className={`w-8 h-4 rounded-full p-0.5 flex items-center cursor-pointer ${showBoardHighlights ? 'bg-blue-600 justify-end' : 'bg-stone-800 justify-start'}`}><div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm" /></button>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] font-bold ${isDark ? 'text-slate-350' : 'text-slate-700'}`}>{language === 'ko' ? '기물 가치 점수차 표시 (+/-)' : 'Show Material Difference'}</span>
                  <button onClick={() => setShowMaterialDifference(prev => !prev)} className={`w-8 h-4 rounded-full p-0.5 flex items-center cursor-pointer ${showMaterialDifference ? 'bg-blue-600 justify-end' : 'bg-stone-800 justify-start'}`}><div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm" /></button>
                </div>
              </div>
            </div>

            {/* 5. Engine settings */}
            <div className="space-y-2">
              <span className={`text-[10px] font-black uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{language === 'ko' ? '5. 분석 엔진 설정' : '5. Engine Settings'}</span>
              <div className={`p-4 rounded-2xl border text-xs space-y-3 ${isDark ? 'bg-stone-900/40 border-stone-850' : 'bg-stone-100 border-stone-250'}`}>
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] font-bold ${isDark ? 'text-slate-350' : 'text-slate-700'}`}>{language === 'ko' ? '엔진 종류' : 'Engine Type'}</span>
                  <span className="font-extrabold text-blue-500 text-[10px]">Stockfish 18 Lite</span>
                </div>
                <div className="space-y-1 pt-1.5">
                  <div className="flex justify-between text-[9px] font-bold text-slate-500">
                    <span>{language === 'ko' ? '엔진 분석 깊이 (Depth)' : 'Max Calculation Depth'}</span>
                    <span className={`font-extrabold ${isDark ? 'text-white' : 'text-slate-800'}`}>{depth} Ply</span>
                  </div>
                  <input 
                    type="range"
                    min={12}
                    max={20}
                    step={2}
                    value={depth}
                    onChange={(e) => setDepth(parseInt(e.target.value, 10) as any)}
                    className="w-full h-1 bg-stone-850 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OCR View */}
        {moreSubView === 'ocr' && (
          <div className="space-y-4">
            {renderSubHeader('Chess OCR')}

            {/* Scan Mode & URL Settings */}
            <div className={`p-3.5 rounded-2xl border space-y-3 text-xs ${isDark ? 'bg-stone-900/40 border-stone-850' : 'bg-stone-100 border-stone-250'}`}>
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-400 text-[10px] uppercase tracking-wider">
                  {language === 'ko' ? '스캐너 방식 설정' : 'Scanner Mode'}
                </span>
                <div className={`flex gap-1 p-0.5 rounded-lg border ${isDark ? 'bg-stone-950/40 border-stone-800' : 'bg-stone-50 border-stone-200'}`}>
                  <button 
                    onClick={() => {
                      setOcrScanMode('local');
                      localStorage.setItem('speerchess_ocr_scan_mode', 'local');
                    }}
                    className={`px-2.5 py-0.5 rounded text-[9px] font-black cursor-pointer transition-all ${
                      ocrScanMode === 'local' 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-slate-400'
                    }`}
                  >
                    Local (TFJS)
                  </button>
                  <button 
                    onClick={() => {
                      setOcrScanMode('cloud');
                      localStorage.setItem('speerchess_ocr_scan_mode', 'cloud');
                    }}
                    className={`px-2.5 py-0.5 rounded text-[9px] font-black cursor-pointer transition-all ${
                      ocrScanMode === 'cloud' 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-slate-400'
                    }`}
                  >
                    Cloud (YOLO)
                  </button>
                </div>
              </div>

              {ocrScanMode === 'cloud' && (
                <div className="space-y-1.5 pt-1.5 border-t border-stone-800/20">
                  <div className="flex justify-between text-[9px] font-bold text-slate-500">
                    <span>Hugging Face Space API URL</span>
                  </div>
                  <input 
                    type="text" 
                    placeholder="https://user-chess-scan.hf.space"
                    value={ocrCloudUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOcrCloudUrl(val);
                      localStorage.setItem('speerchess_ocr_cloud_url', val);
                    }}
                    className="w-full bg-stone-900/60 border border-stone-850 px-3 py-1.5 rounded-xl font-mono text-[9px] text-slate-350 outline-none focus:border-blue-500"
                  />
                  <span className="text-[8px] text-slate-500 font-semibold block leading-normal">
                    {language === 'ko' 
                      ? '💡 생성한 Hugging Face Space의 Direct URL 주소를 입력하세요. (끝에 /predict는 자동으로 붙습니다)' 
                      : '💡 Enter the Direct URL of your Hugging Face Space. (/predict will be appended automatically)'}
                  </span>
                </div>
              )}
            </div>
            
            {/* Loading Overlay */}
            {ocrModelLoading && (
              <div className="flex flex-col items-center justify-center p-12 border border-stone-850 bg-stone-900/40 rounded-2xl gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <div className="text-xs font-bold text-slate-350">
                  {language === 'ko' ? '인공지능 분석 모델 로딩 중...' : 'Loading AI Scanner Model...'}
                </div>
                <div className="text-[10px] text-slate-500">
                  {language === 'ko' ? '첫 실행 시 약 5~10초 정도 소요될 수 있습니다.' : 'May take 5-10 seconds on first run.'}
                </div>
              </div>
            )}

            {!ocrModelLoading && (
              <div className="space-y-4">
                {/* Error Banner */}
                {ocrError && (
                  <div className="p-3 bg-red-950/60 border border-red-900/50 rounded-xl text-[10px] font-bold text-red-400">
                    ⚠️ {ocrError}
                  </div>
                )}

                {/* Upload Section (If no image uploaded yet) */}
                {!ocrImageSrc ? (
                  <div 
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-blue-950/20', 'border-blue-500/50'); }}
                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('bg-blue-950/20', 'border-blue-500/50'); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('bg-blue-950/20', 'border-blue-500/50');
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleOcrFile(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => document.getElementById('ocr-file-input')?.click()}
                    className="border-2 border-dashed border-stone-800 hover:border-blue-500/40 rounded-2xl p-10 text-center space-y-4 my-2 bg-stone-900/10 cursor-pointer transition-all hover:bg-stone-900/20"
                  >
                    <div className="text-4xl text-blue-500">📸</div>
                    <div className="space-y-1">
                      <span className="font-extrabold text-xs block text-slate-300">
                        {language === 'ko' ? '체스판 이미지 업로드' : 'Upload Chessboard Image'}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {language === 'ko' ? '여기에 이미지를 드래그하거나 클릭하여 선택하세요.' : 'Drag & drop image here or click to browse'}
                      </span>
                      <span className="text-[9px] text-blue-500 font-semibold block pt-1">
                        {language === 'ko' ? '💡 팁: 클립보드 복사(Ctrl+V) 붙여넣기도 바로 작동합니다!' : '💡 Tip: Clipboard paste (Ctrl+V) is also supported!'}
                      </span>
                    </div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      id="ocr-file-input" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleOcrFile(e.target.files[0]);
                        }
                      }}
                    />
                  </div>
                ) : (
                  // Crop Overlay View
                  <div className="space-y-4">
                    <div className="relative mx-auto rounded-xl overflow-hidden border border-stone-800 bg-stone-950 flex justify-center items-center max-w-full">
                      {/* Visual canvas showing loaded image scaled to 512px internal */}
                      <canvas 
                        ref={ocrCanvasRef} 
                        id="ocrImageCanvas" 
                        className="max-w-full h-auto block select-none"
                      />

                      {/* Hidden canvas for TFJS input processing */}
                      <canvas ref={ocrResultCanvasRef} id="ocrResultCanvas" className="hidden" />

                      {/* Draggable Crop Overlay */}
                      <div 
                        ref={ocrCropOverlayRef} 
                        id="ocrCropOverlay" 
                        onMouseDown={handleOcrOverlayMouseDown}
                        className="absolute border-2 border-dashed border-blue-500 bg-blue-500/15 cursor-move"
                        style={{ display: 'none' }}
                      >
                        <div className="absolute w-3 h-3 bg-blue-500 rounded-full border border-white -top-1.5 -left-1.5 cursor-nwse-resize ocr-crop-handle tl" />
                        <div className="absolute w-3 h-3 bg-blue-500 rounded-full border border-white -top-1.5 -right-1.5 cursor-nesw-resize ocr-crop-handle tr" />
                        <div className="absolute w-3 h-3 bg-blue-500 rounded-full border border-white -bottom-1.5 -left-1.5 cursor-nesw-resize ocr-crop-handle bl" />
                        <div className="absolute w-3 h-3 bg-blue-500 rounded-full border border-white -bottom-1.5 -right-1.5 cursor-nwse-resize ocr-crop-handle br" />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setOcrImageSrc(null);
                          setOcrBoardState(Array(8).fill(null).map(() => Array(8).fill('1')));
                        }}
                        className="flex-1 bg-stone-850 hover:bg-stone-800 text-slate-350 font-bold py-2 rounded-xl text-[10px] cursor-pointer"
                      >
                        {language === 'ko' ? '다른 이미지 선택' : 'Change Image'}
                      </button>
                      <button 
                        onClick={() => setOcrIsFlipped(!ocrIsFlipped)}
                        className="bg-stone-850 hover:bg-stone-800 text-slate-350 font-bold px-3 py-2 rounded-xl text-[10px] cursor-pointer"
                        title={language === 'ko' ? '보드 시각적 뒤집기' : 'Flip Board Visually'}
                      >
                        🔄
                      </button>
                      <button 
                        onClick={() => {
                          // Rotate pieces 180 deg
                          const newBoard = Array(8).fill(null).map(() => Array(8).fill('1'));
                          for (let r = 0; r < 8; r++) {
                            for (let f = 0; f < 8; f++) {
                              newBoard[7 - r][7 - f] = ocrBoardState[r][f];
                            }
                          }
                          setOcrBoardState(newBoard);
                        }}
                        className="bg-stone-850 hover:bg-stone-800 text-slate-355 font-bold px-3 py-2 rounded-xl text-[10px] cursor-pointer"
                        title={language === 'ko' ? '기물 180도 회전' : 'Rotate Board 180°'}
                      >
                        🔃
                      </button>
                    </div>
                  </div>
                )}

                {/* Editor & Results Board */}
                {ocrImageSrc && (
                  <div className="space-y-4 pt-2 border-t border-stone-850">
                    <div className="text-[10px] font-bold text-slate-400">
                      {language === 'ko' ? '2. 인식된 기물 배치 편집기' : '2. Scanned Board Editor'}
                    </div>

                    {ocrPredicting && (
                      <div className="flex items-center justify-center gap-2 py-4 italic text-[10px] text-blue-400 font-bold">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {language === 'ko' ? '기물 배치 분석 중...' : 'Predicting board layout...'}
                      </div>
                    )}

                    {/* Premium Styled 8x8 Board */}
                    <div className="aspect-square w-full max-w-[320px] mx-auto rounded-xl overflow-hidden shadow-lg border border-stone-800 relative bg-stone-900 select-none">
                      <div className="grid grid-cols-8 grid-rows-8 h-full w-full">
                        {Array(8).fill(null).map((_, rIdx) => {
                          const rank = ocrIsFlipped ? 7 - rIdx : rIdx;
                          return Array(8).fill(null).map((_, fIdx) => {
                            const file = ocrIsFlipped ? 7 - fIdx : fIdx;
                            const isDarkSq = (rank + file) % 2 === 1;
                            const piece = ocrBoardState[rank][file];
                            const isSelected = ocrActiveEditSquare?.rank === rank && ocrActiveEditSquare?.file === file;

                            return (
                              <div 
                                key={`${rank}-${file}`}
                                onClick={() => {
                                  setOcrActiveEditSquare({ rank, file });
                                  setOcrShowSelector(true);
                                }}
                                className={`relative aspect-square flex items-center justify-center cursor-pointer transition-colors duration-150 ${
                                  isDarkSq ? 'bg-[#739552]' : 'bg-[#ececd7]'
                                } ${isSelected ? 'ring-4 ring-blue-500 ring-inset z-10' : 'hover:brightness-95'}`}
                              >
                                {piece !== '1' && (
                                  <img 
                                    src={`https://lichess1.org/assets/piece/cburnett/${
                                      (piece === piece.toUpperCase() ? 'w' : 'b') + piece.toUpperCase()
                                    }.svg`}
                                    alt={piece}
                                    className="w-[85%] h-[85%] pointer-events-none select-none transition-transform duration-200"
                                  />
                                )}
                                
                                {/* Coords labels */}
                                {fIdx === 0 && (
                                  <span className={`absolute top-0.5 left-0.5 text-[8px] font-bold ${
                                    isDarkSq ? 'text-[#ececd7]' : 'text-[#739552]'
                                  }`}>
                                    {8 - rank}
                                  </span>
                                )}
                                {rIdx === 7 && (
                                  <span className={`absolute bottom-0.5 right-0.5 text-[8px] font-bold ${
                                    isDarkSq ? 'text-[#ececd7]' : 'text-[#739552]'
                                  }`}>
                                    {String.fromCharCode(97 + file)}
                                  </span>
                                )}
                              </div>
                            );
                          });
                        })}
                      </div>
                    </div>

                    {/* FEN text box & copy */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-bold text-slate-500 block">
                        {language === 'ko' ? '인식된 FEN 코드' : 'Scanned FEN String'}
                      </span>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          readOnly 
                          value={getOcrBoardFEN()}
                          className="flex-1 bg-stone-900 text-slate-350 border border-stone-850 px-3 py-1.5 rounded-xl font-mono text-[9px] outline-none"
                        />
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(getOcrBoardFEN());
                            alert(language === 'ko' ? "FEN 복사 완료!" : "FEN Copied!");
                          }}
                          className="bg-stone-850 hover:bg-stone-800 text-slate-300 font-bold px-3.5 py-1.5 rounded-xl text-[10px] cursor-pointer shrink-0"
                        >
                          {language === 'ko' ? '복사' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    {/* Action Button: Open in analyze board */}
                    <button 
                      onClick={() => {
                        const fen = getOcrBoardFEN();
                        const initialNode = {
                          id: 'root',
                          san: '',
                          from: '',
                          to: '',
                          fen: fen,
                          parentId: null,
                          children: []
                        };
                        setMoveTree({ 'root': initialNode });
                        setCurrentNodeId('root');
                        setActiveTab('analyze');
                        alert(language === 'ko' ? "분석판으로 포지션을 전송했습니다!" : "Position loaded to analysis board!");
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2.5 rounded-xl text-xs cursor-pointer shadow-lg shadow-blue-500/10 flex items-center justify-center gap-1.5"
                    >
                      🚀 {language === 'ko' ? '자유 분석판에서 열기' : 'Open in Analyze Board'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Piece Selector Popup */}
            {ocrShowSelector && ocrActiveEditSquare && (
              <div 
                className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
                onClick={() => {
                  setOcrShowSelector(false);
                  setOcrActiveEditSquare(null);
                }}
              >
                <div 
                  className="bg-stone-900 border border-stone-850 rounded-2xl p-5 max-w-[280px] w-full text-center space-y-4 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-[10px] font-bold text-slate-400">
                    {language === 'ko' ? '기물 변경 선택' : 'Select Piece'}
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {['P', 'R', 'N', 'B', 'Q', 'K', 'p', 'r', 'n', 'b', 'q', 'k'].map((p) => {
                      const isWhite = p === p.toUpperCase();
                      const code = (isWhite ? 'w' : 'b') + p.toUpperCase();
                      return (
                        <button 
                          key={p}
                          onClick={() => {
                            const newBoard = [...ocrBoardState];
                            newBoard[ocrActiveEditSquare.rank][ocrActiveEditSquare.file] = p;
                            setOcrBoardState(newBoard);
                            setOcrShowSelector(false);
                            setOcrActiveEditSquare(null);
                          }}
                          className="aspect-square bg-stone-850 hover:bg-stone-800 rounded-lg p-1.5 flex items-center justify-center border border-stone-800/50 cursor-pointer"
                        >
                          <img 
                            src={`https://lichess1.org/assets/piece/cburnett/${code}.svg`}
                            alt={p}
                            className="w-full h-full select-none pointer-events-none"
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const newBoard = [...ocrBoardState];
                        newBoard[ocrActiveEditSquare.rank][ocrActiveEditSquare.file] = '1';
                        setOcrBoardState(newBoard);
                        setOcrShowSelector(false);
                        setOcrActiveEditSquare(null);
                      }}
                      className="flex-1 bg-red-950/60 hover:bg-red-900/60 text-red-400 border border-red-900/40 font-bold py-1.5 rounded-xl text-[10px] cursor-pointer"
                    >
                      {language === 'ko' ? '빈 칸으로 비우기' : 'Clear Square'}
                    </button>
                    <button 
                      onClick={() => {
                        setOcrShowSelector(false);
                        setOcrActiveEditSquare(null);
                      }}
                      className="bg-stone-800 hover:bg-stone-750 text-slate-300 font-bold px-4 py-1.5 rounded-xl text-[10px] cursor-pointer"
                    >
                      {language === 'ko' ? '취소' : 'Cancel'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FAQ View */}
        {moreSubView === 'faq' && (
          <div className="space-y-4">
            {renderSubHeader('FAQ')}
            <div className="space-y-2 py-4">
              {[
                { q: 'speerchess는 어떤 서비스인가요?', a: '웹 브라우저에서 서버 없이 초고속 실시간 체스 기보 분석과 GIF 복기본 내보내기, 단축 주소 공유 서비스를 제공하는 익명 체스 도구입니다.' },
                { q: '자유 분석판은 어떻게 작동하나요?', a: '백그라운드에서 구동되는 Stockfish 18 Lite WASM 워커가 실시간 최선의 수를 화살표와 수순으로 평가지와 함께 즉시 연산해줍니다.' },
                { q: '체슬(Chessle)의 힌트는 무엇인가요?', a: '맞추기 어려운 오프닝 수순을 위해 전체 기보가 끝난 최종 국면(FEN) 및 7번째 수(13, 14반수)를 힌트로 보여줍니다.' }
              ].map((item, idx) => (
                <div key={idx} className={`p-3 border rounded-xl space-y-1.5 ${isDark ? 'bg-stone-900/40 border-stone-850' : 'bg-white border-stone-200'}`}>
                  <span className="font-extrabold text-xs text-blue-500 block">Q. {item.q}</span>
                  <span className={`text-[11px] leading-relaxed font-medium block ${isDark ? 'text-slate-350' : 'text-slate-600'}`}>A. {item.a}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proposal View */}
        {moreSubView === 'proposal' && (
          <div className="space-y-4">
            {renderSubHeader(language === 'ko' ? '기능 제안 피드' : 'Feature Proposal Feed')}
            
            {/* Write Proposal Form */}
            <div className={`p-4 rounded-2xl border text-xs space-y-3 ${
              isDark ? 'bg-stone-900/30 border-stone-850' : 'bg-stone-100 border-stone-250'
            }`}>
              <span className={`font-black text-[10px] uppercase tracking-wider block ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {language === 'ko' ? '새 기능 제안하기' : 'Suggest New Feature'}
              </span>
              <div className="space-y-1">
                <input 
                  type="text"
                  placeholder={language === 'ko' ? '제안 제목 (예: 분석 내역 로컬 캐싱)' : 'Title...'}
                  value={newProposalTitle}
                  onChange={(e) => setNewProposalTitle(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-bold ${
                    isDark ? 'bg-stone-950 border-stone-800 text-white' : 'bg-white border-stone-250 text-slate-800'
                  }`}
                />
              </div>
              <div className="space-y-1">
                <textarea 
                  rows={2}
                  placeholder={language === 'ko' ? '제안할 상세 내용을 입력해주세요.' : 'Description...'}
                  value={newProposalDesc}
                  onChange={(e) => setNewProposalDesc(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-bold leading-relaxed ${
                    isDark ? 'bg-stone-950 border-stone-800 text-white' : 'bg-white border-stone-250 text-slate-800'
                  }`}
                />
              </div>
              <button 
                onClick={() => {
                  const t = newProposalTitle.trim();
                  const d = newProposalDesc.trim();
                  if (!t || !d) {
                    alert(language === 'ko' ? '제목과 설명을 모두 입력해주세요.' : 'Please enter title and description.');
                    return;
                  }
                  const updated = [...proposals, { title: t, desc: d, votes: 1 }];
                  saveProposals(updated);
                  setNewProposalTitle('');
                  setNewProposalDesc('');
                  alert(language === 'ko' ? '성공적으로 제안되었습니다!' : 'Proposal added!');
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-2.5 rounded-xl text-xs shadow-md transition-all active:scale-95 cursor-pointer"
              >
                {language === 'ko' ? '제안 등록' : 'Submit Proposal'}
              </button>
            </div>

            <div className="space-y-3 py-2">
              {proposals.map((p, idx) => (
                <div key={idx} className={`p-3.5 border rounded-2xl flex justify-between items-center ${
                  isDark ? 'bg-stone-900/40 border-stone-850' : 'bg-white border-stone-200'
                }`}>
                  <div className="space-y-1 flex-1 pr-3">
                    <span className={`font-extrabold text-xs block ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{p.title}</span>
                    <span className={`text-[10px] leading-relaxed block font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{p.desc}</span>
                  </div>
                  <button 
                    onClick={() => {
                      const updated = proposals.map((item, i) => i === idx ? { ...item, votes: item.votes + 1 } : item);
                      saveProposals(updated);
                    }}
                    className="p-2 rounded-xl bg-blue-600/10 text-blue-400 font-extrabold text-[10px] shrink-0 border border-blue-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    👍 {p.votes}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Terms View */}
        {moreSubView === 'terms' && (
          <div className="space-y-4">
            {renderSubHeader(language === 'ko' ? '서비스 약관' : 'Terms of Service')}
            <div className="text-[11px] text-slate-400 space-y-3 py-3 leading-relaxed font-medium">
              <p className="font-bold text-slate-200">1. 개요</p>
              <p>speerchess는 사용자의 로컬 자원을 사용하는 클라이언트 기반 체스 도구입니다. 회원 가입 없이 누구나 무상으로 이용할 수 있습니다.</p>
              <p className="font-bold text-slate-200">2. 공유 기능 정책</p>
              <p>사용자가 공유를 수락한 기보와 그 가공 텍스트는 클라우드 백업 목적의 데이터베이스에 익명 색인 보관될 수 있으며, 공개적 주소로 공유될 수 있습니다.</p>
            </div>
          </div>
        )}

        {/* Privacy View */}
        {moreSubView === 'privacy' && (
          <div className="space-y-4">
            {renderSubHeader(language === 'ko' ? '개인정보 처리방침' : 'Privacy Policy')}
            <div className="text-[11px] text-slate-400 space-y-3 py-3 leading-relaxed font-medium">
              <p className="font-bold text-slate-200">1. 개인 정보 수집 없음</p>
              <p>본 사이트는 어떤 경우에도 이메일, 이름, 연락처 등의 개인 인적 정보를 직접적으로 요구하거나 데이터베이스에 색인하여 보관하지 않습니다.</p>
              <p className="font-bold text-slate-200">2. 로컬 브라우저 저장소</p>
              <p>사용자의 테마 선택, 언어 설정 등 사이트 내 인터페이스 보정을 위한 최소 기여도는 LocalStorage를 이용해 유저의 기기 로컬 단독으로만 캐싱됩니다.</p>
            </div>
          </div>
        )}

        {/* Credits View */}
        {moreSubView === 'credits' && (
          <div className="space-y-4">
            {renderSubHeader('Credits')}
            <div className="text-[11px] text-slate-400 space-y-3 py-3 font-medium">
              <p className="font-bold text-slate-200">Open Source & APIs</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 text-xs">
                <li><b>Stockfish Chess Engine</b>: GPL License</li>
                <li><b>react-chessboard</b>: MIT License</li>
                <li><b>chess.js</b>: BSD 2-Clause License</li>
                <li><b>Lichess Openings Explorer API</b>: Public statistical API</li>
              </ul>
            </div>
          </div>
        )}

        {/* Blog View */}
        {moreSubView === 'blog' && (
          <div className="space-y-4">
            {renderSubHeader(language === 'ko' ? '업데이트 내역' : 'Updates Log')}
            <div className="space-y-3 py-2">
              {[
                { date: '2026.06.27', title: '자유 분석판 & 체스 시계 탑재', desc: '리체스 데이터베이스와 연계된 오프닝 탐색기와 대국용 체스 시계를 추가했습니다.' },
                { date: '2026.06.24', title: '스톡피시 18 라이트 병렬 풀링', desc: 'COOP/COEP 헤더 제약 없이 하드웨어에 기반한 2~4코어 다중 연산을 적용해 3배 빠른 분석률을 이룩했습니다.' }
              ].map((b, idx) => (
                <div key={idx} className={`p-3 border rounded-xl space-y-1 ${isDark ? 'bg-stone-900/40 border-stone-850' : 'bg-white border-stone-200'}`}>
                  <span className="text-[9px] font-black text-slate-500 block">{b.date}</span>
                  <span className={`font-extrabold text-xs block ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{b.title}</span>
                  <span className={`text-[10px] leading-relaxed block font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{b.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* About View */}
        {moreSubView === 'about' && (
          <div className="space-y-4">
            {renderSubHeader('About')}
            <div className="text-[11px] text-slate-400 space-y-3 py-3 leading-relaxed font-medium">
              <p>speerchess는 로컬 컴퓨터 및 모바일 브라우저 환경에서 실시간 기보 연산 성능을 극한까지 끌어올리는 혁신적인 체스 헬퍼 플랫폼입니다.</p>
              <p>서버 통신 비용 없이 Web Worker 다중 스레드로 Stockfish 18 Lite를 엣지 연동함으로써 복잡한 게임의 정확도를 묘수와 블런더 단위로 선명하게 추적할 수 있습니다.</p>
            </div>
          </div>
        )}

        {/* Feedback View */}
        {moreSubView === 'feedback' && (
          <div className="space-y-4">
            {renderSubHeader(language === 'ko' ? '의견 및 문의' : 'Feedback & Contact')}
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">{language === 'ko' ? '만족도 평점' : 'Rating'}</span>
                <div className="flex gap-2 text-yellow-500 text-lg">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => setFeedbackRating(star)} className="cursor-pointer">
                      {feedbackRating >= star ? '★' : '☆'}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">{language === 'ko' ? '상세 내용' : 'Details'}</span>
                <textarea 
                  rows={4}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder={language === 'ko' ? '건의할 내용이나 건의사항을 남겨주세요.' : 'Type your suggestions here...'}
                  className={`w-full p-3 rounded-xl border text-xs font-bold leading-relaxed ${
                    isDark ? 'bg-stone-900 border-stone-800 text-white' : 'bg-white border-stone-200 text-slate-800'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">
                  {language === 'ko' ? '답변받을 이메일 주소 (선택사항)' : 'Email Address for Reply (Optional)'}
                </span>
                <input 
                  type="email"
                  value={feedbackEmail}
                  onChange={(e) => setFeedbackEmail(e.target.value)}
                  placeholder={language === 'ko' ? 'example@email.com' : 'example@email.com'}
                  className={`w-full p-3 rounded-xl border text-xs font-bold ${
                    isDark ? 'bg-stone-900 border-stone-800 text-white' : 'bg-white border-stone-200 text-slate-800'
                  }`}
                />
              </div>

              <button 
                onClick={() => {
                  alert(language === 'ko' ? '소중한 피드백이 전송되었습니다. 감사합니다!' : 'Feedback submitted. Thank you!');
                  setFeedbackText('');
                  setFeedbackEmail('');
                  setMoreSubView('menu');
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-3 rounded-xl text-xs shadow-md transition-all active:scale-95 cursor-pointer"
              >
                {language === 'ko' ? '의견 전송하기' : 'Send Feedback'}
              </button>
            </div>
          </div>
        )}

        {/* Brilliant Repository Sub-view */}
        {moreSubView === 'brilliant' && (
          <div className="space-y-4">
            {renderSubHeader(language === 'ko' ? '탁월 저장소' : 'Brilliant Repository')}
            <div className="overflow-y-auto max-h-[60vh] no-scrollbar">
              {brilliantItems.length === 0 ? (
                <div className="text-center py-20 text-slate-400 font-bold text-xs">
                  {language === 'ko' ? '저장된 묘수가 없습니다.' : 'No Brilliant moves saved yet.'}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 pb-12">
                  {brilliantItems.map((item, idx) => (
                    <div 
                      key={`${item.game.hashid}-${idx}`}
                      onClick={() => setSelectedHighlight({ ...item, showAfterBoard: false })}
                      className={`rounded-2xl border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col items-center gap-2 hover:-translate-y-0.5 active:scale-98 relative ${
                        isDark ? 'bg-stone-900 border-stone-850' : 'bg-white border-stone-200'
                      }`}
                    >
                      <span className="absolute top-5 left-5 z-10 text-[9px] font-black px-2 py-0.5 rounded-full bg-cyan-650 text-white shadow-sm">
                        Brilliant
                      </span>
                      <div className="w-full aspect-square overflow-hidden rounded-xl border border-stone-850 relative">
                        <Chessboard 
                          options={{
                            position: item.afterFen,
                            boardOrientation: item.moveIndex % 2 === 0 ? 'white' : 'black',
                            allowDragging: false,
                            pieces: getCustomPieces()
                          }}
                        />
                      </div>
                      <div className="w-full text-center space-y-0.5">
                        <div className="text-xs font-black truncate">
                          {item.whitePlayer} vs {item.blackPlayer}
                        </div>
                        <div className="text-[10px] font-black text-cyan-500">
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

        {/* Blunder Repository Sub-view */}
        {moreSubView === 'blunder' && (
          <div className="space-y-4">
            {renderSubHeader(language === 'ko' ? '블런더 저장소' : 'Blunder Repository')}
            <div className="overflow-y-auto max-h-[60vh] no-scrollbar">
              {blunderItems.length === 0 ? (
                <div className="text-center py-20 text-slate-400 font-bold text-xs">
                  {language === 'ko' ? '저장된 실수가 없습니다.' : 'No Blunders saved yet.'}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 pb-12">
                  {blunderItems.map((item, idx) => (
                    <div 
                      key={`${item.game.hashid}-${idx}`}
                      onClick={() => setSelectedHighlight({ ...item, showAfterBoard: false })}
                      className={`rounded-2xl border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col items-center gap-2 hover:-translate-y-0.5 active:scale-98 relative ${
                        isDark ? 'bg-stone-900 border-stone-850' : 'bg-white border-stone-200'
                      }`}
                    >
                      <span className="absolute top-5 left-5 z-10 text-[9px] font-black px-2 py-0.5 rounded-full bg-red-650 text-white shadow-sm">
                        Blunder
                      </span>
                      <div className="w-full aspect-square overflow-hidden rounded-xl border border-stone-850 relative">
                        <Chessboard 
                          options={{
                            position: item.afterFen,
                            boardOrientation: item.moveIndex % 2 === 0 ? 'white' : 'black',
                            allowDragging: false,
                            pieces: getCustomPieces()
                          }}
                        />
                      </div>
                      <div className="w-full text-center space-y-0.5">
                        <div className="text-xs font-black truncate">
                          {item.whitePlayer} vs {item.blackPlayer}
                        </div>
                        <div className="text-[10px] font-black text-red-500">
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
      </div>
    );
  };

  const renderAnalyzeTab = () => {
    const isDark = darkMode === 'dark';
    const activeFen = moveTree[currentNodeId]?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    
    // Evaluation calculations
    const evalScore = getAnalyzeEvaluation();
    const prob = evalToWinProb(evalScore);
    const whitePct = prob * 100;
    const blackPct = 100 - whitePct;
    
    const handleAnalyzeSquareClick = (square: string) => {
      if (!showMoveDestinations) return;
      const tempChess = new Chess(activeFen);
      
      if (selectedSquare && possibleMoves.includes(square)) {
        handleAnalyzePieceDrop({ sourceSquare: selectedSquare, targetSquare: square, piece: 'p' });
        setSelectedSquare(null);
        setPossibleMoves([]);
        return;
      }
      
      const piece = tempChess.get(square as any);
      if (piece && piece.color === tempChess.turn()) {
        setSelectedSquare(square);
        const moves = tempChess.moves({ square: square as any, verbose: true });
        setPossibleMoves(moves.map(m => m.to));
      } else {
        setSelectedSquare(null);
        setPossibleMoves([]);
      }
    };

    const getAnalyzeSquareStyles = () => {
      const styles: Record<string, any> = {};
      if (showBoardHighlights && currentNodeId !== 'root') {
        const node = moveTree[currentNodeId];
        if (node && node.from && node.to) {
          styles[node.from] = { backgroundColor: 'rgba(255, 235, 59, 0.4)' };
          styles[node.to] = { backgroundColor: 'rgba(255, 235, 59, 0.4)' };
        }
      }
      return styles;
    };

    const handlePrevMove = () => {
      const node = moveTree[currentNodeId];
      if (node && node.parentId) {
        setCurrentNodeId(node.parentId);
      }
    };

    const handleNextMove = () => {
      const node = moveTree[currentNodeId];
      if (node && node.children && node.children.length > 0) {
        setCurrentNodeId(node.children[0]);
      }
    };

    // Reconstruct moves list from moveTree starting from root and copy it
    const exportPgn = () => {
      const getMovesList = (nodeId: string): string[] => {
        const node = moveTree[nodeId];
        if (!node || node.children.length === 0) return [];
        const firstChild = moveTree[node.children[0]];
        return [firstChild.san, ...getMovesList(firstChild.id)];
      };
      const moves = getMovesList('root');
      let pgnStr = '';
      for (let i = 0; i < moves.length; i += 2) {
        pgnStr += `${Math.floor(i / 2) + 1}. ${moves[i]} ${moves[i+1] || ''} `;
      }
      navigator.clipboard.writeText(pgnStr.trim());
      alert(language === 'ko' ? 'PGN 기보가 클립보드에 복사되었습니다!' : 'PGN moves list copied to clipboard!');
    };

    return (
      <div className={`flex-1 flex flex-col justify-between overflow-hidden relative ${
        isDark ? 'bg-stone-950 text-slate-100' : 'bg-[#fafaf9] text-slate-800'
      }`}>
        {/* Header */}
        <header className={`flex items-center justify-between py-2 px-4 border-b shrink-0 shadow-sm z-10 ${
          isDark ? 'bg-stone-900 border-stone-850' : 'bg-white border-stone-200/60'
        }`}>
          <button onClick={() => { setActiveTab('home'); }} className={`p-2 rounded-full ${isDark ? 'hover:bg-stone-800 text-slate-400' : 'hover:bg-stone-50 text-slate-650'}`}>
            <ChevronLeft size={22} />
          </button>
          <div className="flex flex-col items-center">
            <h2 className="font-black text-sm">{language === 'ko' ? '자유 분석판' : 'Analysis Board'}</h2>
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{language === 'ko' ? '로컬 실시간 피드백' : 'Local real-time evaluation'}</span>
          </div>
          
          {/* Header settings icon (3-dots vertical settings) */}
          <div className="relative">
            <button 
              onClick={() => setIsAnalyzeSettingsOpen(prev => !prev)}
              className={`p-2 rounded-full transition-colors cursor-pointer ${isDark ? 'hover:bg-stone-800 text-slate-400' : 'hover:bg-stone-50 text-slate-655'}`}
              title={language === 'ko' ? '분석판 설정' : 'Analysis Settings'}
            >
              <MoreVertical size={20} />
            </button>
            {isAnalyzeSettingsOpen && (
              <div className={`absolute right-0 mt-2 w-64 rounded-2xl shadow-xl p-4 border z-50 text-xs space-y-4 animate-fade-in ${
                isDark ? 'bg-stone-900 border-stone-800 text-white shadow-black/80' : 'bg-white border-stone-200 text-slate-800'
              }`}>
                <div className="flex justify-between items-center pb-2 border-b border-stone-800/40">
                  <span className="font-extrabold text-[10px] text-slate-400 uppercase tracking-widest">{language === 'ko' ? '분석 옵션 설정' : 'Analysis Settings'}</span>
                  <button onClick={() => setIsAnalyzeSettingsOpen(false)} className={`p-0.5 rounded ${isDark ? 'hover:bg-stone-800 text-slate-400' : 'hover:bg-stone-100 text-slate-500'}`}><X size={14} /></button>
                </div>
                
                {/* 1. Explorer Settings */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">{language === 'ko' ? '오프닝 탐색기 설정' : 'Opening Explorer'}</label>
                  <div className={`grid grid-cols-2 gap-1 p-0.5 rounded-lg border ${isDark ? 'bg-stone-950/40 border-stone-850' : 'bg-stone-100 border-stone-250'}`}>
                    <button onClick={() => setExplorerDb('lichess')} className={`py-1 rounded text-[9px] font-black transition-all cursor-pointer ${explorerDb === 'lichess' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`}>Lichess</button>
                    <button onClick={() => setExplorerDb('masters')} className={`py-1 rounded text-[9px] font-black transition-all cursor-pointer ${explorerDb === 'masters' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`}>Masters</button>
                  </div>

                  {explorerDb === 'lichess' && (
                    <div className="space-y-2 mt-1.5 pt-1.5 border-t border-stone-800/20">
                      {/* Lichess Speed Controls */}
                      <div className="space-y-1">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">{language === 'ko' ? '시간 조절 (Speed)' : 'Speed Filters'}</span>
                        <div className="flex flex-wrap gap-1">
                          {['bullet', 'blitz', 'rapid', 'classical'].map((speed) => {
                            const isSel = explorerSpeeds.includes(speed);
                            return (
                              <button 
                                key={speed}
                                onClick={() => {
                                  if (isSel) {
                                    setExplorerSpeeds(explorerSpeeds.filter(s => s !== speed));
                                  } else {
                                    setExplorerSpeeds([...explorerSpeeds, speed]);
                                  }
                                }}
                                className={`px-2 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all border ${
                                  isSel 
                                    ? 'bg-blue-600/20 border-blue-500 text-blue-400' 
                                    : (isDark ? 'bg-stone-900 border-stone-800 text-slate-400 hover:border-slate-700' : 'bg-stone-50 border-stone-200 text-slate-605 hover:border-slate-350')
                                }`}
                              >
                                {speed.charAt(0).toUpperCase() + speed.slice(1)}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Lichess Ratings */}
                      <div className="space-y-1">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">{language === 'ko' ? '유저 레이팅 (Rating)' : 'Rating Filters'}</span>
                        <div className="flex flex-wrap gap-1">
                          {['1600', '1800', '2000', '2200', '2500'].map((rating) => {
                            const isSel = explorerRatings.includes(rating);
                            return (
                              <button 
                                key={rating}
                                onClick={() => {
                                  if (isSel) {
                                    setExplorerRatings(explorerRatings.filter(r => r !== rating));
                                  } else {
                                    setExplorerRatings([...explorerRatings, rating]);
                                  }
                                }}
                                className={`px-1.5 py-0.5 rounded text-[8px] font-bold cursor-pointer transition-all border ${
                                  isSel 
                                    ? 'bg-blue-600/20 border-blue-500 text-blue-400' 
                                    : (isDark ? 'bg-stone-900 border-stone-800 text-slate-400 hover:border-slate-700' : 'bg-stone-50 border-stone-200 text-slate-605 hover:border-slate-350')
                                }`}
                              >
                                {rating === '2500' ? '2500+' : rating}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Engine Settings */}
                <div className="space-y-2 border-t border-stone-800/40 pt-2.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{language === 'ko' ? '엔진 분석 (실시간)' : 'Live Engine Evals'}</label>
                    <button 
                      onClick={() => setIsAnalyzeEngineEnabled(prev => !prev)}
                      className={`w-7 h-4 rounded-full p-0.5 flex items-center transition-all cursor-pointer ${isAnalyzeEngineEnabled ? 'bg-blue-600 justify-end' : 'bg-stone-850 justify-start'}`}
                    >
                      <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
                  {isAnalyzeEngineEnabled && (
                    <div className="space-y-2.5 pl-1">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-bold text-slate-450">
                          <span>{language === 'ko' ? '추천 라인 개수 (PV)' : 'Engine Line Count (PV)'}</span>
                          <span className="text-blue-500 font-extrabold">{engineLinesCount} Lines</span>
                        </div>
                        <input 
                          type="range"
                          min={1}
                          max={5}
                          step={1}
                          value={engineLinesCount}
                          onChange={(e) => setEngineLinesCount(parseInt(e.target.value, 10))}
                          className="w-full h-1 bg-stone-850 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-bold text-slate-450">
                          <span>{language === 'ko' ? '엔진 분석 깊이 (Depth)' : 'Max Calculation Depth'}</span>
                          <span className="text-blue-500 font-extrabold">{depth} Ply</span>
                        </div>
                        <input 
                          type="range"
                          min={12}
                          max={20}
                          step={2}
                          value={depth}
                          onChange={(e) => setDepth(parseInt(e.target.value, 10) as any)}
                          className="w-full h-1 bg-stone-850 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Best Move Arrow Settings */}
                <div className="space-y-2.5 border-t border-stone-800/40 pt-2.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{language === 'ko' ? '최선수 화살표 표시' : 'Show Best Move Arrow'}</label>
                    <button 
                      onClick={() => setBestMoveArrowEnabled(prev => !prev)}
                      className={`w-7 h-4 rounded-full p-0.5 flex items-center transition-all cursor-pointer ${bestMoveArrowEnabled ? 'bg-blue-600 justify-end' : 'bg-stone-850 justify-start'}`}
                    >
                      <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
                    </button>
                  </div>
                  {bestMoveArrowEnabled && (
                    <div className="space-y-1 pl-1">
                      <span className="text-[9px] font-bold text-slate-500 block">{language === 'ko' ? '화살표 색상' : 'Arrow Color'}</span>
                      <div className="flex gap-2">
                        {['#10b981', '#ef4444', '#3b82f6', '#eab308'].map(color => (
                          <button 
                            key={color}
                            onClick={() => setArrowColor(color)}
                            className={`w-5 h-5 rounded-full border transition-all cursor-pointer ${
                              arrowColor === color ? 'border-white scale-110 shadow-md shadow-black/40 ring-1 ring-blue-500' : 'border-stone-800 hover:scale-105'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* PV lines info panel */}
        {isAnalyzeEngineEnabled && (
          <div className={`px-4 py-1 text-[9px] font-bold border-b flex flex-col gap-0.5 shrink-0 ${
            isDark ? 'bg-stone-900/60 border-stone-850 text-slate-400' : 'bg-stone-50 border-stone-200 text-slate-600'
          }`}>
            {engineLines.length === 0 ? (
              <span className="flex items-center gap-1.5 italic text-slate-500 py-0.5">
                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                {language === 'ko' ? '엔진 분석 대기 중...' : 'Engine calculating...'}
              </span>
            ) : (
              engineLines.slice(0, 3).map((line, idx) => (
                <div key={idx} className="flex justify-between items-center py-0.5">
                  <span className="text-blue-400 font-extrabold w-6 text-center">PV{line.multipv}</span>
                  <span className="flex-1 truncate font-mono text-[9px] mx-2 text-slate-350">{line.pv}</span>
                  <span className={`font-mono font-black shrink-0 px-1 rounded ${
                    line.score >= 0 ? 'bg-green-950 text-green-400' : 'bg-red-950 text-red-400'
                  }`}>
                    {line.isMate ? `M${line.score}` : (line.score / 100 > 0 ? `+${(line.score / 100).toFixed(2)}` : (line.score / 100).toFixed(2))}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Board & Eval container (Optimized padding and height to pull board up) */}
        <div className="flex flex-col items-center justify-start p-2 gap-2 shrink-0">
          <div className="flex gap-2.5 items-stretch w-full max-w-[360px]">
            {/* Evaluation Bar */}
            {isAnalyzeEngineEnabled && (
              <div className="w-3.5 bg-stone-900 border border-stone-850 rounded-full overflow-hidden flex flex-col relative shrink-0 shadow-inner" style={{ height: '240px' }}>
                {boardOrientation === 'white' ? (
                  <>
                    <div className="bg-stone-900 transition-all duration-300 ease-out w-full" style={{ height: `${blackPct}%` }} />
                    <div className="bg-white transition-all duration-300 ease-out w-full flex-1" />
                  </>
                ) : (
                  <>
                    <div className="bg-white transition-all duration-300 ease-out w-full" style={{ height: `${whitePct}%` }} />
                    <div className="bg-stone-900 transition-all duration-300 ease-out w-full flex-1" />
                  </>
                )}
                <span className={`absolute text-[8px] font-black pointer-events-none select-none px-1 rounded ${
                  evalScore >= 0
                    ? (boardOrientation === 'white' ? 'bottom-1 text-slate-800 bg-white/70' : 'top-1 text-slate-800 bg-white/70')
                    : (boardOrientation === 'white' ? 'top-1 text-white bg-slate-900/70' : 'bottom-1 text-white bg-slate-900/70')
                }`}>
                  {getEvalStr(evalScore)}
                </span>
              </div>
            )}
            
            {/* Chessboard */}
            <div className="flex-1 aspect-square max-w-[280px] overflow-hidden rounded-xl shadow-md border border-stone-250/60 bg-white relative">
              <Chessboard 
                options={{
                  position: activeFen,
                  boardOrientation: boardOrientation,
                  allowDragging: true,
                  onPieceDrop: handleAnalyzePieceDrop,
                  onSquareClick: ({ piece, square }) => handleAnalyzeSquareClick(square),
                  darkSquareStyle: { backgroundColor: themeColors.dark },
                  lightSquareStyle: { backgroundColor: themeColors.light },
                  showNotation: showCoordinates,
                  pieces: getCustomPieces(),
                  arrows: bestMoveArrowEnabled && bestMoveArrow 
                    ? [{ startSquare: bestMoveArrow.from, endSquare: bestMoveArrow.to, color: arrowColor }] 
                    : [],
                  squareRenderer: ({ piece, square, children }) => {
                    const isSelected = selectedSquare === square;
                    const isPossible = possibleMoves.includes(square);
                    
                    const highlightedStyles = getAnalyzeSquareStyles();
                    const highlightStyle = isSelected 
                      ? 'bg-blue-500/30 ring-2 ring-blue-500 ring-inset' 
                      : (isPossible ? 'bg-blue-400/20' : (highlightedStyles[square] ? highlightedStyles[square].backgroundColor : ''));
                    
                    return (
                      <div className={`relative w-full h-full flex items-center justify-center cursor-pointer ${highlightStyle}`}>
                        {children}
                        {isPossible && (
                          <div className={`absolute rounded-full ${
                            piece ? 'w-5/6 h-5/6 border-[4px] border-blue-400/60' : 'w-3 h-3 bg-blue-400/60'
                          }`} />
                        )}
                      </div>
                    );
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Sub-tabs explorer below the board (Expanded height to flex-1 to occupy maximum available space) */}
        <div className={`flex flex-col flex-1 border-t overflow-hidden shrink ${
          isDark ? 'bg-stone-900 border-stone-850' : 'bg-white border-stone-150'
        }`}>
          {/* Sub-tab headers */}
          <div className="h-9 flex border-b border-stone-850 shrink-0 text-[10px] font-black">
            <button onClick={() => setAnalyzeSubTab('BOOK')} className={`flex-1 flex items-center justify-center gap-1.5 cursor-pointer ${analyzeSubTab === 'BOOK' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>
              <BookOpen size={12} /> {language === 'ko' ? '오프닝 북' : 'Openings Book'}
            </button>
            <button onClick={() => setAnalyzeSubTab('TREE')} className={`flex-1 flex items-center justify-center gap-1.5 cursor-pointer ${analyzeSubTab === 'TREE' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>
              <Layers size={12} /> {language === 'ko' ? '수 수순 트리' : 'Game Moves'}
            </button>
            <button onClick={() => setAnalyzeSubTab('SETTINGS')} className={`flex-1 flex items-center justify-center gap-1.5 cursor-pointer ${analyzeSubTab === 'SETTINGS' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>
              <Settings size={12} /> {language === 'ko' ? '분석 라인 설정' : 'Lines Settings'}
            </button>
          </div>
          
          {/* Sub-tab body */}
          <div className="flex-1 p-3 overflow-y-auto no-scrollbar">
            {analyzeSubTab === 'BOOK' && (
              isLoadingOpening ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : (!openingData || !openingData.moves || openingData.moves.length === 0) ? (
                <div className="text-center py-6 text-xs text-slate-500 font-bold italic">
                  {language === 'ko' ? '오프닝 데이터베이스 기록이 없습니다.' : 'No opening statistics found.'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {openingData.moves.slice(0, 8).map((move: any, idx: number) => {
                    const total = move.white + move.draws + move.black;
                    const wPct = total > 0 ? (move.white / total) * 100 : 0;
                    const dPct = total > 0 ? (move.draws / total) * 100 : 0;
                    const bPct = total > 0 ? (move.black / total) * 100 : 0;
                    return (
                      <div key={idx} className="flex items-center justify-between text-[12px] font-bold border-b border-stone-800/20 pb-2 pt-1">
                        <button 
                          onClick={() => handleAnalyzePieceDrop({ sourceSquare: move.uci.slice(0, 2), targetSquare: move.uci.slice(2, 4), piece: 'p' })}
                          className="w-12 text-left text-blue-500 hover:underline font-black cursor-pointer text-[13px]"
                        >
                          {move.san}
                        </button>
                        <div className="flex items-center gap-1.5 flex-1 justify-center mx-2 shrink-0">
                          <span className="text-[10px] text-slate-400 font-extrabold w-8 text-right shrink-0">{Math.round(wPct)}%</span>
                          <div className="flex-1 h-2 rounded-full overflow-hidden flex border border-stone-800 shadow-inner max-w-[80px]">
                            <div style={{ width: `${wPct}%` }} className="bg-slate-200 h-full" title={`W: ${Math.round(wPct)}%`} />
                            <div style={{ width: `${dPct}%` }} className="bg-slate-400 h-full" title={`D: ${Math.round(dPct)}%`} />
                            <div style={{ width: `${bPct}%` }} className="bg-slate-800 h-full" title={`B: ${Math.round(bPct)}%`} />
                          </div>
                          <span className="text-[10px] text-slate-500 font-extrabold w-8 text-left shrink-0">{Math.round(bPct)}%</span>
                        </div>
                        <div className="w-16 text-right text-[11px] text-slate-400 font-extrabold">
                          {total.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {analyzeSubTab === 'TREE' && (
              <div className="flex flex-wrap gap-x-1.5 gap-y-2 leading-relaxed text-xs max-w-full font-sans">
                {renderMoveTree('root')}
              </div>
            )}

            {analyzeSubTab === 'SETTINGS' && (
              <div className="space-y-4 text-xs font-semibold p-1">
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-bold text-slate-450 uppercase tracking-widest">
                    <span>{language === 'ko' ? '엔진 분석 추천 개수 (MultiPV)' : 'Engine Line Count'}</span>
                    <span className="text-blue-500 font-extrabold">{engineLinesCount} Lines</span>
                  </div>
                  <input 
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={engineLinesCount}
                    onChange={(e) => setEngineLinesCount(parseInt(e.target.value, 10))}
                    className="w-full h-1 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom analysis toolbar */}
        <div className={`h-11 border-t flex justify-between items-center px-4 shrink-0 z-10 ${
          isDark ? 'bg-stone-900 border-stone-850' : 'bg-white border-stone-150'
        }`}>
          {/* 3-lines menu with editor options */}
          <div className="relative">
            <button 
              onClick={() => setIsAnalyzeMenuOpen(prev => !prev)}
              className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-800 cursor-pointer`}
              title={language === 'ko' ? '메뉴' : 'Menu'}
            >
              <Menu size={18} />
            </button>
            {isAnalyzeMenuOpen && (
              <div className={`absolute left-0 bottom-10 w-48 rounded-2xl shadow-2xl p-2 border z-50 text-[10px] font-bold space-y-1 animate-fade-in ${
                isDark ? 'bg-stone-900 border-stone-800 text-white shadow-black/85' : 'bg-white border-stone-200 text-slate-800'
              }`}>
                <button 
                  onClick={() => {
                    setBoardOrientation(prev => prev === 'white' ? 'black' : 'white');
                    setIsAnalyzeMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl cursor-pointer ${isDark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}
                >
                  🔄 {language === 'ko' ? '보드 돌리기' : 'Flip Board'}
                </button>
                <button 
                  onClick={() => {
                    const fenIn = prompt(language === 'ko' ? 'FEN 포지션을 입력해 보드를 설정하세요 (보드 편집기):' : 'Enter FEN code to configure board (Board Editor):');
                    if (fenIn && fenIn.trim()) {
                      try {
                        const temp = new Chess(fenIn.trim());
                        setMoveTree({ 'root': { id: 'root', san: '', from: '', to: '', fen: temp.fen(), parentId: null, children: [] } });
                        setCurrentNodeId('root');
                      } catch (e) {
                        alert(language === 'ko' ? '올바르지 않은 FEN입니다.' : 'Invalid FEN code.');
                      }
                    }
                    setIsAnalyzeMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl cursor-pointer ${isDark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}
                >
                  🛠️ {language === 'ko' ? '보드 편집기 (FEN 설정)' : 'Board Editor (Set FEN)'}
                </button>
                <button 
                  onClick={() => {
                    setMoveTree({ 'root': { id: 'root', san: '', from: '', to: '', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', parentId: null, children: [] } });
                    setCurrentNodeId('root');
                    setIsAnalyzeMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl cursor-pointer ${isDark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}
                >
                  🧹 {language === 'ko' ? '시작 포지션으로 리셋' : 'Reset to Start'}
                </button>
                <button 
                  onClick={() => {
                    const fenClean = '8/8/8/8/8/8/8/8 w - - 0 1';
                    setMoveTree({ 'root': { id: 'root', san: '', from: '', to: '', fen: fenClean, parentId: null, children: [] } });
                    setCurrentNodeId('root');
                    setIsAnalyzeMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl cursor-pointer ${isDark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}
                >
                  🗑️ {language === 'ko' ? '체스판 모든 기물 비우기' : 'Clear Board Pieces'}
                </button>
                <button 
                  onClick={() => {
                    exportPgn();
                    setIsAnalyzeMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl cursor-pointer border-t border-stone-800/40 ${isDark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}
                >
                  📝 {language === 'ko' ? 'PGN 기보 복사하기' : 'Copy PGN Moves'}
                </button>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(activeFen);
                    alert(language === 'ko' ? 'FEN이 복사되었습니다!' : 'FEN copied!');
                    setIsAnalyzeMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl cursor-pointer ${isDark ? 'hover:bg-stone-800' : 'hover:bg-stone-100'}`}
                >
                  📋 {language === 'ko' ? 'FEN 복사하기' : 'Copy FEN'}
                </button>
              </div>
            )}
          </div>
          
          {/* Engine toggle */}
          <button 
            onClick={() => setIsAnalyzeEngineEnabled(prev => !prev)}
            className={`px-3 py-1 rounded-xl text-[9px] font-black border transition-all cursor-pointer ${
              isAnalyzeEngineEnabled 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                : (isDark ? 'bg-stone-900 border-stone-800 text-slate-500' : 'bg-white border-stone-250 text-slate-500')
            }`}
          >
            ⚙️ {language === 'ko' ? '엔진추천' : 'Engine recommendations'}
          </button>
          
          {/* Navigation previous/next */}
          <div className="flex gap-2">
            <button 
              onClick={handlePrevMove}
              disabled={currentNodeId === 'root'}
              className="p-1 hover:bg-stone-850 text-slate-500 rounded disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={handleNextMove}
              disabled={moveTree[currentNodeId]?.children.length === 0}
              className="p-1 hover:bg-stone-850 text-slate-500 rounded disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  };

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

        {view !== 'LOADING' && activeTab === 'home' && renderHomeTab()}

        {view !== 'LOADING' && activeTab === 'more' && renderMoreTab()}

        {view !== 'LOADING' && activeTab === 'analyze' && renderAnalyzeTab()}

        {view !== 'LOADING' && activeTab === 'chessle' && !chesslePuzzle && (
          <div className={`flex-1 flex flex-col p-5 overflow-y-auto no-scrollbar justify-between ${
            darkMode === 'dark' ? 'bg-stone-950 text-slate-100' : 'bg-[#fafaf9] text-slate-800'
          }`}>
            <div className="space-y-6 pt-4">
              <div className="flex items-center gap-2 border-b pb-4 border-stone-850">
                <SpeerLogo className={`w-6 h-6 ${darkMode === 'dark' ? 'text-slate-100' : 'text-slate-800'}`} />
                <h3 className="font-black text-sm uppercase tracking-widest">{language === 'ko' ? '🧩 Chessle (체슬)' : '🧩 Chessle'}</h3>
              </div>
              
              <div className={`rounded-2xl p-5 border text-xs leading-relaxed space-y-2 ${
                darkMode === 'dark' ? 'bg-stone-900/30 border-stone-850 text-slate-350' : 'bg-stone-100 border-stone-250'
              }`}>
                <p className="font-bold text-xs">{language === 'ko' ? '🏁 오프닝 맞추기 퍼즐' : '🏁 Opening Guessing Game'}</p>
                <p>
                  {language === 'ko' 
                    ? '상대방이 둔 오프닝 5수(10개 반수)를 유추하고 입력하는 퍼즐 게임입니다.' 
                    : 'Guess the first 10 half-moves of a standard chess match.'}
                </p>
                <p>
                  {language === 'ko'
                    ? '시도 결과에 따라 맞춘 위치와 수순을 워드(Wordle) 스타일 색상으로 평가해 줍니다.'
                    : 'Get color-coded feedback indicating correct, present, or wrong moves.'}
                </p>
              </div>
              
              <div className="space-y-4">
                <button 
                  onClick={() => {
                    const randomGame = allGames.length > 0 ? allGames[Math.floor(Math.random() * allGames.length)] : PRESET_GAMES[0];
                    startChessleGame(randomGame);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-3.5 rounded-2xl text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  {language === 'ko' ? '오늘의 랜덤 체슬 시작하기' : 'Start Random Chessle'}
                </button>
                
                <div className="space-y-1.5 pt-3 border-t border-stone-850/60">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    {language === 'ko' ? '고유 게임 코드로 참여' : 'Enter Custom Game Code'}
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder={language === 'ko' ? '예: hashid 입력' : 'Game hashid...'}
                      value={chessleCodeInput}
                      onChange={(e) => setChessleCodeInput(e.target.value)}
                      className={`flex-1 p-2.5 rounded-xl border text-xs font-bold ${
                        darkMode === 'dark' ? 'bg-stone-900 border-stone-800 text-white' : 'bg-white border-stone-200 text-slate-800'
                      }`}
                    />
                    <button 
                      onClick={async () => {
                        const code = chessleCodeInput.trim();
                        if (!code) return;
                        setView('LOADING');
                        setProgress(0);
                        setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
                        try {
                          const res = await fetch(`/api/games?hashid=${code}&t=${Date.now()}`);
                          if (!res.ok) throw new Error();
                          const data = await res.json();
                          startChessleGame({
                            hashid: code,
                            analysis_json: data.analysis_json,
                            pgn: data.pgn
                          });
                        } catch (e) {
                          alert(language === 'ko' ? '존재하지 않는 코드입니다.' : 'Invalid code.');
                          setView('INPUT');
                        }
                      }}
                      className="px-4 bg-slate-800 hover:bg-slate-750 text-white font-bold rounded-xl text-xs cursor-pointer active:scale-95 transition-all"
                    >
                      {language === 'ko' ? '입장' : 'Enter'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: SUMMARY */}
        {view === 'SUMMARY' && activeTab === 'review' && analysis && (
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
                <h2 className="text-2xl font-black text-slate-850">{getGameResult(pgn, language)}</h2>
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

            <div className="p-4 bg-white border-t border-stone-200/60 space-y-2 shrink-0">
              <button 
                onClick={startReview}
                className="w-full bg-slate-800 hover:bg-slate-750 text-white font-bold py-3.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-sm active:scale-95 cursor-pointer"
              >
                첫 수부터 복기 시작 <ChevronRight size={18} />
              </button>
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={handleDownloadGif} 
                  disabled={isExportingGif}
                  className="bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm text-xs active:scale-95 cursor-pointer animate-none"
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
                <button 
                  onClick={handleCopyPgn}
                  className="bg-white hover:bg-stone-50 text-slate-800 font-bold py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all border border-stone-300 shadow-sm text-xs active:scale-95 cursor-pointer"
                >
                  <Layers size={14} />
                  PGN 복사하기
                </button>
              </div>
              <button 
                onClick={handleShareGame}
                disabled={isSharing}
                className="w-full bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm text-xs active:scale-95 cursor-pointer"
              >
                {isSharing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    공유 링크 생성 중...
                  </>
                ) : sharedHashid ? (
                  <>
                    <CheckCircle2 size={14} className="text-green-400" />
                    링크 복사 완료 (코드: {sharedHashid})
                  </>
                ) : (
                  <>
                    <Globe size={14} />
                    분석 링크 공유
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* VIEW: REVIEW */}
        {view === 'REVIEW' && activeTab === 'review' && analysis && (
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
              <div 
                ref={boardContainerRef}
                className="w-full aspect-square max-w-[360px] overflow-hidden rounded-2xl shadow-md border border-stone-200/60 bg-white"
              >
                <Chessboard 
                  options={{
                    position: fen,
                    boardOrientation: boardOrientation,
                    allowDragging: true,
                    onPieceDrop: handlePieceDrop,
                    onSquareClick: ({ piece, square }) => handleSquareClick(square),
                    darkSquareStyle: { backgroundColor: themeColors.dark },
                    lightSquareStyle: { backgroundColor: themeColors.light },
                    squareRenderer: ({ piece, square, children }) => {
                      const { from: highlightedFrom, to: highlightedTo } = activeHighlightedSquares;
                      const isTargetSquare = highlightedTo === square;
                      const isSourceSquare = highlightedFrom === square;
                      
                      let highlightStyle = '';
                      if (isTargetSquare || isSourceSquare) {
                        if (activeVariationIndex !== null) {
                          highlightStyle = 'bg-yellow-500/20'; // Default highlight for manually placed variations
                        } else {
                          const currentMove = currentMoveIndex >= 0 ? analysis.moves[currentMoveIndex] : null;
                          if (currentMove) {
                            const isBrilliantOrGreat = currentMove.classification === 'Brilliant' || currentMove.classification === 'Great';
                            if (isBrilliantOrGreat) {
                              highlightStyle = 'bg-emerald-500/35'; // Greenish highlight
                            } else if (currentMove.classification === 'Inaccuracy' || currentMove.classification === 'Mistake' || currentMove.classification === 'Blunder') {
                              highlightStyle = 'bg-yellow-500/35'; // Yellowish highlight
                            } else {
                              highlightStyle = 'bg-yellow-500/20'; // Default move highlight
                            }
                          } else {
                            highlightStyle = 'bg-yellow-500/20';
                          }
                        }
                      }
                      
                      // Click-to-move highlights
                      const isSelected = selectedSquare === square;
                      const isPossible = possibleMoves.includes(square);
                      
                      if (isSelected) {
                        highlightStyle = 'bg-blue-500/30 ring-2 ring-blue-500 ring-inset';
                      } else if (isPossible) {
                        highlightStyle = 'bg-blue-400/20';
                      }

                      const currentMove = currentMoveIndex >= 0 ? analysis.moves[currentMoveIndex] : null;

                      return (
                        <div 
                          className={`relative w-full h-full flex items-center justify-center cursor-pointer ${highlightStyle}`}
                        >
                          {children}
                          {isTargetSquare && activeVariationIndex === null && currentMove && getBoardBadge(currentMove.classification)}
                          
                          {/* Possible moves marker dots/rings */}
                          {isPossible && (
                            <div className={`absolute rounded-full ${
                              piece ? 'w-5/6 h-5/6 border-[4px] border-blue-400/60' : 'w-3 h-3 bg-blue-400/60'
                            }`} />
                          )}
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
        {view === 'INPUT' && activeTab === 'review' && (
          <div className="flex-1 flex flex-col bg-white overflow-y-auto no-scrollbar relative">
            {/* Home Top Bar */}
            <div className="flex items-center justify-center px-4 py-3 border-b border-stone-200/40 bg-stone-50/25 shrink-0">
              <div className="flex items-center gap-1">
                <SpeerLogo className="w-4 h-4 text-slate-800" />
                <span className="font-extrabold text-sm tracking-tight text-slate-800">speerchess</span>
              </div>
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
                  
                  {/* GIF Export & Settings Row */}
                  <div className="flex gap-2 items-center">
                    <button 
                      onClick={() => {
                        setIsSidebarOpen(false);
                        handleDownloadGif();
                      }} 
                      disabled={isExportingGif}
                      className="flex-1 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm text-xs active:scale-95 cursor-pointer h-11"
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
                    <button 
                      onClick={() => setShowGifSettings(prev => !prev)}
                      className={`p-3 rounded-xl border flex items-center justify-center transition-all cursor-pointer h-11 w-11 active:scale-95 ${
                        showGifSettings ? 'bg-slate-100 border-slate-300 text-slate-850' : 'bg-white hover:bg-stone-50 border-stone-300 text-slate-600'
                      }`}
                      title="GIF 설정"
                    >
                      <Settings size={16} className={isExportingGif ? "animate-spin" : ""} />
                    </button>
                  </div>

                  {/* Collapsible Settings Panel */}
                  {showGifSettings && (
                    <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-3 text-xs">
                      {/* Annotation Mode */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 block">GIF 주석 표시</label>
                        <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-lg border border-stone-200">
                          {(['standard', 'all', 'none'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setGifAnnotationMode(mode)}
                              className={`py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                gifAnnotationMode === mode 
                                  ? 'bg-slate-800 text-white shadow-sm' 
                                  : 'text-slate-500 hover:bg-stone-50'
                              }`}
                            >
                              {mode === 'standard' ? '표준설정' : mode === 'all' ? '전체설정' : '표시안함'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Orientation */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 block">보드 방향 (아래쪽 기준)</label>
                        <div className="grid grid-cols-2 gap-1 bg-white p-1 rounded-lg border border-stone-200">
                          {(['white', 'black'] as const).map((orient) => (
                            <button
                              key={orient}
                              type="button"
                              onClick={() => setGifOrientation(orient)}
                              className={`py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                gifOrientation === orient 
                                  ? 'bg-slate-800 text-white shadow-sm' 
                                  : 'text-slate-500 hover:bg-stone-50'
                              }`}
                            >
                              {orient === 'white' ? '백 (White)' : '흑 (Black)'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Show Names Toggle */}
                      <div className="flex justify-between items-center pt-2 border-t border-stone-200">
                        <label className="text-[10px] font-bold text-slate-600">플레이어 이름 표시</label>
                        <button
                          type="button"
                          onClick={() => setGifShowNames(prev => !prev)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                            gifShowNames ? 'bg-slate-800 justify-end' : 'bg-stone-300 justify-start'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white transition-transform shadow-sm" />
                        </button>
                      </div>
                    </div>
                  )}

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
                    ) : isCopied ? (
                      <>
                        <CheckCircle2 size={14} className="text-green-400" />
                        공유 링크 복사 완료
                      </>
                    ) : sharedHashid ? (
                      <>
                        <Globe size={14} />
                        공유 링크 복사하기
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

              {/* Relaxation YouTube Links */}
              {hyperlinks.length > 0 && (
                <div className="border-t border-stone-100 pt-4 space-y-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 flex items-center gap-1">
                    ☕ 쉬어가는 길 (기분 전환)
                  </span>
                  <div className="space-y-1.5 text-xs text-slate-600">
                    {hyperlinks.map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-slate-700 hover:text-slate-900 font-bold hover:underline transition-all py-0.5 active:scale-98"
                      >
                        <span className="text-[10px]">📺</span>
                        <span className="truncate max-w-[200px]">{link.text}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

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
                    onClick={async () => {
                      if (feedbackText.trim()) {
                        try {
                          await fetch('/api/feedback', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              rating: feedbackRating,
                              text: feedbackText
                            })
                          });
                        } catch (e) {
                          console.error("Failed to send feedback:", e);
                        }
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
        {view === 'EXPLORE' && activeTab === 'review' && (
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
                          <div className="text-[10px] font-bold text-slate-500">
                            {getGameResult(game.pgn, language)}
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
                            boardOrientation: item.moveIndex % 2 === 0 ? 'white' : 'black',
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
                            boardOrientation: item.moveIndex % 2 === 0 ? 'white' : 'black',
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
                    boardOrientation: selectedHighlight.moveIndex % 2 === 0 ? 'white' : 'black',
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
                      } else {
                        // Highlight opponent's last move when showAfterBoard is false
                        const isOpponentTarget = selectedHighlight.opponentLastMoveTo === square;
                        const isOpponentSource = selectedHighlight.opponentLastMoveFrom === square;
                        if (isOpponentTarget || isOpponentSource) {
                          highlightStyle = 'bg-blue-500/25';
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
        {view === 'CHESSLE' && activeTab === 'chessle' && chesslePuzzle && (
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
                    onSquareClick: ({ piece, square }) => handleChessleSquareClick(square),
                    allowDragging: chessleMoves.length < 10 && !chessleSolved && chessleAttemptCount < 6,
                    darkSquareStyle: { backgroundColor: themeColors.dark },
                    lightSquareStyle: { backgroundColor: themeColors.light },
                    squareRenderer: ({ piece, square, children }) => {
                      const isSelected = chessleSelectedSquare === square;
                      const isPossible = chesslePossibleMoves.includes(square);
                      
                      let highlightStyle = '';
                      if (isSelected) {
                        highlightStyle = 'bg-blue-500/30 ring-2 ring-blue-500 ring-inset';
                      } else if (isPossible) {
                        highlightStyle = 'bg-blue-400/20';
                      }
                      
                      return (
                        <div 
                          className={`relative w-full h-full flex items-center justify-center cursor-pointer ${highlightStyle}`}
                        >
                          {children}
                          {isPossible && (
                            <div className={`absolute rounded-full ${
                              piece ? 'w-5/6 h-5/6 border-[4px] border-blue-400/60' : 'w-3 h-3 bg-blue-400/60'
                            }`} />
                          )}
                        </div>
                      );
                    }
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
                      🔄 {language === 'ko' ? '다른 체슬 풀기' : 'Solve Another Chessle'}
                    </button>
                    <button 
                      onClick={() => {
                        const hash = chesslePuzzle.hashid;
                        setChesslePuzzle(null);
                        loadGameByHashid(hash);
                      }}
                      className="bg-slate-800 hover:bg-slate-750 text-white font-bold py-3 rounded-2xl text-xs transition-all cursor-pointer shadow-md"
                    >
                      🔍 {language === 'ko' ? '전체 경기 보러가기' : 'View Full Game'}
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

        {/* BOTTOM NAVIGATION BAR */}
        {view !== 'LOADING' && (
          <nav className={`h-14 border-t flex items-center justify-around shrink-0 z-40 select-none ${
            darkMode === 'dark' 
              ? 'bg-stone-900 border-stone-850 text-slate-400' 
              : 'bg-white border-stone-200 text-slate-500'
          }`}>
            <button 
              onClick={() => { setActiveTab('home'); }}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative cursor-pointer ${
                activeTab === 'home' ? 'text-blue-500 font-extrabold' : 'hover:text-slate-800'
              }`}
            >
              <HomeIcon size={18} />
              <span className="text-[9px] mt-1 font-bold">{language === 'ko' ? '홈' : 'Home'}</span>
            </button>
            
            <button 
              onClick={() => { setActiveTab('review'); setView('INPUT'); }}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative cursor-pointer ${
                activeTab === 'review' ? 'text-blue-500 font-extrabold' : 'hover:text-slate-800'
              }`}
            >
              <Play size={18} fill={activeTab === 'review' ? 'currentColor' : 'none'} />
              <span className="text-[9px] mt-1 font-bold">{language === 'ko' ? '리뷰' : 'Review'}</span>
            </button>
            
            <button 
              onClick={() => { setActiveTab('analyze'); }}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative cursor-pointer ${
                activeTab === 'analyze' ? 'text-blue-500 font-extrabold' : 'hover:text-slate-800'
              }`}
            >
              <GitBranch size={18} />
              <span className="text-[9px] mt-1 font-bold">{language === 'ko' ? '분석' : 'Analyze'}</span>
            </button>
            
            <button 
              onClick={() => { setActiveTab('chessle'); setChesslePuzzle(null); }}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative cursor-pointer ${
                activeTab === 'chessle' ? 'text-blue-500 font-extrabold' : 'hover:text-slate-800'
              }`}
            >
              <Award size={18} />
              <span className="text-[9px] mt-1 font-bold">{language === 'ko' ? '체슬' : 'Chessle'}</span>
            </button>
            
            <button 
              onClick={() => { setActiveTab('more'); setMoreSubView('menu'); }}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative cursor-pointer ${
                activeTab === 'more' ? 'text-blue-500 font-extrabold' : 'hover:text-slate-850 text-slate-500'
              }`}
            >
              <Menu size={18} />
              <span className="text-[9px] mt-1 font-bold">{language === 'ko' ? '더보기' : 'More'}</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
