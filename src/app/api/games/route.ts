import { NextRequest, NextResponse } from 'next/server';
import { getGameRecord, saveGameRecord, getAllGameRecords } from '../../../lib/db';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hashid = searchParams.get('hashid');
    if (!hashid) {
      const records = await getAllGameRecords();
      return NextResponse.json(records);
    }

    const record = await getGameRecord(hashid);
    if (!record) {
      return NextResponse.json({ error: '게임을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json(record);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pgn, analysisJson, movesSequence } = body || {};
    if (!pgn || !analysisJson || !movesSequence) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 });
    }

    // Security bounds check (prevent oversized payloads / DoS)
    if (typeof pgn !== 'string' || pgn.length > 250000) {
      return NextResponse.json({ error: 'PGN 데이터 크기가 허용치를 초과했습니다.' }, { status: 400 });
    }
    if (typeof analysisJson !== 'string' || analysisJson.length > 3000000) {
      return NextResponse.json({ error: '분석 데이터 크기가 허용치를 초과했습니다.' }, { status: 400 });
    }
    if (typeof movesSequence !== 'string' || movesSequence.length > 50000) {
      return NextResponse.json({ error: '수순 데이터 크기가 허용치를 초과했습니다.' }, { status: 400 });
    }

    const salt = process.env.HASHIDS_SALT || 'speerchess-salt-secret';
    const hashid = await saveGameRecord(pgn, analysisJson, movesSequence, salt);

    return NextResponse.json({ success: true, hashid });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
