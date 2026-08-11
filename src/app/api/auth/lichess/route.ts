import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

function generateRandomString(length: number = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function GET(request: NextRequest) {
  try {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host;
    const proto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https://') ? 'https' : 'http');
    const origin = `${proto}://${host}`;
    const redirectUri = `${origin}/api/auth/lichess/callback`;
    const isHttps = proto === 'https';
    
    // Generate PKCE code verifier and challenge
    const verifier = generateRandomString(64);
    const challengeBuffer = await sha256(verifier);
    const challenge = base64UrlEncode(challengeBuffer);
    
    const state = generateRandomString(32);

    // Build Lichess OAuth authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'speerchess',
      redirect_uri: redirectUri,
      scope: 'preference:read',
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state
    });

    const lichessAuthUrl = `https://lichess.org/oauth?${params.toString()}`;

    // Return redirect with PKCE verifier stored in cookie
    const response = NextResponse.redirect(lichessAuthUrl);
    response.cookies.set('speerchess_pkce_verifier', verifier, {
      path: '/',
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 60 * 15 // 15 minutes
    });
    response.cookies.set('speerchess_oauth_state', state, {
      path: '/',
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 60 * 15
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
