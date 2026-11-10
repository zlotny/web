const CELL = 12;
const STRIDE = 5;

export interface Contact {
  x: number;
  z: number;
  radius: number;
  bottom: number;
  top: number;
  depth: number;
}

export class Obstacles {
  private cells = new Map<number, number[]>();
  private data: number[] = [];
  private contact: Contact = { x: 0, z: 0, radius: 0, bottom: 0, top: 0, depth: 0 };

  get count(): number {
    return this.data.length / STRIDE;
  }

  add(x: number, z: number, radius: number, bottom: number, top: number): void {
    const index = this.data.length;
    this.data.push(x, z, radius, bottom, top);
    const reach = radius + 2;
    for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
      for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
        const key = (cx + 2048) * 4096 + cz + 2048;
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(index);
      }
    }
  }

  hit(x: number, y: number, z: number, margin: number): Contact | null {
    const list = this.cells.get((Math.floor(x / CELL) + 2048) * 4096 + Math.floor(z / CELL) + 2048);
    if (!list) return null;
    const d = this.data;
    let best = -1;
    let depth = 0;
    for (const i of list) {
      if (y < d[i + 3] - margin || y > d[i + 4] + margin) continue;
      const inside = d[i + 2] + margin - Math.hypot(x - d[i], z - d[i + 1]);
      if (inside > depth) {
        depth = inside;
        best = i;
      }
    }
    if (best < 0) return null;
    const c = this.contact;
    c.x = d[best];
    c.z = d[best + 1];
    c.radius = d[best + 2];
    c.bottom = d[best + 3];
    c.top = d[best + 4];
    c.depth = depth;
    return c;
  }
}
