import { NextRequest, NextResponse } from 'next/server';

const API_KEY = 'sk-9910e36d9c2ae996754ff737ea38cb5cb8aefbf965e7af465d9172bb45c0003d';
const BASE_URL = 'https://code.rayinai.com/v1';

export async function POST(req: NextRequest) {
  try {
    const { scene, weather } = await req.json();

    // 使用非流式请求（更兼容各种代理）
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

    // 提取文本
    let text = '';
    if (data.choices && data.choices[0]) {
      text = data.choices[0].message?.content || data.choices[0].text || '';
    } else if (data.error) {
      console.error('OpenAI API error:', data.error);
      text = getFallback(scene);
    }

    if (!text) {
      text = getFallback(scene);
    }

    // 把完整文本逐字拆分，通过 SSE 发送给前端（模拟流式打字机效果）
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const chars = [...text.trim()];
        for (const char of chars) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: char })}\n\n`)
          );
          // 小延迟让前端逐字接收
          await new Promise(r => setTimeout(r, 10));
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

    // 降级：返回预设文案
    const { scene } = await req.json().catch(() => ({ scene: '' }));
    const fallback = getFallback(scene);
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        for (const char of [...fallback]) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: char })}\n\n`)
          );
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  }
}

function getFallback(scene: string): string {
  const map: Record<string, string> = {
    '海滨公路': '海风轻拂，旋律随浪花起伏',
    '山区公路': '山雾缭绕，琴音在松林间回荡',
    '城市夜晚': '霓虹闪烁，节拍融入车流脉搏',
    '高速巡航': '引擎低鸣，速度感充盈每个音符',
    '隧道穿越': '回声叠叠，低音在隧道中共振',
  };
  return map[scene] || '旋律随路途变幻，此刻恰好';
}
