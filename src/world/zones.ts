export const CITY = { x: 640, z: -250, radius: 270 };
export const ARCADE = { x: 520, z: 420, radius: 185 };

export function zoneWeight(zone: { x: number; z: number; radius: number }, x: number, z: number, margin = 1): number {
  const d = Math.hypot(x - zone.x, z - zone.z) / (zone.radius * margin);
  const t = Math.max(0, Math.min(1, (1 - d) / 0.2));
  return t * t * (3 - 2 * t);
}
