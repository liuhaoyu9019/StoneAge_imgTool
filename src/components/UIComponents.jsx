/**
 * UI 通用组件
 */

import React from 'react';

/**
 * 提示条组件 - 页面顶部/底部的轻量提示
 */
export function Toast({ message, type = 'info', visible, onClose }) {
  if (!visible) return null;
  
  const bgColor = type === 'error' ? '#fee2e2' : 
                   type === 'success' ? '#dcfce7' : 
                   type === 'warning' ? '#fef3c7' : '#e0f2fe';
  const textColor = type === 'error' ? '#dc2626' : 
                    type === 'success' ? '#16a34a' : 
                    type === 'warning' ? '#d97706' : '#0369a1';
  
  return (
    <div style={{
      position: 'fixed',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      backgroundColor: bgColor,
      color: textColor,
      padding: '12px 24px',
      borderRadius: 8,
      fontSize: 14,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      maxWidth: '80%',
      wordBreak: 'break-word',
      animation: 'slideDown 0.3s ease',
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button 
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 18,
          color: textColor,
          padding: '0 4px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * 加载动画组件
 */
export function LoadingSpinner({ text = '处理中...' }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 24,
    }}>
      <div style={{
        width: 20,
        height: 20,
        border: '3px solid #e5e7eb',
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span style={{ color: '#6b7280', fontSize: 14 }}>{text}</span>
    </div>
  );
}

/**
 * 简易帮助面板
 */
export function HelpPanel({ visible, onClose }) {
  if (!visible) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: 320,
      height: '100%',
      backgroundColor: '#fff',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
      zIndex: 900,
      padding: '24px 20px',
      overflowY: 'auto',
      animation: 'slideIn 0.3s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: '#1f2937' }}>操作说明</h3>
        <button onClick={onClose} aria-label="关闭帮助" style={{
          background: 'none',
          border: 'none',
          fontSize: 24,
          cursor: 'pointer',
          color: '#6b7280',
          padding: '0 4px',
        }}>×</button>
      </div>
      
      <div style={{ fontSize: 14, lineHeight: 1.8, color: '#374151' }}>
        <p><strong>第一步：上传文件</strong></p>
        <p style={{ color: '#6b7280', marginLeft: 8, marginBottom: 12 }}>
          拖拽或点击上传 adrn+real（静态图）或 spradrn+spr（动画）成对 bin 文件。先上传索引文件（adrn/spradrn），再上传像素文件（real/spr）。
        </p>
        
        <p><strong>第二步：选择预览</strong></p>
        <p style={{ color: '#6b7280', marginLeft: 8, marginBottom: 12 }}>
          左侧列表点击图像 ID，右侧显示对应图片/动画。7.5 客户端静态图默认使用 PALET_1 + BGR；也可手动切换色盘和颜色顺序。动画支持播放/暂停，可调节速度。
        </p>
        
        <p><strong>第三步：导出</strong></p>
        <p style={{ color: '#6b7280', marginLeft: 8, marginBottom: 12 }}>
          支持单张导出 PNG/BMP，批量导出 ZIP 打包，动画支持 GIF/帧序列导出。
        </p>
        
        <p><strong>常见问题</strong></p>
        <p style={{ color: '#6b7280', marginLeft: 8 }}>
          • 文件配对失败？请确保文件名前缀一致，如 adrn_00.bin + real_00.bin<br/>
          • 宠物颜色不同？7.5 的正确常态组合是 PALET_1 + BGR；PALET_0、2–15 主要用于变色/特效<br/>
          • 图片花屏？可能是文件不完整或版本不匹配<br/>
          • 全部在本地解析，文件不会上传到服务器
        </p>
      </div>
    </div>
  );
}

/**
 * 确认对话框
 */
export function ConfirmDialog({ visible, title, message, onConfirm, onCancel }) {
  if (!visible) return null;
  
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999,
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: '24px 28px',
        minWidth: 320,
        maxWidth: 420,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        {title && <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#1f2937' }}>{title}</h3>}
        <p style={{ margin: 0, fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onCancel} style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            backgroundColor: '#fff',
            color: '#374151',
            fontSize: 14,
            cursor: 'pointer',
          }}>取消</button>
          <button onClick={onConfirm} style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            backgroundColor: '#3b82f6',
            color: '#fff',
            fontSize: 14,
            cursor: 'pointer',
          }}>确定</button>
        </div>
      </div>
    </div>
  );
}
