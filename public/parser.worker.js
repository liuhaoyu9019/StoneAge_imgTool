/**
 * 解析 Worker - 所有重计算在后台线程完成
 * 支持分页返回，避免一次传输大量数据
 */

const PAGE_SIZE = 500;

self.onmessage = function(e) {
  const { type, payload, page } = e.data;
  
  try {
    if (type === 'parseAdrn') {
      const result = parseAdrnFromBuffer(payload.buffer, payload.adrnSize);
      self.postMessage({ type: 'adrnResult', payload: result }, [payload.buffer]);
      
    } else if (type === 'parseAdrnPage') {
      const result = parseAdrnPage(payload.buffer, payload.page, PAGE_SIZE);
      self.postMessage({
        type: 'adrnPageResult',
        payload: {
          page: payload.page,
          entries: result.entries,
          totalValid: result.total,
          isLast: result.isLast,
        }
      });
      
    } else if (type === 'parseSpradrn') {
      const result = parseSpradrnFromBuffer(payload.buffer);
      self.postMessage({ type: 'spradrnResult', payload: result }, [payload.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', payload: err.message });
  }
};

function detectSize(fileSize, candidates) {
  for (const s of candidates) { if (fileSize % s === 0) return s; }
  let best = candidates[0], bestRem = Infinity;
  for (const s of candidates) { const r = fileSize % s; if (r < bestRem) { bestRem = r; best = s; } }
  return best;
}

/**
 * adrn_15.bin 格式已验证（80字节条距，40字节有效）：
 *   bytes 20-23: width (int32, LE)
 *   bytes 24-27: height (int32, LE)
 *   bytes 32-35: transColor (int32, 低16位有效, 0xFFFFD8F0 → trans=0xD8F0)
 *   bytes 16-19: 不明（0xFFFFD8E8），不可用作 offset
 *   bytes 0-15:  头部/标识
 *   bytes 36-39: 不明（0x0101 等，可能是名称标记或序列号）
 *   bytes 40-79: 全零填充
 *
 * 像素数据在 real 文件中**连续排列**（按条目顺序）。
 * offset = 前 i 个有效条目像素字节数之和。
 */
function parseAdrnFromBuffer(buffer, adrnSize) {
  const STEP = 80; // 已验证：实际有效条目间隔 80 字节
  const dataView = new DataView(buffer);
  const totalBlocks = Math.floor(buffer.byteLength / 4); // 4字节一组检查
  const entries = [];
  let runningOffset = 0;
  
  for (let i = 0; i < totalBlocks; i += 20) { // 每20个4字节 = 80字节
    const off = i * 4;
    // 这是 40 字节数据的开头
    const w = dataView.getInt32(off + 20, true);
    const h = dataView.getInt32(off + 24, true);
    const transRaw = dataView.getInt32(off + 32, true);
    
    if (w <= 0 || h <= 0) continue;
    if (w > 2048 || h > 2048 || w < 10 || h < 10) continue;
    
    const pixelBytes = w * h * 2;
    if (pixelBytes > 5000000) continue;
    
    const transColor = transRaw & 0xFFFF; // 取低16位
    
    entries.push({
      id: entries.length,
      offset: runningOffset,
      width: w,
      height: h,
      transColor: transColor,
      length: pixelBytes,
      name: '',
    });
    
    runningOffset += pixelBytes;
  }
  
  if (entries.length === 0) {
    // 如果上述格式不匹配，尝试 40 字节格式
    const entrySize = 40;
    const count = Math.floor(buffer.byteLength / entrySize);
    for (let i = 0; i < count; i++) {
      const off = i * entrySize;
      const w = dataView.getInt32(off + 20, true);
      const h = dataView.getInt32(off + 24, true);
      if (w <= 0 || h <= 0) continue;
      if (w > 2048 || h > 2048 || w < 10 || h < 10) continue;
      const pixelBytes = w * h * 2;
      if (pixelBytes > 5000000) continue;
      const transRaw = dataView.getInt32(off + 32, true);
      entries.push({
        id: entries.length,
        offset: 0,
        width: w,
        height: h,
        transColor: transRaw & 0xFFFF,
        length: pixelBytes,
        name: '',
      });
    }
  }
  
  if (entries.length === 0) throw new Error('adrn 无效');
  return { entrySize: 80, entries };
}

function parseAdrnPage(buffer, page, pageSize) {
  const STEP = 80;
  const dataView = new DataView(buffer);
  const totalBlocks = Math.floor(buffer.byteLength / 4);
  let validCount = 0;
  let runningOffset = 0;
  const pageStart = page * pageSize;
  const pageEnd = pageStart + pageSize;
  const pageEntries = [];
  
  for (let i = 0; i < totalBlocks; i += 20) {
    const off = i * 4;
    const w = dataView.getInt32(off + 20, true);
    const h = dataView.getInt32(off + 24, true);
    
    if (w <= 0 || h <= 0 || w > 2048 || h > 2048 || w < 10 || h < 10) continue;
    const pixelBytes = w * h * 2;
    if (pixelBytes > 5000000) continue;
    
    if (validCount >= pageStart && validCount < pageEnd) {
      const transRaw = dataView.getInt32(off + 32, true);
      pageEntries.push({
        id: validCount,
        offset: runningOffset,
        width: w, height: h,
        transColor: transRaw & 0xFFFF,
        length: pixelBytes,
        name: '',
      });
    }
    validCount++;
    runningOffset += pixelBytes;
  }
  
  return {
    entries: pageEntries,
    total: validCount,
    isLast: pageEnd >= validCount,
  };
}

function parseSpradrnFromBuffer(buffer) {
  const fileSize = buffer.byteLength;
  if (fileSize < 8) throw new Error('spradrn 文件太小');
  
  const dataView = new DataView(buffer);
  const candidates = [32, 40, 48, 64, 68, 80, 128, 144, 160];
  const headerVal = dataView.getUint32(0, true);
  let entrySize, count, hasHeader;
  
  if (headerVal > 0 && headerVal < 5000) {
    const wh = fileSize - 4;
    for (const s of candidates) {
      if (wh % s === 0 && wh / s === headerVal) { entrySize = s; count = headerVal; hasHeader = true; break; }
    }
  }
  if (!entrySize) {
    for (const s of candidates) {
      if (fileSize % s === 0) { const c = fileSize / s; if (c >= 1 && c <= 5000) { entrySize = s; count = c; hasHeader = false; break; } }
    }
  }
  if (!entrySize) {
    for (const s of candidates) { if ((fileSize - 4) % s === 0) { const c = (fileSize - 4) / s; if (c >= 1 && c <= 5000) { entrySize = s; count = c; hasHeader = true; break; } } }
  }
  if (!entrySize) { entrySize = 64; count = Math.floor(fileSize / 64); hasHeader = false; }
  
  const startOffset = hasHeader ? 4 : 0;
  const groups = [];
  for (let g = 0; g < count; g++) {
    const offset = startOffset + g * entrySize;
    const group = { id: g, frameCount: 1, delay: 100, defaultWidth: 64, defaultHeight: 64, frameOffsets: [] };
    for (const pos of [2, 4, 6, 8, 10, 12, 18, 20, 24]) {
      if (offset + pos + 2 <= fileSize) { const val = dataView.getUint16(offset + pos, true); if (val > 0 && val < 256) { group.frameCount = val; break; } }
    }
    for (const pos of [4, 6, 8, 10, 12, 14, 16]) {
      if (offset + pos + 2 <= fileSize) { const val = dataView.getUint16(offset + pos, true); if (val > 0 && val < 100) { group.delay = val; break; } }
    }
    for (const [wp, hp] of [[4, 6], [20, 22], [24, 26], [32, 34]]) {
      if (offset + wp + 2 <= fileSize && offset + hp + 2 <= fileSize) {
        const w = dataView.getUint16(offset + wp, true); const h = dataView.getUint16(offset + hp, true);
        if (w > 0 && w < 2048 && h > 0 && h < 2048) { group.defaultWidth = w; group.defaultHeight = h; break; }
      }
    }
    for (const pos of [24, 28, 32, 36, 40, 44, 48, 52, 56, 60]) {
      if (offset + pos + 4 * group.frameCount <= fileSize) {
        const offsets = []; let valid = true;
        for (let f = 0; f < Math.min(group.frameCount, 256); f++) {
          const fo = dataView.getUint32(offset + pos + f * 4, true);
          if (fo > 50000000 || fo < 0) { valid = false; break; }
          offsets.push(fo);
        }
        if (valid && offsets.length > 0) { group.frameOffsets = offsets; break; }
      }
    }
    groups.push(group);
  }
  return groups;
}

function readAdrnEntry(dv, offset, entrySize) {
  // 旧函数保留仅供兼容
  const entry = {};
  // 80字节步进 + 正确字段偏移
  entry.width = dv.getInt32(offset + 20, true);
  entry.height = dv.getInt32(offset + 24, true);
  const transRaw = dv.getInt32(offset + 32, true);
  entry.transColor = transRaw & 0xFFFF;
  entry.offset = 0;
  return entry;
}
