import { NextResponse } from 'next/server';

const QWEATHER_KEY = 'a6a24c8a9c1348d1889bdb7a296ce083';
const SHENZHEN_ID = '101280601';

export async function GET() {
  try {
    const res = await fetch(
      `https://devapi.qweather.com/v7/weather/now?location=${SHENZHEN_ID}&key=${QWEATHER_KEY}&lang=zh`,
      { next: { revalidate: 600 } }
    );

    const data = await res.json();

    if (data.code === '200' && data.now) {
      const now = data.now;
      return NextResponse.json({
        text: now.text,
        temp: now.temp,
        feelsLike: now.feelsLike,
        windDir: now.windDir,
        windScale: now.windScale,
        humidity: now.humidity,
        mood: getWeatherMood(now.text),
      });
    }

    return NextResponse.json({ text: '晴', temp: '25', mood: '明快' });
  } catch (error) {
    console.error('Weather API error:', error);
    return NextResponse.json({ text: '晴', temp: '25', mood: '明快' });
  }
}

function getWeatherMood(weatherText: string): string {
  if (['晴', '少云'].includes(weatherText)) return '明快';
  if (['多云', '阴'].includes(weatherText)) return '柔和';
  if (weatherText.includes('雨')) return '低沉';
  if (weatherText.includes('雪')) return '空灵';
  if (weatherText.includes('雾') || weatherText.includes('霾')) return '迷幻';
  if (weatherText.includes('风') || weatherText.includes('雷')) return '激昂';
  return '舒缓';
}
