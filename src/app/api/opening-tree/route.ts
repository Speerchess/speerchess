import { NextRequest, NextResponse } from 'next/server';
import { getLinkedAccounts, getUserVipStatus, saveOpeningTree, getOpeningTreeRecord } from '../../../lib/db';
import { buildOpeningTreeFromGames, queryOpeningTree, GameInputForTree } from '../../../lib/openingTree';

export const runtime = 'edge';

function getSessionUserId(request: NextRequest): string | null {
  const rawCookie = request.cookies.get('speerchess_session')?.value;
  if (!rawCookie) return null;
  try {
    if (rawCookie.startsWith('{')) {
      return JSON.parse(rawCookie).id;
    } else {
      return JSON.parse(decodeURIComponent(atob(rawCookie))).id;
    }
  } catch (e) {
    return rawCookie;
  }
}

// GET /api/opening-tree - Query opening tree for a specific FEN and color
export async function GET(request: NextRequest) {
  try {
    const sessionUserId = getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fen = searchParams.get('fen') || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const color = (searchParams.get('color') || 'all') as 'white' | 'black' | 'all';

    const record = await getOpeningTreeRecord(sessionUserId);
    if (!record || !record.tree_json) {
      return NextResponse.json({
        synced: false,
        total: 0,
        white: 0,
        draws: 0,
        black: 0,
        moves: [],
        message: '오프닝 트리가 아직 생성되지 않았습니다. 계정에서 전적을 동기화하세요.'
      });
    }

    const tree = JSON.parse(record.tree_json);
    const queryResult = queryOpeningTree(tree, fen, color);

    return NextResponse.json({
      synced: true,
      total: queryResult.total,
      white: queryResult.white,
      draws: queryResult.draws,
      black: queryResult.black,
      moves: queryResult.moves,
      totalGamesIndexed: record.total_games,
      maxPly: record.max_ply,
      isVip: record.is_vip,
      updatedAt: record.updated_at
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/opening-tree - Ingest up to 1,000 (or VIP 5,000) games and build Opening Tree
export async function POST(request: NextRequest) {
  try {
    const sessionUserId = getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const isVip = await getUserVipStatus(sessionUserId);
    const maxGames = isVip ? 5000 : 1000;
    const maxPly = isVip ? 60 : 30; // 30 full moves for VIP, 15 for regular

    // 1. Fetch user's linked accounts
    let accounts = await getLinkedAccounts(sessionUserId);
    if (!accounts || accounts.length === 0) {
      accounts = [
        {
          user_id: sessionUserId,
          platform: 'lichess',
          platform_username: sessionUserId,
          is_primary: true
        }
      ];
    }

    const gamesPerAccount = Math.ceil(maxGames / accounts.length);
    const allFetchedGames: GameInputForTree[] = [];

    // 2. Fetch games from all connected accounts
    for (const acc of accounts) {
      try {
        if (acc.platform === 'lichess') {
          const lichessGames = await fetchLichessGamesForTree(acc.platform_username, gamesPerAccount);
          allFetchedGames.push(...lichessGames);
        } else if (acc.platform === 'chesscom') {
          const chesscomGames = await fetchChessComGamesForTree(acc.platform_username, gamesPerAccount);
          allFetchedGames.push(...chesscomGames);
        }
      } catch (err) {
        console.error(`Failed fetching games for account ${acc.platform}:${acc.platform_username}`, err);
      }
    }

    if (allFetchedGames.length === 0) {
      return NextResponse.json({ error: '불러올 수 있는 대국 기록이 없습니다.' }, { status: 404 });
    }

    // 3. Compile compact Opening Tree
    const tree = buildOpeningTreeFromGames(allFetchedGames, maxPly);

    // 4. Save to Cloudflare D1 Database
    await saveOpeningTree(sessionUserId, isVip, maxPly, tree.totalGames, JSON.stringify(tree));

    return NextResponse.json({
      success: true,
      message: `성공적으로 ${tree.totalGames}개의 대국을 분석하여 오프닝 트리를 구축했습니다!`,
      totalGames: tree.totalGames,
      isVip,
      maxPly,
      updatedAt: tree.updatedAt
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Lichess bulk game fetcher
async function fetchLichessGamesForTree(username: string, max: number): Promise<GameInputForTree[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&moves=true&pgnInJson=true&clocks=false&evals=false`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/x-ndjson',
      'User-Agent': 'Speerchess/1.0'
    }
  });

  if (!res.ok) return [];

  const text = await res.text();
  const lines = text.trim().split('\n').filter(Boolean);
  const games: GameInputForTree[] = [];

  for (const line of lines) {
    try {
      const g = JSON.parse(line);
      const isWhite = g.players?.white?.user?.id?.toLowerCase() === username.toLowerCase() ||
                      g.players?.white?.user?.name?.toLowerCase() === username.toLowerCase();
      
      let outcome = 'draw';
      if (g.winner === 'white') outcome = '1-0';
      else if (g.winner === 'black') outcome = '0-1';
      else outcome = '1/2-1/2';

      games.push({
        pgn: g.pgn || g.moves,
        moves: g.moves ? g.moves.split(' ') : undefined,
        userColor: isWhite ? 'white' : 'black',
        result: outcome
      });
    } catch (e) {}
  }

  return games;
}

// Chess.com bulk game fetcher (archives)
async function fetchChessComGamesForTree(username: string, max: number): Promise<GameInputForTree[]> {
  const archivesRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`, {
    headers: { 'User-Agent': 'speerchess-app/1.0' }
  });

  if (!archivesRes.ok) return [];

  const { archives } = await archivesRes.json();
  if (!archives || !Array.isArray(archives)) return [];

  const games: GameInputForTree[] = [];
  const recentArchives = archives.slice(-6).reverse(); // Last 6 months

  for (const archiveUrl of recentArchives) {
    if (games.length >= max) break;
    try {
      const monthRes = await fetch(archiveUrl, {
        headers: { 'User-Agent': 'speerchess-app/1.0' }
      });
      if (!monthRes.ok) continue;

      const { games: monthGames } = await monthRes.json();
      if (!monthGames || !Array.isArray(monthGames)) continue;

      for (const mg of monthGames.reverse()) {
        if (games.length >= max) break;
        const isWhite = mg.white?.username?.toLowerCase() === username.toLowerCase();
        
        let outcome = 'draw';
        if (mg.white?.result === 'win') outcome = '1-0';
        else if (mg.black?.result === 'win') outcome = '0-1';
        else outcome = '1/2-1/2';

        games.push({
          pgn: mg.pgn,
          userColor: isWhite ? 'white' : 'black',
          result: outcome
        });
      }
    } catch (e) {}
  }

  return games;
}
