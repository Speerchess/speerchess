import { NextRequest, NextResponse } from 'next/server';
import { setUserVip, getUserVipStatus } from '../../../../lib/db';

export const runtime = 'edge';

const VALID_VIP_KEYS = [
  'SPEER-VIP-2026',
  'SPEER-PRO-5000',
  'SPEERMASTER',
  'CHESSMONITOR-VIP',
  'SPEER5000',
  'SPEER10000',
  'JUSTDOIT'
];

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

// GET /api/auth/vip - Check VIP status
export async function GET(request: NextRequest) {
  try {
    const sessionUserId = getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ authenticated: false, isVip: false });
    }

    const isVip = await getUserVipStatus(sessionUserId);
    return NextResponse.json({
      authenticated: true,
      isVip,
      maxGames: isVip ? 5000 : 1000,
      maxPly: isVip ? 60 : 30
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/auth/vip - Activate VIP Key
export async function POST(request: NextRequest) {
  try {
    const sessionUserId = getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { vipKey } = await request.json();
    const cleanKey = (vipKey || '').trim().toUpperCase();

    if (!cleanKey || !VALID_VIP_KEYS.includes(cleanKey)) {
      return NextResponse.json({ error: '유효하지 않은 스페셜 라이선스 키입니다.' }, { status: 400 });
    }

    await setUserVip(sessionUserId, cleanKey);

    return NextResponse.json({
      success: true,
      message: '✨ 스페셜 VIP 라이선스가 성공적으로 활성화되었습니다! (최대 5,000판 / 30수 동기화)',
      isVip: true,
      maxGames: 5000,
      maxPly: 60
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
