// The graphs of SliceDiceGrapher (potentials #75): Apache ECharts 6.1 (zrender) with only the charts and parts the tab draws — a chunk of
// its own, fetched with the first data. ECharts exists only as JavaScript (docs/WASM-AUDIT.md, SliceDiceGrapher); the one piece of it that
// makes code from a string (a GeoJSON map given as text) is not among these parts. The options are src/lib/slicedice.ts's `chartOption`.
import * as echarts from 'echarts/core';
import { BarChart, BoxplotChart, FunnelChart, HeatmapChart, LineChart, PieChart, ScatterChart, SunburstChart, TreemapChart } from 'echarts/charts';
import { AriaComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';

echarts.use([BarChart, BoxplotChart, FunnelChart, HeatmapChart, LineChart, PieChart, ScatterChart, SunburstChart, TreemapChart,
  AriaComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent, VisualMapComponent, LabelLayout, CanvasRenderer, SVGRenderer]);

type Option = Record<string, unknown>;
export interface Drawn { set(option: Option): void; resize(): void; dispose(): void; readonly chart: echarts.ECharts }

/** A graph drawn in `el` (canvas, at the screen's pixel ratio) and drawn again when `el` changes size. */
export function drawChart(el: HTMLElement, option: Option): Drawn {
  const chart = echarts.init(el, null, { renderer: 'canvas' });
  chart.setOption(option, { notMerge: true });
  let frame = 0;
  const ro = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (!chart.isDisposed()) chart.resize(); }); });
  ro.observe(el);
  return {
    chart,
    set: (o) => chart.setOption(o, { notMerge: true }),
    resize: () => chart.resize(),
    dispose: () => { ro.disconnect(); cancelAnimationFrame(frame); chart.dispose(); },
  };
}

/** The graph as a PNG: drawn again off the screen at `w` × `h` CSS pixels and `scale` (2, 4) device pixels each, on white or see-through. */
export async function chartPng(option: Option, w: number, h: number, scale: number, background: 'white' | 'transparent'): Promise<Blob> {
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;pointer-events:none`;
  div.setAttribute('aria-hidden', 'true');
  document.body.append(div);
  const chart = echarts.init(div, null, { renderer: 'canvas', devicePixelRatio: scale, width: w, height: h });
  try {
    chart.setOption({ ...option, animation: false, backgroundColor: background === 'white' ? '#ffffff' : 'transparent' }, { notMerge: true });
    const canvas = chart.renderToCanvas({ pixelRatio: scale, backgroundColor: background === 'white' ? '#ffffff' : 'transparent' });
    return await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('The browser could not make the picture (it may be too large).'))), 'image/png'));
  } finally { chart.dispose(); div.remove(); }
}

/** The graph as an SVG file (text, lines and shapes — sharp at any size), `w` × `h`, on white or see-through. */
export function chartSvg(option: Option, w: number, h: number, background: 'white' | 'transparent'): string {
  const chart = echarts.init(null as unknown as HTMLElement, null, { renderer: 'svg', ssr: true, width: w, height: h });
  try {
    chart.setOption({ ...option, animation: false, backgroundColor: background === 'white' ? '#ffffff' : 'transparent' }, { notMerge: true });
    const svg = chart.renderToSVGString();
    return svg.startsWith('<?xml') ? svg : `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
  } finally { chart.dispose(); }
}
