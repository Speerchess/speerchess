import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('speerchess_session');
  return response;
}
