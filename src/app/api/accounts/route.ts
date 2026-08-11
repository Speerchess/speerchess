import { NextRequest, NextResponse } from 'next/server';
import { getLinkedAccounts, addLinkedAccount, removeLinkedAccount } from '../../../lib/db';

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

// GET /api/accounts - List all linked accounts for current user
export async function GET(request: NextRequest) {
  try {
    const sessionUserId = getSessionUserId(request);
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
    const sessionUserId = getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { platform, platformUsername } = await request.json();
    if (!platform || !platformUsername) {
      return NextResponse.json({ error: '플랫폼 및 닉네임이 필요합니다.' }, { status: 400 });
    }

    // Verify account exists before adding
    if (platform === 'chesscom') {
      const checkRes = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(platformUsername.trim())}`, {
        headers: { 'User-Agent': 'speerchess-app/1.0' }
      });
      if (!checkRes.ok) {
        return NextResponse.json({ error: '존재하지 않는 Chess.com 닉네임입니다.' }, { status: 404 });
      }
    } else if (platform === 'lichess') {
      const checkRes = await fetch(`https://lichess.org/api/user/${encodeURIComponent(platformUsername.trim())}`);
      if (!checkRes.ok) {
        return NextResponse.json({ error: '존재하지 않는 Lichess 닉네임입니다.' }, { status: 404 });
      }
    }

    const success = await addLinkedAccount(sessionUserId, platform, platformUsername.trim(), false);
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
    const sessionUserId = getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { platform, platformUsername } = await request.json();
    if (!platform || !platformUsername) {
      return NextResponse.json({ error: '플랫폼 및 닉네임이 필요합니다.' }, { status: 400 });
    }

    const success = await removeLinkedAccount(sessionUserId, platform, platformUsername.trim());
    if (!success) {
      return NextResponse.json({ error: '기본 로그인 계정은 삭제할 수 없거나 계정 삭제에 실패했습니다.' }, { status: 400 });
    }

    const updatedAccounts = await getLinkedAccounts(sessionUserId);
    return NextResponse.json({ success: true, accounts: updatedAccounts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
