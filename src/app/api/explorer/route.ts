import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '../../../lib/db';
import { verifyAndExtractSession } from '../../../lib/session';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const rawCookie = request.cookies.get('speerchess_session')?.value;
    let userToken = process.env.LICHESS_TOKEN || '';
    let hasSession = false;

    // Check if user is logged in with Lichess via session cookie
    if (rawCookie) {
      const sessionData = await verifyAndExtractSession(rawCookie);
      if (sessionData && sessionData.id) {
        hasSession = true;
        if (sessionData.access_token) {
          userToken = sessionData.access_token;
        } else {
          try {
            const dbUser = await getUser(sessionData.id);
            if (dbUser?.access_token) {
              userToken = dbUser.access_token;
            }
          } catch (dbErr) {}
        }
      }
    }

    // Require Lichess login for opening book explorer
    if (!hasSession && !userToken) {
      return NextResponse.json({
        error: 'LICHESS_LOGIN_REQUIRED',
        message: '오프닝 북 탐색기는 Lichess 계정으로 로그인한 사용자만 이용하실 수 있습니다.'
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const db = searchParams.get('db') || 'lichess';
    
    // Create new search parameters to forward to Lichess, ignoring the 'db' parameter itself
    const lichessParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key !== 'db') {
        lichessParams.set(key, value);
      }
    });

    const targetUrl = `https://explorer.lichess.ovh/${db}?${lichessParams.toString()}`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    };

    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`;
    }

    const res = await fetch(targetUrl, { headers });
    if (!res.ok) {
      return new NextResponse(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
