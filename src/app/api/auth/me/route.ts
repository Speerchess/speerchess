import { NextRequest, NextResponse } from 'next/server';
import { getUser, getLinkedAccounts } from '../../../../lib/db';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const sessionUserId = request.cookies.get('speerchess_session')?.value;
    if (!sessionUserId) {
      return NextResponse.json({ authenticated: false, user: null, linkedAccounts: [] });
    }

    const user = await getUser(sessionUserId);
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null, linkedAccounts: [] });
    }

    const linkedAccounts = await getLinkedAccounts(sessionUserId);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        has_token: Boolean(user.access_token)
      },
      linkedAccounts
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
