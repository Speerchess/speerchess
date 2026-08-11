import { Chess } from 'chess.js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { GameAnalysis, MoveAnalysis } from './analyzer';

const SQUARE_SIZE = 60;
const BOARD_SIZE = SQUARE_SIZE * 8;
const LIGHT_COLOR = '#e2e8f0';
const DARK_COLOR = '#475569';

const pieceMap: Record<string, string> = {
  'p': 'bp', 'n': 'bn', 'b': 'bb', 'r': 'br', 'q': 'bq', 'k': 'bk',
  'P': 'wp', 'N': 'wn', 'B': 'wb', 'R': 'wr', 'Q': 'wq', 'K': 'wk'
};

const classificationColors: Record<string, string> = {
  'Brilliant': '#1baca6',
  'Great': '#5c8bb0',
  'Best': '#81b64c',
  'Excellent': '#96bc4b',
  'Good': '#96bc4b',
  'Inaccuracy': '#f4da59',
  'Mistake': '#e58f2a',
  'Blunder': '#ca3431',
  'Book': '#a88865',
  'Forced': '#5c8bb0'
};

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

let loadedImages: Record<string, HTMLImageElement> | null = null;

async function loadPieces() {
  if (loadedImages) return loadedImages;
  const images: Record<string, HTMLImageElement> = {};
  const pieces = ['wp', 'wn', 'wb', 'wr', 'wq', 'wk', 'bp', 'bn', 'bb', 'br', 'bq', 'bk'];
  
  const promises = pieces.map(p => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.src = `/pieces/${p}.png`;
      img.onload = () => {
        images[p] = img;
        resolve();
      };
      img.onerror = reject;
    });
  });
  
  await Promise.all(promises);
  loadedImages = images;
  return images;
}

let loadedLogoImage: HTMLImageElement | null = null;

async function loadLogo(): Promise<HTMLImageElement | null> {
  if (loadedLogoImage) return loadedLogoImage;
  return new Promise((resolve) => {
    const img = new Image();
    img.src = '/logo.png';
    img.onload = () => {
      loadedLogoImage = img;
      resolve(img);
    };
    img.onerror = () => {
      console.warn("Could not load logo image");
      resolve(null);
    };
  });
}

export async function generateGifClient(
  pgn: string,
  analysis?: GameAnalysis | null,
  options?: {
    darkColor?: string;
    lightColor?: string;
    onProgress?: (p: number) => void;
    orientation?: 'white' | 'black';
    annotationMode?: 'all' | 'standard' | 'none';
    showPlayerNames?: boolean;
  }
): Promise<Blob> {
  const images = await loadPieces();
  const logoImage = await loadLogo();
  
  const chessForHeaders = new Chess();
  try {
    chessForHeaders.loadPgn(pgn);
  } catch (err) {
    // Fail-safe
  }
  const headers = chessForHeaders.header();
  const whiteName = headers.White || 'White';
  const blackName = headers.Black || 'Black';
  const whiteElo = headers.WhiteElo ? `(${headers.WhiteElo})` : '';
  const blackElo = headers.BlackElo ? `(${headers.BlackElo})` : '';

  const replayChess = new Chess();
  const history = chessForHeaders.history({ verbose: true });
  
  const gif = new GIFEncoder();
  
  const showNames = !!options?.showPlayerNames;
  const boardOffsetY = showNames ? 35 : 0;

  const canvas = document.createElement('canvas');
  canvas.width = BOARD_SIZE;
  canvas.height = BOARD_SIZE + (showNames ? 70 : 0);
  
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get 2d context");

  const addFrameToGif = (delay: number) => {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, canvas.width, canvas.height, { palette, delay });
  };

  const drawBoard = (currentChess: Chess, moveAnalysis?: MoveAnalysis, lastMove?: {from: string, to: string}, drawWatermark: boolean = false) => {
    const isFlipped = options?.orientation === 'black';

    // Clear background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw squares
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        ctx.fillStyle = isLight ? (options?.lightColor || LIGHT_COLOR) : (options?.darkColor || DARK_COLOR);
        
        const canvasR = isFlipped ? 7 - r : r;
        const canvasC = isFlipped ? 7 - c : c;
        
        ctx.fillRect(canvasC * SQUARE_SIZE, boardOffsetY + canvasR * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
      }
    }

    // Highlight last move
    if (lastMove) {
      const fromRank = 8 - parseInt(lastMove.from[1], 10);
      const fromFile = lastMove.from.charCodeAt(0) - 97;
      const toRank = 8 - parseInt(lastMove.to[1], 10);
      const toFile = lastMove.to.charCodeAt(0) - 97;
      
      const canvasFromR = isFlipped ? 7 - fromRank : fromRank;
      const canvasFromFile = isFlipped ? 7 - fromFile : fromFile;
      const canvasToR = isFlipped ? 7 - toRank : toRank;
      const canvasToFile = isFlipped ? 7 - toFile : toFile;
      
      ctx.fillStyle = 'rgba(255, 255, 51, 0.5)';
      ctx.fillRect(canvasFromFile * SQUARE_SIZE, boardOffsetY + canvasFromR * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
      ctx.fillRect(canvasToFile * SQUARE_SIZE, boardOffsetY + canvasToR * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
    }

    // Draw watermark
    if (drawWatermark) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('speerchess.xyz', BOARD_SIZE / 2, boardOffsetY + BOARD_SIZE / 2);
    }

    // Draw pieces
    const board = currentChess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          const key = (piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase());
          const imgKey = pieceMap[key];
          if (imgKey && images[imgKey]) {
            const canvasR = isFlipped ? 7 - r : r;
            const canvasC = isFlipped ? 7 - c : c;
            ctx.drawImage(images[imgKey], canvasC * SQUARE_SIZE, boardOffsetY + canvasR * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
          }
        }
      }
    }

    // Draw player names
    if (showNames) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, BOARD_SIZE, 35);
      ctx.fillRect(0, BOARD_SIZE + 35, BOARD_SIZE, 35);

      const topText = isFlipped ? `${whiteName} ${whiteElo}` : `${blackName} ${blackElo}`;
      const bottomText = isFlipped ? `${blackName} ${blackElo}` : `${whiteName} ${whiteElo}`;

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      
      // Top Name
      ctx.fillText(topText, 12, 17.5);
      
      // Bottom Name
      ctx.fillText(bottomText, 12, BOARD_SIZE + 35 + 17.5);
    }

    // Draw annotation if exists
    if (moveAnalysis && lastMove && options?.annotationMode !== 'none') {
      const mode = options?.annotationMode || 'standard';
      const cl = moveAnalysis.classification;
      const isStandardClass = ['Brilliant', 'Great', 'Inaccuracy', 'Mistake', 'Blunder'].includes(cl);

      if (mode === 'all' || (mode === 'standard' && isStandardClass)) {
        const toRank = 8 - parseInt(lastMove.to[1], 10);
        const toFile = lastMove.to.charCodeAt(0) - 97;
        
        const canvasToR = isFlipped ? 7 - toRank : toRank;
        const canvasToFile = isFlipped ? 7 - toFile : toFile;
        
        const symbol = classificationSymbols[cl];
        const color = classificationColors[cl];
        
        if (symbol && color) {
          const badgeX = canvasToFile * SQUARE_SIZE + SQUARE_SIZE - 18;
          const badgeY = boardOffsetY + canvasToR * SQUARE_SIZE + 4;
          
          ctx.beginPath();
          ctx.arc(badgeX + 10, badgeY + 10, 14, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const isEmoji = symbol === '🔒';
          const yOffset = isEmoji ? 13 : (symbol.length > 2 ? 12 : 11);
          ctx.fillText(symbol, badgeX + 10, badgeY + yOffset);
        }
      }
    }
  };

  // Draw initial position
  drawBoard(replayChess, undefined, undefined, true);
  addFrameToGif(1000);

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    replayChess.move(move);
    
    const moveAnalysis = analysis?.moves ? analysis.moves[i] : undefined;
    
    let delay = 1000;
    if (moveAnalysis && (moveAnalysis.classification === 'Brilliant' || moveAnalysis.classification === 'Blunder')) {
      delay = 2000;
    }
    
    drawBoard(replayChess, moveAnalysis, { from: move.from, to: move.to });
    addFrameToGif(delay);
    
    if (options?.onProgress) options.onProgress(((i + 1) / history.length) * 100);
  }

  addFrameToGif(1500); // Hold final position for 1.5 seconds
  
  // Draw outro logo frame (covering entire canvas height)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, BOARD_SIZE, canvas.height);
  
  if (logoImage) {
    const logoSize = 360;
    const logoX = (BOARD_SIZE - logoSize) / 2;
    const logoY = (canvas.height - logoSize) / 2;
    ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
  }
  addFrameToGif(2000); // Hold outro logo for 2 seconds
  
  gif.finish();
  const buffer = gif.bytes();
  return new Blob([buffer as any], { type: 'image/gif' });
}
