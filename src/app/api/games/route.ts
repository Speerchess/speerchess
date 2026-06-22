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
    const { pgn, analysisJson, movesSequence } = await request.json();
    if (!pgn || !analysisJson || !movesSequence) {
      return NextResponse.json({ error: '필수 데이터가 누락되었습니다.' }, { status: 400 });
    }

    const salt = process.env.HASHIDS_SALT || 'speerchess-salt-secret';
    const hashid = await saveGameRecord(pgn, analysisJson, movesSequence, salt);

    return NextResponse.json({ success: true, hashid });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
