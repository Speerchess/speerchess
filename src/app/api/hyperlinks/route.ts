import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  const link1Text = process.env.HYPERLINK_1_TEXT || '유튜브 클래식 음악';
  const link1Url = process.env.HYPERLINK_1_URL || 'https://www.youtube.com/results?search_query=classic+music+for+focus';
  
  const link2Text = process.env.HYPERLINK_2_TEXT || 'Lofi 음악으로 기분 전환';
  const link2Url = process.env.HYPERLINK_2_URL || 'https://www.youtube.com/results?search_query=relaxing+lofi+chess';
  
  const link3Text = process.env.HYPERLINK_3_TEXT || '스트레스 해소 빗소리';
  const link3Url = process.env.HYPERLINK_3_URL || 'https://www.youtube.com/results?search_query=relaxing+rain+sounds';

  const data = [
    { text: link1Text, url: link1Url },
    { text: link2Text, url: link2Url },
    { text: link3Text, url: link3Url }
  ];

  return NextResponse.json(data);
}
