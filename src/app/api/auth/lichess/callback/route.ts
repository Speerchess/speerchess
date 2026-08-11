import { NextRequest, NextResponse } from 'next/server';
import { upsertUser } from '../../../../../lib/db';
import { signSessionPayload } from '../../../../../lib/session';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
  const proto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https://') ? 'https' : 'http');
  const origin = `${proto}://${host}`;
  const isHttps = proto === 'https';

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error || 'cancelled')}`);
  }

  const verifier = request.cookies.get('speerchess_pkce_verifier')?.value;
  const savedState = request.cookies.get('speerchess_oauth_state')?.value;

  if (!verifier || (savedState && savedState !== state)) {
    console.error("PKCE verifier or state missing/mismatched. verifier:", Boolean(verifier), "savedState:", savedState, "state:", state);
    return NextResponse.redirect(`${origin}/?auth_error=invalid_state`);
  }

  const redirectUri = `${origin}/api/auth/lichess/callback`;

  try {
    // 1. Exchange authorization code for Lichess access token
    const tokenRes = await fetch('https://lichess.org/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id: 'speerchess'
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Lichess token exchange failed:", tokenRes.status, errText);
      return NextResponse.redirect(`${origin}/?auth_error=token_exchange_${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch authenticated user profile from Lichess API
    const userRes = await fetch('https://lichess.org/api/account', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!userRes.ok) {
      console.error("Lichess account fetch failed:", userRes.status);
      return NextResponse.redirect(`${origin}/?auth_error=profile_fetch_${userRes.status}`);
    }

    const userData = await userRes.json();
    const userId = userData.id;
    const username = userData.username || userId;
    const avatarUrl = userData.profile?.avatar || null;

    // 3. Upsert user in Cloudflare D1 database (graceful fallback if offline)
    try {
      await upsertUser({
        id: userId,
        username,
        access_token: accessToken,
        avatar_url: avatarUrl
      });
    } catch (dbErr) {
      console.warn("D1 upsertUser skipped or failed:", dbErr);
    }

    // 4. Create response and set cryptographically signed session cookie
    const sessionPayload = {
      id: userId,
      username: username,
      avatar_url: avatarUrl,
      access_token: accessToken
    };
    
    const sessionCookieValue = await signSessionPayload(sessionPayload);

    const response = NextResponse.redirect(`${origin}/?auth_success=1`);
    
    // Set secure signed session cookie
    response.cookies.set('speerchess_session', sessionCookieValue, {
      path: '/',
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    // Clear one-time OAuth cookies
    response.cookies.delete('speerchess_pkce_verifier');
    response.cookies.delete('speerchess_oauth_state');

    return response;
  } catch (e: any) {
    console.error("OAuth callback exception:", e);
    return NextResponse.redirect(`${origin}/?auth_error=server_error`);
  }
}
