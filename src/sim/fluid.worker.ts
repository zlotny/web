import { Fluid, TANK } from './fluid';

let fluid: Fluid | null = null;
let cost = 0;

self.onmessage = (event: MessageEvent<{ type: string; spacing?: number; buffer?: Float32Array }>) => {
  const message = event.data;
  if (message.type === 'init') {
    fluid = new Fluid({ ...TANK, spacing: message.spacing ?? TANK.spacing });
    self.postMessage({ type: 'ready', count: fluid.count });
    return;
  }
  if (message.type === 'tick' && fluid) {
    const started = performance.now();
    const steps = cost > 7 ? 1 : 2;
    for (let i = 0; i < steps; i++) fluid.step(1 / 120);
    cost = (performance.now() - started) / steps;
    const buffer = message.buffer && message.buffer.length === fluid.out.length + 1 ? message.buffer : new Float32Array(fluid.out.length + 1);
    buffer.set(fluid.out);
    buffer[fluid.out.length] = fluid.piston(fluid.time);
    (self as unknown as Worker).postMessage({ type: 'frame', buffer }, [buffer.buffer]);
  }
};
