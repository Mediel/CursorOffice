import * as THREE from 'three';
import type { AgentStatus } from '../contracts';
import { colorToCss } from '../ui/dom';

export type CharacterState = AgentStatus | 'owner';
export type CharacterRestPose = 'stand' | 'workSeat' | 'loungeSeat';

export type CharacterDescriptor = {
  id: string;
  displayName: string;
  role: string;
  color: number;
  isOwner: boolean;
  kind?: 'primary' | 'subagent';
};

function standardMaterial(color: number, roughness = 0.76): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
}

export function createTextSprite(text: string, accent: string, subtitle?: string): THREE.Sprite {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 640;
  labelCanvas.height = subtitle ? 150 : 92;
  const context = labelCanvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable.');
  }

  context.fillStyle = 'rgba(7, 16, 22, 0.9)';
  context.beginPath();
  context.roundRect(5, 5, labelCanvas.width - 10, labelCanvas.height - 10, 28);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 5;
  context.stroke();

  context.fillStyle = '#f4f8fa';
  context.font = '600 38px Inter, Segoe UI, sans-serif';
  context.textAlign = 'center';
  context.fillText(text, labelCanvas.width / 2, subtitle ? 59 : 58);

  if (subtitle) {
    context.fillStyle = '#9db0bc';
    context.font = '500 23px Inter, Segoe UI, sans-serif';
    context.fillText(subtitle, labelCanvas.width / 2, 108);
  }

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.85, subtitle ? 0.43 : 0.27, 1);
  return sprite;
}

function createEmotionSprite(emoji: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable.');
  }

  context.fillStyle = 'rgba(8, 18, 24, 0.9)';
  context.beginPath();
  context.arc(80, 80, 66, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(226, 241, 247, 0.34)';
  context.lineWidth = 5;
  context.stroke();
  context.font = '82px "Segoe UI Emoji", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(emoji, 80, 84);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(0.42, 0.42, 1);
  return sprite;
}

export class CharacterController {
  public readonly group = new THREE.Group();

  private readonly actor = new THREE.Group();
  private readonly arms: THREE.Mesh[] = [];
  private readonly legs: THREE.Mesh[] = [];
  private readonly head: THREE.Mesh;
  private readonly emotionSprite: THREE.Sprite;
  private readonly labelSprite: THREE.Sprite;
  private readonly torsoMaterial: THREE.MeshStandardMaterial;
  private readonly ringMaterial: THREE.MeshStandardMaterial;
  private readonly phase = Math.random() * Math.PI * 2;
  private path: THREE.Vector3[] = [];
  private destination: THREE.Vector3 | undefined;
  private walkPhase = Math.random() * Math.PI * 2;
  private state: CharacterState;
  private restPose: CharacterRestPose = 'stand';
  private restFacing = Math.PI;

  public constructor(private readonly descriptor: CharacterDescriptor) {
    this.group.name = descriptor.id;
    this.group.userData.selectableId = descriptor.id;
    this.group.add(this.actor);

    this.state = descriptor.isOwner ? 'owner' : 'unknown';
    this.torsoMaterial = standardMaterial(descriptor.color, 0.63);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.46, 6, 10), this.torsoMaterial);
    torso.position.y = 0.78;
    torso.castShadow = true;
    this.actor.add(torso);

    const darkMaterial = standardMaterial(descriptor.isOwner ? 0x382a1f : 0x243642, 0.76);
    for (const x of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 10), darkMaterial);
      leg.position.set(x, 0.25, 0);
      leg.castShadow = true;
      this.actor.add(leg);
      this.legs.push(leg);
    }

    for (const x of [-0.31, 0.31]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.3, 4, 8), this.torsoMaterial);
      arm.position.set(x, 0.79, 0);
      arm.rotation.z = x < 0 ? 0.14 : -0.14;
      arm.castShadow = true;
      this.actor.add(arm);
      this.arms.push(arm);
    }

    const skinMaterial = standardMaterial(0xe8b991, 0.82);
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), skinMaterial);
    this.head.position.y = 1.33;
    this.head.castShadow = true;
    this.actor.add(this.head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.245, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.48),
      standardMaterial(descriptor.isOwner ? 0x4a3124 : 0x263038, 0.9)
    );
    hair.position.y = 1.38;
    hair.castShadow = true;
    this.actor.add(hair);

    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: descriptor.color,
      emissive: descriptor.color,
      emissiveIntensity: 1.25,
      roughness: 0.45
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.024, 8, 32), this.ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.025;
    this.actor.add(ring);

    if (descriptor.isOwner) {
      this.addCrown();
    }

    const label = createTextSprite(
      descriptor.displayName,
      colorToCss(descriptor.color),
      descriptor.role
    );
    this.labelSprite = label;
    label.position.y = descriptor.isOwner ? 2.08 : 1.9;
    this.actor.add(label);

    this.emotionSprite = createEmotionSprite(
      descriptor.isOwner ? '👑' : descriptor.kind === 'subagent' ? '🛠️' : '🧭'
    );
    this.emotionSprite.position.set(0.62, descriptor.isOwner ? 1.82 : 1.68, 0);
    this.actor.add(this.emotionSprite);
  }

  public setPosition(position: THREE.Vector3): void {
    this.group.position.copy(position);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public get isMoving(): boolean {
    return this.path.length > 0;
  }

  public setTarget(position: THREE.Vector3): void {
    this.setPath([position]);
  }

  public setPath(waypoints: readonly THREE.Vector3[]): void {
    const destination = waypoints.at(-1);
    if (!destination) {
      this.path = [];
      this.destination = undefined;
      return;
    }
    if (this.destination?.distanceToSquared(destination) === 0 && this.path.length > 0) {
      return;
    }

    this.path = waypoints.map(waypoint => waypoint.clone());
    this.destination = destination.clone();
  }

  public setState(state: CharacterState, color: number): void {
    if (this.state !== state) {
      this.updateEmotion(state);
    }
    this.state = state;
    this.torsoMaterial.color.setHex(color);
    this.ringMaterial.color.setHex(color);
    this.ringMaterial.emissive.setHex(color);
  }

  public setRestPose(pose: CharacterRestPose, facing = Math.PI): void {
    this.restPose = pose;
    this.restFacing = facing;
  }

  public moveTo(position: THREE.Vector3): void {
    const delta = position.clone().sub(this.group.position);
    if (delta.lengthSq() === 0) {
      return;
    }

    this.path = [];
    this.destination = undefined;
    this.restPose = 'stand';
    this.group.position.copy(position);
    this.restFacing = Math.atan2(delta.x, delta.z);
    this.group.rotation.y = lerpAngle(this.group.rotation.y, this.restFacing, 0.45);
  }

  public update(timeSeconds: number, deltaSeconds: number, index: number, selected: boolean): void {
    let target = this.path[0];
    if (target && this.group.position.distanceTo(target) < 0.08) {
      this.path.shift();
      target = this.path[0];
    }
    const distance = target ? this.group.position.distanceTo(target) : 0;
    let travelled = 0;
    if (target && distance > 0.015 && deltaSeconds > 0) {
      const direction = target.clone().sub(this.group.position).setY(0).normalize();
      const speed = this.descriptor.isOwner ? 2.2 : 1.58;
      travelled = Math.min(distance, speed * deltaSeconds);
      this.group.position.addScaledVector(direction, travelled);
      const turnAlpha = 1 - Math.exp(-11 * deltaSeconds);
      this.group.rotation.y = lerpAngle(this.group.rotation.y, Math.atan2(direction.x, direction.z), turnAlpha);
      this.walkPhase += travelled * 7.4;
      if (travelled >= distance - 0.001) {
        this.group.position.copy(target);
        this.path.shift();
      }
    }
    const isWalking = travelled > 0.0001;

    const isSitting = !isWalking && this.restPose !== 'stand';
    if (!isWalking) {
      const restTurnAlpha = 1 - Math.exp(-7 * deltaSeconds);
      this.group.rotation.y = lerpAngle(this.group.rotation.y, this.restFacing, restTurnAlpha);
    }

    this.actor.position.x = !isWalking && this.state === 'error' ? Math.sin(timeSeconds * 13 + this.phase) * 0.025 : 0;
    this.actor.position.y = (isSitting ? -0.2 : 0)
      + (isWalking
        ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.014
        : Math.sin(timeSeconds * 2.2 + this.phase) * (isSitting ? 0.004 : 0.007));
    this.actor.rotation.z = this.state === 'completed' ? Math.sin(timeSeconds * 2 + this.phase) * 0.025 : 0;
    this.head.rotation.y = !isWalking && (this.state === 'waitingForUser' || this.state === 'idle')
      ? Math.sin(timeSeconds * 1.8 + this.phase) * 0.35
      : 0;
    this.head.rotation.z = !isWalking && this.state === 'error'
      ? Math.sin(timeSeconds * 6 + this.phase) * 0.09
      : 0;

    const stride = Math.sin(this.walkPhase) * 0.48;
    const typing = this.state === 'working' && !isWalking;
    const relaxedWave = !isWalking && (this.state === 'idle' || this.state === 'offline')
      ? Math.sin(timeSeconds * 1.3 + this.phase) * 0.08
      : 0;
    this.arms[0].rotation.x = isWalking ? stride : typing ? -1.02 + Math.sin(timeSeconds * 7 + this.phase) * 0.12 : relaxedWave;
    this.arms[1].rotation.x = isWalking ? -stride : typing ? -1.02 - Math.sin(timeSeconds * 7 + this.phase) * 0.12 : -relaxedWave;
    this.arms[0].rotation.z = !isWalking && this.state === 'completed' ? 2.15 : 0.14;
    this.arms[1].rotation.z = !isWalking && this.state === 'completed' ? -2.15 : -0.14;
    this.legs[0].rotation.x = isWalking ? -stride * 0.75 : isSitting ? -1.18 : 0;
    this.legs[1].rotation.x = isWalking ? stride * 0.75 : isSitting ? -1.18 : 0;
    this.legs.forEach(leg => {
      leg.position.y = isSitting ? 0.49 : 0.25;
      leg.position.z = isSitting ? 0.14 : 0;
    });

    const emotionFloat = Math.sin(timeSeconds * 2 + this.phase) * 0.045;
    this.emotionSprite.position.y = (this.descriptor.isOwner ? 1.82 : 1.68) + emotionFloat;
    this.emotionSprite.material.opacity = isWalking ? 0.72 : 1;

    this.ringMaterial.emissiveIntensity = selected
      ? 2.2
      : 0.9 + Math.sin(timeSeconds * 2.5 + index) * 0.28;
    this.labelSprite.scale.x = selected ? 1.82 : 1.38;
    this.labelSprite.scale.y = selected ? 0.42 : 0.32;
  }

  public dispose(): void {
    this.group.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }

      if (object instanceof THREE.Sprite) {
        object.material.map?.dispose();
        object.material.dispose();
      }
    });
  }

  private addCrown(): void {
    for (const x of [-0.13, 0, 0.13]) {
      const crownPoint = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, x === 0 ? 0.24 : 0.18, 8),
        standardMaterial(0xf4b85c, 0.4)
      );
      crownPoint.position.set(x, x === 0 ? 1.76 : 1.73, 0);
      crownPoint.castShadow = true;
      this.actor.add(crownPoint);
    }
  }

  private updateEmotion(state: CharacterState): void {
    const emoji: Record<CharacterState, string> = {
      owner: '👑',
      unknown: '💭',
      idle: '☕',
      working: '💻',
      waitingForUser: '✋',
      error: '⚠️',
      completed: '✨',
      offline: '💤'
    };
    const replacement = createEmotionSprite(emoji[state]);
    this.emotionSprite.material.map?.dispose();
    this.emotionSprite.material.map = replacement.material.map;
    this.emotionSprite.material.needsUpdate = true;
    replacement.material.map = null;
    replacement.material.dispose();
  }
}

function lerpAngle(current: number, target: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * alpha;
}
