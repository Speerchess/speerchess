import { NextRequest, NextResponse } from 'next/server';
import { getUser, getLinkedAccounts } from '../../../../lib/db';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const rawCookie = request.cookies.get('speerchess_session')?.value;
    if (!rawCookie) {
      return NextResponse.json({ authenticated: false, user: null, linkedAccounts: [] });
    }

    let sessionData: { id: string; username: string; avatar_url?: string | null; access_token?: string } | null = null;
    
    try {
      if (rawCookie.startsWith('{')) {
        sessionData = JSON.parse(rawCookie);
      } else {
        sessionData = JSON.parse(decodeURIComponent(atob(rawCookie)));
      }
    } catch (parseErr) {
      sessionData = { id: rawCookie, username: rawCookie };
    }

    if (!sessionData || !sessionData.id) {
      return NextResponse.json({ authenticated: false, user: null, linkedAccounts: [] });
    }

    // Try fetching from D1 database for latest updates/avatar/tokens
    let userFromDb = null;
    let linkedAccountsFromDb: any[] = [];
    try {
      userFromDb = await getUser(sessionData.id);
      linkedAccountsFromDb = await getLinkedAccounts(sessionData.id);
    } catch (e) {}

    const finalUser = {
      id: userFromDb?.id || sessionData.id,
      username: userFromDb?.username || sessionData.username,
      avatar_url: userFromDb?.avatar_url || sessionData.avatar_url || null,
      has_token: Boolean(userFromDb?.access_token || sessionData.access_token)
    };

    // Ensure at least the primary Lichess account is present
    let finalAccounts = linkedAccountsFromDb;
    if (!finalAccounts || finalAccounts.length === 0) {
      finalAccounts = [
        {
          user_id: finalUser.id,
          platform: 'lichess',
          platform_username: finalUser.username,
          is_primary: true
        }
      ];
    }

    return NextResponse.json({
      authenticated: true,
      user: finalUser,
      linkedAccounts: finalAccounts
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
