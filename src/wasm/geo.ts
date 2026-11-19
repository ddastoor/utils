// Wrapper for geo.wasm: Charles Karney's geodesic.c (GeographicLib's geodesic routines in C, MIT) built by us
// (wasm/geo) — the shortest path between two points on the WGS-84 ellipsoid — and the great circle on a sphere.
// `bindGeo(exports)` is environment-neutral so the Node unit tests can use it too.
import { instantiateWasi } from './wasi';
import wasmUrl from './bin/geo.wasm?url';
import { onLeave } from '../lifecycle';

export interface Geodesic {
  /** metres along the shortest path on the WGS-84 ellipsoid */ metres: number;
  /** degrees clockwise from north, 0 ≤ … < 360, on leaving the first point and on arriving at the second */
  bearing: number; finalBearing: number;
  /** the same on a sphere of the Earth's mean radius (the haversine formula) */
  sphereMetres: number; sphereBearing: number;
  /** the point half-way along the path: latitude, longitude */
  mid: [number, number];
}
const turn = (deg: number) => { const a = deg % 360; return a < 0 ? a + 360 : a + 0; };
export function bindGeo(e: any) {
  return {
    /** latitudes and longitudes in degrees */
    inverse(lat1: number, lon1: number, lat2: number, lon2: number): Geodesic {
      e.g_inverse(lat1, lon1, lat2, lon2);
      const o = new Float64Array(e.memory.buffer, e.g_out(), 7);
      return { metres: o[0], bearing: turn(o[1]), finalBearing: turn(o[2]), sphereMetres: o[3], sphereBearing: turn(o[4]), mid: [o[5], o[6]] };
    },
    /** the version of geodesic.c, e.g. 20200 */
    version: () => e.g_version() as number,
  };
}
export type Geo = ReturnType<typeof bindGeo>;

let inst: Promise<Geo> | null = null;
export const geo = () => { if (!inst) { inst = instantiateWasi(wasmUrl).then((x) => bindGeo(x.exports)); onLeave('geo', () => (inst = null)); } return inst; };
