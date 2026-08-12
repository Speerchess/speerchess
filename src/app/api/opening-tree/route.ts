import { NextRequest, NextResponse } from 'next/server';
import { getLinkedAccounts, getUserTier, saveOpeningTree, getOpeningTreeRecord, UserTier } from '../../../lib/db';
import { buildOpeningTreeFromGames, queryOpeningTree, GameInputForTree, CompactOpeningTree } from '../../../lib/openingTree';
import { verifyAndExtractSession } from '../../../lib/session';

export const runtime = 'edge';

async function getSessionUserId(request: NextRequest): Promise<string | null> {
  const rawCookie = request.cookies.get('speerchess_session')?.value;
  const session = await verifyAndExtractSession(rawCookie);
  return session ? session.id : null;
}

// Helper to check sync cooldown
function checkSyncCooldown(tier: UserTier, lastUpdatedAt?: string): { allowed: boolean; remainingHours: number; nextAvailableAt: string } {
  if (tier === 'vvip') {
    return { allowed: true, remainingHours: 0, nextAvailableAt: new Date().toISOString() };
  }
  if (!lastUpdatedAt) {
    return { allowed: true, remainingHours: 0, nextAvailableAt: new Date().toISOString() };
  }

  const lastTime = new Date(lastUpdatedAt).getTime();
  if (isNaN(lastTime)) {
    return { allowed: true, remainingHours: 0, nextAvailableAt: new Date().toISOString() };
  }

  const cooldownMs = tier === 'vip' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const nextAvailableTime = lastTime + cooldownMs;
  const now = Date.now();

  if (now < nextAvailableTime) {
    const diffMs = nextAvailableTime - now;
    const remainingHours = Math.ceil(diffMs / (60 * 60 * 1000));
    return {
      allowed: false,
      remainingHours,
      nextAvailableAt: new Date(nextAvailableTime).toISOString()
    };
  }

  return { allowed: true, remainingHours: 0, nextAvailableAt: new Date().toISOString() };
}

// GET /api/opening-tree - Query opening tree for a specific FEN and color
export async function GET(request: NextRequest) {
  try {
    const sessionUserId = await getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fen = searchParams.get('fen') || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const color = (searchParams.get('color') || 'all') as 'white' | 'black' | 'all';

    const tier = await getUserTier(sessionUserId);
    const record = await getOpeningTreeRecord(sessionUserId);
    const cooldownInfo = checkSyncCooldown(tier, record?.updated_at);

    if (!record || !record.tree_json) {
      return NextResponse.json({
        synced: false,
        total: 0,
        white: 0,
        draws: 0,
        black: 0,
        moves: [],
        tier,
        isVip: tier !== 'free',
        canSync: true,
        remainingHours: 0,
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
      tier,
      isVip: tier !== 'free',
      canSync: cooldownInfo.allowed,
      remainingHours: cooldownInfo.remainingHours,
      nextAvailableAt: cooldownInfo.nextAvailableAt,
      updatedAt: record.updated_at
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/opening-tree - Accepts client-compiled Opening Tree or server fallback with Cooldown checks
export async function POST(request: NextRequest) {
  try {
    const sessionUserId = await getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const tier = await getUserTier(sessionUserId);
    const record = await getOpeningTreeRecord(sessionUserId);

    // Cooldown verification
    const cooldownInfo = checkSyncCooldown(tier, record?.updated_at);
    if (!cooldownInfo.allowed) {
      const tierLabel = tier === 'vip' ? 'VIP 회원 (1일 1회)' : '일반 회원 (7일 1회)';
      return NextResponse.json({
        error: `동기화 쿨다운 적용 중입니다 (${tierLabel}). 다음 동기화는 약 ${cooldownInfo.remainingHours}시간 후 가능합니다.`,
        remainingHours: cooldownInfo.remainingHours,
        nextAvailableAt: cooldownInfo.nextAvailableAt,
        cooldown: true
      }, { status: 429 });
    }

    const maxAllowedGames = tier === 'vvip' ? 10000 : (tier === 'vip' ? 5000 : 1000);
    const maxAllowedPly = tier === 'vvip' ? 120 : (tier === 'vip' ? 60 : 30);

    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {}

    // 1. Client-Side Compiled Tree (Instant & Zero Server Timeout)
    if (body && body.tree) {
      const tree: CompactOpeningTree = body.tree;
      const totalGames = Math.min(body.totalGames || tree.totalGames || 0, maxAllowedGames);
      const maxPly = Math.min(body.maxPly || tree.maxPly || maxAllowedPly, maxAllowedPly);

      await saveOpeningTree(sessionUserId, tier, maxPly, totalGames, JSON.stringify(tree));

      return NextResponse.json({
        success: true,
        message: `성공적으로 ${totalGames}개의 대국을 분석하여 오프닝 트리가 저장되었습니다!`,
        totalGames,
        tier,
        isVip: tier !== 'free',
        maxPly,
        updatedAt: tree.updatedAt || new Date().toISOString()
      });
    }

    // 2. Server-side fallback (if client sent raw games or empty body)
    let games: GameInputForTree[] = body.games || [];
    if (games.length === 0) {
      let accounts = await getLinkedAccounts(sessionUserId);
      if (!accounts || accounts.length === 0) {
        accounts = [{ user_id: sessionUserId, platform: 'lichess', platform_username: sessionUserId, is_primary: true }];
      }
      const quota = Math.ceil(maxAllowedGames / accounts.length);
      for (const acc of accounts) {
        if (acc.platform === 'lichess') {
          games.push(...(await fetchLichessGamesForTree(acc.platform_username, quota)));
        } else if (acc.platform === 'chesscom') {
          games.push(...(await fetchChessComGamesForTree(acc.platform_username, quota)));
        }
      }
    }

    if (games.length === 0) {
      return NextResponse.json({ error: '불러올 수 있는 대국 기록이 없습니다.' }, { status: 404 });
    }

    const tree = buildOpeningTreeFromGames(games.slice(0, maxAllowedGames), maxAllowedPly);
    await saveOpeningTree(sessionUserId, tier, maxAllowedPly, tree.totalGames, JSON.stringify(tree));

    return NextResponse.json({
      success: true,
      message: `성공적으로 ${tree.totalGames}개의 대국을 분석하여 오프닝 트리를 구축했습니다!`,
      totalGames: tree.totalGames,
      tier,
      isVip: tier !== 'free',
      maxPly: maxAllowedPly,
      updatedAt: tree.updatedAt
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Lichess bulk game fetcher
async function fetchLichessGamesForTree(username: string, max: number): Promise<GameInputForTree[]> {
  try {
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
  } catch (e) {
    return [];
  }
}

// Chess.com bulk game fetcher
async function fetchChessComGamesForTree(username: string, max: number): Promise<GameInputForTree[]> {
  try {
    const archivesRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`, {
      headers: { 'User-Agent': 'speerchess-app/1.0' }
    });

    if (!archivesRes.ok) return [];

    const { archives } = await archivesRes.json();
    if (!archives || !Array.isArray(archives)) return [];

    const games: GameInputForTree[] = [];
    const recentArchives = archives.slice(-6).reverse();

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
  } catch (e) {
    return [];
  }
}
