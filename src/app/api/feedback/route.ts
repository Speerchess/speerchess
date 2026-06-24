import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const { rating, text } = await request.json();
    if (!text) {
      return NextResponse.json({ error: '의견을 입력해주세요.' }, { status: 400 });
    }

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('DISCORD_WEBHOOK_URL이 설정되지 않았습니다.');
      return NextResponse.json({ success: true, warning: 'Discord Webhook URL이 설정되지 않았습니다.' });
    }

    const message = {
      embeds: [
        {
          title: '💬 새로운 사용자 의견 및 피드백',
          color: 0x0f172a, // Dark slate color
          fields: [
            {
              name: '평점 (Rating)',
              value: '⭐'.repeat(rating || 5) + ` (${rating || 5}/5)`,
              inline: true
            },
            {
              name: '내용 (Feedback)',
              value: text
            }
          ],
          timestamp: new Date().toISOString()
        }
      ]
    };

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!discordRes.ok) {
      throw new Error(`Discord Webhook 전송 실패: ${discordRes.statusText}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
