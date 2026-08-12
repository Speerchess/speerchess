import { NextRequest, NextResponse } from 'next/server';
import { getUser, getLinkedAccounts } from '../../../../lib/db';
import { verifyAndExtractSession } from '../../../../lib/session';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const rawCookie = request.cookies.get('speerchess_session')?.value;
    const sessionData = await verifyAndExtractSession(rawCookie);

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

    // Ensure at least the primary Lichess account is present and deduplicate
    let finalAccounts = linkedAccountsFromDb || [];
    const hasPrimary = finalAccounts.some(a => a.platform === 'lichess' && a.platform_username.toLowerCase() === finalUser.username.toLowerCase());
    if (!hasPrimary) {
      finalAccounts.unshift({
        user_id: finalUser.id,
        platform: 'lichess',
        platform_username: finalUser.username,
        is_primary: true
      });
    }

    const seenMe = new Set<string>();
    finalAccounts = finalAccounts.filter(a => {
      const key = `${a.platform}:${a.platform_username.toLowerCase().trim()}`;
      if (seenMe.has(key)) return false;
      seenMe.add(key);
      return true;
    });

    return NextResponse.json({
      authenticated: true,
      user: finalUser,
      linkedAccounts: finalAccounts
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
