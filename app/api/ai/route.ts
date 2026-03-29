import { NextRequest, NextResponse } from 'next/server';

const API_KEY = 'sk-9910e36d9c2ae996754ff737ea38cb5cb8aefbf965e7af465d9172bb45c0003d';
const BASE_URL = 'https://code.rayinai.com/v1';

export async function POST(req: NextRequest) {
  try {
    const { scene, weather } = await req.json();

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
        stream: true,
      }),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) { controller.close(); return; }

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

          for (const line of lines) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
              }
            } catch {}
          }
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
