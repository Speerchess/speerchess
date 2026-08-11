import { NextRequest, NextResponse } from 'next/server';
import { getLinkedAccounts, addLinkedAccount, removeLinkedAccount } from '../../../lib/db';
import { verifyAndExtractSession } from '../../../lib/session';

export const runtime = 'edge';

async function getSessionUserId(request: NextRequest): Promise<string | null> {
  const rawCookie = request.cookies.get('speerchess_session')?.value;
  const session = await verifyAndExtractSession(rawCookie);
  return session ? session.id : null;
}

// Validation helper
function isValidUsername(username: string): boolean {
  if (!username || typeof username !== 'string') return false;
  const trimmed = username.trim();
  return trimmed.length >= 2 && trimmed.length <= 35 && /^[a-zA-Z0-9_\-]+$/.test(trimmed);
}

// GET /api/accounts - List all linked accounts for current user
export async function GET(request: NextRequest) {
  try {
    const sessionUserId = await getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const accounts = await getLinkedAccounts(sessionUserId);
    return NextResponse.json({ success: true, accounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/accounts - Add linked account (e.g. Chess.com or secondary Lichess)
export async function POST(request: NextRequest) {
  try {
    const sessionUserId = await getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { platform, platformUsername } = body || {};
    
    if (!platform || !platformUsername) {
      return NextResponse.json({ error: '플랫폼 및 닉네임이 필요합니다.' }, { status: 400 });
    }

    const cleanUsername = String(platformUsername).trim();
    if (!isValidUsername(cleanUsername)) {
      return NextResponse.json({ error: '올바른 형식의 체스 닉네임을 입력해 주세요.' }, { status: 400 });
    }

    const cleanPlatform = String(platform).toLowerCase().replace(/[\.\_\-\s]/g, '') === 'chesscom' ? 'chesscom' : 'lichess';

    // Verify account exists before adding
    if (cleanPlatform === 'chesscom') {
      const checkRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(cleanUsername.toLowerCase())}`, {
        headers: { 'User-Agent': 'Speerchess/1.0 (contact@speerchess.com)' }
      });
      if (!checkRes.ok) {
        return NextResponse.json({ error: '존재하지 않는 Chess.com 닉네임입니다.' }, { status: 404 });
      }
    } else {
      const checkRes = await fetch(`https://lichess.org/api/user/${encodeURIComponent(cleanUsername)}`, {
        headers: { 'User-Agent': 'Speerchess/1.0 (contact@speerchess.com)' }
      });
      if (!checkRes.ok) {
        return NextResponse.json({ error: '존재하지 않는 Lichess 닉네임입니다.' }, { status: 404 });
      }
    }

    const success = await addLinkedAccount(sessionUserId, cleanPlatform, cleanUsername, false);
    if (!success) {
      return NextResponse.json({ error: '계정 연동 저장에 실패했습니다.' }, { status: 500 });
    }

    const updatedAccounts = await getLinkedAccounts(sessionUserId);
    return NextResponse.json({ success: true, accounts: updatedAccounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/accounts - Remove linked account
export async function DELETE(request: NextRequest) {
  try {
    const sessionUserId = await getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { platform, platformUsername } = body || {};
    if (!platform || !platformUsername) {
      return NextResponse.json({ error: '플랫폼 및 닉네임이 필요합니다.' }, { status: 400 });
    }

    const cleanUsername = String(platformUsername).trim();
    const cleanPlatform = String(platform).toLowerCase().replace(/[\.\_\-\s]/g, '') === 'chesscom' ? 'chesscom' : 'lichess';

    const success = await removeLinkedAccount(sessionUserId, cleanPlatform, cleanUsername);
    if (!success) {
      return NextResponse.json({ error: '기본 로그인 계정은 삭제할 수 없거나 계정 삭제에 실패했습니다.' }, { status: 400 });
    }

    const updatedAccounts = await getLinkedAccounts(sessionUserId);
    return NextResponse.json({ success: true, accounts: updatedAccounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
