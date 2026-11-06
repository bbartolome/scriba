/* global process */

/**
 * Dev proxy for `ng serve`. It forwards the API routes to the API on the loopback address, using
 * SCRIBA_PORT the way the API reads it (unset or empty means 8080).
 *
 * changeOrigin is false, so the Host and Origin headers reach the API unchanged. secure is false
 * because the target is plain HTTP. The proxy's default streaming applies, so /events is not
 * buffered.
 */
const port = process.env.SCRIBA_PORT || '8080';

const apiTarget = {
  target: `http://127.0.0.1:${port}`,
  changeOrigin: false,
  secure: false,
};

export default {
  '/api': apiTarget,
  '/healthz': apiTarget,
  '/events': apiTarget,
};
