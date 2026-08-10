import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export interface UserGameItem {
  id: string;
  platform: 'lichess' | 'chesscom';
  url: string;
  pgn: string;
  timeClass: 'bullet' | 'blitz' | 'rapid' | 'daily' | 'classical';
  timeControl: string;
  date: string;
  white: {
    username: string;
    rating: number;
    result: string;
    avatar?: string;
  };
  black: {
    username: string;
    rating: number;
    result: string;
    avatar?: string;
  };
  userColor: 'white' | 'black';
  userResult: 'win' | 'loss' | 'draw';
  userRatingDiff?: number;
  opening?: string;
  movesCount?: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform') || 'lichess';
    const username = searchParams.get('username')?.trim();
    const max = parseInt(searchParams.get('max') || '25', 10);

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    if (platform === 'lichess') {
      return await fetchLichessGames(username, max);
    } else if (platform === 'chesscom') {
      return await fetchChessComGames(username, max);
    } else {
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Failed to fetch user games:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

async function fetchLichessGames(username: string, max: number) {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&moves=true&pgnInJson=true&opening=true&clocks=false&evals=false`;
  
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/x-ndjson',
      'User-Agent': 'Speerchess/1.0 (https://speerchess.com)'
    }
  });

  if (!res.ok) {
    if (res.status === 404) {
      return NextResponse.json({ error: 'Lichess user not found' }, { status: 404 });
    }
    return NextResponse.json({ error: `Lichess API error: ${res.statusText}` }, { status: res.status });
  }

  const text = await res.text();
  const lines = text.trim().split('\n').filter(Boolean);
  const games: UserGameItem[] = [];

  const lowerUser = username.toLowerCase();

  for (const line of lines) {
    try {
      const g = JSON.parse(line);
      const isWhite = (g.players?.white?.user?.name || g.players?.white?.name || '').toLowerCase() === lowerUser;
      const userColor: 'white' | 'black' = isWhite ? 'white' : 'black';

      let userResult: 'win' | 'loss' | 'draw' = 'draw';
      if (g.winner === 'white') {
        userResult = isWhite ? 'win' : 'loss';
      } else if (g.winner === 'black') {
        userResult = !isWhite ? 'win' : 'loss';
      } else {
        userResult = 'draw';
      }

      let timeClass: UserGameItem['timeClass'] = 'rapid';
      const speed = g.speed || '';
      if (speed === 'bullet' || speed === 'ultraBullet') timeClass = 'bullet';
      else if (speed === 'blitz') timeClass = 'blitz';
      else if (speed === 'rapid') timeClass = 'rapid';
      else if (speed === 'classical') timeClass = 'classical';
      else if (speed === 'correspondence') timeClass = 'daily';

      let timeControl = '';
      if (g.clock) {
        const initMins = Math.floor(g.clock.initial / 60);
        timeControl = g.clock.increment ? `${initMins}+${g.clock.increment}` : `${initMins}:00`;
      } else if (g.daysPerTurn) {
        timeControl = `${g.daysPerTurn}d`;
      }

      const whiteName = g.players?.white?.user?.name || g.players?.white?.name || 'Anonymous';
      const blackName = g.players?.black?.user?.name || g.players?.black?.name || 'Anonymous';
      const whiteRating = g.players?.white?.rating || 1500;
      const blackRating = g.players?.black?.rating || 1500;
      const userRatingDiff = isWhite ? g.players?.white?.ratingDiff : g.players?.black?.ratingDiff;

      // Extract or build PGN
      let pgnText = g.pgn || '';
      if (!pgnText && g.moves) {
        pgnText = `[Event "Lichess Game"]\n[Site "https://lichess.org/${g.id}"]\n[White "${whiteName}"]\n[Black "${blackName}"]\n[WhiteElo "${whiteRating}"]\n[BlackElo "${blackRating}"]\n[Result "${g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2'}"]\n\n${g.moves}`;
      }

      games.push({
        id: `lichess_${g.id}`,
        platform: 'lichess',
        url: `https://lichess.org/${g.id}`,
        pgn: pgnText,
        timeClass,
        timeControl,
        date: new Date(g.createdAt || Date.now()).toISOString(),
        white: {
          username: whiteName,
          rating: whiteRating,
          result: g.winner === 'white' ? 'win' : g.winner === 'black' ? 'loss' : 'draw'
        },
        black: {
          username: blackName,
          rating: blackRating,
          result: g.winner === 'black' ? 'win' : g.winner === 'white' ? 'loss' : 'draw'
        },
        userColor,
        userResult,
        userRatingDiff,
        opening: g.opening?.name || undefined,
        movesCount: g.moves ? g.moves.split(' ').length : undefined
      });
    } catch (e) {
      console.warn('Failed to parse NDJSON line:', e);
    }
  }

  return NextResponse.json({
    platform: 'lichess',
    username,
    count: games.length,
    games
  });
}

async function fetchChessComGames(username: string, max: number) {
  const archivesUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`;
  
  const archivesRes = await fetch(archivesUrl, {
    headers: {
      'User-Agent': 'Speerchess/1.0 (contact@speerchess.com)'
    }
  });

  if (!archivesRes.ok) {
    if (archivesRes.status === 404) {
      return NextResponse.json({ error: 'Chess.com user not found' }, { status: 404 });
    }
    return NextResponse.json({ error: `Chess.com API error: ${archivesRes.statusText}` }, { status: archivesRes.status });
  }

  const archivesData = await archivesRes.json();
  const archives: string[] = archivesData.archives || [];

  if (archives.length === 0) {
    return NextResponse.json({
      platform: 'chesscom',
      username,
      count: 0,
      games: []
    });
  }

  // Fetch games from the latest archive (and previous month if needed to fill max)
  const games: UserGameItem[] = [];
  const lowerUser = username.toLowerCase();

  for (let i = archives.length - 1; i >= 0 && games.length < max; i--) {
    const monthUrl = archives[i];
    try {
      const monthRes = await fetch(monthUrl, {
        headers: {
          'User-Agent': 'Speerchess/1.0 (contact@speerchess.com)'
        }
      });
      if (!monthRes.ok) continue;
      const monthData = await monthRes.json();
      const rawGames: any[] = (monthData.games || []).reverse();

      for (const g of rawGames) {
        if (games.length >= max) break;
        const isWhite = (g.white?.username || '').toLowerCase() === lowerUser;
        const userColor: 'white' | 'black' = isWhite ? 'white' : 'black';

        const whiteResult = g.white?.result || '';
        const blackResult = g.black?.result || '';
        
        let userResult: 'win' | 'loss' | 'draw' = 'draw';
        const userResultStr = isWhite ? whiteResult : blackResult;
        if (userResultStr === 'win') {
          userResult = 'win';
        } else if (['checkmated', 'timeout', 'resigned', 'abandoned', 'lose'].includes(userResultStr)) {
          userResult = 'loss';
        } else {
          userResult = 'draw';
        }

        let timeClass: UserGameItem['timeClass'] = 'rapid';
        if (g.time_class === 'bullet') timeClass = 'bullet';
        else if (g.time_class === 'blitz') timeClass = 'blitz';
        else if (g.time_class === 'rapid') timeClass = 'rapid';
        else if (g.time_class === 'daily') timeClass = 'daily';

        let timeControl = '';
        if (g.time_control) {
          if (g.time_control.includes('/')) {
            timeControl = 'Daily';
          } else if (g.time_control.includes('+')) {
            const [base, inc] = g.time_control.split('+');
            timeControl = `${Math.floor(parseInt(base, 10)/60)}+${inc}`;
          } else {
            const secs = parseInt(g.time_control, 10);
            if (!isNaN(secs)) {
              timeControl = `${Math.floor(secs / 60)}:00`;
            } else {
              timeControl = g.time_control;
            }
          }
        }

        const gameId = g.url ? g.url.split('/').pop() || String(g.end_time) : String(g.end_time);

        games.push({
          id: `chesscom_${gameId}`,
          platform: 'chesscom',
          url: g.url || '',
          pgn: g.pgn || '',
          timeClass,
          timeControl,
          date: new Date(g.end_time ? g.end_time * 1000 : Date.now()).toISOString(),
          white: {
            username: g.white?.username || 'White',
            rating: g.white?.rating || 1500,
            result: g.white?.result || ''
          },
          black: {
            username: g.black?.username || 'Black',
            rating: g.black?.rating || 1500,
            result: g.black?.result || ''
          },
          userColor,
          userResult,
          opening: undefined
        });
      }
    } catch (e) {
      console.warn('Failed to fetch monthly archive:', e);
    }
  }

  return NextResponse.json({
    platform: 'chesscom',
    username,
    count: games.length,
    games
  });
}
