// middleware/timing.ts
export function timing() {
  return async (req: any, res: any, next: any) => {
    const marks: Record<string, number> = {};
    const mark = (k: string) => (marks[k] = performance.now());

    mark('t0');
    res.locals.mark = mark;

    res.on('finish', () => {
      const t = (k: string) => marks[k] ? (marks[k] - marks.t0).toFixed(1) : '0';
      try {
        if (!res.headersSent) {
          res.setHeader('Server-Timing',
            `validate;dur=${t('v1')},db;dur=${t('d1')},serialize;dur=${t('s1')}`);
        }
      } catch (error) {
        // Ignore header errors
      }
    });
    next();
  };
}

// Event loop lag monitor
import { monitorEventLoopDelay } from 'perf_hooks';
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  const p95 = Math.round(h.percentile(95) / 1e6); // ms
  if (p95 > 100) console.warn('[EL-LAG] p95', p95, 'ms');
  h.reset();
}, 5000);

// Request backpressure limiter
class Limit {
  q: Array<() => void> = []; 
  active = 0;
  constructor(private readonly n: number) {}
  
  async run<T>(fn: () => Promise<T>) {
    if (this.active >= this.n) await new Promise<void>(r => this.q.push(r));
    this.active++;
    try { 
      return await fn(); 
    } finally {
      this.active--;
      const next = this.q.shift(); 
      if (next) next();
    }
  }
}

export const validateLimit = new Limit(2);  // at most 2 validations at once