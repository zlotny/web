import type { Controls } from '../core/input';
import type { Flight } from './flight';

export interface Orbit {
  x: number;
  z: number;
  y: number;
  radius: number;
}

const controls: Controls = { steerX: 0, steerY: 0, flap: false, brake: false, interact: false };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function orbit(flight: Flight, target: Orbit): Controls {
  const dx = flight.position.x - target.x;
  const dz = flight.position.z - target.z;
  const distance = Math.hypot(dx, dz);
  const outward = Math.atan2(dx, dz);
  const error = clamp((distance - target.radius) / target.radius, -1, 1.4);
  const heading = outward + Math.PI / 2 + error * 0.95;
  let turn = heading - flight.yaw;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  controls.steerX = clamp(-turn * 1.8, -1, 1);
  controls.steerY = clamp((target.y - flight.position.y) * 0.05 - flight.pitch * 0.6, -1, 1);
  controls.flap = false;
  controls.brake = distance < target.radius * 1.5 && flight.speed > 13;
  controls.interact = false;
  return controls;
}
