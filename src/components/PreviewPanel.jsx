import React, { useRef, useState, useEffect, useCallback } from 'react';

const SCROLL_SPEEDS = [1, 10, 100, 500, 1000, 2000, 5000, 10000];

function ZoomableCanvas({ canvas, width, height, onPrev, onNext }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(3);
  const sliderRef = useRef(null);
  
  // --- 自动滚动逻辑（全在组件内） ---
  const timerRef = useRef(null);
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);
  onPrevRef.current = onPrev;
  onNextRef.current = onNext;

  const [dir, setDir] = useState(null); // null | 'up' | 'down'
  const [speed, setSpeed] = useState(1);
  const dirRef = useRef(dir);
  dirRef.current = dir;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const start = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const base = 1500;
    const ms = Math.max(10, base / speedRef.current);
    timerRef.current = setInterval(() => {
      if (dirRef.current === 'up') onPrevRef.current?.();
      else if (dirRef.current === 'down') onNextRef.current?.();
    }, ms);
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const toggle = useCallback((d) => {
    setDir(prev => prev === d ? null : d);
  }, []);

  useEffect(() => {
    if (dir) start(); else stop();
  }, [dir, start, stop]);

  useEffect(() => {
    if (dir) start();
  }, [speed, dir, start]);

  // --- 用户交互时停止滚动 ---
  const handleCanvasClick = useCallback(() => {
    if (timerRef.current) { stop(); setDir(null); }
    if (onNext) onNext();
  }, [onNext, stop]);

  const handleWheel = useCallback((e) => {
    if (!onPrev || !onNext) return;
    e.preventDefault();
    if (timerRef.current) { stop(); setDir(null); }
    if (e.deltaY < 0) onPrev();
    else onNext();
  }, [onPrev, onNext, stop]);
  
  const handleSliderChange = useCallback((e) => {
    setScale(Number(e.target.value));
  }, []);
  
  // 如果 canvas 是 data URL (string)，用 img 显示
  if (typeof canvas === 'string') {
    return (
      <div style={{
        width: '100%', flex: 1, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        backgroundColor: '#f3f4f6',
      }}>
        <div ref={containerRef} onWheel={handleWheel} onClick={handleCanvasClick} style={{
          flex: 1, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#f3f4f6', position: 'relative',
        }}>
          <div style={{
            transform: 'scale(' + scale + ', ' + (-scale) + ')',
            transformOrigin: 'center center',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img
              src={canvas}
              alt="pet"
              style={{ imageRendering: 'pixelated', maxWidth: 'none', userSelect: 'none' }}
            />
          </div>
        </div>
        <div style={{
          padding: '8px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          backgroundColor: '#fff', borderTop: '1px solid #e5e7eb',
        }}>
          {/* ▲ ▼ 自动滚动按钮 + 速度按钮 */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
            <button onClick={() => toggle('up')}
              title={dir === 'up' ? '停止向上滚动' : '向上自动滚动'}
              style={{
                padding: '4px 10px', fontSize: 13, fontWeight: 600,
                border: '1px solid ' + (dir === 'up' ? '#3b82f6' : '#d1d5db'),
                borderRadius: 4, cursor: 'pointer',
                backgroundColor: dir === 'up' ? '#eff6ff' : '#fff',
                color: dir === 'up' ? '#1e40af' : '#6b7280',
              }}
            >▲</button>
            <button onClick={() => toggle('down')}
              title={dir === 'down' ? '停止向下滚动' : '向下自动滚动'}
              style={{
                padding: '4px 10px', fontSize: 13, fontWeight: 600,
                border: '1px solid ' + (dir === 'down' ? '#3b82f6' : '#d1d5db'),
                borderRadius: 4, cursor: 'pointer',
                backgroundColor: dir === 'down' ? '#eff6ff' : '#fff',
                color: dir === 'down' ? '#1e40af' : '#6b7280',
              }}
            >▼</button>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
              style={{
                padding: '4px 6px', fontSize: 11, fontWeight: 600,
                border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer',
                backgroundColor: '#fff', color: '#6b7280', fontFamily: 'monospace',
                outline: 'none',
              }}
            >
              {SCROLL_SPEEDS.map(s => (
                <option key={s} value={s}>{s}×</option>
              ))}
            </select>
          </div>
          <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>缩放:</span>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>0.5×</span>
          <input
            ref={sliderRef}
            type="range"
            min="0.5"
            max="8"
            step="0.1"
            value={scale}
            onChange={handleSliderChange}
            style={{ flex: 1, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, color: '#9ca3af' }}>8×</span>
          <span style={{
            fontSize: 12, fontFamily: 'monospace',
            color: '#374151', fontWeight: 500,
            minWidth: 40, textAlign: 'right',
          }}>
            {Math.round(scale * 100)}%
          </span>
        </div>
      </div>
    );
  }
  
  if (!canvas) {
    return (
      <div style={{
        width: '100%', height: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#9ca3af', fontSize: 14, backgroundColor: '#f3f4f6',
      }}>
        点击左侧 ID 加载图片
      </div>
    );
  }
  
  return null;
}

export function StaticPreview({ canvas, width, height, id, onExport, loading, onPrev, onNext }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ZoomableCanvas canvas={canvas} width={width} height={height} onPrev={onPrev} onNext={onNext} />
      <div style={{ padding: '8px 4px' }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8, display: 'flex', gap: 16 }}>
          <span>ID: <strong>{String(id).padStart(3, '0')}</strong></span>
          <span>尺寸: <strong>{width} × {height}</strong></span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onExport('png')} disabled={!canvas}
            style={{ padding: '8px 16px', fontSize: 13, color: '#fff', backgroundColor: canvas ? '#3b82f6' : '#e5e7eb', border: 'none', borderRadius: 6, cursor: canvas ? 'pointer' : 'not-allowed', fontWeight: 500 }}>
            导出 PNG
          </button>
          <button onClick={() => onExport('bmp')} disabled={!canvas}
            style={{ padding: '8px 16px', fontSize: 13, color: '#374151', backgroundColor: canvas ? '#fff' : '#f3f4f6', border: canvas ? '1px solid #d1d5db' : '1px solid #e5e7eb', borderRadius: 6, cursor: canvas ? 'pointer' : 'not-allowed' }}>
            导出 BMP
          </button>
        </div>
      </div>
    </div>
  );
}

export function AnimationPreview({ frames, frameCount, delay, id, onExportFrame, onExportGIF, onExportFrames, loading }) {
  const containerRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef(null);
  
  const frameDelay = (delay || 100) / speed;
  
  useEffect(() => {
    if (!playing || !frames || frames.length === 0) return;
    timerRef.current = setInterval(() => {
      setCurrentFrame(prev => (prev + 1) % frames.length);
    }, frameDelay * 16);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, frames, frameDelay]);
  
  const hasFrames = frames && frames.length > 0;
  
  return (
    <div>
      <div style={{
        width: '100%', height: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#f3f4f6', position: 'relative',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3b82f6', fontSize: 14 }}>
            <div style={{ width: 16, height: 16, border: '2px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            加载动画中...
          </div>
        ) : hasFrames ? (
          <img
            src={frames[currentFrame]?.dataUrl}
            alt="frame"
            style={{ imageRendering: 'pixelated', maxWidth: 'none' }}
          />
        ) : (
          <span style={{ color: '#9ca3af', fontSize: 14 }}>无帧数据</span>
        )}
      </div>
      
      <div style={{ padding: '8px 4px' }}>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>ID: <strong>{String(id).padStart(3, '0')}</strong></span>
          <span>帧数: <strong>{frameCount}</strong></span>
          <span>当前: <strong>{currentFrame + 1}/{frameCount}</strong></span>
        </div>
        
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setPlaying(p => !p)} disabled={!hasFrames}
            style={{ padding: '6px 12px', fontSize: 13, color: '#fff', backgroundColor: hasFrames ? '#3b82f6' : '#e5e7eb', border: 'none', borderRadius: 6, cursor: hasFrames ? 'pointer' : 'not-allowed' }}>
            {playing ? '暂停' : '播放'}
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>速度:</span>
          {[0.5, 1, 2].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              style={{ padding: '4px 10px', fontSize: 12, color: speed === s ? '#fff' : '#374151', backgroundColor: speed === s ? '#3b82f6' : '#f3f4f6', border: speed === s ? 'none' : '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}>
              {s}×
            </button>
          ))}
        </div>
        
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => onExportFrame(currentFrame)} disabled={!hasFrames}
            style={{ padding: '8px 16px', fontSize: 13, color: '#fff', backgroundColor: hasFrames ? '#3b82f6' : '#e5e7eb', border: 'none', borderRadius: 6, cursor: hasFrames ? 'pointer' : 'not-allowed', fontWeight: 500 }}>
            导出当前帧 PNG
          </button>
          <button onClick={onExportGIF} disabled={!hasFrames || frames.length < 2}
            style={{ padding: '8px 16px', fontSize: 13, color: hasFrames && frames.length >= 2 ? '#fff' : '#9ca3af', backgroundColor: hasFrames && frames.length >= 2 ? '#059669' : '#e5e7eb', border: 'none', borderRadius: 6, cursor: hasFrames && frames.length >= 2 ? 'pointer' : 'not-allowed' }}>
            导出 GIF
          </button>
          <button onClick={onExportFrames} disabled={!hasFrames}
            style={{ padding: '8px 16px', fontSize: 13, color: '#374151', backgroundColor: hasFrames ? '#fff' : '#f3f4f6', border: hasFrames ? '1px solid #d1d5db' : '1px solid #e5e7eb', borderRadius: 6, cursor: hasFrames ? 'pointer' : 'not-allowed' }}>
            导出帧序列 ZIP
          </button>
        </div>
      </div>
    </div>
  );
}
