import * as THREE from 'three/webgpu';
import type { Controls } from '../core/input';
import type { HeightMap } from '../world/height';
import type { Obstacles } from '../world/obstacles';

const CRUISE = 17;
const MIN_SPEED = 5;
const MAX_SPEED = 46;
const CLEARANCE = 0.55;
const CEILING = 460;
const BOUNDS = 1720;
const BODY = 0.4;
const STAND = 0.24;

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export class Flight {
  readonly position = new THREE.Vector3();
  readonly forward = new THREE.Vector3(0, 0, 1);
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  roll = 0;
  speed = CRUISE;
  flapPhase = 0;
  flapPower = 0.4;
  altitude = 0;
  grounded = false;
  frozen = false;
  turningBack = false;
  landed = false;
  turbo = false;
  perchY: number | null = null;
  perch = 0;
  canLand = false;
  private grace = 0;
  private boost = 0;

  constructor(
    private map: HeightMap,
    private obstacles: Obstacles,
  ) {}

  place(x: number, y: number, z: number, yaw: number): void {
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.speed = CRUISE;
    this.landed = false;
    this.perch = 0;
    this.grace = 1;
  }

  groundAt(x: number, z: number): number {
    return Math.max(this.map.sample(x, z), 0);
  }

  rings: { x: number; z: number; radius: number; top: number }[] = [];

  update(dt: number, input: Controls): void {
    if (this.frozen) {
      this.flapPhase += dt * 4;
      return;
    }
    this.grace = Math.max(0, this.grace - dt);
    if (this.landed) {
      if (this.perchY === null) this.yaw -= input.steerX * 1.5 * dt;
      this.pitch = damp(this.pitch, 0, 6, dt);
      this.roll = damp(this.roll, 0, 6, dt);
      this.speed = 0;
      this.velocity.set(0, 0, 0);
      this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const rest = this.perchY ?? this.groundAt(this.position.x, this.position.z);
      this.position.y = damp(this.position.y, rest + STAND, 10, dt);
      this.altitude = STAND;
      this.grounded = true;
      this.perch = damp(this.perch, 1, 4, dt);
      this.flapPower = damp(this.flapPower, 0.02, 5, dt);
      this.flapPhase += dt * 1.5;
      if (this.perchY === null && (input.flap || input.steerY > 0.6 || !this.canLand)) {
        this.landed = false;
        this.speed = 10;
        this.pitch = 0.5;
        this.boost = 1;
        this.grace = 1.3;
        this.position.y += 0.5;
        this.flapPower = 1.2;
      }
      return;
    }
    this.perch = damp(this.perch, 0, 5, dt);

    const agility = 1.25 - 0.45 * Math.min(1, this.speed / MAX_SPEED);
    let steerX = input.steerX;
    let steerY = input.steerY;

    const edge = Math.hypot(this.position.x, this.position.z);
    const corridor = this.position.x < -1300 && this.position.x > -3250 && Math.abs(this.position.z) < 520;
    if (edge > BOUNDS && !corridor) {
      const home = Math.atan2(-this.position.x, -this.position.z);
      let diff = home - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const push = Math.min(1, (edge - BOUNDS) / 120);
      steerX = THREE.MathUtils.lerp(steerX, THREE.MathUtils.clamp(-diff * 2.5, -1, 1), push);
      this.turningBack = Math.abs(diff) > 0.5;
    } else {
      this.turningBack = false;
    }
    for (const ring of this.rings) {
      const dx = this.position.x - ring.x;
      const dz = this.position.z - ring.z;
      const from = Math.hypot(dx, dz);
      const gap = from - ring.radius;
      const closing = -Math.sign(gap) * (dx * this.forward.x + dz * this.forward.z) / (from || 1);
      const near = 1 - Math.abs(gap) / (30 + this.speed * 1.6);
      const low = (ring.top + 9 - this.position.y) / 9;
      if (near > 0 && low > 0 && closing > 0.15) steerY = Math.max(steerY, Math.min(1, near * 2.2) * Math.min(1, low));
    }
    if (this.position.y > CEILING) steerY = Math.min(steerY, -Math.min(1, (this.position.y - CEILING) / 40));

    const reach = this.speed * 0.55;
    const ahead0 = this.obstacles.hit(this.position.x + this.forward.x * reach, this.position.y + this.forward.y * reach, this.position.z + this.forward.z * reach, BODY + 0.9);
    if (ahead0) {
      const urge = Math.min(1, ahead0.depth / (ahead0.radius * 0.6 + 1));
      if (this.position.y > ahead0.top - 3) {
        steerY = Math.max(steerY, urge);
      } else {
        const side = (ahead0.x - this.position.x) * this.forward.z - (ahead0.z - this.position.z) * this.forward.x;
        steerX = THREE.MathUtils.clamp(steerX + (side >= 0 ? 1 : -1) * urge * 1.3, -1, 1);
      }
    }

    this.yaw -= steerX * 1.25 * agility * dt;
    this.roll = damp(this.roll, steerX * 0.95, 5, dt);
    this.pitch = damp(this.pitch, steerY * 0.82, steerY === 0 ? 1.6 : 3.4, dt);

    if (input.flap) this.boost = Math.min(1, this.boost + dt * 3.5);
    else this.boost = Math.max(0, this.boost - dt * 1.4);

    const target = input.brake ? MIN_SPEED + 1.5 : (CRUISE + this.boost * 15) * (this.turbo ? 1.9 : 1);
    const gravityGain = -Math.sin(this.pitch) * 19;
    this.speed += (gravityGain + (target - this.speed) * (input.brake ? 1.6 : 0.55)) * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, MIN_SPEED, this.turbo ? 78 : MAX_SPEED);

    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);

    const contact = this.obstacles.hit(this.position.x, this.position.y, this.position.z, BODY);
    if (contact) {
      const dx = this.position.x - contact.x;
      const dz = this.position.z - contact.z;
      const distance = Math.hypot(dx, dz) || 1e-3;
      const over = contact.top + BODY - this.position.y;
      if (over < contact.depth) {
        this.position.y += over;
        this.pitch = Math.max(this.pitch, 0.05);
      } else {
        this.position.x += (dx / distance) * contact.depth;
        this.position.z += (dz / distance) * contact.depth;
        this.speed = Math.max(MIN_SPEED + 3, this.speed - 10 * dt);
      }
    }

    const ground = this.groundAt(this.position.x, this.position.z);
    const ahead = this.groundAt(this.position.x + this.forward.x * this.speed * 0.6, this.position.z + this.forward.z * this.speed * 0.6);
    const floor = Math.max(ground, ahead - 2) + CLEARANCE;
    this.grounded = this.position.y <= floor + 0.02;
    if (this.canLand && this.grace <= 0 && ground > 0.5 && this.position.y < ground + CLEARANCE + 0.45 && (this.pitch < -0.06 || input.brake) && this.map.slope(this.position.x, this.position.z) < 0.45) {
      this.landed = true;
      return;
    }
    if (this.position.y < floor) {
      this.position.y = damp(this.position.y, floor, 18, dt);
      if (this.position.y < ground + CLEARANCE) this.position.y = ground + CLEARANCE;
      this.pitch = Math.max(this.pitch, damp(this.pitch, 0.22, 8, dt));
      this.speed = Math.max(MIN_SPEED, this.speed - 6 * dt);
    }
    this.altitude = this.position.y - ground;

    const effort = THREE.MathUtils.clamp(0.35 + this.boost * 0.9 + Math.max(0, this.pitch) * 1.3 - Math.max(0, -this.pitch) * 0.9 + (input.brake ? 0.6 : 0), 0.05, 1.5);
    this.flapPower = damp(this.flapPower, effort, 4, dt);
    this.flapPhase += dt * (5 + this.flapPower * 9);
  }
}
