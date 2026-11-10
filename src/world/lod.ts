import * as THREE from 'three/webgpu';

export interface LodKind {
  levels: THREE.BufferGeometry[];
  material: THREE.Material | THREE.Material[];
  items: THREE.Matrix4[];
}

interface Chunk {
  center: THREE.Vector3;
  reach: number;
  level: number;
  meshes: THREE.InstancedMesh[];
}

interface Block {
  mesh: THREE.InstancedMesh;
  chunks: Chunk[];
}

const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const BLOCK = 3;
const pick = (kind: LodKind, level: number) => (Array.isArray(kind.material) ? kind.material[Math.min(level, kind.material.length - 1)] : kind.material);

export class LodField {
  static detail = 1;
  readonly group = new THREE.Group();
  readonly count: number;
  private chunks: Chunk[] = [];
  private blocks: Block[] = [];

  constructor(
    name: string,
    kinds: LodKind[],
    size: number,
    private ranges: number[],
  ) {
    this.group.name = name;
    let count = 0;
    for (const kind of kinds) {
      const buckets = new Map<string, THREE.Matrix4[]>();
      for (const matrix of kind.items) {
        position.setFromMatrixPosition(matrix);
        const key = `${Math.floor(position.x / size)}:${Math.floor(position.z / size)}`;
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(matrix);
      }
      for (const level of kind.levels) if (!level.boundingSphere) level.computeBoundingSphere();
      const blocks = new Map<string, { matrices: THREE.Matrix4[]; chunks: Chunk[] }>();
      for (const [key, matrices] of buckets) {
        const [cx, cz] = key.split(':').map(Number);
        const meshes = kind.levels.map((geometry, level) => this.instanced(geometry, pick(kind, level), matrices, `${name}-lod${level}`, level === 0));
        const chunk = { center: meshes[0].boundingSphere!.center, reach: meshes[0].boundingSphere!.radius, level: 0, meshes };
        this.chunks.push(chunk);
        count += matrices.length;
        const blockKey = `${Math.floor(cx / BLOCK)}:${Math.floor(cz / BLOCK)}`;
        let block = blocks.get(blockKey);
        if (!block) blocks.set(blockKey, (block = { matrices: [], chunks: [] }));
        block.matrices.push(...matrices);
        block.chunks.push(chunk);
      }
      for (const block of blocks.values()) {
        if (block.chunks.length < 2) continue;
        this.blocks.push({ mesh: this.instanced(kind.levels[kind.levels.length - 1], pick(kind, kind.levels.length - 1), block.matrices, `${name}-block`, false), chunks: block.chunks });
      }
    }
    this.count = count;
  }

  private instanced(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], name: string, visible: boolean): THREE.InstancedMesh {
    const bound = geometry.boundingSphere!;
    const radius = bound.radius + bound.center.length();
    const center = new THREE.Vector3();
    for (const m of matrices) center.add(position.setFromMatrixPosition(m));
    center.divideScalar(matrices.length);
    let reach = 0;
    for (const m of matrices) {
      m.decompose(position, rotation, scale);
      reach = Math.max(reach, position.distanceTo(center) + radius * Math.max(scale.x, scale.y, scale.z));
    }
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.boundingSphere = new THREE.Sphere(center, reach);
    mesh.visible = visible;
    mesh.name = name;
    this.group.add(mesh);
    return mesh;
  }

  reveal(all: boolean): void {
    for (const chunk of this.chunks) chunk.meshes.forEach((mesh, level) => (mesh.visible = all || level === chunk.level));
    for (const block of this.blocks) block.mesh.visible = all;
  }

  update(eye: THREE.Vector3): void {
    const detail = LodField.detail;
    for (const chunk of this.chunks) {
      const away = Math.max(0, eye.distanceTo(chunk.center) - chunk.reach);
      let level = 0;
      for (let i = 0; i < this.ranges.length && i < chunk.meshes.length - 1; i++) {
        const edge = this.ranges[i] * detail * (i < chunk.level ? 0.94 : 1.06);
        if (away > edge) level = i + 1;
      }
      if (level === chunk.level) continue;
      chunk.meshes[chunk.level].visible = false;
      chunk.meshes[level].visible = true;
      chunk.level = level;
    }
    for (const block of this.blocks) {
      const last = block.chunks[0].meshes.length - 1;
      const far = block.chunks.every((chunk) => chunk.level === last);
      block.mesh.visible = far;
      for (const chunk of block.chunks) chunk.meshes[last].visible = !far && chunk.level === last;
    }
  }
}
