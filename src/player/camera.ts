import * as THREE from 'three/webgpu';
import type { Flight } from './flight';

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.4, 12000);
  private yaw = 0;
  private pitch = 0;
  private look = new THREE.Vector3();
  private goal = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private offsetX = 0;
  private offsetY = 0;
  private ready = false;
  private freeYaw = 0;
  private freePitch = 0;
  private wantYaw = 0;
  private wantPitch = 0;
  private held = false;
  distance = 4.9;
  height = 2.0;

  constructor(private groundAt: (x: number, z: number) => number) {}

  free(dx: number, dy: number, held: boolean): void {
    this.held = held;
    if (held) {
      this.wantYaw -= dx * 0.006;
      this.wantPitch = Math.max(-1.1, Math.min(0.7, this.wantPitch - dy * 0.005));
    }
  }

  snap(): void {
    this.ready = false;
  }

  update(dt: number, flight: Flight): void {
    if (!this.ready) {
      this.yaw = flight.yaw;
      this.pitch = flight.pitch;
    }
    let diff = flight.yaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * damp(3.2, dt);
    this.pitch += (flight.pitch * 0.55 - this.pitch) * damp(2.4, dt);

    if (!this.held) {
      this.wantYaw = Math.atan2(Math.sin(this.wantYaw), Math.cos(this.wantYaw));
      this.wantYaw *= Math.exp(-2.6 * dt);
      this.wantPitch *= Math.exp(-2.6 * dt);
    }
    this.freeYaw += (this.wantYaw - this.freeYaw) * damp(12, dt);
    this.freePitch += (this.wantPitch - this.freePitch) * damp(12, dt);
    const loose = Math.min(1, Math.abs(this.freeYaw) * 2 + Math.abs(this.freePitch) * 2);

    const speedPull = THREE.MathUtils.clamp((flight.speed - 17) / 28, -0.3, 1);
    const distance = (this.distance + speedPull * 1.6) * (1 - flight.perch * 0.28) * (1 + loose * 0.35);
    const pitch = this.pitch + this.freePitch;
    const yaw = this.yaw + this.freeYaw;
    const cp = Math.cos(pitch);
    const bx = Math.sin(yaw) * cp;
    const by = Math.sin(pitch);
    const bz = Math.cos(yaw) * cp;

    this.goal.set(
      flight.position.x - bx * distance,
      flight.position.y - by * distance + this.height * (1 - flight.perch * 0.5),
      flight.position.z - bz * distance,
    );
    const floor = this.groundAt(this.goal.x, this.goal.z) + 0.8;
    if (this.goal.y < floor) this.goal.y = floor;

    const target = this.look.copy(flight.position).addScaledVector(flight.forward, 3.5 * (1 - loose));
    target.y += 0.2;

    if (!this.ready) {
      this.camera.position.copy(this.goal);
      this.ready = true;
    } else {
      this.camera.position.lerp(this.goal, damp(loose > 0.02 ? 22 : 9, dt));
      const under = this.groundAt(this.camera.position.x, this.camera.position.z) + 0.6;
      if (this.camera.position.y < under) this.camera.position.y = under;
    }
    this.aim.copy(target);
    this.camera.lookAt(target);
    this.camera.rotateZ(-flight.roll * 0.22 * (1 - loose));

    const fov = 58 + speedPull * 14;
    if (Math.abs(fov - this.camera.fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * damp(3, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  orbit(dt: number, flight: Flight, x: number, y: number, z: number, back: number): void {
    const dx = flight.position.x - x;
    const dz = flight.position.z - z;
    const distance = Math.hypot(dx, dz) || 1;
    const lead = back * 0.45 + flight.speed / 4;
    this.goal.set(
      flight.position.x + (dx / distance) * back + flight.forward.x * lead,
      flight.position.y + back * 0.34,
      flight.position.z + (dz / distance) * back + flight.forward.z * lead,
    );
    const floor = this.groundAt(this.goal.x, this.goal.z) + 1.2;
    if (this.goal.y < floor) this.goal.y = floor;
    this.camera.position.lerp(this.goal, damp(4, dt));
    const under = this.groundAt(this.camera.position.x, this.camera.position.z) + 0.8;
    if (this.camera.position.y < under) this.camera.position.y = under;
    this.look.set(x, y, z).lerp(flight.position, 0.3);
    this.aim.lerp(this.look, damp(2.4, dt));
    this.camera.lookAt(this.aim);
    this.yaw = Math.atan2(this.aim.x - this.camera.position.x, this.aim.z - this.camera.position.z);
    this.pitch = 0;
    if (Math.abs(54 - this.camera.fov) > 0.05) {
      this.camera.fov += (54 - this.camera.fov) * damp(3, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  shift(dt: number, x: number, y: number, width: number, height: number): void {
    this.offsetX += (x - this.offsetX) * damp(3, dt);
    this.offsetY += (y - this.offsetY) * damp(3, dt);
    if (Math.abs(this.offsetX) < 0.5 && Math.abs(this.offsetY) < 0.5) {
      if (this.camera.view?.enabled) this.camera.clearViewOffset();
    } else {
      this.camera.setViewOffset(width, height, this.offsetX, this.offsetY, width, height);
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
