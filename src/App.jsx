/**
 * App 主组件 - 使用 Web Worker 做解析,主线程完全不阻塞
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

import FileUpload from './components/FileUpload';
import IdListPanel from './components/IdListPanel';
import { StaticPreview, AnimationPreview } from './components/PreviewPanel';
import { Toast, HelpPanel } from './components/UIComponents';

import { readAdrnBuffer, parseAdrnSync, readSpradrnBuffer, loadStaticImage, loadAnimationGroup, parseSapPalette } from './parsers/staticParser';
import { packToZip, downloadBlob, getPetFilename } from './utils/exportUtils';

export default function App() {
  const [indexFile, setIndexFile] = useState(null);
  const [pixelFile, setPixelFile] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [fileStatus, setFileStatus] = useState('idle');
  const [staticEntries, setStaticEntries] = useState(null);
  const [animGroups, setAnimGroups] = useState(null);
  const [currentImageData, setCurrentImageData] = useState(null);
  const [currentDataUrl, setCurrentDataUrl] = useState(null);
  const [currentImageInfo, setCurrentImageInfo] = useState(null);
  const [scrollToId, setScrollToId] = useState(null); // 用于 IdListPanel 联动滚动
  const [imageLoading, setImageLoading] = useState(false);
  const [currentFrames, setCurrentFrames] = useState([]);
  const [currentAnimInfo, setCurrentAnimInfo] = useState(null);
  const [animLoading, setAnimLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [staticPaletteIndex, setStaticPaletteIndex] = useState(1);
  // 7.5 客户端的 SAP 三字节颜色按 BGR 存储；PALET_1 是常态色盘。
  const [staticColorOrder, setStaticColorOrder] = useState('bgr');

  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const [showHelp, setShowHelp] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [errorLog, setErrorLog] = useState('');
  const [showFirstGuide, setShowFirstGuide] = useState(true);
  const [exportProgress, setExportProgress] = useState('');

  const workerRef = useRef(null);
  const realBlobRef = useRef(null);
  const sprBlobRef = useRef(null);
  const palettesRef = useRef(null);
  const loadedCache = useRef(new Map());
  const staticLoadRequestRef = useRef(0);

  // 清理 Worker
  useEffect(() => {
    const workerVersion = Date.now();
    workerRef.current = new Worker('/parser.worker.js?v=' + workerVersion);
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  useEffect(() => {
    if (showFirstGuide) {
      const timer = setTimeout(() => setShowFirstGuide(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [showFirstGuide]);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
  }, []);

  const identifyFileType = useCallback((filename) => {
    const lower = filename.toLowerCase();
    if (lower.startsWith('adrn') || lower.includes('adrn')) return 'index-static';
    if (lower.startsWith('real') || lower.includes('real')) return 'pixel-static';
    if (lower.startsWith('spradrn') || lower.includes('spradrn')) return 'index-animation';
    if (lower.startsWith('spr') || lower.includes('spr')) return 'pixel-animation';
    return 'unknown';
  }, []);

  // 用 Worker 解析 adrn
  const parseAdrnInWorker = useCallback((buffer) => {
    return new Promise((resolve, reject) => {
      const worker = workerRef.current;
      if (!worker) { reject(new Error('Worker not ready')); return; }

      const handler = (e) => {
        const { type, payload } = e.data;
        if (type === 'adrnResult') { resolve(payload); }
        else if (type === 'error') { reject(new Error(payload)); }
        worker.removeEventListener('message', handler);
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'parseAdrn', payload: { buffer } }, [buffer]);
    });
  }, []);

  // 用 Worker 解析 spradrn
  const parseSpradrnInWorker = useCallback((buffer) => {
    return new Promise((resolve, reject) => {
      const worker = workerRef.current;
      if (!worker) { reject(new Error('Worker not ready')); return; }

      const handler = (e) => {
        const { type, payload } = e.data;
        if (type === 'spradrnResult') { resolve(payload); }
        else if (type === 'error') { reject(new Error(payload)); }
        worker.removeEventListener('message', handler);
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'parseSpradrn', payload: { buffer } }, [buffer]);
    });
  }, []);

  const pendingIndexRef = useRef(null);
  const pendingPixelRef = useRef(null);

  // 处理文件上传
  const handleFilesReady = useCallback(async ({ files, errors, reset }) => {
    if (reset) {
      setIndexFile(null); setPixelFile(null); setFileType(null);
      setFileStatus('idle'); setStaticEntries(null); setAnimGroups(null);
      setCurrentImageData(null); setCurrentImageInfo(null);
      setCurrentFrames([]); setCurrentAnimInfo(null);
      setSelectedIds(new Set()); setErrorLog('');
      realBlobRef.current = null; sprBlobRef.current = null;
      staticLoadRequestRef.current += 1;
      loadedCache.current.clear();
      pendingIndexRef.current = null; pendingPixelRef.current = null;
      return;
    }

    if (errors.length > 0) {
      errors.forEach(err => showToast(err, 'error'));
      setErrorLog(prev => prev + errors.join('\n') + '\n');
      return;
    }
    if (files.length === 0) return;

    const types = files.map(f => ({ file: f, type: identifyFileType(f.name) }));
    const newIndex = types.filter(t => t.type === 'index-static' || t.type === 'index-animation');
    const newPixel = types.filter(t => t.type === 'pixel-static' || t.type === 'pixel-animation');

    if (newIndex.length > 0) pendingIndexRef.current = newIndex[0];
    if (newPixel.length > 0) pendingPixelRef.current = newPixel[0];

    const idxFile = pendingIndexRef.current;
    const pxFile = pendingPixelRef.current;

    if (idxFile) setIndexFile(idxFile.file);
    if (pxFile) setPixelFile(pxFile.file);

    if (idxFile && pxFile) {
      const isIdxStatic = idxFile.type === 'index-static';
      setFileStatus('paired');

      try {
        setParsing(true);
        showToast('正在读取索引文件...', 'info');

        if (isIdxStatic) {
          setFileType('static');
          realBlobRef.current = pxFile.file;

          // 读 adrn → 解析 → 完成
          const adrnBuf = await readAdrnBuffer(idxFile.file);
          showToast('正在解析索引...', 'info');

          console.log('正在同步解析...');
          const { entries } = parseAdrnSync(adrnBuf);
          console.log('解析完成:', entries.length, '个条目');



          // 加载调色板（从 public/palettes 加载）
          try {
            const baseUrl = '/palettes/';
            const palettes = [];
            for (let pi = 0; pi <= 15; pi++) {
              const name = pi === 0 ? 'Palet_0.sap' : 'PALET_' + pi + '.SAP';
              const resp = await fetch(baseUrl + name);
              if (resp.ok) palettes.push(parseSapPalette(await resp.arrayBuffer()));
              else palettes.push(null);
            }
            palettesRef.current = palettes;
            const loaded = palettes.filter(p => p !== null).length;
            showToast(`调色板加载完成 (${loaded}/16)`, 'success');
          } catch(e) {
            palettesRef.current = null;
            console.warn('调色板加载失败:', e);
          }

          setStaticEntries(entries);
          loadedCache.current.clear();
          if (!entries || entries.length === 0) {
            showToast('解析没有返回条目!', 'error');
          }

          const validCount = entries.filter(e => e.width > 0 && e.height > 0).length;
          console.log('Setting done: validCount=' + validCount + ' entries.length=' + entries.length);
          showToast(`解析完成!共 ${validCount} 个宠物,点击 ID 加载`, 'success');
          setFileStatus('done');
        } else {
          setFileType('animation');
          sprBlobRef.current = pxFile.file;

          const spradrnBuf = await readSpradrnBuffer(idxFile.file);
          showToast('正在后台解析动画索引...', 'info');

          const groups = await parseSpradrnInWorker(spradrnBuf);
          setAnimGroups(groups);
          loadedCache.current.clear();

          const validCount = groups.filter(g => g.frameCount > 0).length;
          showToast(`解析完成!共 ${validCount} 组动画,点击 ID 加载`, 'success');
          setFileStatus('done');
        }
      } catch (e) {
        showToast(`解析失败:${e.message}`, 'error');
        setErrorLog(prev => prev + `解析错误: ${e.message}\n`);
        setFileStatus('error');
      }
      setParsing(false);
    } else if (idxFile) {
      setFileStatus('uploading');
      showToast(`已上传索引文件,请上传像素文件`, 'info');
    } else if (pxFile) {
      setFileStatus('uploading');
      showToast(`已上传像素文件,请上传索引文件`, 'info');
    }
  }, [identifyFileType, showToast, parseSpradrnInWorker]);

  const handleSelectStatic = useCallback(async (id, settings = {}) => {
    if (!staticEntries || !realBlobRef.current) return;
    const entry = staticEntries.find(e => e.id === id);
    if (!entry) return;

    const paletteIndex = settings.paletteIndex ?? staticPaletteIndex;
    const colorOrder = settings.colorOrder ?? staticColorOrder;
    const requestId = ++staticLoadRequestRef.current;

    // 联动左侧列表：背景色高亮，但不滚动（滑轮切换时才会滚动）

    const cacheKey = `static_${id}_p${paletteIndex}_${colorOrder}`;
    if (loadedCache.current.has(cacheKey)) {
      const c = loadedCache.current.get(cacheKey);
      if (requestId !== staticLoadRequestRef.current) return;
      console.log("setCurrentDataUrl from cache, url length=" + (c.dataUrl ? c.dataUrl.length : 0));
      setCurrentDataUrl(c.dataUrl);
      setCurrentImageInfo({ id: entry.id, width: c.width, height: c.height, paletteIndex, colorOrder });
      setCurrentImageData(c.imageData);
      setCurrentFrames([]);
      setImageLoading(false);
      return;
    }

    setImageLoading(true);
    setCurrentImageData(null);
    setCurrentFrames([]);

    const result = await loadStaticImage(realBlobRef.current, entry, palettesRef.current, { paletteIndex, colorOrder });
    if (requestId !== staticLoadRequestRef.current) return;
    if (result.dataUrl) {
      loadedCache.current.set(cacheKey, result);
      console.log("setCurrentDataUrl called, url length=" + (result.dataUrl ? result.dataUrl.length : 0));
      setCurrentDataUrl(result.dataUrl);
      setCurrentImageInfo({ id: entry.id, width: result.width, height: result.height, paletteIndex, colorOrder });
      setCurrentImageData(result.imageData);
    } else if (result.error) {
      showToast(`加载 ID ${entry.id} 失败: ${result.error}`, 'error');
    }
    setImageLoading(false);

  }, [staticEntries, showToast, staticPaletteIndex, staticColorOrder]);

  const handlePaletteIndexChange = useCallback((event) => {
    const paletteIndex = Number(event.target.value);
    setStaticPaletteIndex(paletteIndex);
    if (currentImageInfo?.id != null) {
      handleSelectStatic(currentImageInfo.id, { paletteIndex, colorOrder: staticColorOrder });
    }
  }, [currentImageInfo, handleSelectStatic, staticColorOrder]);

  const handleColorOrderChange = useCallback((event) => {
    const colorOrder = event.target.value;
    setStaticColorOrder(colorOrder);
    if (currentImageInfo?.id != null) {
      handleSelectStatic(currentImageInfo.id, { paletteIndex: staticPaletteIndex, colorOrder });
    }
  }, [currentImageInfo, handleSelectStatic, staticPaletteIndex]);

// 预加载附近条目的缓存
let preloadTaskId = 0;
function preloadNearbyEntries(realBlob, entries, currentEntry, palettes, cache, settings = {}) {
  const taskId = ++preloadTaskId;
  const idx = entries.findIndex(e => e.id === currentEntry.id);
  if (idx < 0) return;
  
  // 每隔 500 条，取前后各 1000 条（共 2000 条范围）
  const PRELOAD_RANGE = 1000;
  const STEP = 500;
  const start = Math.max(0, idx - PRELOAD_RANGE);
  const end = Math.min(entries.length, idx + PRELOAD_RANGE + 1);
  
  // 分批处理，不阻塞主线程
  setTimeout(async () => {
    if (taskId !== preloadTaskId) return; // 新任务取消了旧任务
    for (let i = start; i < end; i++) {
      const e = entries[i];
      const paletteIndex = settings.paletteIndex ?? 1;
      const colorOrder = settings.colorOrder ?? 'bgr';
      const key = `static_${e.id}_p${paletteIndex}_${colorOrder}`;
      if (cache.has(key)) continue;
      // 只在 STEP 间隔的边界加载
      if ((i - start) % STEP !== 0 && (i - start) !== 0 && (i - start) !== (end - start - 1)) continue;
      try {
        const result = await loadStaticImage(realBlob, e, palettes, settings);
        if (result.dataUrl) {
          cache.set(key, result);
        }
      } catch {
        // 静默失败
      }
    }
  }, 200); // 延迟 200ms 在主加载完成后执行
}

  const handlePrevStatic = useCallback(() => {
    if (!staticEntries || currentImageInfo == null) return;
    const idx = staticEntries.findIndex(e => e.id === currentImageInfo.id);
    if (idx > 0) {
      const prevId = staticEntries[idx - 1].id;
      setScrollToId(prevId);
      handleSelectStatic(prevId);
    }
  }, [staticEntries, currentImageInfo, handleSelectStatic]);

  const handleNextStatic = useCallback(() => {
    if (!staticEntries || currentImageInfo == null) return;
    const idx = staticEntries.findIndex(e => e.id === currentImageInfo.id);
    if (idx < staticEntries.length - 1) {
      const nextId = staticEntries[idx + 1].id;
      setScrollToId(nextId);
      handleSelectStatic(nextId);
    }
  }, [staticEntries, currentImageInfo, handleSelectStatic]);

  const handleSelectAnimation = useCallback(async (id) => {
    if (!animGroups || !sprBlobRef.current) return;
    const group = animGroups.find(g => g.id === id);
    if (!group) return;

    const cacheKey = `anim_${id}`;
    if (loadedCache.current.has(cacheKey)) {
      const frames = loadedCache.current.get(cacheKey);
      setCurrentFrames(frames);
      setCurrentAnimInfo({ id: group.id, frameCount: frames.length, delay: group.delay });
      setCurrentImageData(null);
      return;
    }

    setAnimLoading(true);
    setCurrentFrames([]);
    setCurrentImageData(null);

    const frames = await loadAnimationGroup(sprBlobRef.current, group);
    loadedCache.current.set(cacheKey, frames);
    setCurrentFrames(frames);
    setCurrentAnimInfo({ id: group.id, frameCount: frames.length, delay: group.delay });
    setAnimLoading(false);
  }, [animGroups, showToast]);

  const handleToggleSelect = useCallback((id) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const handleSelectAll = useCallback(() => {
    const items = staticEntries || animGroups || [];
    // 全选最多 2000 条,超过则提示
    if (items.length > 2000) {
      showToast('批量导出最多支持 2000 项', 'warning');
      setSelectedIds(new Set(items.slice(0, 2000).map(r => r.id)));
    } else {
      setSelectedIds(new Set(items.map(r => r.id)));
    }
  }, [staticEntries, animGroups, showToast]);

  const handleDeselectAll = useCallback(() => setSelectedIds(new Set()), []);

  const handleExportStatic = useCallback(async (format = 'png') => {
    if (!currentDataUrl || !currentImageInfo) { showToast('当前无图片可导出', 'warning'); return; }
    const { id, width, height } = currentImageInfo;
    const mimeType = format === 'bmp' ? 'image/bmp' : 'image/png';
    // 统一走 canvas，用 scale(1, -1) 翻转回正
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = currentDataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.translate(0, height);
    ctx.scale(1, -1);
    ctx.drawImage(img, 0, 0);
    const finalBlob = await new Promise(r => canvas.toBlob(r, mimeType));
    downloadBlob(finalBlob, getPetFilename(id, format));
    showToast('下载成功', 'success');
  }, [currentDataUrl, currentImageInfo, showToast]);

  const handleBatchExport = useCallback(async (format = 'png') => {
    if (selectedIds.size === 0) { showToast('请先选择项目', 'warning'); return; }
    const items = fileType === 'static' ? staticEntries : animGroups;
    if (!items) { showToast('无数据', 'warning'); return; }
    const selected = items.filter(r => selectedIds.has(r.id));
    if (selected.length === 0) { showToast('所选无数据', 'warning'); return; }

    const mimeType = format === 'bmp' ? 'image/bmp' : 'image/png';
    const ext = format === 'bmp' ? 'bmp' : 'png';
    setExportProgress(`加载中 ${selected.length} 项...`);
    try {
      const files = [];
      for (let i = 0; i < selected.length; i++) {
        if (fileType === 'static') {
          const result = await loadStaticImage(realBlobRef.current, selected[i], palettesRef.current, {
            paletteIndex: staticPaletteIndex,
            colorOrder: staticColorOrder,
          });
          if (result.dataUrl) {
            // 用 img 加载 dataUrl 再 draw 到 canvas 做翻转
            const img = await new Promise((resolve, reject) => {
              const ii = new Image();
              ii.onload = () => resolve(ii);
              ii.onerror = reject;
              ii.src = result.dataUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = result.width; canvas.height = result.height;
            const ctx = canvas.getContext('2d');
            ctx.translate(0, result.height);
            ctx.scale(1, -1);
            ctx.drawImage(img, 0, 0);
            const blob = await new Promise(r => canvas.toBlob(r, mimeType));
            files.push({ name: getPetFilename(selected[i].id, ext), blob });
          }
        }
        setExportProgress(`加载中... ${i + 1}/${selected.length}`);
      }
      if (files.length === 0) { showToast('无图片可导出', 'warning'); setExportProgress(''); return; }
      setExportProgress('打包 ZIP...');
      const zipBlob = await packToZip(files);
      downloadBlob(zipBlob, `宠物_批量导出.${ext}.zip`);
      showToast(`下载成功:共 ${files.length} 张`, 'success');
    } catch (e) { showToast(`导出失败:${e.message}`, 'error'); }
    setExportProgress('');
  }, [selectedIds, fileType, staticEntries, animGroups, showToast, staticPaletteIndex, staticColorOrder]);

  const handleExportAnimationFrame = useCallback(async (frameIdx) => {
    const frame = currentFrames[frameIdx];
    if (!frame?.imageData) { showToast('当前帧无数据', 'warning'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = frame.imageData.width; canvas.height = frame.imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(frame.imageData, 0, 0);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    downloadBlob(blob, getPetFilename(currentAnimInfo?.id || 0, 'png', `f${String(frameIdx).padStart(2,'0')}`));
    showToast('下载成功', 'success');
  }, [currentFrames, currentAnimInfo, showToast]);

  const handleExportAnimationFrames = useCallback(async () => {
    if (currentFrames.length === 0) { showToast('无帧数据', 'warning'); return; }
    setExportProgress(`打包 ${currentFrames.length} 帧...`);
    try {
      const files = [];
      for (let i = 0; i < currentFrames.length; i++) {
        const frame = currentFrames[i];
        if (frame?.imageData) {
          const canvas = document.createElement('canvas');
          canvas.width = frame.imageData.width; canvas.height = frame.imageData.height;
          const ctx = canvas.getContext('2d');
          ctx.putImageData(frame.imageData, 0, 0);
          const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
          files.push({ name: getPetFilename(currentAnimInfo?.id||0, 'png', String(i).padStart(2,'0')), blob });
        }
      }
      const zipBlob = await packToZip(files);
      downloadBlob(zipBlob, `动画_${String(currentAnimInfo?.id||0).padStart(3,'0')}_帧序列.zip`);
      showToast(`下载成功:共 ${files.length} 帧`, 'success');
    } catch (e) { showToast(`导出失败:${e.message}`, 'error'); }
    setExportProgress('');
  }, [currentFrames, currentAnimInfo, showToast]);

  const handleExportGIF = useCallback(async () => {
    const valid = currentFrames.filter(f => f?.imageData);
    if (valid.length < 2) { showToast('至少 2 帧才能导出 GIF', 'warning'); return; }
    setExportProgress('生成 GIF...');
    try {
      const GIF = (await import('gif.js')).default;
      const maxW = Math.max(...valid.map(f => f.imageData.width));
      const maxH = Math.max(...valid.map(f => f.imageData.height));
      const gif = new GIF({ workers: 2, quality: 10, width: maxW, height: maxH, repeat: 0 });
      for (const frame of valid) {
        const tmp = document.createElement('canvas');
        tmp.width = maxW; tmp.height = maxH;
        const ctx = tmp.getContext('2d');
        ctx.putImageData(frame.imageData, Math.floor((maxW - frame.imageData.width)/2), Math.floor((maxH - frame.imageData.height)/2));
        gif.addFrame(tmp, { delay: (currentAnimInfo?.delay||1)*16, copy: true });
      }
      const blob = await new Promise((resolve, reject) => {
        gif.on('progress', p => setExportProgress(`GIF ${Math.round(p*100)}%...`));
        gif.on('finished', resolve); gif.on('error', reject);
        gif.render();
      });
      downloadBlob(blob, getPetFilename(currentAnimInfo?.id||0, 'gif'));
      showToast('GIF 导出成功', 'success');
    } catch (e) { showToast(`GIF 导出失败: ${e.message}`, 'warning'); }
    setExportProgress('');
  }, [currentFrames, currentAnimInfo, showToast]);

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#f5f5f5',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans SC", sans-serif',
      color: '#1f2937',
    }}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={() => setToast(prev => ({...prev, visible: false}))} />
      <HelpPanel visible={showHelp} onClose={() => setShowHelp(false)} />

      {showFirstGuide && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1e40af', color: '#fff', padding: '12px 24px', borderRadius: 10,
          fontSize: 13, zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          animation: 'slideUp 0.5s ease', maxWidth: '80%', textAlign: 'center',
        }}>
          🎯 上传文件 → 点击 ID → 预览导出
        </div>
      )}

      <header style={{
        backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="logo" style={{ height: 48, width: 'auto' }} />
          石器时代宠物图片解析工具
        </h1>
        <button onClick={() => setShowHelp(true)} title="帮助" aria-label="打开帮助" style={{
          width: 36, height: 36, borderRadius: '50%', border: '1px solid #d1d5db',
          backgroundColor: '#fff', cursor: 'pointer', fontSize: 18, color: '#6b7280',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>?</button>
      </header>

      <div style={{
        maxWidth: 1400, margin: '0 auto', padding: '16px 16px',
        display: 'flex', gap: 16, minHeight: 'calc(100vh - 80px)', height: 'calc(100vh - 80px)',
      }}>
        <div style={{
          flex: '0 0 328px', backgroundColor: '#fff', borderRadius: 12,
          border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
            <FileUpload onFilesReady={handleFilesReady} disabled={parsing} />
            {fileStatus === 'uploading' && (
              <div style={{ marginTop: 8, padding: '8px 12px', backgroundColor: '#fef3c7', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                ⚠️ 请上传配对的{indexFile && !pixelFile ? '像素文件(real/spr)' : '索引文件(adrn/spradrn)'}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            {fileType === 'static' && staticEntries && (
              <IdListPanel
                items={staticEntries} type="static"
                selectedId={currentImageInfo?.id}
                onSelect={handleSelectStatic}
                selectedIds={selectedIds} onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll} onDeselectAll={handleDeselectAll}
                onBatchExport={handleBatchExport}
                loading={parsing || imageLoading} hasData={fileStatus === 'done'}
                scrollToId={scrollToId}
              />
            )}
            {fileType === 'animation' && animGroups && (
              <IdListPanel
                items={animGroups} type="animation"
                selectedId={currentAnimInfo?.id}
                onSelect={handleSelectAnimation}
                selectedIds={selectedIds} onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll} onDeselectAll={handleDeselectAll}
                onBatchExport={handleBatchExport}
                loading={parsing || animLoading} hasData={fileStatus === 'done'}
              />
            )}
            {!fileType && fileStatus === 'idle' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 13, padding: 20, textAlign: 'center' }}>
                <div><div style={{ marginBottom: 8 }}><img src="/logo.png" alt="logo" style={{ height: 120, width: 'auto' }} /></div><div>请上传 adrn+real 或 spradrn+spr 文件</div></div>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid #e5e7eb', fontSize: 14,
            fontWeight: 500, color: '#6b7280', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          }}>
            <span>预览 {imageLoading || animLoading ? '(加载中...)' : ''}</span>
            {fileType === 'static' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 400 }}>
                  <span>调色板</span>
                  <select
                    value={staticPaletteIndex}
                    onChange={handlePaletteIndexChange}
                    aria-label="静态图片调色板"
                    title="REAL 文件只保存颜色索引，请选择客户端实际使用的 SAP 调色板"
                    style={{
                      minWidth: 82, height: 36, padding: '0 28px 0 10px', borderRadius: 6,
                      border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', cursor: 'pointer',
                    }}
                  >
                    {Array.from({ length: 16 }, (_, index) => (
                      <option key={index} value={index}>PALET_{index}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 400 }}>
                  <span>颜色顺序</span>
                  <select
                    value={staticColorOrder}
                    onChange={handleColorOrderChange}
                    aria-label="SAP 颜色通道顺序"
                    title="石器时代 7.5 客户端使用 BGR；RGB 仅用于兼容其他版本或转换工具"
                    style={{
                      minWidth: 108, height: 36, padding: '0 28px 0 10px', borderRadius: 6,
                      border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', cursor: 'pointer',
                    }}
                  >
                    <option value="bgr">BGR（7.5 正确）</option>
                    <option value="rgb">RGB（其他版本）</option>
                  </select>
                </label>
              </div>
            )}
          </div>
          {fileType === 'static' && (
            <div style={{
              padding: '7px 16px', backgroundColor: '#eff6ff', borderBottom: '1px solid #dbeafe',
              color: '#1e40af', fontSize: 12, lineHeight: 1.5,
            }}>
              已按 7.5 客户端的常态规则默认使用 PALET_1 + BGR。PALET_0、2–15 是变色/特效色盘；只有其他版本素材颜色异常时再切换。
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {!fileType && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 14, padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
                <p style={{ margin: '0 0 8px', fontWeight: 500 }}>选择文件后即可预览</p>
                <p style={{ margin: 0, fontSize: 13, color: '#b0b7c3' }}>支持 adrn+real 静态图 或 spradrn+spr 动画</p>
              </div>
            )}
            {fileType === 'static' && (
              <StaticPreview canvas={currentDataUrl} width={currentImageInfo?.width||0} height={currentImageInfo?.height||0}
                id={currentImageInfo?.id} onExport={handleExportStatic} loading={imageLoading}
                onPrev={handlePrevStatic} onNext={handleNextStatic} />
            )}
            {fileType === 'animation' && (
              <AnimationPreview frames={currentFrames} frameCount={currentAnimInfo?.frameCount||0} delay={currentAnimInfo?.delay||1}
                id={currentAnimInfo?.id} onExportFrame={handleExportAnimationFrame}
                onExportGIF={handleExportGIF} onExportFrames={handleExportAnimationFrames} loading={animLoading} />
            )}
            {exportProgress && (
              <div style={{ textAlign: 'center', padding: '8px 16px', backgroundColor: '#eff6ff', color: '#3b82f6', fontSize: 13, borderTop: '1px solid #e5e7eb' }}>
                {exportProgress}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer style={{ backgroundColor: '#fff', borderTop: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#9ca3af' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><img src="/logo.png" alt="logo" style={{ height: 20, width: 'auto' }} /> 石器时代宠物图片解析工具 | 纯本地解析,不上传服务器</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {errorLog && (
            <button onClick={() => { navigator.clipboard?.writeText(errorLog); showToast('已复制', 'info'); }}
              style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              查看错误日志
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
