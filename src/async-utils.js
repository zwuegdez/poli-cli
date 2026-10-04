export function withSignal(work, signal) {
  const pending = Promise.resolve(work);
  if (!signal) return pending;
  if (signal.aborted) {
    pending.catch(() => {});
    return Promise.reject(signal.reason || new Error('Stopped.'));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', stop);
    const stop = () => { cleanup(); reject(signal.reason || new Error('Stopped.')); };
    signal.addEventListener('abort', stop, { once: true });
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
