// Chromium's ICU still reports some zones by their old names (India → "Asia/Calcutta"); show the current IANA name.
const ZONE_RENAMES: Record<string, string> = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'Asia/Dacca': 'Asia/Dhaka', 'Asia/Thimbu': 'Asia/Thimphu' };
export const modernZone = (z: string) => ZONE_RENAMES[z] || z;
/** This device's time zone, by its current IANA name. */
export const localZone = () => modernZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
