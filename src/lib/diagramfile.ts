// The Diagram Editor's files (potentials #54; no DOM — the unit suite runs it in Node): what a file chosen to open is, and the
// diagram inside it — draw.io's own .drawio / .xml, a PNG or an SVG that carries its diagram (draw.io's "editable" pictures),
// Visio and Gliffy files (opened by draw.io's importers in the editor's page), Mermaid and PlantUML text (turned into shapes by
// draw.io). And the names the tab saves under.

export type DiagramKind = 'xml' | 'png' | 'svg' | 'visio' | 'gliffy' | 'mermaid' | 'plantuml';

/** What a file is, by its first bytes where they tell, else by its name. */
export function kindOf(name: string, head: Uint8Array): DiagramKind | null {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) || '';
  const sig = (s: number[]) => s.every((b, i) => head[i] === b);
  if (sig([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (sig([0x50, 0x4b, 0x03, 0x04]) || sig([0xd0, 0xcf, 0x11, 0xe0])) return /^(vsdx|vsdm|vssx|vssm|vstx|vstm|vsd|vss|vst)$/.test(ext) || !ext ? 'visio' : null; // a zip (.vsdx) or an OLE file (.vsd)
  const text = new TextDecoder('utf-8', { fatal: false }).decode(head.subarray(0, 4096)).replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(mxfile|mxGraphModel|mxlibrary)\b/.test(text)) return 'xml';
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg\b/i.test(text)) return 'svg';
  if (ext === 'gliffy' || /^\{\s*"(contentType|version|embeddedResources|stage)"/.test(text) && /"stage"\s*:/.test(text)) return 'gliffy';
  if (/^(mmd|mermaid)$/.test(ext)) return 'mermaid';
  if (/^(puml|plantuml|pu|iuml|wsd)$/.test(ext) || /^@start(uml|mindmap|wbs|gantt|salt|json|yaml|ebnf)\b/.test(text)) return 'plantuml';
  if (/^(drawio|dio|xml)$/.test(ext)) return 'xml';
  if (ext === 'svg') return 'svg';
  if (/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|mindmap|journey|gitGraph|timeline|quadrantChart|C4Context|block-beta|architecture-beta)\b/.test(text)) return 'mermaid';
  return null;
}

/** draw.io's diagram in a text: an <mxfile>, an <mxGraphModel> — or a shape library (opened in the editor's own menu). */
export function xmlDiagram(text: string): { xml: string } | { library: true } | null {
  const t = text.replace(/^﻿/, '').trim();
  const body = t.replace(/^<\?xml[^>]*>\s*/, '').replace(/^(<!--[\s\S]*?-->\s*)+/, '');
  if (/^<mxlibrary\b/.test(body)) return { library: true };
  if (/^<(mxfile|mxGraphModel)\b/.test(body)) return { xml: body };
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m);

/** The diagram an "editable" SVG carries: its root element's content attribute (draw.io writes the whole <mxfile> there). */
export function svgDiagram(text: string): string | null {
  const root = text.match(/<svg\b[^>]*>/i)?.[0];
  const content = root?.match(/\scontent\s*=\s*("([^"]*)"|'([^']*)')/i);
  if (!content) return null;
  const v = unescapeXml(content[2] ?? content[3] ?? '').trim();
  return /^<(mxfile|mxGraphModel)\b/.test(v) ? v : null;
}

/** The diagram an "editable" PNG carries: a tEXt chunk (or a zTXt one, zlib) named mxfile or mxGraphModel, its text the
 *  diagram written with encodeURIComponent — as draw.io's Editor.writeGraphModelToPng writes it and extractGraphModelFromPng
 *  reads it. */
export async function pngDiagram(png: Uint8Array): Promise<string | null> {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const latin1 = (a: number, b: number) => { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(png[i]); return s; };
  for (let p = 8; p + 12 <= png.length;) {
    const len = dv.getUint32(p), type = latin1(p + 4, p + 8), data = p + 8;
    if (data + len > png.length) break;
    if (type === 'tEXt' || type === 'zTXt') {
      let z = data; while (z < data + len && png[z] !== 0) z++;
      const key = latin1(data, z);
      if (key === 'mxfile' || key === 'mxGraphModel') {
        let raw: string;
        if (type === 'tEXt') raw = latin1(z + 1, data + len);
        else {
          if (png[z + 1] !== 0) return null; // compression method 0 (zlib) only
          const out = await new Response(new Blob([png.slice(z + 2, data + len)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
          raw = latin1Bytes(new Uint8Array(out));
        }
        let xml: string;
        try { xml = decodeURIComponent(raw); } catch { xml = raw; }
        xml = xml.trim();
        return /^<(mxfile|mxGraphModel)\b/.test(xml) ? xml : null;
      }
    }
    if (type === 'IEND') break;
    p = data + len + 4;
  }
  return null;
}
function latin1Bytes(b: Uint8Array) { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s; }

/** A diagram's name from its file's: "Plan.drawio.png" → "Plan", "net.vsdx" → "net". */
export function diagramName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.(png|svg|xml)$/i, '').replace(/\.(drawio|dio|xml|vsdx|vsdm|vssx|vssm|vstx|vstm|vsd|vss|vst|gliffy|mmd|mermaid|puml|plantuml|pu|iuml|wsd|txt)$/i, '').trim();
  return base || 'Diagram';
}

/** A name a file may have on Windows, macOS and Linux: no / \ : * ? " < > |, no control characters, no dots or spaces at
 *  its ends, not one of Windows' device names; at most 120 characters. */
export function safeName(name: string): string {
  let s = name.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '');
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(s)) s = `${s} diagram`;
  return [...s].slice(0, 120).join('').trim() || 'Diagram';
}

/** An empty diagram (draw.io's own empty model). */
export const BLANK = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';
