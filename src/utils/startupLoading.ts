/** Hand display ownership back before the native startup screen writes. */
export async function finishStartupLoading(): Promise<void> {
  const stop = (globalThis as Record<symbol, unknown>)[Symbol.for('amirahco.startup-loading.stop')]
  if (typeof stop === 'function') await stop()
}
