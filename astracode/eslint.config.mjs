// CI lint for the Worker source: catches names used without import/declaration (split modules) and assignment to imports.
// No plugins or packages: the Workers runtime globals are listed here.
const g = 'Response Request Headers fetch crypto URL URLSearchParams TextEncoder TextDecoder TransformStream ReadableStream WritableStream atob btoa console setTimeout clearTimeout setInterval clearInterval AbortController AbortSignal FormData File Blob structuredClone queueMicrotask performance WebSocket WebSocketPair HTMLRewriter navigator DOMException CompressionStream DecompressionStream caches self';
export default [{
  files: ['src/**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: Object.fromEntries(g.split(' ').map(n => [n, 'readonly'])) },
  rules: { 'no-undef': 'error', 'no-import-assign': 'error', 'no-const-assign': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'error' },
}];
