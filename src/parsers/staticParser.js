// SAP 调色板 — 16固定色 + 236文件色
const FIXED_COLORS = {
  0x00: [0x00,0x00,0x00], 0x01: [0x00,0x00,0x80], 0x02: [0x00,0x80,0x00], 0x03: [0x00,0x80,0x80],
  0x04: [0x80,0x00,0x00], 0x05: [0x80,0x00,0x80], 0x06: [0x80,0x80,0x00], 0x07: [0xC0,0xC0,0xC0],
  0x08: [0xC0,0xDC,0xC0], 0x09: [0xF0,0xCA,0xA6], 0x0A: [0x00,0x00,0xDE], 0x0B: [0x00,0x5F,0xFF],
  0x0C: [0xA0,0xFF,0xFF], 0x0D: [0xD2,0x5F,0x00], 0x0E: [0xFF,0xD2,0x50], 0x0F: [0x28,0xE1,0x28],
  0xF0: [0x96,0xC3,0xF5], 0xF1: [0x5F,0xA0,0x1E], 0xF2: [0x46,0x7D,0xC3], 0xF3: [0x1E,0x55,0x9B],
  0xF4: [0x37,0x41,0x46], 0xF5: [0x1E,0x23,0x28], 0xF6: [0xF0,0xFB,0xFF], 0xF7: [0xA5,0x6E,0x3A],
  0xF8: [0x80,0x80,0x80], 0xF9: [0x00,0x00,0xFF], 0xFA: [0x00,0xFF,0x00], 0xFB: [0x00,0xFF,0xFF],
  0xFC: [0xFF,0x00,0x00], 0xFD: [0xFF,0x80,0xFF], 0xFE: [0xFF,0xFF,0x00], 0xFF: [0xFF,0xFF,0xFF]
};

// SAP 调色板缓存
let _palettes = null;
let _palDir = null;

export function readAdrnBuffer(adrnBlob) {
  return new Promise((resolve, reject) => {
    if (adrnBlob.size > 200 * 1024 * 1024) {
      reject(new Error('adrn 文件超过 200MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('读取 adrn 失败'));
    reader.readAsArrayBuffer(adrnBlob);
  });
}

export function readSpradrnBuffer(spradrnBlob) {
  return new Promise((resolve, reject) => {
    if (spradrnBlob.size > 200 * 1024 * 1024) {
      reject(new Error('spradrn 文件超过 200MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('读取 spradrn 失败'));
    reader.readAsArrayBuffer(spradrnBlob);
  });
}

function readSlice(file, offset, length) {
  return new Promise((resolve, reject) => {
    const blob = file.slice(offset, offset + length);
    const reader = new FileReader();
    reader.onload = (e) => resolve(new Uint8Array(e.target.result));
    reader.onerror = () => reject(new Error('读取像素失败'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * 加载 SAP 调色板文件
 * @param {string} dir - 调色板文件夹路径（input 元素的 files 列表）
 */
/**
 * 解析单个 SAP 调色板文件
 * 格式：236色 × 3字节 RGB + 16固定色（0-15和252-255）= 708 字节
 */
export function parseSapPalette(buffer) {
  const palette = new Array(256);
  // 初始化为固定色
  for (let i = 0; i < 256; i++) {
    palette[i] = FIXED_COLORS[i] || [0, 0, 0];
  }
  // 文件中的 236 色从索引 16 开始
  const view = new DataView(buffer);
  for (let i = 0; i < 236 && (i * 3 + 2) < buffer.byteLength; i++) {
    const idx = 16 + i;
    palette[idx] = [
      view.getUint8(i * 3),
      view.getUint8(i * 3 + 1),
      view.getUint8(i * 3 + 2)
    ];
  }
  return palette; // 256 x [R,G,B]
}

/**
 * 从 File 对象加载调色板
 */
export async function loadPalettesFromInput(fileList) {
  const palettes = [];
  for (let i = 0; i <= 15; i++) {
    const expectedName = i === 0 ? 'Palet_0.sap' : 'PALET_' + i + '.SAP';
    const file = Array.from(fileList).find(f => f.name === expectedName || f.name.toUpperCase() === expectedName.toUpperCase());
    if (file) {
      const buf = await file.arrayBuffer();
      palettes.push(parseSapPalette(buf));
    } else {
      palettes.push(null);
    }
  }
  return palettes;
}

/**
 * 异步读取 real 文件的某一段（压缩的 RLE 数据）
 */
async function readRleData(realFile, entry) {
  const { rleOffset, rleLength } = entry;
  if (rleOffset < 0 || !rleLength) return null;
  try {
    const blob = realFile.slice(rleOffset, rleOffset + rleLength);
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = (e) => resolve(new Uint8Array(e.target.result));
      reader.onerror = () => reject(new Error('读取 RLE 数据失败'));
      reader.readAsArrayBuffer(blob);
    });
  } catch (e) {
    return null;
  }
}

/**
 * JSS-RLE 解压算法
 * 每个字节的高4位是命令，低4位是参数
 * 
 * 命令:
 * 0n: output n raw bytes
 * 1n m: output (n*256+m) raw bytes
 * 2x y z: output (x*65536+y*256+z) raw bytes
 * 8n X: fill n copies of color X
 * 9n X m: fill (n*256+m) copies of color X
 * Ax X y z: fill (x*65536+y*256+z) copies of color X
 * Cn: fill n background (transparent, index 0)
 * Dn m: fill (n*256+m) background
 * Ex y z: fill (x*65536+y*256+z) background
 * 
 * 非压缩模式（version 为偶数时）：直接返回原始数据
 */
function decompressJSSRLE(input, expectedLength) {
  const out = new Uint8Array(expectedLength);
  let ip = 0, op = 0;

  while (ip < input.length && op < expectedLength) {
    const cmd = input[ip++];
    const hi = (cmd >> 4) & 0x0F;
    const lo = cmd & 0x0F;

    switch (hi) {
      case 0x0: { // 0n: output n raw bytes
        for (let i = 0; i < lo && ip < input.length; i++) {
          out[op++] = input[ip++];
        }
        break;
      }
      case 0x1: { // 1n m: output (n*256+m) raw bytes
        const count = (lo * 256) + input[ip++];
        for (let i = 0; i < count && ip < input.length; i++) {
          out[op++] = input[ip++];
        }
        break;
      }
      case 0x2: { // 2x y z: output (x*65536+y*256+z) raw bytes
        const y = input[ip++], z = input[ip++];
        const count = (lo * 65536) + (y * 256) + z;
        for (let i = 0; i < count && ip < input.length; i++) {
          out[op++] = input[ip++];
        }
        break;
      }
      case 0x8: { // 8n X: fill n copies of color X
        const color = input[ip++];
        for (let i = 0; i < lo && op < expectedLength; i++) out[op++] = color;
        break;
      }
      case 0x9: { // 9n X m: fill (n*256+m) copies of color X
        const color = input[ip++], m = input[ip++];
        const count = (lo * 256) + m;
        for (let i = 0; i < count && op < expectedLength; i++) out[op++] = color;
        break;
      }
      case 0xA: { // Ax X y z: fill (x*65536+y*256+z) copies of color X
        const color = input[ip++], y = input[ip++], z = input[ip++];
        const count = (lo * 65536) + (y * 256) + z;
        for (let i = 0; i < count && op < expectedLength; i++) out[op++] = color;
        break;
      }
      case 0xC: { // Cn: fill n background (transparent, index 0)
        for (let i = 0; i < lo && op < expectedLength; i++) out[op++] = 0;
        break;
      }
      case 0xD: { // Dn m: fill (n*256+m) background
        const m = input[ip++];
        const count = (lo * 256) + m;
        for (let i = 0; i < count && op < expectedLength; i++) out[op++] = 0;
        break;
      }
      case 0xE: { // Ex y z: fill (x*65536+y*256+z) background
        const y = input[ip++], z = input[ip++];
        const count = (lo * 65536) + (y * 256) + z;
        for (let i = 0; i < count && op < expectedLength; i++) out[op++] = 0;
        break;
      }
      default:
        // 忽略未知命令
        break;
    }
  }
  return out;
}

/**
 * 静态图片加载——使用 JSS-RLE 解码 + SAP 调色板
 *
 * RD_HEADER 的 0x02 字段是压缩标志，不是调色板编号。REAL/ADRN
 * 本身不携带可靠的逐图调色板信息，因此由调用方明确指定 SAP 调色板。
 */
export async function loadStaticImage(realFile, entry, palettes, options = {}) {
  const { id, width, height } = entry;
  const { paletteIndex = 1, colorOrder = 'bgr' } = options;
  const pixelCount = width * height;
  
  try {
    // 读取压缩数据
    const rleData = await readRleData(realFile, entry);
    if (!rleData || rleData.length < 2) {
      return { id, width, height, dataUrl: null, error: '图像数据不足' };
    }
    
    // JSS-RLE 解码得到 8-bit 调色板索引
    const pixelData = decompressJSSRLE(rleData, pixelCount);
    
    // 获取对应的调色板 (256 x [R,G,B])
    const palette = palettes && palettes[paletteIndex];
    if (!palette) {
      return { id, width, height, dataUrl: null, error: `调色板 ${paletteIndex} 未加载` };
    }
    
    // Canvas 渲染：索引0=透明
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    
    for (let i = 0; i < pixelCount; i++) {
      const idx = i < pixelData.length ? pixelData[i] : 0;
      const p = i * 4;
      if (idx === 0) {
        // 索引0 = 透明
        data[p] = 0; data[p+1] = 0; data[p+2] = 0; data[p+3] = 0;
      } else {
        const color = palette[idx] || [0, 0, 0];
        // 石器时代 7.5 客户端的 SAP 色值按 BGR 存储。RGB 仅保留为
        // 其他客户端版本或第三方转换文件的兼容选项。
        data[p] = colorOrder === 'bgr' ? color[2] : color[0];
        data[p+1] = color[1];
        data[p+2] = colorOrder === 'bgr' ? color[0] : color[2];
        data[p+3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    const dataUrl = c.toDataURL('image/png');
    
    return { id, width, height, dataUrl, paletteIndex, colorOrder, error: null };
  } catch (e) {
    return { id, width, height, dataUrl: null, error: e.message };
  }
}

export async function loadAnimationGroup(sprFile, frames, imageWidth, imageHeight) {
  const results = [];
  for (let i = 0; i < frames.length && i < 256; i++) {
    const frame = frames[i];
    const pixelBytes = (imageWidth || frame.width) * (imageHeight || frame.height) * 2;
    try {
      const pixelData = await readSlice(sprFile, frame.offset, pixelBytes);
      if (!pixelData || pixelData.length < 16) continue;
      const w = frame.width || imageWidth || 64;
      const h = frame.height || imageHeight || 64;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const imageData = ctx.createImageData(w, h);
      const d = imageData.data;
      for (let j = 0; j < w * h && j * 2 + 1 < pixelData.length; j++) {
        const val = (pixelData[j * 2 + 1] << 8) | pixelData[j * 2];
        const r = ((val >> 11) & 0x1F) << 3;
        const g = ((val >> 5) & 0x3F) << 2;
        const b = (val & 0x1F) << 3;
        const idx = j * 4;
        d[idx] = r; d[idx+1] = g; d[idx+2] = b;
        d[idx+3] = (val === 0) ? 0 : 255;
      }
      ctx.putImageData(imageData, 0, 0);
      results.push({ dataUrl: c.toDataURL('image/png'), width: w, height: h });
    } catch (e) {}
  }
  return results;
}

/**
 * 同步解析 adrn 文件，使用真实偏移（adrn[4] + 16）
 * 并存储 RLE 数据长度（来自 adrn[8]）
 */
export function parseAdrnSync(buffer) {
  const dv = new DataView(buffer);
  const totalBytes = buffer.byteLength;
  const entries = [];
  
  // 尝试 80 字节步进（先读第一个验证）
  let stride = 80;
  const firstW = dv.getInt32(0 + 20, true);
  const firstH = dv.getInt32(0 + 24, true);
  if (firstW <= 0 || firstW > 2048 || firstH <= 0 || firstH > 2048) {
    stride = 40;
  }
  
  for (let i = 0; i < totalBytes; i += stride) {
    const realOffset = dv.getUint32(i + 4, true);   // bytes 4-7: real 文件中 RD 头偏移
    const rleTotalLen = dv.getUint32(i + 8, true);    // bytes 8-11: 到下一个 RD 头的长度（含头）
    const w = dv.getInt32(i + 20, true);
    const h = dv.getInt32(i + 24, true);
    if (w <= 0 || h <= 0 || w > 2048 || h > 2048 || w < 10 || h < 10) continue;
    const pixelBytes = w * h * 2;
    if (pixelBytes > 5000000) continue;
    const transRaw = dv.getInt32(i + 32, true);
    
    // 从 realOffset+16 开始是 RLE 数据，长度 rleTotalLen-16
    entries.push({
      // SPR 帧引用的是 ADRN 记录下标。跳过无效记录时不能重新连续编号，
      // 否则搜索到的图像 ID 会与真实宠物动画引用错位。
      id: Math.floor(i / stride),
      offset: realOffset + 16,       // RLE 数据在 real 文件中的偏移
      rleOffset: realOffset + 16,    // 同 offset，供 readRleData 使用
      rleLength: rleTotalLen - 16,   // RLE 压缩数据长度
      width: w,
      height: h,
      transColor: transRaw & 0xFFFF,
      length: pixelBytes,
    });
  }

  return { entrySize: stride, entries };
}
