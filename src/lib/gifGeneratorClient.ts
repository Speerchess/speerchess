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
  'Inaccuracy': '!?',
  'Mistake': '?',
  'Blunder': '??'
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
  analysis: GameAnalysis,
  options?: {
    darkColor?: string;
    lightColor?: string;
    onProgress?: (p: number) => void;
    orientation?: 'white' | 'black';
  }
): Promise<Blob> {
  const images = await loadPieces();
  const logoImage = await loadLogo();
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  
  const replayChess = new Chess();
  
  const gif = new GIFEncoder();
  
  // We use a temporary canvas to draw the frames
  const canvas = document.createElement('canvas');
  canvas.width = BOARD_SIZE;
  canvas.height = BOARD_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get 2d context");

  const addFrameToGif = (delay: number) => {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, canvas.width, canvas.height, { palette, delay });
  };

  const drawBoard = (currentChess: Chess, moveAnalysis?: MoveAnalysis, lastMove?: {from: string, to: string}) => {
    const isFlipped = options?.orientation === 'black';

    // Draw squares
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        ctx.fillStyle = isLight ? (options?.lightColor || LIGHT_COLOR) : (options?.darkColor || DARK_COLOR);
        
        const canvasR = isFlipped ? 7 - r : r;
        const canvasC = isFlipped ? 7 - c : c;
        
        ctx.fillRect(canvasC * SQUARE_SIZE, canvasR * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
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
      ctx.fillRect(canvasFromFile * SQUARE_SIZE, canvasFromR * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
      ctx.fillRect(canvasToFile * SQUARE_SIZE, canvasToR * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
    }

    // Draw watermark
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('speerchess.xyz', BOARD_SIZE / 2, BOARD_SIZE / 2);

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
            ctx.drawImage(images[imgKey], canvasC * SQUARE_SIZE, canvasR * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
          }
        }
      }
    }

    // Draw annotation if exists
    if (moveAnalysis && lastMove) {
      const toRank = 8 - parseInt(lastMove.to[1], 10);
      const toFile = lastMove.to.charCodeAt(0) - 97;
      
      const canvasToR = isFlipped ? 7 - toRank : toRank;
      const canvasToFile = isFlipped ? 7 - toFile : toFile;
      
      const symbol = classificationSymbols[moveAnalysis.classification];
      const color = classificationColors[moveAnalysis.classification];
      
      if (symbol && color) {
        const badgeX = canvasToFile * SQUARE_SIZE + SQUARE_SIZE - 18;
        const badgeY = canvasToR * SQUARE_SIZE + 4;
        
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
        // Adjust for emojis
        const yOffset = symbol.length > 2 ? 12 : 11;
        ctx.fillText(symbol, badgeX + 10, badgeY + yOffset);
      }
    }
  };

  // Draw initial position
  drawBoard(replayChess);
  addFrameToGif(1000);

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    replayChess.move(move);
    
    const moveAnalysis = analysis.moves[i];
    
    let delay = 1000;
    if (moveAnalysis && (moveAnalysis.classification === 'Brilliant' || moveAnalysis.classification === 'Blunder')) {
      delay = 2000;
    }
    
    drawBoard(replayChess, moveAnalysis, { from: move.from, to: move.to });
    addFrameToGif(delay);
    
    if (options?.onProgress) options.onProgress(((i + 1) / history.length) * 100);
  }

  addFrameToGif(1500); // Hold final position for 1.5 seconds
  
  // Draw outro logo frame
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  
  if (logoImage) {
    const logoSize = 360;
    const logoX = (BOARD_SIZE - logoSize) / 2;
    const logoY = (BOARD_SIZE - logoSize) / 2;
    ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
  }
  addFrameToGif(3000); // Hold outro logo for 3 seconds
  
  gif.finish();
  const buffer = gif.bytes();
  return new Blob([buffer as any], { type: 'image/gif' });
}
