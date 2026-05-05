/**
 * 文件上传组件
 * 支持拖拽和点击上传，配对识别，格式校验
 */

import React, { useRef, useState, useCallback } from 'react';

const ALLOWED_EXT = '.bin';
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

export default function FileUpload({ onFilesReady, disabled }) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  
  const validateFile = useCallback((file) => {
    // 格式校验
    if (!file.name.toLowerCase().endsWith(ALLOWED_EXT)) {
      return { valid: false, error: `"${file.name}" 不是 .bin 文件，仅允许上传 .bin 格式文件` };
    }
    
    // 大小校验
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `"${file.name}" 超过 1GB，请上传 ≤1GB 的 bin 文件` };
    }
    
    if (file.size === 0) {
      return { valid: false, error: `"${file.name}" 是空文件` };
    }
    
    return { valid: true, error: null };
  }, []);
  
  const processFiles = useCallback((files) => {
    const fileArray = Array.from(files);
    const validated = [];
    const errors = [];
    
    // 不能超过2个文件
    if (fileArray.length > 2) {
      errors.push('一次最多上传 2 个文件（索引+像素成对）');
      setUploadedFiles([]);
      onFilesReady({ files: [], errors });
      return;
    }
    
    for (const file of fileArray) {
      const result = validateFile(file);
      if (result.valid) {
        validated.push(file);
      } else {
        errors.push(result.error);
      }
    }
    
    setUploadedFiles(validated);
    
    if (validated.length > 0) {
      onFilesReady({ files: validated, errors });
    } else {
      onFilesReady({ files: [], errors });
    }
  }, [validateFile, onFilesReady]);
  
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    if (disabled) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files);
    }
  }, [disabled, processFiles]);
  
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);
  
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);
  
  const handleClick = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);
  
  const handleFileChange = useCallback((e) => {
    const files = e.target.files;
    if (files.length > 0) {
      processFiles(files);
    }
    // 重置input以允许重新选择同一文件
    e.target.value = '';
  }, [processFiles]);
  
  const handleReset = useCallback(() => {
    setUploadedFiles([]);
    onFilesReady({ files: [], errors: [], reset: true });
  }, [onFilesReady]);
  
  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        style={{
          border: `2px dashed ${dragOver ? '#3b82f6' : '#d1d5db'}`,
          borderRadius: 12,
          padding: '24px 16px',
          textAlign: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: dragOver ? '#eff6ff' : '#f9fafb',
          transition: 'all 0.2s',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".bin"
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        
        <div style={{ fontSize: 32, marginBottom: 8, color: dragOver ? '#3b82f6' : '#9ca3af' }}>
          📁
        </div>
        <p style={{ margin: '4px 0', fontSize: 14, color: '#6b7280' }}>
          {dragOver ? '释放文件以上传' : '拖拽文件到此处，或点击上传'}
        </p>
        <p style={{ margin: '4px 0', fontSize: 12, color: '#9ca3af' }}>
          支持 adrn+real 或 spradrn+spr 成对 bin 文件
        </p>
      </div>
      
      {uploadedFiles.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {uploadedFiles.map((file, idx) => (
            <div key={idx} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              backgroundColor: '#f0fdf4',
              borderRadius: 8,
              fontSize: 13,
              color: '#16a34a',
              marginBottom: 4,
            }}>
              <span>✓</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </span>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>
                {(file.size / 1024 / 1024).toFixed(1)}MB
              </span>
            </div>
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); handleReset(); }}
            style={{
              marginTop: 8,
              padding: '4px 12px',
              fontSize: 12,
              color: '#6b7280',
              backgroundColor: '#fff',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            重新上传
          </button>
        </div>
      )}
    </div>
  );
}
