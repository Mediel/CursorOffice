import * as THREE from 'three';
import {
  roleColors,
  statusColors,
  statusLabels,
  visualRoleFor,
  type AgentSnapshot,
  type AgentStatus,
  type AgentVisualRole
} from '../contracts';
import { colorToCss } from '../ui/dom';
import { CharacterStateMachine, type CharacterVisualState } from './CharacterStateMachine';

export type CharacterState = AgentStatus | 'owner';
export type CharacterRestPose = 'stand' | 'workSeat' | 'loungeSeat' | 'sofaSeat';
export type CharacterActivity = 'idle' | 'work' | 'talk' | 'listen' | 'concerned' | 'sleepy';
export type CharacterGesture = 'lookAround' | 'wave' | 'attention' | 'stretch' | 'drink' | 'celebrate';
export type CharacterConversationMode = 'talk' | 'listen';
export type CharacterRestState = {
  pose: CharacterRestPose;
  facing: number;
  visualOffset: THREE.Vector3;
};

export type CharacterDescriptor = {
  id: string;
  displayName: string;
  role: string;
  color: number;
  isOwner: boolean;
  kind?: 'primary' | 'subagent';
  visualRole?: AgentVisualRole;
  appearanceKey?: string;
};

function standardMaterial(color: number, roughness = 0.76): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
}

type HairStyle = 'bald' | 'buzz' | 'short' | 'sidePart' | 'bob' | 'long' | 'curly' | 'bun' | 'mohawk';
type CharacterAppearance = {
  hairStyle: HairStyle;
  hairColor: number;
  skinColor: number;
  widthScale: number;
  heightScale: number;
  depthScale: number;
};

const hairColors = [
  0x171412,
  0x30231d,
  0x513426,
  0x75452c,
  0x9b5c36,
  0xb98b56,
  0xd5c49a,
  0x85878d,
  0x4b385f
] as const;

const skinColors = [
  0xf2c9aa,
  0xe8b991,
  0xdca27c,
  0xc48661,
  0xa9694b,
  0x855139,
  0x603b2d
] as const;

const hairStyles: readonly HairStyle[] = [
  'bald',
  'buzz',
  'short',
  'sidePart',
  'bob',
  'long',
  'curly',
  'bun',
  'mohawk'
];

const bodyBuilds = [
  { width: 0.88, height: 1.01, depth: 0.92 },
  { width: 0.96, height: 1, depth: 0.97 },
  { width: 1, height: 1, depth: 1 },
  { width: 1.1, height: 1.02, depth: 1.04 },
  { width: 1.15, height: 0.96, depth: 1.12 },
  { width: 1.12, height: 1.05, depth: 1.01 }
] as const;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(value: string): number {
  return stableHash(value) / 0xffffffff;
}

function stablePick<T>(values: readonly T[], seed: string): T {
  return values[stableHash(seed) % values.length];
}

function createAppearance(seed: string, isOwner: boolean): CharacterAppearance {
  const build = isOwner
    ? bodyBuilds[2]
    : stablePick(bodyBuilds, `${seed}:build`);
  const heightVariation = isOwner
    ? 1
    : 0.92 + stableUnit(`${seed}:height`) * 0.18;
  return {
    hairStyle: isOwner ? 'short' : stablePick(hairStyles, `${seed}:hair-style`),
    hairColor: isOwner ? 0x4a3124 : stablePick(hairColors, `${seed}:hair-color`),
    skinColor: isOwner ? 0xe8b991 : stablePick(skinColors, `${seed}:skin-color`),
    widthScale: build.width,
    heightScale: THREE.MathUtils.clamp(build.height * heightVariation, 0.9, 1.12),
    depthScale: build.depth
  };
}

function roleShirtColor(role: AgentVisualRole, seed: string, ownerColor?: number): number {
  const color = new THREE.Color(role === 'owner' && ownerColor !== undefined
    ? ownerColor
    : roleColors[role]);
  if (role !== 'owner') {
    color.offsetHSL(
      (stableUnit(`${seed}:shirt-hue`) - 0.5) * 0.025,
      (stableUnit(`${seed}:shirt-saturation`) - 0.5) * 0.06,
      (stableUnit(`${seed}:shirt-lightness`) - 0.5) * 0.09
    );
  }
  return color.getHex();
}

function addHairPart(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  position: readonly [number, number, number],
  scale: readonly [number, number, number] = [1, 1, 1],
  rotation: readonly [number, number, number] = [0, 0, 0]
): void {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  group.add(mesh);
}

function createHair(style: HairStyle, color: number): THREE.Group {
  const hair = new THREE.Group();
  if (style === 'bald') {
    return hair;
  }
  const material = standardMaterial(color, 0.9);
  const addCap = (height = 0.74): void => addHairPart(
    hair,
    new THREE.SphereGeometry(0.248, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
    material,
    [0, 0.048, 0],
    [1, height, 1]
  );

  if (style === 'buzz') {
    addCap(0.44);
  } else if (style === 'short') {
    addCap(0.72);
  } else if (style === 'sidePart') {
    addCap(0.76);
    addHairPart(
      hair,
      new THREE.SphereGeometry(0.105, 12, 8),
      material,
      [-0.105, 0.13, 0.15],
      [1.35, 0.48, 0.62],
      [0, 0, -0.18]
    );
  } else if (style === 'bob') {
    addCap(0.8);
    for (const x of [-0.205, 0.205]) {
      addHairPart(
        hair,
        new THREE.CapsuleGeometry(0.07, 0.22, 4, 8),
        material,
        [x, -0.09, -0.015],
        [0.82, 1, 0.9]
      );
    }
  } else if (style === 'long') {
    addCap(0.82);
    for (const x of [-0.15, 0.15]) {
      addHairPart(
        hair,
        new THREE.CapsuleGeometry(0.085, 0.4, 5, 9),
        material,
        [x, -0.21, -0.13],
        [1, 1, 0.9]
      );
    }
  } else if (style === 'curly') {
    const curls: readonly [number, number, number, number][] = [
      [-0.16, 0.11, -0.08, 0.105], [0, 0.17, -0.1, 0.115], [0.16, 0.11, -0.08, 0.105],
      [-0.18, 0.09, 0.07, 0.1], [0, 0.2, 0.04, 0.12], [0.18, 0.09, 0.07, 0.1],
      [-0.1, 0.13, 0.17, 0.095], [0.1, 0.13, 0.17, 0.095], [0, 0.08, -0.2, 0.1]
    ];
    for (const [x, y, z, radius] of curls) {
      addHairPart(hair, new THREE.SphereGeometry(radius, 10, 7), material, [x, y, z]);
    }
  } else if (style === 'bun') {
    addCap(0.78);
    addHairPart(hair, new THREE.SphereGeometry(0.13, 12, 9), material, [0, 0.105, -0.22]);
  } else {
    addCap(0.38);
    for (const z of [-0.16, -0.08, 0, 0.08, 0.16]) {
      addHairPart(
        hair,
        new THREE.ConeGeometry(0.055, 0.17, 8),
        material,
        [0, 0.26, z],
        [1, 1 - Math.abs(z) * 1.6, 1]
      );
    }
  }
  return hair;
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

type AgentLabelContent = {
  name: string;
  model: string;
  task: string;
  tokens: string;
  status: string;
  accent: string;
};

function replaceSpriteTexture(sprite: THREE.Sprite, canvas: HTMLCanvasElement): void {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const previousTexture = sprite.material.map;
  sprite.material.map = texture;
  sprite.material.needsUpdate = true;
  previousTexture?.dispose();
}

function paintCompactLabel(sprite: THREE.Sprite, name: string, accent: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 116;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.fillStyle = 'rgba(6, 15, 21, 0.91)';
  context.beginPath();
  context.roundRect(6, 6, 628, 104, 28);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 6;
  context.stroke();
  context.fillStyle = '#f4f8fa';
  context.font = '700 42px Inter, Segoe UI, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(fitCanvasText(context, name, 550), 320, 59);
  replaceSpriteTexture(sprite, canvas);
}

function paintOwnerLabel(sprite: THREE.Sprite, name: string, role: string, accent: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 150;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.fillStyle = 'rgba(6, 15, 21, 0.95)';
  context.beginPath();
  context.roundRect(5, 5, 630, 140, 28);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 6;
  context.stroke();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#f4f8fa';
  context.font = '700 40px Inter, Segoe UI, sans-serif';
  context.fillText(fitCanvasText(context, name, 560), 320, 53);
  context.fillStyle = '#9db0bc';
  context.font = '500 24px Inter, Segoe UI, sans-serif';
  context.fillText(fitCanvasText(context, role, 560), 320, 105);
  replaceSpriteTexture(sprite, canvas);
}

function paintAgentLabel(sprite: THREE.Sprite, content: AgentLabelContent): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 300;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.fillStyle = 'rgba(6, 15, 21, 0.95)';
  context.beginPath();
  context.roundRect(7, 7, 1010, 286, 30);
  context.fill();
  context.strokeStyle = content.accent;
  context.lineWidth = 8;
  context.stroke();

  context.textBaseline = 'middle';
  context.fillStyle = '#f4f8fa';
  context.font = '700 56px Inter, Segoe UI, sans-serif';
  context.textAlign = 'left';
  context.fillText(fitCanvasText(context, content.name, 610), 46, 65);
  context.fillStyle = content.accent;
  context.font = '700 29px Inter, Segoe UI, sans-serif';
  context.textAlign = 'right';
  context.fillText(fitCanvasText(context, content.status, 300), 974, 65);

  context.fillStyle = '#9ed8e8';
  context.font = '600 30px Inter, Segoe UI, sans-serif';
  context.textAlign = 'left';
  context.fillText(fitCanvasText(context, content.model, 480), 46, 137);
  context.fillStyle = '#d9bd82';
  context.font = '500 27px Inter, Segoe UI, sans-serif';
  context.textAlign = 'right';
  context.fillText(fitCanvasText(context, content.tokens, 430), 974, 137);

  context.strokeStyle = 'rgba(212, 236, 244, 0.12)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(46, 179);
  context.lineTo(978, 179);
  context.stroke();
  context.fillStyle = '#b8c8cf';
  context.font = '500 30px Inter, Segoe UI, sans-serif';
  context.textAlign = 'left';
  context.fillText(fitCanvasText(context, `Dělá: ${content.task}`, 925), 46, 232);

  replaceSpriteTexture(sprite, canvas);
}

function fitCanvasText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (context.measureText(value).width <= maxWidth) {
    return value;
  }
  let shortened = value;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function formatLabelTokens(value: number): string {
  return new Intl.NumberFormat('cs-CZ', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value);
}

export class CharacterController {
  public readonly group = new THREE.Group();

  private readonly actor = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly armPivots: THREE.Group[] = [];
  private readonly legPivots: THREE.Group[] = [];
  private readonly headPivot = new THREE.Group();
  private readonly eyes: THREE.Mesh[] = [];
  private readonly mouth: THREE.Mesh;
  private readonly coffeeCup: THREE.Group;
  private roleBadgeMaterial: THREE.MeshStandardMaterial | undefined;
  private readonly emotionSprite: THREE.Sprite;
  private blinkCountdown = 2 + Math.random() * 3;
  private blinkRemaining = 0;
  private readonly conversationSprite: THREE.Sprite;
  private readonly labelSprite: THREE.Sprite;
  private readonly labelBaseY: number;
  private readonly torsoMaterial: THREE.MeshStandardMaterial;
  private readonly ringMaterial: THREE.MeshStandardMaterial;
  private readonly selectionRing: THREE.Mesh;
  private readonly groundShadow: THREE.Mesh;
  private readonly stateMachine = new CharacterStateMachine();
  private readonly phase = Math.random() * Math.PI * 2;
  private path: THREE.Vector3[] = [];
  private destination: THREE.Vector3 | undefined;
  private walkPhase = Math.random() * Math.PI * 2;
  private directTravelled = 0;
  private status: CharacterState;
  private restPose: CharacterRestPose = 'stand';
  private restFacing = Math.PI;
  private readonly restVisualOffset = new THREE.Vector3();
  private activity: CharacterActivity = 'idle';
  private movementPaused = false;
  private labelKey = '';
  private labelContent: AgentLabelContent | undefined;
  private labelExpanded = false;
  private labelHovered = false;
  private labelExpandedUntil = 0;
  private conversationMode: CharacterConversationMode | undefined;
  private readonly appearanceKey: string;

  public constructor(private readonly descriptor: CharacterDescriptor) {
    this.group.name = descriptor.id;
    this.group.userData.selectableId = descriptor.id;
    this.group.add(this.actor);
    this.actor.add(this.body);
    this.status = descriptor.isOwner ? 'owner' : 'unknown';
    this.appearanceKey = descriptor.appearanceKey ?? descriptor.id;
    const appearance = createAppearance(this.appearanceKey, descriptor.isOwner);
    this.body.scale.set(appearance.widthScale, appearance.heightScale, appearance.depthScale);
    const initialRole = descriptor.visualRole
      ?? (descriptor.isOwner
        ? 'owner'
        : descriptor.id.startsWith('cursor-window-manager-')
          ? 'manager'
          : descriptor.kind === 'subagent'
            ? 'subagent'
            : 'chat');

    this.torsoMaterial = standardMaterial(
      roleShirtColor(initialRole, this.appearanceKey, descriptor.isOwner ? descriptor.color : undefined),
      0.63
    );
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.46, 6, 10), this.torsoMaterial);
    torso.position.y = 0.79;
    torso.castShadow = true;
    this.body.add(torso);

    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.252, 0.252, 0.08, 16),
      standardMaterial(descriptor.kind === 'subagent' ? 0x172832 : 0x2c4050, 0.72)
    );
    belt.position.y = 0.55;
    belt.castShadow = true;
    this.body.add(belt);

    const darkMaterial = standardMaterial(descriptor.isOwner ? 0x382a1f : 0x243642, 0.76);
    for (const x of [-0.12, 0.12]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.47, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 10), darkMaterial);
      leg.position.y = -0.21;
      leg.castShadow = true;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.25), darkMaterial);
      shoe.position.set(0, -0.43, 0.065);
      shoe.castShadow = true;
      pivot.add(leg, shoe);
      this.body.add(pivot);
      this.legPivots.push(pivot);
    }

    const skinMaterial = standardMaterial(appearance.skinColor, 0.82);
    this.coffeeCup = new THREE.Group();
    this.coffeeCup.visible = false;
    const cupBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.045, 0.105, 12),
      standardMaterial(0xe7edf0, 0.48)
    );
    const coffee = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.048, 0.008, 12),
      standardMaterial(0x5a321d, 0.66)
    );
    coffee.position.y = 0.055;
    const cupHandle = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI * 1.65),
      standardMaterial(0xe7edf0, 0.48)
    );
    cupHandle.position.set(0.055, 0, 0);
    this.coffeeCup.add(cupBody, coffee, cupHandle);
    for (const x of [-0.31, 0.31]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.02, 0);
      pivot.rotation.z = x < 0 ? 0.14 : -0.14;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.3, 4, 8), this.torsoMaterial);
      arm.position.y = -0.22;
      arm.castShadow = true;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.078, 10, 8), skinMaterial);
      hand.position.y = -0.46;
      hand.castShadow = true;
      pivot.add(arm, hand);
      if (x > 0) {
        this.coffeeCup.position.set(0, -0.49, 0);
        pivot.add(this.coffeeCup);
      }
      this.body.add(pivot);
      this.armPivots.push(pivot);
    }

    this.headPivot.position.y = 1.34;
    this.body.add(this.headPivot);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), skinMaterial);
    head.castShadow = true;
    this.headPivot.add(head);
    this.headPivot.add(createHair(appearance.hairStyle, appearance.hairColor));

    const faceMaterial = standardMaterial(0x17232b, 0.86);
    for (const x of [-0.082, 0.082]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.027, 8, 6), faceMaterial);
      eye.position.set(x, 0.025, 0.226);
      this.headPivot.add(eye);
      this.eyes.push(eye);
    }
    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.018, 0.018), faceMaterial);
    this.mouth.position.set(0, -0.085, 0.231);
    this.headPivot.add(this.mouth);

    if (!descriptor.isOwner) {
      this.roleBadgeMaterial = standardMaterial(roleColors[initialRole], 0.5);
      this.roleBadgeMaterial.emissive.setHex(roleColors[initialRole]);
      this.roleBadgeMaterial.emissiveIntensity = 0.42;
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.17, 0.03), this.roleBadgeMaterial);
      badge.position.set(0.14, 0.88, 0.236);
      badge.rotation.z = -0.08;
      this.body.add(badge);
    }

    this.groundShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 24),
      new THREE.MeshBasicMaterial({ color: 0x02070a, transparent: true, opacity: 0.24, depthWrite: false })
    );
    this.groundShadow.rotation.x = -Math.PI / 2;
    this.groundShadow.position.y = 0.012;
    this.group.add(this.groundShadow);

    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: descriptor.color,
      emissive: descriptor.color,
      emissiveIntensity: 1.25,
      roughness: 0.45
    });
    this.selectionRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.024, 8, 32), this.ringMaterial);
    this.selectionRing.rotation.x = Math.PI / 2;
    this.selectionRing.position.y = 0.025;
    this.group.add(this.selectionRing);

    if (descriptor.isOwner) {
      this.addCrown();
    }

    this.labelSprite = createTextSprite(descriptor.displayName, colorToCss(descriptor.color));
    paintCompactLabel(this.labelSprite, descriptor.displayName, colorToCss(descriptor.color));
    this.labelBaseY = descriptor.isOwner ? 2.08 : 2.16;
    this.labelSprite.position.y = this.labelBaseY;
    this.actor.add(this.labelSprite);
    this.emotionSprite = createEmotionSprite(descriptor.isOwner ? '👑' : descriptor.kind === 'subagent' ? '🛠️' : '🧭');
    this.emotionSprite.position.set(descriptor.isOwner ? 0.72 : 1.16, descriptor.isOwner ? 1.82 : 1.94, 0);
    this.actor.add(this.emotionSprite);
    this.conversationSprite = createEmotionSprite('💬');
    this.conversationSprite.position.set(descriptor.isOwner ? -0.72 : -1.16, descriptor.isOwner ? 1.82 : 1.94, 0);
    this.conversationSprite.visible = false;
    this.actor.add(this.conversationSprite);
  }

  public setPosition(position: THREE.Vector3): void {
    this.group.position.copy(position);
  }

  public rebindId(id: string): void {
    this.group.name = id;
    this.group.userData.selectableId = id;
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public getVisualPosition(): THREE.Vector3 {
    return this.actor.getWorldPosition(new THREE.Vector3());
  }

  public get isMoving(): boolean {
    return this.path.length > 0;
  }

  public get isWaitingForPassage(): boolean {
    return this.movementPaused;
  }

  public getRemainingPath(): readonly THREE.Vector3[] {
    return this.path.map(waypoint => waypoint.clone());
  }

  public get visualState(): CharacterVisualState {
    return this.stateMachine.state;
  }

  public get isSeated(): boolean {
    return isSeatedState(this.stateMachine.state);
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
    const sameRoute = this.path.length === waypoints.length
      && this.path.every((waypoint, index) => waypoint.distanceToSquared(waypoints[index]) < 0.000001);
    if (sameRoute) {
      return;
    }
    this.path = waypoints.map(waypoint => waypoint.clone());
    this.destination = destination.clone();
    this.movementPaused = false;
  }

  public setMovementPaused(paused: boolean): void {
    this.movementPaused = paused && this.path.length > 0;
    if (this.movementPaused && this.stateMachine.state === 'walk') {
      this.stateMachine.transition('idle', true);
    }
  }

  public setState(state: CharacterState, color: number): void {
    if (this.status !== state) {
      this.updateEmotion(state);
    }
    this.status = state;
    this.ringMaterial.color.setHex(color);
    this.ringMaterial.emissive.setHex(color);
  }

  public setActivity(activity: CharacterActivity): void {
    this.activity = activity;
  }

  public setConversationMode(mode?: CharacterConversationMode, labelLane: 'upper' | 'lower' = 'lower'): void {
    this.conversationMode = mode;
    this.conversationSprite.visible = mode !== undefined;
    this.labelSprite.position.y = this.labelBaseY + (mode !== undefined && labelLane === 'upper' ? 0.86 : 0);
  }

  public getRestState(): CharacterRestState {
    return {
      pose: this.restPose,
      facing: this.restFacing,
      visualOffset: this.restVisualOffset.clone()
    };
  }

  public face(position: THREE.Vector3): void {
    const direction = position.clone().sub(this.group.position).setY(0);
    if (direction.lengthSq() > 0.0001) {
      this.restFacing = Math.atan2(direction.x, direction.z);
    }
  }

  public stopMovement(): void {
    this.path = [];
    this.destination = undefined;
    this.movementPaused = false;
  }

  public setLabelHovered(hovered: boolean, timeSeconds: number): void {
    this.labelHovered = hovered;
    if (!hovered) {
      this.labelExpandedUntil = Math.max(this.labelExpandedUntil, timeSeconds + 1.25);
    }
  }

  public setMetadata(snapshot: AgentSnapshot): void {
    if (this.descriptor.isOwner) {
      return;
    }
    const visualRole = visualRoleFor(snapshot);
    const roleColor = roleColors[visualRole];
    this.torsoMaterial.color.setHex(roleShirtColor(visualRole, this.appearanceKey));
    this.roleBadgeMaterial?.color.setHex(roleColor);
    this.roleBadgeMaterial?.emissive.setHex(roleColor);
    const isManager = snapshot.id.startsWith('cursor-window-manager-');
    const teamModels = snapshot.teamModels?.filter(Boolean) ?? [];
    const model = isManager
      ? teamModels.length > 0 ? teamModels.slice(0, 2).join(' + ') : 'modely týmu čekají na hook'
      : snapshot.model?.trim() || 'model čeká na hook';
    const task = snapshot.currentTask?.trim() || snapshot.role || 'Bez aktuálního úkolu';
    const tokens = snapshot.usage
      ? `${formatLabelTokens(snapshot.usage.totalTokens)} tok. / ${snapshot.usageScope === 'workspace' ? 'repo' : 'generace'}`
      : snapshot.status === 'working' ? 'tokeny po dokončení' : 'tokeny Cursor neposlal';
    const key = [snapshot.displayName, model, task, tokens, snapshot.status].join('\u0000');
    if (key === this.labelKey) {
      return;
    }
    this.labelKey = key;
    this.labelContent = {
      name: snapshot.displayName,
      model,
      task,
      tokens,
      status: statusLabels[snapshot.status],
      accent: colorToCss(statusColors[snapshot.status])
    };
    this.paintCurrentLabel();
  }

  public playGesture(gesture: CharacterGesture, durationSeconds?: number): boolean {
    if (this.isMoving) {
      return false;
    }
    if (this.restPose === 'stand') {
      return this.stateMachine.transition(gesture, false, durationSeconds);
    }
    const seatedGesture: Partial<Record<CharacterGesture, CharacterVisualState>> = {
      lookAround: 'sitLookAround',
      wave: 'sitWave',
      celebrate: 'sitCelebrate'
    };
    const seatedState = seatedGesture[gesture];
    return seatedState ? this.stateMachine.transition(seatedState, false, durationSeconds) : false;
  }

  public setRestPose(pose: CharacterRestPose, facing = Math.PI, visualOffset?: THREE.Vector3): void {
    this.restPose = pose;
    this.restFacing = facing;
    if (visualOffset) {
      this.restVisualOffset.copy(visualOffset);
    } else {
      this.restVisualOffset.set(0, 0, 0);
    }
  }

  public moveTo(position: THREE.Vector3): void {
    this.restPose = 'stand';
    this.restVisualOffset.set(0, 0, 0);
    if (isSeatedState(this.stateMachine.state)) {
      this.stateMachine.transition('standUp', true);
      return;
    }
    const delta = position.clone().sub(this.group.position);
    if (delta.lengthSq() === 0) {
      return;
    }
    this.directTravelled += delta.length();
    this.path = [];
    this.destination = undefined;
    this.group.position.copy(position);
    this.restFacing = Math.atan2(delta.x, delta.z);
    this.group.rotation.y = lerpAngle(this.group.rotation.y, this.restFacing, 0.45);
  }

  public update(timeSeconds: number, deltaSeconds: number, index: number, selected: boolean): void {
    const shouldExpandLabel = selected || this.labelHovered || timeSeconds < this.labelExpandedUntil;
    if (shouldExpandLabel !== this.labelExpanded) {
      this.labelExpanded = shouldExpandLabel;
      this.paintCurrentLabel();
    }
    this.stateMachine.update(deltaSeconds);
    let target = this.path[0];
    if (target && this.group.position.distanceTo(target) < 0.08) {
      this.path.shift();
      target = this.path[0];
    }

    let travelled = this.directTravelled;
    if (travelled > 0) {
      this.walkPhase += travelled * 7.1;
      this.directTravelled = 0;
    }
    const mustStandBeforeTravel = Boolean(target) && isSeatedState(this.stateMachine.state);
    if (mustStandBeforeTravel && this.stateMachine.state !== 'standUp') {
      this.stateMachine.transition('standUp', true);
    }
    if (target && !this.movementPaused && !mustStandBeforeTravel
      && this.stateMachine.state !== 'standUp' && deltaSeconds > 0) {
      const distance = this.group.position.distanceTo(target);
      if (distance > 0.015) {
        const direction = target.clone().sub(this.group.position).setY(0).normalize();
        const speed = this.descriptor.isOwner ? 2.2 : 1.48;
        const pathTravelled = Math.min(distance, speed * deltaSeconds);
        travelled += pathTravelled;
        this.group.position.addScaledVector(direction, pathTravelled);
        const turnAlpha = 1 - Math.exp(-8.5 * deltaSeconds);
        this.group.rotation.y = lerpAngle(this.group.rotation.y, Math.atan2(direction.x, direction.z), turnAlpha);
        this.walkPhase += pathTravelled * 7.1;
        if (pathTravelled >= distance - 0.001) {
          this.group.position.copy(target);
          this.path.shift();
        }
      }
    }

    const isWalking = travelled > 0.0001;
    if (isWalking) {
      this.stateMachine.transition('walk', true);
    } else if (this.path.length === 0) {
      this.applyRestingState();
      const restTurnAlpha = 1 - Math.exp(-6.2 * deltaSeconds);
      this.group.rotation.y = lerpAngle(this.group.rotation.y, this.restFacing, restTurnAlpha);
    }

    this.animateRig(timeSeconds, deltaSeconds, isWalking);
    this.ringMaterial.emissiveIntensity = selected
      ? 2.2
      : 0.9 + Math.sin(timeSeconds * 2.5 + index) * 0.28;
    const compactScale = this.descriptor.isOwner ? [1.48, 0.27] : [1.58, 0.29];
    const expandedScale = this.descriptor.isOwner ? [2.5, 0.58] : [3.15, 0.92];
    const targetScale = shouldExpandLabel ? expandedScale : compactScale;
    this.labelSprite.scale.x = damp(this.labelSprite.scale.x, targetScale[0], 14, deltaSeconds);
    this.labelSprite.scale.y = damp(this.labelSprite.scale.y, targetScale[1], 14, deltaSeconds);
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

  private paintCurrentLabel(): void {
    const accent = this.labelContent?.accent ?? colorToCss(this.descriptor.color);
    if (!this.labelExpanded) {
      paintCompactLabel(this.labelSprite, this.labelContent?.name ?? this.descriptor.displayName, accent);
      return;
    }
    if (this.descriptor.isOwner || !this.labelContent) {
      paintOwnerLabel(
        this.labelSprite,
        this.descriptor.displayName,
        this.descriptor.role,
        accent
      );
      return;
    }
    paintAgentLabel(this.labelSprite, this.labelContent);
  }

  private applyRestingState(): void {
    const visual = this.stateMachine.state;
    if (this.restPose !== 'stand') {
      if (!isSeatedState(visual) && visual !== 'sitDown') {
        this.stateMachine.transition('sitDown');
        return;
      }
      if (visual === 'sitIdle' || visual === 'sitWork') {
        this.stateMachine.transition(this.activity === 'work' ? 'sitWork' : 'sitIdle');
      }
      return;
    }

    if (isSeatedState(visual) && visual !== 'standUp') {
      this.stateMachine.transition('standUp', visual !== 'sitDown');
      return;
    }
    if (this.stateMachine.isTransient) {
      return;
    }

    const stableState: Record<CharacterActivity, CharacterVisualState> = {
      idle: 'idle',
      work: 'idle',
      talk: 'talk',
      listen: 'listen',
      concerned: 'concerned',
      sleepy: 'sleepy'
    };
    this.stateMachine.transition(stableState[this.activity]);
  }

  private animateRig(timeSeconds: number, deltaSeconds: number, isWalking: boolean): void {
    const state = this.stateMachine.state;
    const expressiveState = this.conversationMode ?? state;
    const progress = smoothStep(this.stateMachine.normalizedTime);
    const seatedAmount = state === 'sitDown'
      ? progress
      : state === 'standUp'
        ? 1 - progress
        : isStableSeatedState(state)
          ? 1
          : 0;
    const breathing = Math.sin(timeSeconds * 2.1 + this.phase);
    const errorShake = state === 'concerned' ? Math.sin(timeSeconds * 12 + this.phase) * 0.022 : 0;
    const bob = isWalking
      ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.012
      : state === 'attention'
        ? Math.abs(Math.sin(timeSeconds * 4.8 + this.phase)) * 0.032
        : breathing * (seatedAmount > 0.5 ? 0.003 : 0.006);
    const seatedVisualX = this.restVisualOffset.x * seatedAmount;
    const seatedVisualY = this.restVisualOffset.y * seatedAmount;
    const seatedVisualZ = this.restVisualOffset.z * seatedAmount;
    this.actor.position.x = errorShake + seatedVisualX;
    this.actor.position.y = -0.19 * seatedAmount + seatedVisualY + bob;
    this.actor.position.z = damp(
      this.actor.position.z,
      (state === 'sitWork' ? 0.14 : 0) + seatedVisualZ,
      9,
      deltaSeconds
    );
    this.groundShadow.position.x = damp(this.groundShadow.position.x, seatedVisualX, 9, deltaSeconds);
    this.groundShadow.position.z = damp(this.groundShadow.position.z, seatedVisualZ, 9, deltaSeconds);
    this.selectionRing.position.x = damp(this.selectionRing.position.x, seatedVisualX, 9, deltaSeconds);
    this.selectionRing.position.z = damp(this.selectionRing.position.z, seatedVisualZ, 9, deltaSeconds);
    this.body.scale.y = 1 + breathing * 0.006;
    const relaxedSofaLean = seatedAmount > 0.5 && this.restPose === 'sofaSeat' ? -0.09 : 0;
    this.body.rotation.x = damp(
      this.body.rotation.x,
      state === 'sitWork' ? 0.11 : state === 'sleepy' ? -0.04 : relaxedSofaLean,
      7,
      deltaSeconds
    );
    this.body.rotation.z = damp(
      this.body.rotation.z,
      state === 'attention'
        ? Math.sin(timeSeconds * 5.2 + this.phase) * 0.045
        : state === 'celebrate' || state === 'sitCelebrate'
          ? Math.sin(timeSeconds * 5) * 0.055
          : 0,
      8,
      deltaSeconds
    );

    const stride = Math.sin(this.walkPhase) * 0.5;
    this.legPivots.forEach((leg, legIndex) => {
      const walkRotation = legIndex === 0 ? -stride * 0.72 : stride * 0.72;
      const target = isWalking ? walkRotation : -1.18 * seatedAmount;
      leg.rotation.x = damp(leg.rotation.x, target, 13, deltaSeconds);
      leg.position.y = damp(leg.position.y, 0.47 + seatedAmount * 0.23, 12, deltaSeconds);
      leg.position.z = damp(leg.position.z, seatedAmount * 0.13, 12, deltaSeconds);
    });

    const armTargets = this.armTargets(expressiveState, timeSeconds, isWalking, stride);
    this.armPivots.forEach((arm, armIndex) => {
      // A desk is higher than the seated lap. Lift the shoulder rig while
      // working so the procedural hands land on the tabletop/keyboard plane.
      arm.position.y = damp(arm.position.y, state === 'sitWork' ? 1.13 : 1.02, 10, deltaSeconds);
      arm.rotation.x = damp(arm.rotation.x, armTargets[armIndex].x, 11, deltaSeconds);
      arm.rotation.z = damp(arm.rotation.z, armTargets[armIndex].z, 11, deltaSeconds);
    });

    let headX = 0;
    let headY = 0;
    let headZ = 0;
    if (expressiveState === 'lookAround' || expressiveState === 'sitLookAround'
      || expressiveState === 'idle' || expressiveState === 'sitIdle') {
      headY = Math.sin(timeSeconds * 1.25 + this.phase)
        * (expressiveState === 'lookAround' || expressiveState === 'sitLookAround' ? 0.58 : 0.16);
    } else if (expressiveState === 'listen') {
      headY = 0.16;
      headZ = Math.sin(timeSeconds * 2.2 + this.phase) * 0.035;
    } else if (expressiveState === 'attention') {
      headX = -0.34 + Math.sin(timeSeconds * 2.4 + this.phase) * 0.04;
      headY = Math.sin(timeSeconds * 1.4 + this.phase) * 0.1;
    } else if (expressiveState === 'concerned') {
      headZ = Math.sin(timeSeconds * 6 + this.phase) * 0.085;
    } else if (expressiveState === 'sleepy') {
      headZ = 0.12 + Math.sin(timeSeconds * 0.8 + this.phase) * 0.035;
    }
    this.headPivot.rotation.x = damp(this.headPivot.rotation.x, headX, 7, deltaSeconds);
    this.headPivot.rotation.y = damp(this.headPivot.rotation.y, headY, 7, deltaSeconds);
    this.headPivot.rotation.z = damp(this.headPivot.rotation.z, headZ, 7, deltaSeconds);

    this.blinkCountdown -= deltaSeconds;
    if (this.blinkCountdown <= 0 && this.blinkRemaining <= 0) {
      this.blinkRemaining = 0.15;
      this.blinkCountdown = 2 + Math.random() * 3;
    }
    this.blinkRemaining = Math.max(0, this.blinkRemaining - deltaSeconds);
    const blink = this.blinkRemaining > 0 ? 0.12 : state === 'sleepy' ? 0.42 : 1;
    this.eyes.forEach(eye => { eye.scale.y = damp(eye.scale.y, blink, 24, deltaSeconds); });
    this.mouth.scale.y = damp(
      this.mouth.scale.y,
      expressiveState === 'talk' ? 1.2 + Math.abs(Math.sin(timeSeconds * 8)) * 2.5 : 1,
      18,
      deltaSeconds
    );
    this.coffeeCup.visible = state === 'drink';

    const emotionFloat = Math.sin(timeSeconds * 2 + this.phase) * 0.04;
    this.emotionSprite.position.y = (this.descriptor.isOwner ? 1.82 : 1.68) + emotionFloat;
    this.emotionSprite.material.opacity = isWalking ? 0.62 : state === 'idle' ? 0.84 : 1;
    const emotionScale = state === 'attention'
      ? 0.54 + Math.sin(timeSeconds * 5 + this.phase) * 0.035
      : 0.42;
    this.emotionSprite.scale.x = damp(this.emotionSprite.scale.x, emotionScale, 10, deltaSeconds);
    this.emotionSprite.scale.y = damp(this.emotionSprite.scale.y, emotionScale, 10, deltaSeconds);
    this.conversationSprite.position.y = (this.descriptor.isOwner ? 1.82 : 1.68) - emotionFloat;
    this.conversationSprite.material.opacity = isWalking ? 0.48 : 1;
  }

  private armTargets(
    state: CharacterVisualState,
    timeSeconds: number,
    isWalking: boolean,
    stride: number
  ): [{ x: number; z: number }, { x: number; z: number }] {
    const base: [{ x: number; z: number }, { x: number; z: number }] = [
      { x: 0, z: 0.14 },
      { x: 0, z: -0.14 }
    ];
    if (isWalking) {
      base[0].x = stride;
      base[1].x = -stride;
    } else if (state === 'sitWork') {
      // Hands hover above the keyboard instead of resting on the thighs.
      base[0].x = -1.48 + Math.sin(timeSeconds * 8.4 + this.phase) * 0.035;
      base[1].x = -1.48 - Math.sin(timeSeconds * 8.4 + this.phase) * 0.035;
      base[0].z = 0.31 + Math.sin(timeSeconds * 5.2 + this.phase) * 0.035;
      base[1].z = -0.31 - Math.sin(timeSeconds * 5.2 + this.phase) * 0.035;
    } else if (state === 'sitIdle' && this.restPose === 'sofaSeat') {
      // A relaxed couch pose is visibly different from an upright meeting chair.
      base[0].x = -0.28 + Math.sin(timeSeconds * 1.6 + this.phase) * 0.025;
      base[1].x = -0.28 - Math.sin(timeSeconds * 1.6 + this.phase) * 0.025;
      base[0].z = 0.24;
      base[1].z = -0.24;
    } else if (state === 'talk') {
      base[0].x = -0.42 + Math.sin(timeSeconds * 4.1 + this.phase) * 0.28;
      base[0].z = 0.45;
      base[1].x = -0.18 - Math.sin(timeSeconds * 3.3 + this.phase) * 0.18;
      base[1].z = -0.34;
    } else if (state === 'listen') {
      base[0].x = -0.18;
      base[1].x = -0.18;
      base[0].z = 0.25;
      base[1].z = -0.25;
    } else if (state === 'wave' || state === 'sitWave') {
      base[1].x = Math.sin(timeSeconds * 8 + this.phase) * 0.34;
      base[1].z = -2.25;
    } else if (state === 'attention') {
      const wave = Math.sin(timeSeconds * 7.2 + this.phase) * 0.24;
      base[0].x = -0.22 + wave;
      base[1].x = -0.22 - wave;
      base[0].z = 2.48 + Math.sin(timeSeconds * 5.5 + this.phase) * 0.16;
      base[1].z = -2.48 - Math.sin(timeSeconds * 5.5 + this.phase) * 0.16;
    } else if (state === 'stretch') {
      const reach = 2.72 + Math.sin(timeSeconds * 2.4 + this.phase) * 0.12;
      base[0].z = reach;
      base[1].z = -reach;
      base[0].x = -0.18;
      base[1].x = -0.18;
    } else if (state === 'drink') {
      base[0].x = -0.18;
      base[0].z = 0.2;
      base[1].x = -2.35 + Math.sin(timeSeconds * 2.2) * 0.06;
      base[1].z = -0.46;
    } else if (state === 'celebrate' || state === 'sitCelebrate') {
      base[0].z = 2.1;
      base[1].z = -2.1;
      base[0].x = Math.sin(timeSeconds * 7) * 0.18;
      base[1].x = -base[0].x;
    } else if (state === 'concerned') {
      base[0].x = -0.34;
      base[1].x = -0.34;
      base[0].z = 0.42;
      base[1].z = -0.42;
    } else if (state === 'sleepy') {
      base[0].x = 0.12;
      base[1].x = -0.08;
    }
    return base;
  }

  private addCrown(): void {
    for (const x of [-0.13, 0, 0.13]) {
      const crownPoint = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, x === 0 ? 0.24 : 0.18, 8),
        standardMaterial(0xf4b85c, 0.4)
      );
      crownPoint.position.set(x, x === 0 ? 1.76 : 1.73, 0);
      crownPoint.castShadow = true;
      this.body.add(crownPoint);
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

function isSeatedState(state: CharacterVisualState): boolean {
  return state === 'sitDown'
    || isStableSeatedState(state)
    || state === 'standUp';
}

function isStableSeatedState(state: CharacterVisualState): boolean {
  return state === 'sitIdle'
    || state === 'sitWork'
    || state === 'sitLookAround'
    || state === 'sitWave'
    || state === 'sitCelebrate';
}

function damp(current: number, target: number, lambda: number, deltaSeconds: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * Math.max(deltaSeconds, 0)));
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerpAngle(current: number, target: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * alpha;
}
