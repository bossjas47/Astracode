import pako from 'pako'; export const gunzipSync = b => pako.ungzip(b); export const gzipSync = b => pako.gzip(b); export const inflateSync = b => pako.inflate(b); export const deflateSync = b => pako.deflate(b); export default { gunzipSync, gzipSync, inflateSync, deflateSync };
export const constants = { Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1, Z_BEST_SPEED: 1, Z_NO_COMPRESSION: 0 };
