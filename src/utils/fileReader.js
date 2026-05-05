/**
 * 大文件流式读取工具
 * Blob.slice 按需读取，不一次加载全部到内存
 */

const SLICE_SIZE = 4 * 1024 * 1024; // 4MB 分块读取

/**
 * 从 Blob 中读取指定偏移和长度的数据
 * @param {Blob} blob
 * @param {number} offset
 * @param {number} length
 * @returns {Promise<ArrayBuffer>}
 */
export async function readBlobSlice(blob, offset, length) {
  const end = Math.min(offset + length, blob.size);
  if (offset >= blob.size) {
    throw new Error(`偏移 ${offset} 超出文件范围 (${blob.size})`);
  }
  const slice = blob.slice(offset, end);
  return await slice.arrayBuffer();
}

/**
 * 只读取文件头部
 */
export async function readFileHead(blob, bytes = 20 * 1024 * 1024) {
  const size = Math.min(bytes, blob.size);
  return readBlobSlice(blob, 0, size);
}

/** 完整读取小文件（≤100MB） */
export async function readFileAsArrayBuffer(file) {
  if (file.size > 100 * 1024 * 1024) {
    throw new Error(`文件太大 (${(file.size / 1024 / 1024).toFixed(0)}MB)，只支持索引等小文件完整读取`);
  }
  return await file.arrayBuffer();
}

/**
 * 分步读取文件到 ArrayBuffer（支持超大文件，每步让出主线程）
 * 适合需要完整读入但不想卡 UI 的场景
 */
export async function readFileInChunks(file, onProgress) {
  const CHUNK = 4 * 1024 * 1024; // 4MB 每块
  const totalSize = file.size;
  const chunks = [];
  let totalRead = 0;

  while (totalRead < totalSize) {
    const end = Math.min(totalRead + CHUNK, totalSize);
    const blob = file.slice(totalRead, end);
    const buf = await blob.arrayBuffer();
    chunks.push(buf);
    totalRead += buf.byteLength;
    if (onProgress) onProgress(totalRead, totalSize);
    // 每块读完让出主线程
    await new Promise(r => setTimeout(r, 0));
  }

  if (chunks.length === 1) return chunks[0];

  const total = totalSize;
  const result = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(new Uint8Array(chunk), pos);
    pos += chunk.byteLength;
  }
  return result.buffer;
}

/**
 * RGB565 像素数据转 RGBA
 */
export function convertRGB565ToRGBA(buffer, transColor, width, height) {
  const dataView = new DataView(buffer);
  const pixelCount = Math.floor(buffer.byteLength / 2);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const maxPixels = Math.min(pixelCount, width * height);
  
  for (let i = 0; i < maxPixels; i++) {
    const val = dataView.getUint16(i * 2, true);
    const r = ((val >> 11) & 0x1F) << 3;
    const g = ((val >> 5) & 0x3F) << 2;
    const b = (val & 0x1F) << 3;
    
    const idx = i * 4;
    rgba[idx] = r;
    rgba[idx + 1] = g;
    rgba[idx + 2] = b;
    rgba[idx + 3] = (transColor !== null && val === transColor) ? 0 : 255;
  }
  
  return rgba;
}
