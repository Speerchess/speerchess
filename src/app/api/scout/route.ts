import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

interface ScoutGame {
  white: { username: string; rating?: number; result?: string };
  black: { username: string; rating?: number; result?: string };
  pgn: string;
  timeControl?: string;
  date?: string;
  result?: string;
  isWin: boolean;
  isLoss: boolean;
  isDraw: boolean;
  playerColor: 'white' | 'black';
  openingName?: string;
  firstMoves?: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username')?.trim();
    const platform = searchParams.get('platform') || 'chesscom';
    const speed = searchParams.get('speed') || 'rapid'; // rapid | blitz | bullet | all
    const count = parseInt(searchParams.get('count') || '20', 10);

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const games: ScoutGame[] = [];
    let opponentRating: number | null = null;
    let avatarUrl: string | null = null;

    if (platform === 'chesscom') {
      // 1. Get Chess.com Profile & Avatar
      try {
        const profileRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`, {
          headers: { 'User-Agent': 'Speerchess/2.0 (contact@speerchess.com)' }
        });
        if (profileRes.ok) {
          const pData = await profileRes.json();
          avatarUrl = pData.avatar || null;
        }

        const statsRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`, {
          headers: { 'User-Agent': 'Speerchess/2.0 (contact@speerchess.com)' }
        });
        if (statsRes.ok) {
          const sData = await statsRes.json();
          if (speed === 'blitz') opponentRating = sData.chess_blitz?.last?.rating || null;
          else if (speed === 'rapid') opponentRating = sData.chess_rapid?.last?.rating || null;
          else if (speed === 'bullet') opponentRating = sData.chess_bullet?.last?.rating || null;
          else opponentRating = sData.chess_rapid?.last?.rating || sData.chess_blitz?.last?.rating || null;
        }
      } catch (e) {}

      // 2. Get Archives
      const archivesRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`, {
        headers: { 'User-Agent': 'Speerchess/2.0 (contact@speerchess.com)' }
      });
      if (!archivesRes.ok) {
        return NextResponse.json({ error: 'USER_NOT_FOUND', message: 'Chess.com 사용자를 찾을 수 없습니다.' }, { status: 404 });
      }
      const archivesData = await archivesRes.json();
      const archives: string[] = archivesData.archives || [];

      // Fetch recent 2-3 months archives backwards
      const recentArchives = archives.slice(-3).reverse();
      const targetCount = Math.min(count, 30);

      for (const archiveUrl of recentArchives) {
        if (games.length >= targetCount) break;
        try {
          const mRes = await fetch(archiveUrl, {
            headers: { 'User-Agent': 'Speerchess/2.0 (contact@speerchess.com)' }
          });
          if (!mRes.ok) continue;
          const mData = await mRes.json();
          const rawGames = (mData.games || []).reverse();

          for (const g of rawGames) {
            if (games.length >= targetCount) break;
            const timeClass = g.time_class?.toLowerCase();
            if (speed !== 'all' && timeClass !== speed) continue;

            const isWhite = g.white.username.toLowerCase() === username.toLowerCase();
            const playerObj = isWhite ? g.white : g.black;

            const isWin = playerObj.result === 'win';
            const isLoss = ['checkmated', 'timeout', 'resigned', 'abandoned'].includes(playerObj.result);
            const isDraw = !isWin && !isLoss;

            // Extract ECO or Opening from PGN
            let openingName = 'Standard Game';
            let firstMoves = '';
            if (g.pgn) {
              const ecoUrlMatch = g.pgn.match(/\[ECOUrl\s+"([^"]+)"\]/);
              if (ecoUrlMatch) {
                const parts = ecoUrlMatch[1].split('/');
                openingName = decodeURIComponent(parts[parts.length - 1] || 'Unknown').replace(/-/g, ' ');
              }
              const pgnBody = g.pgn.replace(/\[[^\]]+\]/g, '').trim();
              const moveMatch = pgnBody.match(/1\.\s*([^\s]+)\s*([^\s]+)?(?:\s*2\.\s*([^\s]+)\s*([^\s]+)?)?/);
              if (moveMatch) {
                firstMoves = `${moveMatch[1] || ''} ${moveMatch[2] || ''} ${moveMatch[3] || ''}`.trim();
              }
            }

            games.push({
              white: { username: g.white.username, rating: g.white.rating, result: g.white.result },
              black: { username: g.black.username, rating: g.black.rating, result: g.black.result },
              pgn: g.pgn || '',
              timeControl: g.time_control || timeClass,
              isWin,
              isLoss,
              isDraw,
              playerColor: isWhite ? 'white' : 'black',
              openingName,
              firstMoves
            });
          }
        } catch (e) {}
      }
    } else {
      // Lichess Scouting
      try {
        const userRes = await fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`);
        if (!userRes.ok) {
          return NextResponse.json({ error: 'USER_NOT_FOUND', message: 'Lichess 사용자를 찾을 수 없습니다.' }, { status: 404 });
        }
        const uData = await userRes.json();
        if (speed === 'blitz') opponentRating = uData.perfs?.blitz?.rating || null;
        else if (speed === 'rapid') opponentRating = uData.perfs?.rapid?.rating || null;
        else if (speed === 'bullet') opponentRating = uData.perfs?.bullet?.rating || null;
        else opponentRating = uData.perfs?.rapid?.rating || uData.perfs?.blitz?.rating || null;

        const perfType = speed === 'all' ? '' : `&perfType=${speed}`;
        const gamesRes = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${Math.min(count, 30)}&pgnInJson=true&opening=true${perfType}`, {
          headers: { 'Accept': 'application/x-ndjson' }
        });
        if (gamesRes.ok) {
          const text = await gamesRes.text();
          const lines = text.trim().split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const g = JSON.parse(line);
              const isWhite = g.players?.white?.user?.name?.toLowerCase() === username.toLowerCase();
              const winner = g.winner;
              const isWin = (isWhite && winner === 'white') || (!isWhite && winner === 'black');
              const isLoss = (isWhite && winner === 'black') || (!isWhite && winner === 'white');
              const isDraw = g.status === 'draw' || g.status === 'stalemate';

              games.push({
                white: { username: g.players?.white?.user?.name || 'White', rating: g.players?.white?.rating },
                black: { username: g.players?.black?.user?.name || 'Black', rating: g.players?.black?.rating },
                pgn: g.pgn || '',
                timeControl: g.speed,
                isWin,
                isLoss,
                isDraw,
                playerColor: isWhite ? 'white' : 'black',
                openingName: g.opening?.name || 'Standard Game',
                firstMoves: g.moves?.split(' ').slice(0, 4).join(' ') || ''
              });
            } catch (e) {}
          }
        }
      } catch (e) {}
    }

    if (games.length === 0) {
      return NextResponse.json({ error: 'NO_GAMES', message: '선택한 조건의 최근 대국 기록이 없습니다.' }, { status: 404 });
    }

    // Process & Analyze 20 Games
    const total = games.length;
    const wins = games.filter(g => g.isWin).length;
    const draws = games.filter(g => g.isDraw).length;
    const losses = games.filter(g => g.isLoss).length;
    const winRate = Math.round((wins / total) * 100);

    // White vs Black performance
    const whiteGames = games.filter(g => g.playerColor === 'white');
    const blackGames = games.filter(g => g.playerColor === 'black');

    const whiteWins = whiteGames.filter(g => g.isWin).length;
    const whiteLosses = whiteGames.filter(g => g.isLoss).length;
    const whiteWinRate = whiteGames.length > 0 ? Math.round((whiteWins / whiteGames.length) * 100) : 0;

    const blackWins = blackGames.filter(g => g.isWin).length;
    const blackLosses = blackGames.filter(g => g.isLoss).length;
    const blackWinRate = blackGames.length > 0 ? Math.round((blackWins / blackGames.length) * 100) : 0;

    // Aggregate Openings for White
    const whiteOpeningsMap: Record<string, { count: number; wins: number; losses: number }> = {};
    for (const g of whiteGames) {
      const name = g.openingName || 'General Opening';
      if (!whiteOpeningsMap[name]) whiteOpeningsMap[name] = { count: 0, wins: 0, losses: 0 };
      whiteOpeningsMap[name].count++;
      if (g.isWin) whiteOpeningsMap[name].wins++;
      if (g.isLoss) whiteOpeningsMap[name].losses++;
    }
    const whiteOpenings = Object.entries(whiteOpeningsMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        winRate: Math.round((data.wins / data.count) * 100)
      }))
      .sort((a, b) => b.count - a.count);

    // Aggregate Openings for Black
    const blackOpeningsMap: Record<string, { count: number; wins: number; losses: number }> = {};
    for (const g of blackGames) {
      const name = g.openingName || 'General Defense';
      if (!blackOpeningsMap[name]) blackOpeningsMap[name] = { count: 0, wins: 0, losses: 0 };
      blackOpeningsMap[name].count++;
      if (g.isWin) blackOpeningsMap[name].wins++;
      if (g.isLoss) blackOpeningsMap[name].losses++;
    }
    const blackOpenings = Object.entries(blackOpeningsMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        winRate: Math.round((data.wins / data.count) * 100)
      }))
      .sort((a, b) => b.count - a.count);

    // Tactical & Weakness Analysis
    const weakestBlackOpening = blackOpenings.find(o => o.count >= 2 && o.winRate < 45) || blackOpenings[blackOpenings.length - 1];
    const favoriteWhiteOpening = whiteOpenings[0];

    // Generate Strategic Advice
    const adviceList: string[] = [];
    if (whiteWinRate > blackWinRate + 15) {
      adviceList.push(`상대는 백을 잡았을 때 승률(${whiteWinRate}%)이 흑(${blackWinRate}%)보다 현저히 높습니다. 상대가 흑일 때 적극적인 초반 압박을 시도하세요.`);
    } else if (blackWinRate > whiteWinRate + 15) {
      adviceList.push(`상대는 흑 수비 승률(${blackWinRate}%)이 매우 뛰어난 카운터 어택형 플레이어입니다. 무리한 공격을 자제하고 안정적으로 전개하세요.`);
    }

    if (favoriteWhiteOpening) {
      adviceList.push(`상대가 백일 때는 주로 '${favoriteWhiteOpening.name}'(승률 ${favoriteWhiteOpening.winRate}%)을 선호합니다. 이에 맞춘 전용 오프닝 준비가 유효합니다.`);
    }

    if (weakestBlackOpening && weakestBlackOpening.winRate < 45) {
      adviceList.push(`상대가 흑일 때 '${weakestBlackOpening.name}'에서의 승률이 ${weakestBlackOpening.winRate}%로 매우 취약합니다. 이 라인으로 유도하세요!`);
    } else {
      adviceList.push(`초반 기물 전개 속도와 시간 관리에 신경 쓰고, 복잡한 전술 포지션으로 유도하여 상대의 실수를 유도하세요.`);
    }

    return NextResponse.json({
      username,
      platform,
      speed,
      rating: opponentRating,
      avatarUrl,
      sampleSize: total,
      record: { wins, draws, losses, winRate },
      whiteStats: { gamesCount: whiteGames.length, winRate: whiteWinRate, openings: whiteOpenings.slice(0, 3) },
      blackStats: { gamesCount: blackGames.length, winRate: blackWinRate, openings: blackOpenings.slice(0, 3) },
      strategicAdvice: adviceList,
      recentGames: games.slice(0, 10).map(g => ({
        white: g.white.username,
        black: g.black.username,
        result: g.isWin ? 'WIN' : (g.isLoss ? 'LOSS' : 'DRAW'),
        opening: g.openingName,
        playerColor: g.playerColor
      }))
    });
  } catch (error: any) {
    console.error('Scouting error:', error);
    return NextResponse.json({ error: 'SERVER_ERROR', message: error.message }, { status: 500 });
  }
}
