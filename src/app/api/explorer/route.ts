import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
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

    // Inject Lichess token from Cloudflare environment variable if configured
    if (process.env.LICHESS_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.LICHESS_TOKEN}`;
    }

    const res = await fetch(targetUrl, { headers });
    if (!res.ok) {
      return new NextResponse(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=600'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
