function normalizeSearchTerm(value) {
  return String(value || '').trim().toLocaleLowerCase('zh-CN');
}

function lowerBound(items, target) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const id = items[mid]?.id ?? items[mid];
    if (id < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [intervals[0].slice()];
  for (const [start, end] of intervals.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

const RELEVANT_CATEGORIES = new Set(['宠物', '人物', '骑乘']);

export function createImageLabelIndex(data) {
  const ranges = Array.isArray(data?.ranges) ? data.ranges : [];
  const groups = data?.groups || {};
  const direct = data?.direct || {};
  const groupSearchText = new Map();
  const directSearchText = new Map();

  for (const [groupId, meta] of Object.entries(groups)) {
    groupSearchText.set(Number(groupId), normalizeSearchTerm([
      meta.label,
      ...(meta.aliases || []),
      meta.category,
      `动画组${groupId}`,
    ].join(' ')));
  }
  for (const [frameId, meta] of Object.entries(direct)) {
    directSearchText.set(Number(frameId), normalizeSearchTerm([
      meta.label,
      ...(meta.aliases || []),
      meta.category,
    ].join(' ')));
  }

  const findRange = (frameId) => {
    let low = 0;
    let high = ranges.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const range = ranges[mid];
      if (frameId < range[0]) high = mid - 1;
      else if (frameId > range[1]) low = mid + 1;
      else return range;
    }
    return null;
  };

  const resolveGroup = (groupId) => {
    const meta = groups[groupId];
    return meta ? { ...meta, groupId: Number(groupId) } : null;
  };

  const resolveFrame = (frameId) => {
    const directMeta = direct[frameId];
    if (directMeta) return { ...directMeta, frameId: Number(frameId), source: 'direct' };
    const range = findRange(Number(frameId));
    if (!range) return null;
    const meta = groups[range[2]];
    return meta ? { ...meta, frameId: Number(frameId), groupId: range[2], source: 'group' } : null;
  };

  const filterFrames = (items, searchTerm, allowedCategories = null) => {
    const term = normalizeSearchTerm(searchTerm);
    if (!term) return items;
    const matchingGroups = new Set();
    const matchingDirectIds = [];
    for (const [groupId, text] of groupSearchText) {
      const meta = groups[groupId];
      if ((!allowedCategories || allowedCategories.has(meta?.category)) && text.includes(term)) {
        matchingGroups.add(groupId);
      }
    }
    for (const [frameId, text] of directSearchText) {
      const meta = direct[frameId];
      if ((!allowedCategories || allowedCategories.has(meta?.category)) && text.includes(term)) {
        matchingDirectIds.push(frameId);
      }
    }

    const intervals = ranges
      .filter((range) => matchingGroups.has(range[2]))
      .map((range) => [range[0], range[1]]);
    for (const frameId of matchingDirectIds) intervals.push([frameId, frameId]);

    const result = [];
    for (const [start, end] of mergeIntervals(intervals)) {
      let index = lowerBound(items, start);
      while (index < items.length) {
        const item = items[index];
        const id = item?.id ?? item;
        if (id > end) break;
        result.push(item);
        index += 1;
      }
    }
    return result;
  };

  const filterFramesByCategories = (items, categories = RELEVANT_CATEGORIES) => {
    const allowedCategories = categories instanceof Set ? categories : new Set(categories);
    // 某些道具图标帧也会被宠物动画组当作公共素材引用。direct 是对静态帧
    // 更具体的命名来源，因此明确属于其他分类的 direct 帧必须从结果中排除。
    const excludedDirectIds = new Set();
    const intervals = ranges
      .filter((range) => allowedCategories.has(groups[range[2]]?.category))
      .map((range) => [range[0], range[1]]);
    for (const [frameId, meta] of Object.entries(direct)) {
      if (allowedCategories.has(meta?.category)) intervals.push([Number(frameId), Number(frameId)]);
      else excludedDirectIds.add(Number(frameId));
    }

    const result = [];
    for (const [start, end] of mergeIntervals(intervals)) {
      let index = lowerBound(items, start);
      while (index < items.length) {
        const item = items[index];
        const id = item?.id ?? item;
        if (id > end) break;
        if (!excludedDirectIds.has(id)) result.push(item);
        index += 1;
      }
    }
    return result;
  };

  const filterGroupsByCategories = (items, categories = RELEVANT_CATEGORIES) => {
    const allowedCategories = categories instanceof Set ? categories : new Set(categories);
    return items.filter((item) => {
      const id = item?.id ?? item;
      return allowedCategories.has(groups[id]?.category);
    });
  };

  const filterGroups = (items, searchTerm, allowedCategories = null) => {
    const term = normalizeSearchTerm(searchTerm);
    if (!term) return items;
    return items.filter((item) => {
      const id = item?.id ?? item;
      const meta = groups[id];
      if (allowedCategories && !allowedCategories.has(meta?.category)) return false;
      return groupSearchText.get(Number(id))?.includes(term) || false;
    });
  };

  return {
    resolveFrame,
    resolveGroup,
    filterFrames,
    filterRelevantFrames: (items, searchTerm) => filterFrames(items, searchTerm, RELEVANT_CATEGORIES),
    filterRelevantGroups: (items, searchTerm) => filterGroups(items, searchTerm, RELEVANT_CATEGORIES),
    filterFramesByCategories,
    filterGroupsByCategories,
    stats: data?.stats || {},
  };
}
