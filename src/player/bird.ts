import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, float, fract, max, mix, pow, normalWorld, positionGeometry, positionWorld, sin, smoothstep, step, time, uniform, vec3 } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyFog, noise, paint, type N } from '../world/shading';
import type { Flight } from './flight';

const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(-1, 0, 0);

interface Joint {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  parentInverse: THREE.Quaternion;
}

const axis = new THREE.Vector3();
const turn = new THREE.Quaternion();
const total = new THREE.Quaternion();

export class Bird {
  readonly root = new THREE.Group();
  private model = new THREE.Group();
  private joints = new Map<string, Joint>();
  private steer = 0;
  private crest = 0;
  private clock = 0;
  private fade = uniform(0);
  private meshes: THREE.Mesh[] = [];
  private materials: Record<'lelo' | 'neon', THREE.MeshBasicNodeMaterial[]>;
  private style: 'lelo' | 'neon' = 'lelo';
  readonly tips: THREE.Object3D[] = [];

  static async load(url = '/models/lelo.glb'): Promise<Bird> {
    const gltf = await new GLTFLoader().loadAsync(url);
    return new Bird(gltf.scene);
  }

  private constructor(scene: THREE.Object3D) {
    const color: N = attribute('color', 'vec3');
    const local: N = positionGeometry;
    const grain = noise(local.xy.mul(1.9).add(local.z.mul(1.3))).r.mul(0.7).add(noise(local.zx.mul(6.1)).g.mul(0.3));
    const edge = grain.sub(this.fade.mul(1.2).sub(0.1));
    const ember = edge.div(0.1).clamp(0, 1).oneMinus();
    const albedo: N = mix(vec3(0.45, 0.47, 0.5), color, step(0.0005, color.r.add(color.g).add(color.b)));
    const floorLight = pow(albedo, vec3(2.2)).mul(0.55);
    const feathered = applyFog(max(paint(albedo, normalWorld, positionWorld, float(1), 0.82, false), floorLight), positionWorld);
    const view = cameraPosition.sub(positionWorld).normalize();
    const rim = float(1).sub(normalWorld.dot(view).abs()).pow(2.6);
    const stripes = smoothstep(0.455, 0.5, fract(local.z.mul(11).add(local.x.abs().mul(7))).sub(0.5).abs());
    const hue = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.2, 0.8), sin(local.z.mul(5).add(time.mul(1.7))).mul(0.5).add(0.5));
    const glowing = applyFog(vec3(0.012, 0.015, 0.045).add(hue.mul(rim.mul(1.9).add(stripes.mul(0.85)))), positionWorld);
    const make = (base: N, dissolve: boolean, tint: N) => {
      const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
      material.colorNode = dissolve ? base.add(tint.mul(ember)) : base;
      if (dissolve) {
        material.opacityNode = step(0, edge);
        material.alphaTest = 0.5;
      }
      return material;
    };
    this.materials = {
      lelo: [make(feathered, false, vec3(0)), make(feathered, true, vec3(1.6, 1.25, 0.45))],
      neon: [make(glowing, false, vec3(0)), make(glowing, true, vec3(0.6, 1.8, 2.0))],
    };

    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (mesh.isMesh) {
        const source = mesh.geometry.getAttribute('color');
        const flat = new Float32Array(source.count * 3);
        for (let i = 0; i < source.count; i++) flat.set([source.getX(i), source.getY(i), source.getZ(i)], i * 3);
        mesh.geometry.setAttribute('color', new THREE.BufferAttribute(flat, 3));
        mesh.material = this.materials.lelo[0];
        this.meshes.push(mesh);
        mesh.frustumCulled = false;
      }
      const bone = object as THREE.Bone;
      if (bone.isBone) {
        const parentWorld = new THREE.Quaternion();
        bone.parent?.getWorldQuaternion(parentWorld);
        this.joints.set(bone.name, { bone, rest: bone.quaternion.clone(), parentInverse: parentWorld.invert() });
        const reach = bone.name.startsWith('wing_hand') ? 0.34 : bone.name === 'tail' ? 0.44 : 0;
        if (reach) {
          const tip = new THREE.Object3D();
          tip.position.set(0, reach, 0);
          bone.add(tip);
          this.tips.push(tip);
        }
      }
    });

    this.model.add(scene);
    this.model.scale.setScalar(1.75);
    this.root.add(this.model);
    this.root.rotation.order = 'YXZ';
  }

  setFade(value: number): void {
    this.fade.value = value;
    this.apply();
  }

  setStyle(style: 'lelo' | 'neon'): void {
    this.style = style;
    this.apply();
  }

  setVisible(visible: boolean): void {
    this.model.visible = visible;
  }

  private apply(): void {
    const material = this.materials[this.style][this.fade.value > 0 ? 1 : 0];
    for (const mesh of this.meshes) if (mesh.material !== material) mesh.material = material;
  }

  private pose(name: string, rotations: [THREE.Vector3, number][]): void {
    const joint = this.joints.get(name);
    if (!joint) return;
    total.identity();
    for (const [modelAxis, angle] of rotations) {
      axis.copy(modelAxis).applyQuaternion(joint.parentInverse);
      turn.setFromAxisAngle(axis, angle);
      total.premultiply(turn);
    }
    joint.bone.quaternion.copy(total).multiply(joint.rest);
  }

  private idle = 0;

  update(dt: number, flight: Flight, steerX: number): void {
    this.root.position.copy(flight.position);
    const perch = flight.perch;
    const air = 1 - perch;
    this.clock += dt;
    this.root.rotation.set(-(flight.pitch + perch * 0.62), flight.yaw, flight.roll);

    const power = Math.min(1.25, flight.flapPower);
    const phase = flight.flapPhase;
    const amplitude = 0.1 + power * 0.62;
    const stroke = Math.sin(phase);
    const rising = Math.max(0, Math.cos(phase));
    const dihedral = 0.14 - power * 0.06;

    for (const [suffix, side] of [
      ['L', 1],
      ['R', -1],
    ] as const) {
      const bank = flight.roll * 0.18 * side;
      const upper = dihedral + stroke * amplitude * 0.7 + bank;
      const fore = Math.sin(phase - 0.7) * amplitude * 0.42;
      const hand = Math.sin(phase - 1.25) * amplitude * 0.55;
      const fold = rising * power * 0.32;
      this.pose(`wing_upper${suffix}`, [
        [UP, side * (fold * 0.35 * air + perch * 1.22)],
        [FORWARD, side * (upper * air - perch * 0.3)],
      ]);
      this.pose(`wing_fore${suffix}`, [
        [UP, side * (fold * 0.5 * air + perch * 0.2)],
        [FORWARD, side * fore * air],
      ]);
      this.pose(`wing_hand${suffix}`, [
        [UP, side * (fold * 0.9 * air + perch * 0.25)],
        [FORWARD, side * hand * air],
      ]);
    }

    this.steer += (steerX - this.steer) * (1 - Math.exp(-6 * dt));
    this.idle = perch > 0.9 ? this.idle + dt : 0;
    const cycle = this.idle % 12;
    const preen = cycle > 7.5 && cycle < 10.5 ? Math.sin(((cycle - 7.5) / 3) * Math.PI) ** 0.6 : 0;
    this.pose('head', [
      [FORWARD, -flight.roll * 0.55 + perch * Math.sin(this.clock * 0.43) * 0.22],
      [UP, -this.steer * 0.3 + perch * (Math.sin(this.clock * 0.7) * 0.55 * (1 - preen) + preen * 2.1)],
      [RIGHT, flight.pitch * 0.25 - perch * (0.5 - preen * (0.55 + Math.sin(this.clock * 15) * 0.07))],
    ]);
    this.pose('tail', [
      [UP, this.steer * 0.22],
      [RIGHT, -flight.pitch * 0.3 + Math.cos(phase) * amplitude * 0.08 * air + perch * 0.35],
    ]);
    const sleek = THREE.MathUtils.clamp((flight.speed - 9) / 22, 0, 1);
    this.crest += (sleek - this.crest) * (1 - Math.exp(-3 * dt));
    this.pose('crest', [[RIGHT, -this.crest * 0.75 + Math.sin(phase * 0.5) * 0.03]]);

    this.model.position.y = -stroke * amplitude * 0.05 * air + perch * 0.1;
  }
}
