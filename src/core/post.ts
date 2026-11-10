import * as THREE from 'three/webgpu';
import { Fn, If, atan, dot, float, floor, fract, length, mix, pass, screenSize, screenUV, smoothstep, step, time, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { noise, type N } from '../world/shading';

const QUADRANTS: [number, number][] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

function kuwahara(source: N, radius: number, stride: N, at: N): N {
  return Fn(() => {
    const texel = vec2(1).div(screenSize).mul(stride);
    const wobble = noise(screenUV.mul(screenSize).div(190)).rg.sub(0.5).mul(texel).mul(2.2);
    const uv = at.add(wobble);
    const count = (radius + 1) * (radius + 1);
    const best = vec3(0).toVar();
    const lowest = float(1e6).toVar();
    for (const [sx, sy] of QUADRANTS) {
      const sum = vec3(0).toVar();
      const squares = vec3(0).toVar();
      for (let i = 0; i <= radius; i++) {
        for (let j = 0; j <= radius; j++) {
          const sample = source.sample(uv.add(vec2(sx * i, sy * j).mul(texel))).rgb.toVar();
          sum.addAssign(sample);
          squares.addAssign(sample.mul(sample));
        }
      }
      const mean = sum.div(count).toVar();
      const spread = squares.div(count).sub(mean.mul(mean));
      const variance = spread.r.add(spread.g).add(spread.b).toVar();
      If(variance.lessThan(lowest), () => {
        lowest.assign(variance);
        best.assign(mean);
      });
    }
    return best;
  })();
}

export interface PostSettings {
  radius: number;
  bloom: boolean;
}

export class Post {
  readonly pipeline: THREE.RenderPipeline;
  readonly stride = uniform(1.35);
  readonly glow = uniform(0.15);
  readonly retro = uniform(0);
  readonly fringe = uniform(0);
  readonly rush = uniform(0);
  readonly shut = uniform(0);
  private scenePass: N;

  constructor(
    private renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    settings: PostSettings,
  ) {
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.scenePass = pass(scene, camera);
    this.build(settings);
  }

  build(settings: PostSettings): void {
    const color = this.scenePass.getTextureNode();
    const block = vec2(4).div(screenSize);
    const chunky: N = floor(screenUV.div(block)).add(0.5).mul(block);
    const at: N = mix(screenUV, chunky, step(0.5, this.retro));
    const brushed: N = settings.radius > 0 ? kuwahara(color, settings.radius, this.stride, at) : color.sample(at).rgb;
    const spread = screenUV.sub(0.5).mul(this.fringe.mul(0.012).add(this.rush.mul(0.006)));
    const split: N = vec3(color.sample(at.add(spread)).r, brushed.g, color.sample(at.sub(spread)).b);
    const painted: N = mix(brushed, split, this.fringe.max(this.rush).min(1).mul(0.85));

    const lifted: N = settings.bloom ? painted.add(bloom(color, 1, 0.55, 2.4).rgb.mul(this.glow)) : painted;
    const grey = dot(lifted, vec3(0.2126, 0.7152, 0.0722));
    const vivid = mix(vec3(grey), lifted, 1.16);
    const centered = screenUV.sub(0.5);
    const vignette = smoothstep(0.9, 0.28, length(centered.mul(vec2(1, 0.85)))).mul(0.46).add(0.54);
    const canvasGrain = noise(screenUV.mul(screenSize).div(96)).a.sub(0.5).mul(0.05).add(1);
    const scan = fract(screenUV.y.mul(screenSize.y).div(4)).step(0.5).mul(0.16).mul(this.retro).oneMinus();
    const around = atan(centered.y, centered.x);
    const streak = noise(vec2(around.mul(1.9), time.mul(0.35))).r.mul(noise(vec2(around.mul(5.3), time.mul(0.6).add(0.4))).g);
    const lines = smoothstep(0.3, 0.5, streak).mul(smoothstep(0.26, 0.62, length(centered))).mul(this.rush).mul(0.5);
    const half = this.shut.oneMinus().mul(0.5).add(0.004);
    const open = step(centered.y.abs(), half);
    const seam = smoothstep(0.02, 0, centered.y.abs().sub(half).abs()).mul(step(0.001, this.shut));
    this.pipeline.outputNode = vec4(vivid.mul(vignette).mul(canvasGrain).mul(scan).add(vec3(lines)).mul(open).add(vec3(seam)), 1);
    this.pipeline.needsUpdate = true;
  }

  render(): void {
    this.pipeline.render();
  }
}

export function configureToneMapping(renderer: THREE.WebGPURenderer): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
}
