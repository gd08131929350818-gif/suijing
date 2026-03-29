'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// ============================================================
// 配置
// ============================================================
interface SceneConfig {
  name: string;
  tag: string;
  musicFile: string;
  ambientFile: string;
  description: string;
  color: string;
}
interface AudioTrack { source: AudioBufferSourceNode | null; gain: GainNode; }

const SCENES: SceneConfig[] = [
  { name: '海滨公路', tag: 'coastal', musicFile: '/audio/music/海滨公路.mp3', ambientFile: '/audio/ambient/海浪.mp3', description: 'Lo-fi Chill · 72bpm', color: '#0ea5e9' },
  { name: '山区公路', tag: 'mountain', musicFile: '/audio/music/山区公路.mp3', ambientFile: '/audio/ambient/风声.mp3', description: 'Ambient Folk · 85bpm', color: '#22c55e' },
  { name: '城市夜晚', tag: 'city', musicFile: '/audio/music/城市夜晚.mp3', ambientFile: '/audio/ambient/城市噪声.mp3', description: 'Synthwave · 110bpm', color: '#a855f7' },
  { name: '高速巡航', tag: 'highway', musicFile: '/audio/music/高速巡航.mp3', ambientFile: '/audio/ambient/引擎声.mp3', description: 'Electronic · 128bpm', color: '#f97316' },
  { name: '隧道穿越', tag: 'tunnel', musicFile: '/audio/music/隧道穿越.mp3', ambientFile: '/audio/ambient/回声.mp3', description: 'Deep Bass · 90bpm', color: '#6366f1' },
];

const ROUTE_POINTS: [number, number][] = [
  [113.9420,22.5090],[113.9480,22.5070],[113.9550,22.5055],[113.9620,22.5040],
  [113.9700,22.5030],[113.9780,22.5025],[113.9860,22.5020],[113.9940,22.5018],
  [114.0020,22.5020],[114.0100,22.5030],
  [114.0150,22.5080],[114.0180,22.5150],[114.0200,22.5230],[114.0210,22.5310],
  [114.0230,22.5400],[114.0250,22.5480],[114.0260,22.5550],[114.0270,22.5620],
  [114.0280,22.5700],[114.0290,22.5770],
  [114.0350,22.5800],[114.0430,22.5810],[114.0520,22.5815],[114.0600,22.5820],
  [114.0680,22.5825],[114.0750,22.5830],[114.0830,22.5835],[114.0900,22.5840],
  [114.0970,22.5845],[114.1040,22.5850],
  [114.1100,22.5880],[114.1180,22.5920],[114.1270,22.5970],[114.1360,22.6020],
  [114.1450,22.6080],[114.1540,22.6140],[114.1630,22.6200],[114.1720,22.6260],
  [114.1810,22.6320],[114.1900,22.6380],
  [114.1950,22.6420],[114.1980,22.6470],[114.2000,22.6530],[114.2010,22.6600],
  [114.2020,22.6670],[114.2025,22.6740],[114.2030,22.6810],[114.2035,22.6880],
  [114.2040,22.6950],[114.2045,22.7020],
];

const SCENE_BOUNDARIES = [0, 10, 20, 30, 40];
const N = ROUTE_POINTS.length;
const SEG = N - 1;
const MS_SEG = 1200;
const TOTAL_MS = SEG * MS_SEG;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function getSceneIdx(pt: number): number {
  for (let i = SCENE_BOUNDARIES.length - 1; i >= 0; i--)
    if (pt >= SCENE_BOUNDARIES[i]) return i;
  return 0;
}

// ============================================================
// 音频引擎
// ============================================================
function useAudio() {
  const ctx = useRef<AudioContext | null>(null);
  const mRef = useRef<AudioTrack | null>(null);
  const aRef = useRef<AudioTrack | null>(null);
  const cache = useRef<Map<string, AudioBuffer>>(new Map());
  const tms = useRef<number[]>([]);

  const init = useCallback(() => {
    if (!ctx.current) ctx.current = new AudioContext();
    if (ctx.current.state === 'suspended') ctx.current.resume();
  }, []);

  const load = useCallback(async (url: string) => {
    const c = ctx.current!;
    if (cache.current.has(url)) return cache.current.get(url)!;
    try {
      const buf = await c.decodeAudioData(await (await fetch(url)).arrayBuffer());
      cache.current.set(url, buf);
      return buf;
    } catch { return null; }
  }, []);

  const fade = useCallback(async (ref: React.MutableRefObject<AudioTrack | null>, url: string) => {
    const c = ctx.current;
    if (!c) return;
    const buf = await load(url);
    if (!buf) return;
    if (ref.current?.source) {
      const g = ref.current.gain, now = c.currentTime;
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 1.5);
      const s = ref.current.source;
      tms.current.push(window.setTimeout(() => { try { s.stop(); } catch {} }, 1600));
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.6, c.currentTime + 1.5);
    g.connect(c.destination);
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true; s.connect(g); s.start(0);
    ref.current = { source: s, gain: g };
  }, [load]);

  const play = useCallback(async (sc: SceneConfig) => {
    init();
    await Promise.all([fade(mRef, sc.musicFile), fade(aRef, sc.ambientFile)]);
  }, [init, fade]);

  const stop = useCallback(() => {
    tms.current.forEach(clearTimeout); tms.current = [];
    [mRef, aRef].forEach(r => { if (r.current?.source) { try { r.current.source.stop(); } catch {} r.current = null; } });
  }, []);

  useEffect(() => () => { stop(); ctx.current?.close(); }, [stop]);
  return { play, stop, init };
}

// ============================================================
// AI 文案
// ============================================================
function useAIText() {
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number[]>([]);

  const generate = useCallback(async (
    sceneName: string, weather: string,
    onChar: (char: string) => void, onDone: () => void,
  ) => {
    abortRef.current?.abort();
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: sceneName, weather }),
        signal: ctrl.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      const charQueue: string[] = [];
      let typing = false;

      const typeNext = () => {
        if (charQueue.length === 0) { typing = false; onDone(); return; }
        const ch = charQueue.shift()!;
        onChar(ch);
        const t = window.setTimeout(typeNext, 50);
        timerRef.current.push(t);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const { text } = JSON.parse(raw);
            if (text) {
              for (const ch of text) charQueue.push(ch);
              if (!typing) { typing = true; typeNext(); }
            }
          } catch {}
        }
      }
      if (charQueue.length > 0 && !typing) { typing = true; typeNext(); }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        // 降级文案
        const fb = getFallback(sceneName);
        let i = 0;
        const t = () => { if (i < fb.length) { onChar(fb[i++]); timerRef.current.push(window.setTimeout(t, 50)); } else onDone(); };
        t();
      }
    }
  }, []);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);
  return { generate, cleanup };
}

function getFallback(s: string): string {
  const m: Record<string, string> = {
    '海滨公路': '海风轻拂，旋律随浪花起伏',
    '山区公路': '山雾缭绕，琴音在松林间回荡',
    '城市夜晚': '霓虹闪烁，节拍融入车流脉搏',
    '高速巡航': '引擎低鸣，速度感充盈每个音符',
    '隧道穿越': '回声叠叠，低音在隧道中共振',
  };
  return m[s] || '旋律随路途变幻，此刻恰好';
}

// ============================================================
// 天气
// ============================================================
function useWeather() {
  const dataRef = useRef<{ text: string; temp: string; mood: string } | null>(null);
  const fetchedRef = useRef(false);
  const fetchWeather = useCallback(async () => {
    if (fetchedRef.current && dataRef.current) return dataRef.current;
    try {
      const res = await fetch('/api/weather');
      const data = await res.json();
      dataRef.current = data;
      fetchedRef.current = true;
      return data;
    } catch {
      const fb = { text: '晴', temp: '25', mood: '明快' };
      dataRef.current = fb;
      return fb;
    }
  }, []);
  return { fetchWeather, dataRef };
}

// ============================================================
// 主组件
// ============================================================
function MapCore() {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const carRef = useRef<any>(null);
  const rafRef = useRef(0);
  const t0Ref = useRef(0);
  const pausedAtRef = useRef(0);
  const sceneNowRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  // DOM refs
  const barRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const descRef = useRef<HTMLSpanElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const aiTextRef = useRef<HTMLDivElement>(null);
  const weatherTagRef = useRef<HTMLSpanElement>(null);
  const navDotsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const navItemsRef = useRef<(HTMLDivElement | null)[]>([]);

  const audio = useAudio();
  const audioRef = useRef(audio);
  audioRef.current = audio;

  const { generate, cleanup: cleanupAI } = useAIText();
  const generateRef = useRef(generate);
  generateRef.current = generate;

  const { fetchWeather, dataRef: weatherDataRef } = useWeather();
  const fetchWeatherRef = useRef(fetchWeather);
  fetchWeatherRef.current = fetchWeather;

  // ------ AI 触发 ------
  const triggerAI = useCallback(async (sceneIdx: number) => {
    const el = aiTextRef.current;
    if (!el) return;
    el.textContent = '';
    el.classList.add('typing-cursor');

    const weather = await fetchWeatherRef.current();
    const weatherText = weather?.text || '晴';
    const mood = weather?.mood || '明快';

    if (weatherTagRef.current) {
      weatherTagRef.current.textContent = `${weatherText} · ${mood}`;
      weatherTagRef.current.style.opacity = '1';
    }

    generateRef.current(
      SCENES[sceneIdx].name, weatherText,
      (char) => { if (aiTextRef.current) aiTextRef.current.textContent += char; },
      () => { if (aiTextRef.current) aiTextRef.current.classList.remove('typing-cursor'); }
    );
  }, []);

  const triggerAIRef = useRef(triggerAI);
  triggerAIRef.current = triggerAI;

  // ------ UI 更新 ------
  const updateUI = useCallback((si: number, pct: number) => {
    const sc = SCENES[si];
    if (barRef.current) {
      barRef.current.style.width = pct + '%';
      barRef.current.style.background = `linear-gradient(90deg, ${SCENES[0].color}, ${sc.color})`;
      barRef.current.style.boxShadow = `0 0 10px ${sc.color}`;
    }
    if (nameRef.current) nameRef.current.textContent = sc.name;
    if (descRef.current) descRef.current.textContent = sc.description;
    if (numRef.current) {
      numRef.current.textContent = `${si + 1}/5`;
      numRef.current.style.background = `${sc.color}28`;
      numRef.current.style.color = sc.color;
      numRef.current.style.borderColor = `${sc.color}44`;
    }
    if (cardRef.current) {
      cardRef.current.style.background = `linear-gradient(135deg, ${sc.color}22, ${sc.color}0a)`;
      cardRef.current.style.borderColor = `${sc.color}33`;
      cardRef.current.style.boxShadow = `0 8px 32px ${sc.color}18`;
    }
    if (glowRef.current) glowRef.current.style.background = sc.color;
    if (dotRef.current) { dotRef.current.style.background = sc.color; dotRef.current.style.boxShadow = `0 0 8px ${sc.color}`; }
    navItemsRef.current.forEach((el, i) => {
      if (!el) return;
      el.style.background = i === si ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
      el.style.color = i === si ? '#fff' : 'rgba(255,255,255,0.35)';
      el.style.transform = i === si ? 'scale(1.08)' : 'scale(1)';
    });
    navDotsRef.current.forEach((el, i) => {
      if (!el) return;
      el.style.background = i === si ? SCENES[i].color : 'rgba(255,255,255,0.2)';
      el.style.boxShadow = i === si ? `0 0 6px ${SCENES[i].color}` : 'none';
    });
  }, []);

  // ------ 地图 ------
  useEffect(() => {
    if ((window as any).AMap) { build(); return; }
    const s = document.createElement('script');
    s.src = 'https://webapi.amap.com/maps?v=2.0&key=bc32b030cbcb06e70075815bb0402b8b';
    s.async = true;
    s.onload = () => build();
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function build() {
    if (!boxRef.current || !(window as any).AMap) return;
    const A = (window as any).AMap;
    const map = new A.Map(boxRef.current, {
      zoom: 12, center: [114.05, 22.55],
      mapStyle: 'amap://styles/dark', viewMode: '2D', animateEnable: false,
    });
    mapRef.current = map;

    SCENE_BOUNDARIES.forEach((si, i) => {
      const ei = i < SCENE_BOUNDARIES.length - 1 ? SCENE_BOUNDARIES[i + 1] + 1 : N;
      new A.Polyline({
        path: ROUTE_POINTS.slice(si, ei).map(p => new A.LngLat(p[0], p[1])),
        strokeColor: SCENES[i].color, strokeWeight: 6, strokeOpacity: 0.85,
        lineJoin: 'round', lineCap: 'round', map,
      });
    });

    new A.CircleMarker({ center: new A.LngLat(ROUTE_POINTS[0][0], ROUTE_POINTS[0][1]), radius: 6, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, map });
    const lp = ROUTE_POINTS[N - 1];
    new A.CircleMarker({ center: new A.LngLat(lp[0], lp[1]), radius: 6, fillColor: '#ef4444', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, map });

    const car = new A.Marker({
      position: new A.LngLat(ROUTE_POINTS[0][0], ROUTE_POINTS[0][1]),
      anchor: 'center',
      content: `<div style="pointer-events:none;filter:drop-shadow(0 0 10px rgba(250,204,21,0.9)) drop-shadow(0 0 20px rgba(250,204,21,0.4));"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 17h1a2 2 0 1 0 4 0h4a2 2 0 1 0 4 0h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-.2-.6l-3-4A1 1 0 0 0 16 7H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1z" fill="#facc15"/><path d="M14 7v5h5.2" stroke="#b45309" stroke-width="1" fill="none"/><circle cx="7" cy="17" r="1.5" fill="#fff"/><circle cx="17" cy="17" r="1.5" fill="#fff"/></svg></div>`,
      offset: new A.Pixel(-16, -16),
      zIndex: 999, map,
    });
    carRef.current = car;

    map.setFitView(null, false, [80, 80, 200, 80]);
    setReady(true);
    fetchWeatherRef.current();
  }

  // ------ 动画 ------
  const tick = useCallback((ts: number) => {
    const A = (window as any).AMap;
    const car = carRef.current;
    const map = mapRef.current;
    if (!A || !car || !map) return;

    const globalT = Math.min((ts - t0Ref.current) / TOTAL_MS, 1);
    const raw = Math.min(globalT * SEG, SEG - 0.0001);
    const idx = Math.min(Math.floor(raw), N - 2);
    const t = raw - idx;

    const p1 = ROUTE_POINTS[idx];
    const p2 = ROUTE_POINTS[idx + 1];
    if (!p1 || !p2) { rafRef.current = requestAnimationFrame(tick); return; }

    const lng = lerp(p1[0], p2[0], t);
    const lat = lerp(p1[1], p2[1], t);

    car.setPosition(new A.LngLat(lng, lat));
    if (Math.floor(raw) % 3 === 0) map.setCenter(new A.LngLat(lng, lat));

    const si = getSceneIdx(idx);
    if (si !== sceneNowRef.current) {
      sceneNowRef.current = si;
      audioRef.current.play(SCENES[si]);
      triggerAIRef.current(si);
    }

    updateUI(si, globalT * 100);

    if (globalT >= 1) { pausedAtRef.current = 1; setPlaying(false); setDone(true); return; }
    rafRef.current = requestAnimationFrame(tick);
  }, [updateUI]);

  // ------ 控制 ------
  const go = useCallback(() => {
    if (!mapRef.current || !carRef.current) return;
    audioRef.current.init();
    if (done || pausedAtRef.current <= 0) {
      pausedAtRef.current = 0; setDone(false);
      sceneNowRef.current = 0;
      audioRef.current.play(SCENES[0]);
      updateUI(0, 0);
      const A = (window as any).AMap;
      carRef.current.setPosition(new A.LngLat(ROUTE_POINTS[0][0], ROUTE_POINTS[0][1]));
      triggerAIRef.current(0);
    }
    t0Ref.current = performance.now() - pausedAtRef.current * TOTAL_MS;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [done, tick, updateUI]);

  const pause = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    pausedAtRef.current = Math.min((performance.now() - t0Ref.current) / TOTAL_MS, 1);
    setPlaying(false);
  }, []);

  const reset = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    audioRef.current.stop(); cleanupAI();
    pausedAtRef.current = 0; sceneNowRef.current = 0;
    setPlaying(false); setDone(false);
    updateUI(0, 0);
    if (aiTextRef.current) { aiTextRef.current.textContent = ''; aiTextRef.current.classList.remove('typing-cursor'); }
    if (weatherTagRef.current) weatherTagRef.current.textContent = '';
    const A = (window as any).AMap;
    if (carRef.current && A) {
      carRef.current.setPosition(new A.LngLat(ROUTE_POINTS[0][0], ROUTE_POINTS[0][1]));
      mapRef.current?.setFitView(null, false, [80, 80, 200, 80]);
    }
  }, [updateUI, cleanupAI]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const sc0 = SCENES[0];

  // ============================================================
  // 渲染 — 响应式布局
  // ============================================================
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', height: '100dvh', overflow: 'hidden', background: '#0a0a0f' }}>

      {/* 进度条 */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, height: 3, paddingTop: 'var(--safe-top)' }}>
        <div style={{ height: '100%', background: 'rgba(255,255,255,0.06)' }}>
          <div ref={barRef} style={{ height: '100%', width: '0%', borderRadius: 2, transition: 'width 0.08s linear' }} />
        </div>
      </div>

      {/* 顶部导航 — 手机上更紧凑 */}
      <div style={{
        position: 'fixed',
        top: 'calc(8px + var(--safe-top))',
        left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, display: 'flex', gap: 4,
        maxWidth: '100vw', padding: '0 8px',
        overflowX: 'auto', overflowY: 'hidden',
        scrollbarWidth: 'none',
      }}>
        {SCENES.map((s, i) => (
          <div key={s.tag} ref={el => { navItemsRef.current[i] = el; }} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 9999,
            fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap',
            background: i === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
            color: i === 0 ? '#fff' : 'rgba(255,255,255,0.35)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            transition: 'all 0.4s', flexShrink: 0,
          }}>
            <span ref={el => { navDotsRef.current[i] = el; }} style={{
              width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
              background: i === 0 ? s.color : 'rgba(255,255,255,0.2)', transition: 'all 0.4s',
            }} />
            {s.name}
          </div>
        ))}
      </div>

      {/* 地图 */}
      <div ref={boxRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

      {/* 地图底部渐变遮罩 — 让卡片区域更易读 */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: '40vh',
        background: 'linear-gradient(to top, rgba(10,10,15,0.85) 0%, rgba(10,10,15,0.4) 50%, transparent 100%)',
        zIndex: 2, pointerEvents: 'none',
      }} />

      {/* 底部面板 */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 9999, pointerEvents: 'none',
        padding: '12px',
        paddingBottom: 'max(16px, calc(var(--safe-bottom) + 8px))',
      }}>
        <div style={{
          maxWidth: 420, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 8,
          pointerEvents: 'auto',
        }}>

          {/* 场景卡片 */}
          <div ref={cardRef} style={{
            position: 'relative', overflow: 'hidden', borderRadius: 14,
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            padding: '14px 16px', transition: 'all 0.6s ease',
            background: `linear-gradient(135deg, ${sc0.color}22, ${sc0.color}0a)`,
            border: `1px solid ${sc0.color}33`,
            boxShadow: `0 8px 32px ${sc0.color}18`,
          }}>
            <div ref={glowRef} style={{
              position: 'absolute', top: -32, right: -32, width: 80, height: 80,
              borderRadius: '50%', filter: 'blur(24px)', opacity: 0.2,
              background: sc0.color, transition: 'all 0.6s',
            }} />

            <div style={{ position: 'relative' }}>
              {/* 头部行 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span ref={dotRef} style={{
                    width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                    background: sc0.color, boxShadow: `0 0 6px ${sc0.color}`,
                  }} />
                  <span ref={nameRef} style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 600, fontSize: 15, letterSpacing: '0.02em' }}>
                    {sc0.name}
                  </span>
                  <span ref={weatherTagRef} style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.5)',
                    background: 'rgba(255,255,255,0.08)', padding: '2px 7px',
                    borderRadius: 99, opacity: 0, transition: 'opacity 0.4s',
                    letterSpacing: '0.03em',
                  }} />
                </div>
                <div ref={numRef} style={{
                  width: 36, height: 36, borderRadius: 10, fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${sc0.color}28`, color: sc0.color, border: `1px solid ${sc0.color}44`,
                  flexShrink: 0,
                }}>
                  1/5
                </div>
              </div>

              {/* 音乐风格 */}
              <span ref={descRef} style={{
                color: 'rgba(255,255,255,0.35)', fontSize: 12,
                fontFamily: 'ui-monospace, "SF Mono", monospace',
                letterSpacing: '0.04em',
              }}>
                {sc0.description}
              </span>

              {/* AI 文案 */}
              <div style={{
                marginTop: 8, minHeight: 22, paddingTop: 8,
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                  <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, flexShrink: 0, marginTop: 2 }}>✨ AI</span>
                  <div ref={aiTextRef} style={{
                    color: 'rgba(255,255,255,0.7)', fontSize: 13,
                    lineHeight: 1.6, fontStyle: 'italic',
                    letterSpacing: '0.02em',
                  }} />
                </div>
              </div>
            </div>
          </div>

          {/* 按钮 */}
          <div style={{ display: 'flex', gap: 8 }}>
            {!playing ? (
              <button onClick={go} disabled={!ready} style={{
                flex: 1, padding: 12, borderRadius: 11, fontWeight: 600, fontSize: 14,
                border: 'none', cursor: ready ? 'pointer' : 'not-allowed',
                opacity: ready ? 1 : 0.4, background: '#fff', color: '#0a0a0f',
                letterSpacing: '0.05em',
              }}>
                {done ? '▶  重新行驶' : pausedAtRef.current > 0 ? '▶  继续行驶' : '▶  开始行驶'}
              </button>
            ) : (
              <button onClick={pause} style={{
                flex: 1, padding: 12, borderRadius: 11, fontWeight: 600, fontSize: 14,
                border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                background: 'rgba(255,255,255,0.08)', color: '#fff',
                letterSpacing: '0.05em',
              }}>
                ⏸  暂停
              </button>
            )}
            <button onClick={reset} style={{
              padding: '12px 18px', borderRadius: 11, fontWeight: 600, fontSize: 15,
              border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.45)',
            }}>
              ↺
            </button>
          </div>

          {/* 品牌标识 */}
          <div style={{ textAlign: 'center', paddingTop: 2 }}>
            <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 10, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em' }}>
              随景 · SUIJING
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
const App = dynamic(() => Promise.resolve(MapCore), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100vw', height: '100vh', height: '100dvh',
      background: '#0a0a0f', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 24, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.6)', fontWeight: 300 }}>随景</div>
      <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, fontFamily: 'monospace' }}>加载中...</div>
    </div>
  ),
});

export default function Home() { return <App />; }
