function retryDelay(attempt, { baseMs = 1000, maxMs = 300000 } = {}) {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}
module.exports = { retryDelay };
