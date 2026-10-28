/* Deployment settings. Edited by hand, committed.
 *
 * proxyBase — the transit proxy that holds the TfNSW API key (see proxy/README.md).
 *             Empty string = no provider configured, and the app falls back to the labelled mock.
 *             Live and test share one proxy; the key lives in the proxy's environment, never here.
 */
export const CONFIG = {
  proxyBase: "",
};
