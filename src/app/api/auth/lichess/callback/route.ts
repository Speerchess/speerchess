import { NextRequest, NextResponse } from 'next/server';
import { upsertUser } from '../../../../../lib/db';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error || 'cancelled')}`);
  }

  const verifier = request.cookies.get('speerchess_pkce_verifier')?.value;
  const savedState = request.cookies.get('speerchess_oauth_state')?.value;

  if (!verifier || (savedState && savedState !== state)) {
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
      console.error("Lichess token exchange failed:", errText);
      return NextResponse.redirect(`${origin}/?auth_error=token_failed`);
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
      return NextResponse.redirect(`${origin}/?auth_error=profile_failed`);
    }

    const userData = await userRes.json();
    const userId = userData.id;
    const username = userData.username || userId;

    // 3. Upsert user in Cloudflare D1 database
    await upsertUser({
      id: userId,
      username,
      access_token: accessToken,
      avatar_url: userData.profile?.avatar || null
    });

    // 4. Create response and set persistent session cookie
    const response = NextResponse.redirect(`${origin}/?auth_success=1`);
    
    // Set secure session cookie containing userId
    response.cookies.set('speerchess_session', userId, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    // Clear one-time OAuth cookies
    response.cookies.delete('speerchess_pkce_verifier');
    response.cookies.delete('speerchess_oauth_state');

    return response;
  } catch (e: any) {
    console.error("OAuth callback error:", e);
    return NextResponse.redirect(`${origin}/?auth_error=server_error`);
  }
}
