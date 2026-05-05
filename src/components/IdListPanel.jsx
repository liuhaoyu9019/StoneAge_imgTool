/**
 * ID 列表面板 - 虚拟滚动版本
 * 只渲染可视区域的条目，支持海量数据（24万+）
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';

const ITEM_HEIGHT = 32; // 每个条目的高度
const OVERSCAN = 10;    // 上下额外渲染的行数

export default function IdListPanel({
  items,
  type,
  selectedId,
  onSelect,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onBatchExport,
  loading,
  hasData,
  scrollToId,
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);
  
  // 测量容器高度：在 hasData 变化时重新测量
  const measureHeight = useCallback(() => {
    if (containerRef.current) {
      const h = containerRef.current.clientHeight;
      if (h > 0) setContainerHeight(h);
    }
  }, []);
  
  useEffect(() => {
    measureHeight();
    const handleResize = () => measureHeight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [hasData, measureHeight]);
  
  // 用 selectedIds 作为依赖，确保选中变化时列表重新计算
  // 注意: 这些 const 声明必须放在 displayItems 之前，因为 displayItems 引用了 searchTerm 和 filteredItems
  const [searchTerm, setSearchTerm] = useState('');
  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (!searchTerm) return items;
    const term = searchTerm.toLowerCase();
    // 如果是纯数字搜索，显示匹配项前后各 10 个，方便上下切换
    if (/^\d+$/.test(term)) {
      const targetNum = parseInt(term, 10);
      const exactIdx = items.findIndex(item => {
        const id = item.id ?? item;
        return id === targetNum;
      });
      return items;
    }
    return items;
  }, [items, searchTerm]);
  
  const displayItems = useMemo(() => searchTerm ? filteredItems : items, [items, searchTerm, filteredItems, selectedIds]);
  
  // scrollToId 变化时滚动列表到对应位置
  const scrolledRef = useRef(null);
  useEffect(() => {
    if (scrollToId == null || !items || !containerRef.current) return;
    const targetArray = searchTerm ? displayItems : items;
    const idx = targetArray.findIndex(item => (item.id ?? item) === scrollToId);
    if (idx < 0) return;
    const targetScroll = idx * ITEM_HEIGHT - containerHeight / 2 + ITEM_HEIGHT / 2;
    containerRef.current.scrollTop = Math.max(0, targetScroll);
    setScrollTop(containerRef.current.scrollTop);
  }, [scrollToId, items, containerHeight, displayItems, searchTerm]);
  
  const totalItems = items?.length || 0;
  const totalHeight = totalItems * ITEM_HEIGHT;
  
  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
    const end = Math.min(totalItems, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);
    return { start, end };
  }, [scrollTop, containerHeight, totalItems]);
  
  // 搜索功能（searchTerm 和 filteredItems 已在前面定义）
  
  // 纯数字搜索时自动选中匹配项
  const prevSearchRef = useRef('');
  useEffect(() => {
    if (!items || !searchTerm || !onSelect) return;
    if (searchTerm === prevSearchRef.current) return;
    prevSearchRef.current = searchTerm;
    const m = searchTerm.match(/^(\d+)$/);
    if (!m) return;
    const targetId = parseInt(m[1], 10);
    const match = items.find(item => (item.id ?? item) === targetId);
    if (match && containerRef.current) {
      onSelect(targetId);
      // 搜索完成后立即滚动到中间
      const idx = items.findIndex(item => (item.id ?? item) === targetId);
      if (idx >= 0) {
        const targetScroll = idx * ITEM_HEIGHT - containerHeight / 2 + ITEM_HEIGHT / 2;
        containerRef.current.scrollTop = Math.max(0, targetScroll);
        setScrollTop(containerRef.current.scrollTop);
      }
    }
  }, [searchTerm, items, onSelect, containerHeight]);
  
  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);
  
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
    setScrollTop(0);
  }, []);
  
  if (!hasData || !items || items.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 13, padding: 20, textAlign: 'center' }}>
        <div><div style={{ fontSize: 24, marginBottom: 8 }}>⬆️</div><div>请上传文件后查看列表</div></div>
      </div>
    );
  }
  
  const displayTotal = displayItems.length;
  const displayHeight = displayTotal * ITEM_HEIGHT;
  
  // 计算当前用于虚拟滚动的可见范围
  const visStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visEnd = Math.min(displayTotal, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 搜索框 */}
      <div style={{ padding: '8px 8px 4px' }}>
        <input
          type="text"
          placeholder="搜索 ID 或名称..."
          value={searchTerm}
          onChange={handleSearchChange}
          style={{
            width: '100%',
            padding: '6px 8px',
            fontSize: 12,
            border: '1px solid #d1d5db',
            borderRadius: 6,
            outline: 'none',
            boxSizing: 'border-box',
            backgroundColor: '#f9fafb',
          }}
        />
      </div>
      
      {/* 工具栏 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 8px', borderBottom: '1px solid #e5e7eb',
      }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {searchTerm
            ? `搜索: ${displayTotal} 项`
            : `${type === 'static' ? '宠物' : '动画'} (${displayTotal})`
          }
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onSelectAll} style={{ padding: '2px 8px', fontSize: 11, color: '#3b82f6', backgroundColor: 'transparent', border: '1px solid #3b82f6', borderRadius: 3, cursor: 'pointer' }}>全选</button>
          <button onClick={onDeselectAll} style={{ padding: '2px 8px', fontSize: 11, color: '#6b7280', backgroundColor: 'transparent', border: '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer' }}>取消</button>
        </div>
      </div>
      
      {/* 虚拟列表 */}
      <div
        ref={(el) => { containerRef.current = el; if (el) measureHeight(); }}
        onScroll={handleScroll}
        style={{
          flex: 1, overflowY: 'scroll', overflowX: 'hidden',
          position: 'relative',
          paddingRight: 4,
          minHeight: 200,
        }}
      >
        <div style={{ height: displayHeight, position: 'relative' }}>
          {displayItems.slice(visStart, visEnd).map((item, idx) => {
            const realIdx = visStart + idx;
            const id = item.id ?? item;
            const isSelected = selectedIds.has(id);
            const isCurrent = selectedId === id;
            
            return (
              <div
                key={id}
                onClick={() => {onSelect(id); window.__lastClickedId = id;}}
                style={{
                  position: 'absolute',
                  top: realIdx * ITEM_HEIGHT,
                  left: 0, right: 0, height: ITEM_HEIGHT,
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 8px',
                  cursor: 'pointer',
                  backgroundColor: isCurrent ? '#eff6ff' : 'transparent',
                  borderLeft: isCurrent ? '3px solid #3b82f6' : '3px solid transparent',
                  userSelect: 'none',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: 13, height: 13, cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{
                  fontSize: 12, fontFamily: 'monospace',
                  color: isCurrent ? '#1e40af' : '#374151',
                  fontWeight: isCurrent ? 600 : 400,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {String(id).padStart(3, '0')}
                </span>
                {item.width && item.height ? (
                  <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto', flexShrink: 0 }}>
                    {item.width}×{item.height}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(255,255,255,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#3b82f6', zIndex: 5,
          }}>
            <div style={{
              width: 14, height: 14,
              border: '2px solid #e5e7eb', borderTopColor: '#3b82f6',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              marginRight: 6,
            }} />
            加载中...
          </div>
        )}
      </div>
      
      {/* 批量导出 */}
      <div style={{ padding: '8px', borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => onBatchExport('png')}
            disabled={selectedIds.size === 0}
            style={{
              flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 500,
              color: selectedIds.size > 0 ? '#fff' : '#9ca3af',
              backgroundColor: selectedIds.size > 0 ? '#3b82f6' : '#e5e7eb',
              border: 'none', borderRadius: 6,
              cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
            }}
          >
            批量导出 PNG ({selectedIds.size})
          </button>
          <button
            onClick={() => onBatchExport('bmp')}
            disabled={selectedIds.size === 0}
            style={{
              flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 500,
              color: selectedIds.size > 0 ? '#fff' : '#9ca3af',
              backgroundColor: selectedIds.size > 0 ? '#059669' : '#e5e7eb',
              border: 'none', borderRadius: 6,
              cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
            }}
          >
            批量导出 BMP ({selectedIds.size})
          </button>
        </div>
      </div>
    </div>
  );
}
