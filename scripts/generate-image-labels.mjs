import fs from 'node:fs';
import path from 'node:path';

// 服务端配置中的形象号比客户端 spradrn 记录的动画组号小 1。
const CLIENT_ANIMATION_GROUP_OFFSET = 1;

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    result[argv[i].slice(2)] = argv[i + 1];
    i += 1;
  }
  return result;
}

function findVersionedFile(directory, pattern) {
  const matches = fs.readdirSync(directory)
    .map((name) => ({ name, match: name.match(pattern) }))
    .filter((item) => item.match)
    .sort((a, b) => Number(b.match[1]) - Number(a.match[1]));
  if (!matches.length) throw new Error(`在 ${directory} 中没有找到 ${pattern}`);
  return path.join(directory, matches[0].name);
}

function readGbkLines(filePath) {
  const bytes = fs.readFileSync(filePath);
  return new TextDecoder('gb18030').decode(bytes).split(/\r?\n/).filter(Boolean);
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function cleanMountName(value) {
  return cleanName(value).replace(/\d{2}\s*$/, '');
}

function addName(target, id, name, category) {
  if (!Number.isInteger(id) || id <= 0 || !name) return;
  let meta = target.get(id);
  if (!meta) {
    meta = { names: new Map(), categories: new Set() };
    target.set(id, meta);
  }
  if (!meta.names.has(name)) meta.names.set(name, category);
  meta.categories.add(category);
}

function loadGroupLabels(serverDataDirectory) {
  const labels = new Map();
  const enemyBasePath = path.join(serverDataDirectory, 'enemybase1.txt');
  const ridePath = path.join(serverDataDirectory, 'ride.txt');

  for (const line of readGbkLines(enemyBasePath)) {
    const columns = line.split(',');
    // PETFLG=1 才是玩家可持有的宠物；0 常用于地图怪物、NPC、任务物件等。
    if (Number(columns[37]) !== 1) continue;
    // enemybase 使用服务端形象号；客户端 spradrn 的宠物动画组号比它大 1。
    // 例如：enemybase 100351=布洛多斯，而客户端 100352 才引用咖啡色雷龙帧。
    // 不能直接按相同编号关联，否则所有宠物名称都会错后一只。
    addName(labels, Number(columns[36]) + CLIENT_ANIMATION_GROUP_OFFSET, cleanName(columns[0]), '宠物');
  }

  const rideLines = readGbkLines(ridePath).map((line) => line.split(','));
  const header = rideLines[0] || [];
  for (const columns of rideLines.slice(1)) {
    const character = cleanName(columns[0]);
    for (let column = 1; column < columns.length && column < header.length; column += 1) {
      const serverGroupId = Number(String(columns[column]).trim());
      const mount = cleanMountName(header[column]);
      if (!mount || serverGroupId <= 0) continue;
      const groupId = serverGroupId + CLIENT_ANIMATION_GROUP_OFFSET;
      const label = character === '骑宠' ? mount : `${character} · ${mount}`;
      addName(labels, groupId, label, character === '骑宠' ? '宠物' : '人物');
    }
  }

  return labels;
}

function loadDirectFrameLabels(serverDataDirectory) {
  const labels = new Map();
  const itemPath = path.join(serverDataDirectory, 'itemset6.txt');
  for (const line of readGbkLines(itemPath)) {
    const columns = line.split(',');
    addName(labels, Number(columns[17]), cleanName(columns[0]), '物品');
  }
  return labels;
}

function serializeMeta(meta) {
  const entries = [...meta.names.entries()].filter(([name]) => Boolean(name));
  const [label, primaryCategory] = entries[0] || ['', ''];
  const aliases = entries
    .filter(([, category]) => category === primaryCategory)
    .map(([name]) => name)
    .slice(1, 12);
  return {
    label,
    aliases,
    category: primaryCategory,
  };
}

function scoreGroup(groupLabels, groupId) {
  const meta = groupLabels.get(groupId);
  if (!meta) return 1;
  let score = 100;
  if (meta.categories.has('宠物')) score += 10;
  if (meta.categories.has('人物')) score += 20;
  return score;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args['client-data'] || !args['server-data']) {
    throw new Error('用法: node scripts/generate-image-labels.mjs --client-data <客户端data目录> --server-data <服务端gmsv/data目录> [--output <输出JSON>]');
  }

  const clientData = path.resolve(args['client-data']);
  const serverData = path.resolve(args['server-data']);
  const outputPath = path.resolve(args.output || 'public/data/image-labels-7.5.json');
  const adrnPath = findVersionedFile(clientData, /^adrn_(\d+)\.bin$/i);
  const sprPath = findVersionedFile(clientData, /^spr_(\d+)\.bin$/i);
  const sprAdrnPath = findVersionedFile(clientData, /^spradrn_(\d+)\.bin$/i);

  const adrn = fs.readFileSync(adrnPath);
  const spr = fs.readFileSync(sprPath);
  const sprAdrn = fs.readFileSync(sprAdrnPath);
  const frameCount = Math.floor(adrn.length / 80);
  const recordCount = Math.floor((sprAdrn.length - 4) / 12);
  const groupLabels = loadGroupLabels(serverData);
  const directLabels = loadDirectFrameLabels(serverData);
  const records = [];

  for (let index = 0; index < recordCount; index += 1) {
    const offset = 4 + index * 12;
    records.push({
      start: sprAdrn.readUInt32LE(offset),
      groupId: sprAdrn.readUInt32LE(offset + 8),
    });
  }

  const starts = [...new Set(records.map((record) => record.start).filter((start) => start < spr.length))].sort((a, b) => a - b);
  const endByStart = new Map(starts.map((start, index) => [start, starts[index + 1] ?? spr.length]));
  const primaryGroup = new Uint32Array(frameCount);
  const primaryScore = new Uint16Array(frameCount);

  const validFrame = (frameId) => {
    if (frameId <= 0 || frameId >= frameCount) return false;
    const offset = frameId * 80;
    const width = adrn.readInt32LE(offset + 20);
    const height = adrn.readInt32LE(offset + 24);
    return width > 0 && width <= 2048 && height > 0 && height <= 2048;
  };

  for (const { start, groupId } of records) {
    const end = endByStart.get(start);
    if (end == null || end <= start) continue;
    let offset = start;
    const score = scoreGroup(groupLabels, groupId);

    while (offset + 12 <= end) {
      const count = spr.readUInt32LE(offset + 8);
      const sequenceSize = 12 + count * 10;
      if (count > 1000 || offset + sequenceSize > end) break;

      for (let frame = 0; frame < count; frame += 1) {
        const frameId = spr.readUInt32LE(offset + 12 + frame * 10);
        if (!validFrame(frameId) || score <= primaryScore[frameId]) continue;
        primaryGroup[frameId] = groupId;
        primaryScore[frameId] = score;
      }
      offset += sequenceSize;
    }
  }

  const ranges = [];
  let rangeStart = 0;
  let groupId = primaryGroup[0];
  for (let frameId = 1; frameId <= primaryGroup.length; frameId += 1) {
    const nextGroup = frameId < primaryGroup.length ? primaryGroup[frameId] : 0;
    if (nextGroup === groupId) continue;
    if (groupId) ranges.push([rangeStart, frameId - 1, groupId]);
    rangeStart = frameId;
    groupId = nextGroup;
  }

  const usedGroupIds = new Set(ranges.map((range) => range[2]));
  const groups = {};
  for (const groupIdValue of [...usedGroupIds].sort((a, b) => a - b)) {
    const meta = groupLabels.get(groupIdValue);
    if (meta) groups[groupIdValue] = serializeMeta(meta);
  }

  const direct = {};
  for (const [frameId, meta] of [...directLabels.entries()].sort((a, b) => a[0] - b[0])) {
    if (frameId >= 0 && frameId < frameCount) direct[frameId] = serializeMeta(meta);
  }

  const namedFrames = ranges.reduce((total, [start, end, id]) => total + (groups[id] ? end - start + 1 : 0), 0);
  const output = {
    version: 3,
    source: '石器时代7.5客户端与服务端配置',
    animationGroupOffset: CLIENT_ANIMATION_GROUP_OFFSET,
    ranges,
    groups,
    direct,
    stats: {
      totalFrames: frameCount,
      mappedFrames: primaryGroup.reduce((total, value) => total + (value ? 1 : 0), 0),
      namedFrames,
      namedGroups: Object.keys(groups).length,
      directNames: Object.keys(direct).length,
    },
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`, 'utf8');
  console.log(`已生成 ${outputPath}`);
  console.log(output.stats);
}

main();
