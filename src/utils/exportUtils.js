/**
 * ZIP 打包工具
 * 使用 JSZip 批量导出图片
 */
import JSZip from 'jszip';

/**
 * 打包多个 Blob 为 ZIP
 * @param {Array<{name:string, blob:Blob}>} files
 * @returns {Promise<Blob>} ZIP Blob
 */
export async function packToZip(files) {
  const zip = new JSZip();
  
  for (const file of files) {
    zip.file(file.name, file.blob);
  }
  
  return await zip.generateAsync({ type: 'blob' });
}

/**
 * 触发浏览器下载
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * 获取带前缀的宠物文件名
 */
export function getPetFilename(id, format = 'png', suffix = '') {
  const idStr = String(id).padStart(3, '0');
  if (suffix) {
    return `${idStr}_${suffix}.${format}`;
  }
  return `${idStr}_宠物图.${format}`;
}
