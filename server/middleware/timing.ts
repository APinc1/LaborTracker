// middleware/timing.ts
import { performance } from 'node:perf_hooks';
import onHeaders from 'on-headers';

export function timing() {
  return (req: any, res: any, next: any) => {
    const t0 = performance.now();
    const marks: Record<string, number> = { t0 };

    // allow handlers to mark stages
    res.locals.mark = (k: string) => { marks[k] = performance.now(); };

    // set headers just-in-time, before first byte is sent
    onHeaders(res, () => {
      const dur = (a: string, b: string) => (marks[b] && marks[a]) ? (marks[b] - marks[a]) : 0;
      const validate = dur('v0','v1');
      const db = dur('d0','d1') + dur('d2','d3');
      const serialize = dur('s0','s1');
      const queue = dur('q0','q1');

      // NOTE: no JSON/stringify here—just numbers—to avoid adding work
      res.setHeader('Server-Timing',
        `queue;dur=${queue.toFixed(1)}, validate;dur=${validate.toFixed(1)}, db;dur=${db.toFixed(1)}, serialize;dur=${serialize.toFixed(1)}`);
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