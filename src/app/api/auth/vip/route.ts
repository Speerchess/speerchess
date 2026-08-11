import { NextRequest, NextResponse } from 'next/server';
import { setUserTier, getUserTier, UserTier } from '../../../../lib/db';
import { verifyAndExtractSession } from '../../../../lib/session';

export const runtime = 'edge';

const DEFAULT_VIP_KEYS = [
  'SPEER-VIP-2026',
  'SPEER-PRO-5000',
  'SPEERMASTER',
  'CHESSMONITOR-VIP',
  'SPEER5000',
  'JUSTDOIT'
];

const DEFAULT_VVIP_KEYS = [
  'SPEER-VVIP-2026',
  'SPEER-ADMIN',
  'SPEER-MASTER-VVIP',
  'VVIPMASTER',
  'SPEER10000',
  'JUSTDOIT-VVIP'
];

async function getSessionUserId(request: NextRequest): Promise<string | null> {
  const rawCookie = request.cookies.get('speerchess_session')?.value;
  const session = await verifyAndExtractSession(rawCookie);
  return session ? session.id : null;
}

// GET /api/auth/vip - Check VIP/VVIP status & cooldown specs
export async function GET(request: NextRequest) {
  try {
    const sessionUserId = await getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ authenticated: false, tier: 'free', isVip: false });
    }

    const tier = await getUserTier(sessionUserId);
    const isVip = tier !== 'free';

    return NextResponse.json({
      authenticated: true,
      tier,
      isVip,
      maxGames: tier === 'vvip' ? 10000 : (tier === 'vip' ? 5000 : 1000),
      maxPly: tier === 'vvip' ? 120 : (tier === 'vip' ? 60 : 30),
      cooldownHours: tier === 'vvip' ? 0 : (tier === 'vip' ? 24 : 168)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/auth/vip - Activate VIP or VVIP Key
export async function POST(request: NextRequest) {
  try {
    const sessionUserId = await getSessionUserId(request);
    if (!sessionUserId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { vipKey } = await request.json();
    const cleanKey = (vipKey || '').trim().toUpperCase();

    if (!cleanKey) {
      return NextResponse.json({ error: '라이선스 키를 입력해 주세요.' }, { status: 400 });
    }

    // Check VVIP keys (from env or default list)
    const envVvipKey = (process.env.VVIP_SECRET_KEY || process.env.VVIP_KEY || '').trim().toUpperCase();
    const isVvip = (envVvipKey && cleanKey === envVvipKey) || DEFAULT_VVIP_KEYS.includes(cleanKey);

    // Check VIP keys (from env or default list)
    const envVipKey = (process.env.VIP_SECRET_KEY || process.env.VIP_KEY || '').trim().toUpperCase();
    const isVip = (envVipKey && cleanKey === envVipKey) || DEFAULT_VIP_KEYS.includes(cleanKey);

    if (!isVvip && !isVip) {
      return NextResponse.json({ error: '유효하지 않은 라이선스 키입니다.' }, { status: 400 });
    }

    const tier: UserTier = isVvip ? 'vvip' : 'vip';
    await setUserTier(sessionUserId, tier, cleanKey);

    return NextResponse.json({
      success: true,
      tier,
      isVip: true,
      message: isVvip 
        ? '👑 VVIP 마스터 라이선스가 활성화되었습니다! (최대 10,000판 / 60수 / 무제한 동기화)' 
        : '✨ VIP 라이선스가 활성화되었습니다! (최대 5,000판 / 30수 / 24시간 쿨다운)',
      maxGames: isVvip ? 10000 : 5000,
      maxPly: isVvip ? 120 : 60,
      cooldownHours: isVvip ? 0 : 24
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
