import { NextRequest, NextResponse } from 'next/server';

const API_KEY = 'sk-9910e36d9c2ae996754ff737ea38cb5cb8aefbf965e7af465d9172bb45c0003d';
const BASE_URL = 'https://code.rayinai.com/v1';

export async function POST(req: NextRequest) {
  try {
    const { scene, weather } = await req.json();

    // 非流式请求（更兼容）
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 100,
        temperature: 0.9,
        stream: false,
        messages: [
          {
            role: 'system',
            content: '你是一个诗意的音乐氛围描述师。用户会告诉你当前驶过的场景和天气，你需要用20个字以内描述此刻的音乐氛围。要求：富有画面感、诗意、简洁。只输出描述文字，不要加引号或其他符号。'
          },
          {
            role: 'user',
            content: `现在驶过「${scene}」，天气「${weather}」，请用20字以内描述此刻的音乐氛围。`
          }
        ],
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';

    if (!text) {
      console.error('AI 返回空内容:', JSON.stringify(data));
      return NextResponse.json({ error: '空响应' }, { status: 500 });
    }

    // 把完整文本拆成逐字的 SSE 事件，前端打字机效果不变
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        for (const char of text) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: char })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('AI API error:', error);
    return NextResponse.json({ error: 'AI 请求失败' }, { status: 500 });
  }
}
