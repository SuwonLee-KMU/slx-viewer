const { DOMParser } = require('@xmldom/xmldom');
const { unzipSync, strFromU8 } = require('fflate');

const maxArchive = 64 * 1024 * 1024;
const maxXml = 24 * 1024 * 1024;
function elements(node, tag) {
  return Array.from(node?.childNodes || []).filter(el => el.nodeName === tag);
}
function props(node) {
  return Object.fromEntries(elements(node, 'P').map(p => [p.getAttribute('Name'), p.textContent]));
}
function numbers(value) {
  return (String(value || '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
}
function position(value) {
  const rect = numbers(value);
  return rect.length === 4 && rect.every(n => Number.isFinite(n) && Math.abs(n) <= 1e7) && rect[2] >= rect[0] && rect[3] >= rect[1] ? rect : null;
}
function endpoint(value) {
  const match = /^(.*?)#([a-zA-Z]+):(\d+)$/.exec(value || '');
  return match && {sid: match[1], side: match[2], index: Number(match[3])};
}
function branch(node, depth = 0) {
  if (depth > 100) throw Error('Signal branches are nested too deeply.');
  const p = props(node);
  return {src: endpoint(p.Src), dst: endpoint(p.Dst), points: numbers(p.Points), children: elements(node, 'Branch').map(n => branch(n, depth + 1))};
}
function readModel(bytes) {
  if (bytes.length > maxArchive) throw Error('SLX files up to 64 MiB are supported.');
  let total = 0;
  const files = unzipSync(bytes, {filter(entry) {
    if (!/^simulink\/(?:blockdiagram|systems\/system_[\w.-]+)\.xml$/.test(entry.name)) return false;
    total += entry.originalSize;
    if (total > maxXml) throw Error('Model diagrams exceed the 24 MiB XML limit.');
    return true;
  }});
  function xmlRoot(path) {
    if (!files[path]) return null;
    const xml = strFromU8(files[path]);
    if (/<!DOCTYPE/i.test(xml)) throw Error('Document type declarations are unsupported.');
    const doc = new DOMParser({onError(level, message) { if (level !== 'warning') throw Error(message); }}).parseFromString(xml, 'application/xml');
    return doc.documentElement;
  }
  let root = xmlRoot('simulink/systems/system_root.xml');
  if (!root) {
    const diagram = xmlRoot('simulink/blockdiagram.xml');
    root = diagram?.getElementsByTagName('System')[0];
  }
  if (!root || root.nodeName !== 'System') throw Error('The archive has no supported Simulink block diagram.');
  const systems = [];
  function visit(system, name, parent, refs) {
    if (systems.length >= 2048 || refs.length > 100) throw Error('The subsystem hierarchy exceeds the viewer limit.');
    const id = systems.length;
    const blocks = [];
    const annotations = [];
    const lines = elements(system, 'Line').map(n => branch(n));
    systems.push({name, parent, blocks, lines, annotations});
    for (const el of elements(system, 'Block')) {
      const p = props(el);
      const rect = position(p.Position);
      if (!rect) continue;
      const counts = numbers(p.Ports || p.PortCounts);
      const port = elements(el, 'PortCounts')[0];
      const b = {sid: el.getAttribute('SID'), name: el.getAttribute('Name') || '', type: el.getAttribute('BlockType') || 'Block', rect,
        ins: Number(port?.getAttribute('in') || counts[0] || 0), outs: Number(port?.getAttribute('out') || counts[1] || 0),
        orientation: p.Orientation || ({90:'down',180:'left',270:'up'}[p.BlockRotation]) || (p.BlockMirror === 'on' ? 'left' : 'right'),
        showName: p.ShowName !== 'off', labelAbove: p.NamePlacement === 'alternate', subtype: p.SFBlockType || '', value: p.Value || p.Gain || '', child: null};
      blocks.push(b);
      const nested = elements(el, 'System')[0];
      if (!nested) continue;
      const ref = nested.getAttribute('Ref');
      if (ref && refs.includes(ref)) continue;
      const child = ref ? xmlRoot('simulink/systems/' + ref + '.xml') : nested;
      if (child?.nodeName === 'System') b.child = visit(child, b.name, id, [...refs, ref || '']);
    }
    for (const el of elements(system, 'Annotation')) {
      const p = props(el);
      const rect = position(p.Position);
      if (p.Name && rect && !/<(?:html|!doctype)/i.test(p.Name)) annotations.push({rect, text:p.Name});
    }
    return id;
  }
  visit(root, '', null, ['system_root']);
  return systems;
}
module.exports = {readModel, maxArchive};
