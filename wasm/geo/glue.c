/* geo.wasm — distances on the Earth for the Coordinates tab.
 *
 * The ellipsoid: Charles Karney's geodesic.c (the C implementation of GeographicLib's geodesic routines, MIT), taken
 * unmodified from the PROJ release archive (see build.sh). It solves the inverse problem on WGS-84 to about 15
 * nanometres for any two points, the nearly opposite ones included (Vincenty's formula does not converge there).
 * The sphere: the haversine formula on the mean radius, for comparison with tools that use it.
 */
#include "geodesic.h"
#include <math.h>
#define API __attribute__((visibility("default")))

#define WGS84_A 6378137.0            /* equatorial radius, metres */
#define WGS84_F (1 / 298.257223563)  /* flattening */
#define MEAN_R 6371008.8             /* mean radius (IUGG), metres */

static struct geod_geodesic G;
static int ready;
static double out[8];

/* where g_inverse leaves its answer */
API double *g_out(void) { return out; }
API int g_version(void) { return GEODESIC_VERSION_MAJOR * 10000 + GEODESIC_VERSION_MINOR * 100 + GEODESIC_VERSION_PATCH; }

/* Degrees in. out[0] metres along the geodesic, out[1] the azimuth at the first point and out[2] at the second
 * (degrees clockwise from north, -180 … 180), out[3] metres on the sphere, out[4] the bearing there (0 … 360),
 * out[5], out[6] latitude and longitude of the point half-way along the geodesic. */
API void g_inverse(double lat1, double lon1, double lat2, double lon2) {
    double s12, azi1, azi2, d = M_PI / 180;
    if (!ready) { geod_init(&G, WGS84_A, WGS84_F); ready = 1; }
    geod_inverse(&G, lat1, lon1, lat2, lon2, &s12, &azi1, &azi2);
    out[0] = s12; out[1] = azi1; out[2] = azi2;
    double dLat = (lat2 - lat1) * d, dLon = (lon2 - lon1) * d;
    double h = sin(dLat / 2) * sin(dLat / 2) + cos(lat1 * d) * cos(lat2 * d) * sin(dLon / 2) * sin(dLon / 2);
    out[3] = 2 * MEAN_R * asin(sqrt(h < 1 ? h : 1));
    double y = sin(dLon) * cos(lat2 * d), x = cos(lat1 * d) * sin(lat2 * d) - sin(lat1 * d) * cos(lat2 * d) * cos(dLon);
    out[4] = fmod(atan2(y, x) / d + 360, 360);
    geod_direct(&G, lat1, lon1, azi1, s12 / 2, &out[5], &out[6], 0);
}
