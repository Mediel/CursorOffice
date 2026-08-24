import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AgentSnapshot, OfficeBootstrap, OfficeOwner } from '../contracts';
import { statusColors, visualRoleFor } from '../contracts';
import {
  CharacterController,
  createTextSprite,
  type CharacterActivity,
  type CharacterGesture,
  type CharacterRestState
} from './AnimatedCharacterController';
import {
  agentDeskFixtures,
  departurePoint,
  loungeSofaFixture,
  loungeTableFixture,
  ownerDesk,
  ownerDeskFixture,
  ownerStart,
  partitionWalls,
  spawnPoint,
  standingConversationGroups,
  targetForAgent,
  worldBounds
} from './layout';
import { OfficeNavigation } from './OfficeNavigation';
import { DoorTrafficManager, type DoorTraveler } from './DoorTrafficManager';
import { OfficePoiManager, type ClaimedDestination } from './OfficePoiManager';
import type { OfficePoiKind } from './layout';

export type OfficeWorldPersistedState = {
  ownerPosition?: [number, number, number];
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  departedAgents?: Record<string, number>;
};

const defaultCameraPosition = new THREE.Vector3(17.2, 14.1, 20.4);
const defaultCameraTarget = new THREE.Vector3(0.8, 0.65, 0);
const medielSoftLogoUrl = new URL('../assets/medielsoft-green-white.png', import.meta.url).href;
const ownerManualOverrideSeconds = 9;
const ownerAutonomyCadenceSeconds = 20;

type AgentBehavior = {
  status: AgentSnapshot['status'];
  kind: NonNullable<AgentSnapshot['kind']>;
  retiring: boolean;
  teamKey: string;
  index: number;
  cycle: number;
  nextMoveAt: number;
  nextGestureAt: number;
  statusChangedAt: number;
  lastActivityAt: number;
  departAt: number;
  removeAt: number;
  destination?: ClaimedDestination;
  pendingDwellPoiId?: string;
  celebrationPending: boolean;
  celebrationStarted: boolean;
  phase: 'present' | 'departing' | 'departed';
  lastInteractionKey?: string;
};

type SocialEncounter = {
  key: string;
  visitorId: string;
  hostId: string;
  firstSpeakerId: string;
  phase: 'queued' | 'approaching' | 'talking' | 'returning';
  queuedAt: number;
  expiresAt: number;
  talkStartedAt: number;
  talkUntil: number;
  returnDeadline: number;
  visitorDepartureAt: number;
  meetingPosition?: THREE.Vector3;
  visitorReturnPosition?: THREE.Vector3;
  visitorRestState?: CharacterRestState;
  hostRestState?: CharacterRestState;
};

type AmbientSocialVenue = 'sofa' | 'meeting' | 'standing';

type AmbientSocialMember = {
  id: string;
  target: ClaimedDestination;
  departureAt: number;
};

type AmbientSocialGroup = {
  key: string;
  venue: AmbientSocialVenue;
  members: AmbientSocialMember[];
  focus: THREE.Vector3;
  phase: 'gathering' | 'talking';
  startedAt: number;
  gatherDeadline: number;
  settledAt?: number;
  talkStartedAt: number;
  talkUntil: number;
  speakerCadence: number;
  firstSpeakerIndex: number;
};

type CrowdConflict = {
  blockerId: string;
  since: number;
  lastDetourAt: number;
  releaseUntil: number;
};

type MovementWatch = {
  position: THREE.Vector3;
  observedAt: number;
  stuckSince?: number;
  lastRecoveryAt: number;
};

function standardMaterial(color: number, roughness = 0.76): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  options: { roughness?: number; emissive?: number; castShadow?: boolean } = {}
): THREE.Mesh {
  const material = standardMaterial(color, options.roughness);
  if (options.emissive !== undefined) {
    material.emissive.setHex(options.emissive);
    material.emissiveIntensity = 0.8;
  }

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export class OfficeWorld {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 70);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly room = new THREE.Group();
  private readonly agents = new Map<string, CharacterController>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly navigation = new OfficeNavigation();
  private readonly doorTraffic = new DoorTrafficManager();
  private readonly poiManager = new OfficePoiManager();
  private readonly pressedKeys = new Set<string>();
  private readonly agentBehaviors = new Map<string, AgentBehavior>();
  private readonly agentWindowIds = new Map<string, string | undefined>();
  private readonly agentIdentityKeys = new Map<string, string>();
  private readonly departedActivities = new Map<string, number>();
  private readonly socialQueue: SocialEncounter[] = [];
  private readonly socialEncounters = new Map<string, SocialEncounter>();
  private readonly ambientSocialGroups = new Map<string, AmbientSocialGroup>();
  private readonly crowdConflicts = new Map<string, CrowdConflict>();
  private readonly movementWatches = new Map<string, MovementWatch>();
  private nextAmbientInteractionAt = 12;
  private ambientInteractionSequence = 0;
  private ownerManualUntil = 0;
  private nextOwnerAutonomyAt = 12;
  private ownerAutonomySequence = 0;
  private ownerAutonomyAction = 'initializing';
  private officeFloor: THREE.Mesh | undefined;
  private owner: CharacterController | undefined;
  private ownerDescriptorKey: string | undefined;
  private selectedId: string | undefined;
  private selectedWindowId = 'all';
  private hoveredId: string | undefined;
  private pointerDown: { x: number; y: number; button: number } | undefined;
  private previousAnimationTime = 0;
  private sceneSeconds = 0;
  private nextPersistAt = 0;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onSelectionRequested: (id?: string) => void,
    private readonly persistedState: OfficeWorldPersistedState = {},
    private readonly onStateChanged?: (state: OfficeWorldPersistedState) => void
  ) {
    this.scene.background = new THREE.Color(0x0a1319);
    this.scene.fog = new THREE.Fog(0x0a1319, 27, 46);
    this.scene.add(this.room);
    Object.entries(persistedState.departedAgents ?? {})
      .forEach(([id, activityAt]) => this.departedActivities.set(id, activityAt));

    const persistedCameraPosition = persistedState.cameraPosition
      ? new THREE.Vector3(...persistedState.cameraPosition)
      : defaultCameraPosition;
    const persistedCameraTarget = persistedState.cameraTarget
      ? new THREE.Vector3(...persistedState.cameraTarget)
      : defaultCameraTarget;
    this.camera.position.copy(persistedCameraPosition);
    this.camera.lookAt(persistedCameraTarget);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(persistedCameraTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = true;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.panSpeed = 0.82;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.82;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.controls.minDistance = 5.5;
    this.controls.maxDistance = 34;
    this.controls.minPolarAngle = 0.34;
    this.controls.maxPolarAngle = 1.38;
    this.controls.update();

    this.buildLighting();
    this.buildOffice();
    this.attachInteraction();
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  public applyBootstrap(bootstrap: OfficeBootstrap): void {
    this.updateOwner(bootstrap.owner);
    this.updateAgents(bootstrap.agents);
  }

  public setWindowFilter(windowId: string): void {
    this.selectedWindowId = windowId;
    this.updateAgentVisibility();
  }

  public select(id?: string): void {
    this.selectedId = id;
    if (id === 'owner') {
      this.canvas.focus({ preventScroll: true });
    }
  }

  public start(): void {
    this.renderer.setAnimationLoop(time => this.animate(time));
  }

  /** Deterministic standalone regression scene enabled only by ?crowdDemo=1. */
  public startCrowdDemo(): void {
    const left = this.agents.get('alice');
    const right = this.agents.get('dan');
    if (!left || !right) {
      return;
    }
    left.setPosition(new THREE.Vector3(-5.2, 0, 2.02));
    left.setRestPose('stand');
    left.setPath([new THREE.Vector3(0.6, 0, 2.02)]);
    right.setPosition(new THREE.Vector3(0.6, 0, 2.02));
    right.setRestPose('stand');
    right.setPath([new THREE.Vector3(-5.2, 0, 2.02)]);
  }

  /** Standalone regression for manual owner walking followed by autonomous control. */
  public startOwnerDemo(): void {
    if (!this.owner) {
      return;
    }
    this.owner.setPosition(new THREE.Vector3(-5.2, 0, 2.02));
    this.owner.stopMovement();
    this.owner.setRestPose('stand', Math.PI);
    this.nextOwnerAutonomyAt = this.sceneSeconds + 12;
    this.ownerAutonomyAction = 'demo-ready';
  }

  /** Deterministic standalone regression for the kitchenette and drink gesture. */
  public startKitchenDemo(): void {
    const id = 'nina';
    const controller = this.agents.get(id);
    const behavior = this.agentBehaviors.get(id);
    if (!controller || !behavior) {
      return;
    }
    this.poiManager.release(id);
    const destination = this.poiManager.claim(id, ['kitchen'], 0);
    if (!destination) {
      return;
    }
    behavior.destination = destination;
    behavior.nextMoveAt = Number.POSITIVE_INFINITY;
    behavior.nextGestureAt = performance.now() / 1000 + 1;
    controller.setRestPose(destination.restPose, destination.facing, destination.visualOffset);
    controller.setPath(this.navigation.plan(controller.group.position, destination.position));
  }

  /** Deterministic standalone regression for walkable approach + sofa seating anchor. */
  public startCouchDemo(): void {
    const id = 'nina';
    const controller = this.agents.get(id);
    const behavior = this.agentBehaviors.get(id);
    if (!controller || !behavior) {
      return;
    }
    this.poiManager.release(id);
    const destination = this.poiManager.claimSpecific(id, 'lounge-1');
    if (!destination) {
      return;
    }
    // Keep this regression focused on the final walk-to-seat transition; full
    // office routes are covered by the navigation/crowd regression scenes.
    controller.setPosition(destination.position.clone().add(new THREE.Vector3(0, 0, -0.18)));
    controller.stopMovement();
    behavior.destination = destination;
    behavior.nextMoveAt = Number.POSITIVE_INFINITY;
    behavior.nextGestureAt = Number.POSITIVE_INFINITY;
    controller.setRestPose(destination.restPose, destination.facing, destination.visualOffset);
    controller.setPath(this.navigation.plan(controller.group.position, destination.position));
  }

  /** Deterministic regression for a coordinated multi-character idle scene. */
  public startGroupDemo(venue: AmbientSocialVenue): void {
    const ids = ['alice', 'bob', 'dan', 'nina'].filter(id => this.agents.has(id));
    this.nextAmbientInteractionAt = Number.POSITIVE_INFINITY;
    this.tryStartAmbientSocialGroup(ids, venue, venue === 'sofa' ? 3 : 4, this.sceneSeconds);
  }

  /** Accelerated standalone regression for terminal subagent retirement. */
  public startRetirementDemo(): void {
    const id = 'bob';
    const controller = this.agents.get(id);
    const behavior = this.agentBehaviors.get(id);
    if (!controller || !behavior) {
      return;
    }
    controller.setPosition(new THREE.Vector3(-1.4, 0, 3.4));
    controller.stopMovement();
    behavior.departAt = this.sceneSeconds + 2;
    behavior.nextMoveAt = Number.POSITIVE_INFINITY;
  }

  public getCouchDemoState(): object {
    const controller = this.agents.get('nina');
    const behavior = this.agentBehaviors.get('nina');
    return {
      sceneSeconds: this.sceneSeconds,
      position: controller?.getPosition().toArray(),
      visualPosition: controller?.getVisualPosition().toArray(),
      moving: controller?.isMoving,
      paused: controller?.isWaitingForPassage,
      path: controller?.getRemainingPath().map(point => point.toArray()),
      visualState: controller?.visualState,
      destination: behavior?.destination?.poiId
    };
  }

  public getKitchenDemoState(): object {
    const controller = this.agents.get('nina');
    const behavior = this.agentBehaviors.get('nina');
    return {
      sceneSeconds: this.sceneSeconds,
      position: controller?.getPosition().toArray(),
      moving: controller?.isMoving,
      visualState: controller?.visualState,
      path: controller?.getRemainingPath().map(point => point.toArray()),
      nextGestureAt: behavior?.nextGestureAt,
      destination: behavior?.destination?.poiId
    };
  }

  public getRetirementDemoState(): object {
    const controller = this.agents.get('bob');
    const behavior = this.agentBehaviors.get('bob');
    return {
      sceneSeconds: this.sceneSeconds,
      present: Boolean(controller),
      phase: behavior?.phase,
      retiring: behavior?.retiring,
      moving: controller?.isMoving,
      position: controller?.getPosition().toArray(),
      departIn: behavior ? behavior.departAt - this.sceneSeconds : undefined
    };
  }

  public getGroupDemoState(): object {
    return [...this.ambientSocialGroups.values()].map(group => ({
      key: group.key,
      venue: group.venue,
      phase: group.phase,
      members: group.members.map(member => {
        const controller = this.agents.get(member.id);
        return {
          id: member.id,
          destination: member.target.poiId,
          target: member.target.position.toArray(),
          position: controller?.getPosition().toArray(),
          moving: controller?.isMoving,
          seated: controller?.isSeated,
          visualState: controller?.visualState,
          path: controller?.getRemainingPath().map(point => point.toArray())
        };
      })
    }));
  }

  public getCrowdDemoState(): object {
    return ['alice', 'dan'].map(id => {
      const controller = this.agents.get(id);
      return controller && {
        id,
        position: controller.getPosition().toArray(),
        moving: controller.isMoving,
        paused: controller.isWaitingForPassage,
        path: controller.getRemainingPath().map(point => point.toArray())
      };
    });
  }

  public getOwnerDemoState(): object {
    return {
      sceneSeconds: this.sceneSeconds,
      position: this.owner?.getPosition().toArray(),
      moving: this.owner?.isMoving,
      visualState: this.owner?.visualState,
      manualFor: Math.max(0, this.ownerManualUntil - this.sceneSeconds),
      autonomyIn: Math.max(0, this.nextOwnerAutonomyAt - this.sceneSeconds),
      autonomySequence: this.ownerAutonomySequence,
      autonomyAction: this.ownerAutonomyAction,
      sociallyBusy: this.isSociallyBusy('owner')
    };
  }

  public getAttentionDemoState(): object {
    const controller = this.agents.get('bob');
    const behavior = this.agentBehaviors.get('bob');
    return {
      sceneSeconds: this.sceneSeconds,
      position: controller?.getPosition().toArray(),
      moving: controller?.isMoving,
      visualState: controller?.visualState,
      status: behavior?.status,
      nextGestureIn: behavior ? Math.max(0, behavior.nextGestureAt - this.sceneSeconds) : undefined,
      attentionRequested: behavior ? requestsAttention('bob', behavior.status) : false
    };
  }

  /** Standalone-only camera state used by the local interaction regression. */
  public getCameraDemoState(): object {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      distance: this.camera.position.distanceTo(this.controls.target)
    };
  }

  public dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.controls.dispose();
    this.owner?.dispose();
    this.agents.forEach(agent => agent.dispose());
    this.room.traverse(object => {
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
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerDown = { x: event.clientX, y: event.clientY, button: event.button };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerDown;
    this.pointerDown = undefined;
    if (!start || start.button !== 0 || event.button !== 0
      || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
      return;
    }

    const id = this.selectableAt(event);
    if (id) {
      this.onSelectionRequested(id);
      return;
    }

    if ((!this.selectedId || this.selectedId === 'owner') && this.owner) {
      const floorPoint = this.floorPointAt(event);
      if (floorPoint) {
        this.markOwnerManualControl();
        const safePoint = this.navigation.constrainDestination(floorPoint);
        const direction = safePoint.clone().sub(this.owner.group.position);
        this.owner.setRestPose('stand', Math.atan2(direction.x, direction.z));
        this.owner.setPath(this.navigation.plan(this.owner.group.position, safePoint));
      }
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointerDown) {
      const hoveredId = this.selectableAt(event);
      this.setHoveredId(hoveredId);
      this.canvas.style.cursor = hoveredId ? 'pointer' : 'grab';
    }
  };

  private readonly handlePointerLeave = (): void => {
    this.pointerDown = undefined;
    this.setHoveredId(undefined);
    this.canvas.style.cursor = 'grab';
  };

  private setHoveredId(id?: string): void {
    if (this.hoveredId === id) {
      return;
    }
    const seconds = performance.now() / 1000;
    if (this.hoveredId) {
      this.characterFor(this.hoveredId)?.setLabelHovered(false, seconds);
    }
    this.hoveredId = id;
    if (id) {
      this.characterFor(id)?.setLabelHovered(true, seconds);
    }
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private attachInteraction(): void {
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      this.onSelectionRequested();
      this.canvas.focus({ preventScroll: true });
      return;
    }
    if (key === 'home' || key === '0') {
      event.preventDefault();
      this.resetCamera();
      return;
    }
    if (!['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      return;
    }
    event.preventDefault();
    if (this.selectedId === 'owner'
      && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      this.markOwnerManualControl();
    }
    this.pressedKeys.add(key);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.key.toLowerCase());
  };

  private readonly handleWindowBlur = (): void => {
    this.pressedKeys.clear();
  };

  private updateOwner(owner: OfficeOwner): void {
    const descriptorKey = `${owner.displayName}\u0000${owner.role}\u0000${owner.accent}`;
    if (this.owner && this.ownerDescriptorKey === descriptorKey) {
      return;
    }

    const previousPosition = this.owner?.getPosition();
    if (this.owner) {
      this.scene.remove(this.owner.group);
      this.owner.dispose();
    }

    const parsedColor = Number.parseInt(owner.accent.replace('#', ''), 16);
    const color = Number.isFinite(parsedColor) ? parsedColor : 0xf4b85c;
    this.owner = new CharacterController({
      id: 'owner',
      displayName: owner.displayName,
      role: owner.role,
      color,
      isOwner: true,
      visualRole: 'owner',
      appearanceKey: `owner:${owner.displayName}`
    });
    this.ownerDescriptorKey = descriptorKey;
    const persistedPosition = this.persistedState.ownerPosition
      ? new THREE.Vector3(...this.persistedState.ownerPosition)
      : undefined;
    const position = previousPosition ?? persistedPosition ?? ownerStart;
    this.owner.setPosition(this.navigation.constrainDestination(position));
    if (!previousPosition && !persistedPosition) {
      this.owner.setRestPose('workSeat', Math.PI);
      this.owner.setPath(this.navigation.plan(ownerStart, ownerDesk));
    } else {
      this.owner.setRestPose('stand', Math.PI);
    }
    this.owner.setState('owner', color);
    this.scene.add(this.owner.group);
  }

  private updateAgents(snapshots: AgentSnapshot[]): void {
    const now = performance.now() / 1000;
    this.reconcileReopenedManagers(snapshots);
    const activeIds = new Set(snapshots.map(agent => agent.id));
    for (const [id] of this.agents) {
      if (!activeIds.has(id)) {
        const behavior = this.agentBehaviors.get(id);
        if (behavior?.kind === 'subagent') {
          this.scheduleSubagentRetirement(id, now);
        } else {
          this.beginDeparture(id, now);
        }
      }
    }

    const statusIndexes = new Map<AgentSnapshot['status'], number>();
    snapshots.forEach((agent, index) => {
      this.agentWindowIds.set(agent.id, agent.windowId ?? undefined);
      this.agentIdentityKeys.set(agent.id, logicalAgentIdentity(agent));
      const statusIndex = statusIndexes.get(agent.status) ?? 0;
      statusIndexes.set(agent.status, statusIndex + 1);
      const activityAt = snapshotActivityTime(agent);
      let behavior = this.agentBehaviors.get(agent.id);
      const kind = agent.kind ?? 'primary';
      const retiring = isRetiringSubagent(agent, kind);
      const isDepartureStatus = agent.status === 'offline' || retiring;
      const departedActivityAt = this.departedActivities.get(agent.id);
      if (!behavior && departedActivityAt !== undefined && activityAt <= departedActivityAt + 1) {
        this.agentBehaviors.set(agent.id, {
          status: agent.status,
          kind,
          retiring,
          teamKey: teamKeyFor(agent),
          index: statusIndex,
          cycle: 0,
          nextMoveAt: Number.POSITIVE_INFINITY,
          nextGestureAt: Number.POSITIVE_INFINITY,
          statusChangedAt: now,
          lastActivityAt: activityAt,
          departAt: now,
          removeAt: now,
          celebrationPending: false,
          celebrationStarted: false,
          phase: 'departed'
        });
        return;
      }
      if (departedActivityAt !== undefined && activityAt > departedActivityAt + 1) {
        this.departedActivities.delete(agent.id);
      }
      if (!behavior && isDepartureStatus && Date.now() - activityAt > 120_000) {
        this.agentBehaviors.set(agent.id, {
          status: agent.status,
          kind,
          retiring,
          teamKey: teamKeyFor(agent),
          index: statusIndex,
          cycle: 0,
          nextMoveAt: Number.POSITIVE_INFINITY,
          nextGestureAt: Number.POSITIVE_INFINITY,
          statusChangedAt: now,
          lastActivityAt: activityAt,
          departAt: now,
          removeAt: now,
          celebrationPending: false,
          celebrationStarted: false,
          phase: 'departed'
        });
        this.departedActivities.set(agent.id, activityAt);
        return;
      }

      const previousStatus = behavior?.status;
      const hasFreshActivity = !behavior || activityAt > behavior.lastActivityAt + 1;
      let controller = this.agents.get(agent.id);
      if (!controller) {
        if (behavior?.phase === 'departed' && !hasFreshActivity) {
          return;
        }
        controller = new CharacterController({
          id: agent.id,
          displayName: agent.displayName,
          role: agent.role,
          color: statusColors[agent.status],
          isOwner: false,
          kind: agent.kind,
          visualRole: visualRoleFor(agent),
          appearanceKey: appearanceKeyFor(agent)
        });
        controller.setPosition(spawnPoint(index));
        this.agents.set(agent.id, controller);
        this.scene.add(controller.group);
        behavior = {
          status: agent.status,
          kind,
          retiring,
          teamKey: teamKeyFor(agent),
          index: statusIndex,
          cycle: 0,
          nextMoveAt: now + 12 + statusIndex * 3.2,
          nextGestureAt: now + (requestsAttention(agent.id, agent.status)
            ? 1.4 + statusIndex * 0.6
            : 5 + statusIndex * 1.8),
          statusChangedAt: now,
          lastActivityAt: activityAt,
          departAt: Number.POSITIVE_INFINITY,
          removeAt: Number.POSITIVE_INFINITY,
          celebrationPending: agent.status === 'completed',
          celebrationStarted: false,
          phase: 'present'
        };
        this.agentBehaviors.set(agent.id, behavior);
      }
      if (!behavior) {
        return;
      }

      const previousRetiring = behavior.retiring;
      controller.setState(agent.status, statusColors[agent.status]);
      controller.setActivity(activityForStatus(agent.status));
      controller.setMetadata(agent);
      const statusChanged = previousStatus !== undefined && previousStatus !== agent.status;
      const retirementChanged = previousRetiring !== retiring;
      const nextTeamKey = teamKeyFor(agent);
      const teamChanged = behavior.teamKey !== nextTeamKey;
      if (behavior.phase === 'departing' && retiring && !hasFreshActivity && !retirementChanged) {
        return;
      }
      const shouldRetarget = previousStatus === undefined
        || statusChanged
        || retirementChanged
        || teamChanged
        || behavior.phase !== 'present';
      behavior.status = agent.status;
      behavior.kind = kind;
      behavior.retiring = retiring;
      behavior.teamKey = nextTeamKey;
      behavior.lastActivityAt = Math.max(behavior.lastActivityAt, activityAt);
      if (statusChanged) {
        behavior.statusChangedAt = now;
        behavior.index = statusIndex;
        behavior.cycle = 0;
        behavior.celebrationPending = agent.status === 'completed';
        behavior.celebrationStarted = false;
        behavior.nextGestureAt = now + (requestsAttention(agent.id, agent.status)
          ? 1.2 + statusIndex * 0.6
          : 6 + statusIndex * 2);
      }
      behavior.phase = 'present';
      behavior.removeAt = Number.POSITIVE_INFINITY;
      if (retiring) {
        if (previousStatus === undefined || statusChanged || retirementChanged || hasFreshActivity) {
          behavior.departAt = now + retirementDelay(agent.status, statusIndex);
        }
      } else if (agent.status === 'offline') {
        if (previousStatus === undefined || statusChanged || hasFreshActivity) {
          behavior.departAt = now + 7;
        }
      } else {
        behavior.departAt = Number.POSITIVE_INFINITY;
      }
      if (isLeisureBehavior(behavior)) {
        if (statusChanged || retirementChanged) {
          behavior.nextMoveAt = now + 6 + statusIndex * 1.8;
        }
      } else {
        behavior.nextMoveAt = Number.POSITIVE_INFINITY;
      }

      if (shouldRetarget) {
        this.assignStatusDestination(agent.id, controller, behavior);
      }
      this.queueSocialInteraction(agent, behavior, now);
    });
    this.updateAgentVisibility();
  }

  /**
   * Cursor assigns a fresh extension-host PID when an IDE window is reopened.
   * Preserve the logical manager and its world position instead of showing the
   * departing lease and the replacement as two different people.
   */
  private reconcileReopenedManagers(snapshots: readonly AgentSnapshot[]): void {
    const incomingIds = new Set(snapshots.map(snapshot => snapshot.id));
    const missingManagers = [...this.agents.keys()]
      .filter(id => id.startsWith('cursor-window-manager-') && !incomingIds.has(id));
    if (missingManagers.length === 0) {
      return;
    }

    for (const snapshot of snapshots) {
      if (!snapshot.id.startsWith('cursor-window-manager-') || this.agents.has(snapshot.id)) {
        continue;
      }
      const identity = logicalAgentIdentity(snapshot);
      const previousIndex = missingManagers.findIndex(id => this.agentIdentityKeys.get(id) === identity);
      if (previousIndex < 0) {
        continue;
      }
      const previousId = missingManagers.splice(previousIndex, 1)[0];
      this.rebindAgent(previousId, snapshot.id, identity);
    }
  }

  private rebindAgent(previousId: string, nextId: string, identity: string): void {
    const controller = this.agents.get(previousId);
    const behavior = this.agentBehaviors.get(previousId);
    if (!controller || !behavior) {
      return;
    }

    this.agents.delete(previousId);
    this.agentBehaviors.delete(previousId);
    this.agentWindowIds.delete(previousId);
    this.agentIdentityKeys.delete(previousId);
    this.movementWatches.delete(previousId);
    this.crowdConflicts.delete(previousId);
    this.departedActivities.delete(previousId);
    this.departedActivities.delete(nextId);
    this.poiManager.transferAgent(previousId, nextId);

    controller.rebindId(nextId);
    behavior.phase = 'present';
    behavior.removeAt = Number.POSITIVE_INFINITY;
    this.agents.set(nextId, controller);
    this.agentBehaviors.set(nextId, behavior);
    this.agentIdentityKeys.set(nextId, identity);
    if (this.selectedId === previousId) this.selectedId = nextId;
    if (this.hoveredId === previousId) this.hoveredId = nextId;

    for (const encounter of this.socialQueue) {
      rebindEncounter(encounter, previousId, nextId);
    }
    for (const [key, encounter] of [...this.socialEncounters]) {
      if (!encounterReferences(encounter, previousId)) {
        continue;
      }
      this.socialEncounters.delete(key);
      rebindEncounter(encounter, previousId, nextId);
      encounter.key = encounter.key.replaceAll(previousId, nextId);
      this.socialEncounters.set(encounter.key, encounter);
    }
    for (const [key, group] of [...this.ambientSocialGroups]) {
      const member = group.members.find(item => item.id === previousId);
      if (!member) {
        continue;
      }
      this.ambientSocialGroups.delete(key);
      member.id = nextId;
      group.key = group.key.replaceAll(previousId, nextId);
      this.ambientSocialGroups.set(group.key, group);
    }
  }

  private updateAgentVisibility(): void {
    for (const [id, controller] of this.agents) {
      const windowId = this.agentWindowIds.get(id);
      controller.group.visible = this.selectedWindowId === 'all'
        || (this.selectedWindowId === 'unassigned' ? !windowId : windowId === this.selectedWindowId);
    }
  }

  private assignStatusDestination(
    id: string,
    controller: CharacterController,
    behavior: AgentBehavior
  ): void {
    this.poiManager.release(id);
    behavior.pendingDwellPoiId = undefined;
    const attentionRequested = requestsAttention(id, behavior.status);
    let kinds: readonly OfficePoiKind[];
    switch (behavior.retiring ? 'completed' : behavior.status) {
      case 'working': kinds = ['desk']; break;
      case 'waitingForUser': kinds = attentionRequested ? ['idle'] : ['meeting']; break;
      case 'error': kinds = ['debug']; break;
      case 'completed':
      case 'offline': kinds = ['lounge']; break;
      case 'idle':
      case 'unknown': kinds = behavior.index % 4 === 0 ? ['lounge', 'idle'] : ['idle', 'lounge']; break;
    }

    const claimed = this.poiManager.claim(id, kinds, behavior.index, behavior.teamKey);
    const fallback = targetForAgent(attentionRequested ? 'idle' : behavior.status, behavior.index);
    const destination: ClaimedDestination = claimed ?? {
      poiId: `fallback-${id}`,
      position: fallback.position,
      restPose: fallback.restPose,
      facing: fallback.facing,
      visualOffset: fallback.visualOffset
    };
    behavior.destination = destination;
    const celebrateStanding = behavior.status === 'completed' && behavior.celebrationPending;
    controller.setRestPose(
      celebrateStanding || attentionRequested ? 'stand' : destination.restPose,
      destination.facing,
      celebrateStanding || attentionRequested ? undefined : destination.visualOffset
    );
    controller.setPath(this.navigation.plan(controller.group.position, destination.position));
    if (isLeisureBehavior(behavior) && !attentionRequested) {
      behavior.pendingDwellPoiId = destination.poiId;
      behavior.nextMoveAt = Number.POSITIVE_INFINITY;
    }
  }

  private selectableAt(event: PointerEvent): string | undefined {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const roots = this.owner
      ? [...this.agents.values()].map(agent => agent.group).concat(this.owner.group)
      : [...this.agents.values()].map(agent => agent.group);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    let current: THREE.Object3D | null | undefined = hit?.object;
    while (current) {
      if (typeof current.userData.selectableId === 'string') {
        return current.userData.selectableId as string;
      }
      current = current.parent;
    }

    return undefined;
  }

  private floorPointAt(event: PointerEvent): THREE.Vector3 | undefined {
    if (!this.officeFloor) {
      return undefined;
    }
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(this.officeFloor, false)[0]?.point.clone();
  }

  private animate(time: number): void {
    const seconds = time / 1000;
    this.sceneSeconds = seconds;
    const deltaSeconds = this.previousAnimationTime === 0
      ? 0
      : Math.min((time - this.previousAnimationTime) / 1000, 0.05);
    this.previousAnimationTime = time;
    this.updateOwnerMovement(deltaSeconds);
    this.updateCameraMovement(deltaSeconds);
    this.updateAgentLifecycle(seconds);
    this.updateLeisureBehaviors(seconds);
    this.updateOwnerAutonomy(seconds);
    this.updateSocialBehaviors(seconds);
    this.updateAgentGestures(seconds);
    this.updateDoorTraffic(seconds);
    let index = 0;
    for (const [id, agent] of this.agents) {
      agent.update(seconds, deltaSeconds, index, this.selectedId === id);
      index += 1;
    }
    this.owner?.update(seconds, deltaSeconds, index, this.selectedId === 'owner');
    this.updateCharacterSeparation();
    this.persistWorldState(seconds);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private updateOwnerMovement(deltaSeconds: number): void {
    if (!this.owner || this.selectedId !== 'owner' || this.pressedKeys.size === 0) {
      return;
    }

    const forwardAmount = Number(this.pressedKeys.has('w') || this.pressedKeys.has('arrowup'))
      - Number(this.pressedKeys.has('s') || this.pressedKeys.has('arrowdown'));
    const rightAmount = Number(this.pressedKeys.has('d') || this.pressedKeys.has('arrowright'))
      - Number(this.pressedKeys.has('a') || this.pressedKeys.has('arrowleft'));
    const cameraForward = this.controls.target.clone().sub(this.camera.position).setY(0);
    if (cameraForward.lengthSq() < 0.0001) {
      return;
    }
    cameraForward.normalize();
    const cameraRight = cameraForward.clone().cross(this.camera.up).normalize();
    const direction = cameraForward.multiplyScalar(forwardAmount)
      .add(cameraRight.multiplyScalar(rightAmount));
    if (direction.lengthSq() === 0) {
      return;
    }

    this.markOwnerManualControl();
    direction.normalize().multiplyScalar(2.15 * deltaSeconds);
    const position = this.navigation.move(this.owner.group.position, direction);
    this.owner.moveTo(position);
  }

  private markOwnerManualControl(seconds = this.sceneSeconds): void {
    const wasAlreadyManual = seconds < this.ownerManualUntil;
    this.ownerManualUntil = seconds + ownerManualOverrideSeconds;
    this.nextOwnerAutonomyAt = seconds + ownerManualOverrideSeconds + 2;
    this.ownerAutonomyAction = 'manual';
    if (!wasAlreadyManual) {
      this.cancelOwnerSocialInteractions(seconds);
    }
  }

  private cancelOwnerSocialInteractions(seconds: number): void {
    for (let index = this.socialQueue.length - 1; index >= 0; index -= 1) {
      const encounter = this.socialQueue[index];
      if (encounter.visitorId !== 'owner' && encounter.hostId !== 'owner') {
        continue;
      }
      this.restoreQueuedDeparture(encounter, seconds);
      this.socialQueue.splice(index, 1);
    }

    for (const encounter of [...this.socialEncounters.values()]) {
      if ((encounter.visitorId !== 'owner' && encounter.hostId !== 'owner')
        || encounter.phase === 'returning') {
        continue;
      }
      const visitor = this.characterFor(encounter.visitorId);
      const host = this.characterFor(encounter.hostId);
      if (!visitor || !host) {
        this.socialEncounters.delete(encounter.key);
        continue;
      }
      if (encounter.hostRestState) {
        host.setRestPose(
          encounter.hostRestState.pose,
          encounter.hostRestState.facing,
          encounter.hostRestState.visualOffset
        );
      }
      visitor.setConversationMode();
      host.setConversationMode();
      if (encounter.hostId === 'owner') {
        this.finishSocialEncounter(encounter, visitor, host, seconds);
      } else {
        this.restoreQueuedDeparture(encounter, seconds);
        this.socialEncounters.delete(encounter.key);
      }
    }
  }

  private updateOwnerAutonomy(seconds: number): void {
    if (!this.owner) {
      return;
    }
    if (this.owner.isMoving) {
      if (this.ownerAutonomyAction === 'manual') {
        this.nextOwnerAutonomyAt = Math.max(
          this.nextOwnerAutonomyAt,
          seconds + ownerManualOverrideSeconds
        );
      }
      return;
    }
    if (seconds < this.ownerManualUntil
      || seconds < this.nextOwnerAutonomyAt
      || this.isSociallyBusy('owner')
      || this.socialQueue.some(encounter => encounter.visitorId === 'owner' || encounter.hostId === 'owner')) {
      return;
    }

    const ownerMovementKeyPressed = [...this.pressedKeys].some(key =>
      ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
    );
    if (this.selectedId === 'owner' && ownerMovementKeyPressed) {
      return;
    }

    this.ownerAutonomySequence += 1;
    this.nextOwnerAutonomyAt = seconds + ownerAutonomyCadenceSeconds
      + (this.ownerAutonomySequence % 3) * 4;
    const workIsActive = [...this.agentBehaviors.values()].some(behavior =>
      behavior.phase === 'present' && behavior.status === 'working'
    );
    const idleAgents = [...this.agentBehaviors.entries()]
      .filter(([id, behavior]) => behavior.phase === 'present'
        && isLeisureBehavior(behavior)
        && !behavior.retiring
        && !this.isSociallyBusy(id)
        && !this.agents.get(id)?.isMoving)
      .map(([id]) => id)
      .sort();
    const shouldSocialize = idleAgents.length > 0
      && (!workIsActive || this.ownerAutonomySequence % 3 === 0);

    if (shouldSocialize) {
      const hostId = idleAgents[this.ownerAutonomySequence % idleAgents.length];
      const key = `owner-ambient:${this.ownerAutonomySequence}:${hostId}`;
      this.socialQueue.push({
        key,
        visitorId: 'owner',
        hostId,
        firstSpeakerId: 'owner',
        phase: 'queued',
        queuedAt: seconds,
        expiresAt: seconds + 55,
        talkStartedAt: 0,
        talkUntil: 0,
        returnDeadline: 0,
        visitorDepartureAt: Number.POSITIVE_INFINITY
      });
      this.ownerAutonomyAction = `social:${hostId}`;
      return;
    }

    this.ownerAutonomyAction = workIsActive ? 'desk:monitoring' : 'desk:idle';
    this.owner.setActivity(workIsActive ? 'work' : 'idle');
    this.owner.setRestPose('workSeat', Math.PI);
    this.owner.setPath(this.navigation.plan(this.owner.group.position, ownerDesk));
  }

  private updateCameraMovement(deltaSeconds: number): void {
    if (this.pressedKeys.size === 0) {
      return;
    }

    const ownerHasKeyboard = this.selectedId === 'owner';
    const forwardAmount = ownerHasKeyboard
      ? 0
      : Number(this.pressedKeys.has('w') || this.pressedKeys.has('arrowup'))
        - Number(this.pressedKeys.has('s') || this.pressedKeys.has('arrowdown'));
    const rightAmount = ownerHasKeyboard
      ? 0
      : Number(this.pressedKeys.has('d') || this.pressedKeys.has('arrowright'))
        - Number(this.pressedKeys.has('a') || this.pressedKeys.has('arrowleft'));
    const turnAmount = Number(this.pressedKeys.has('e')) - Number(this.pressedKeys.has('q'));
    const viewForward = this.controls.target.clone().sub(this.camera.position).setY(0);

    if ((forwardAmount !== 0 || rightAmount !== 0) && viewForward.lengthSq() > 0.0001) {
      viewForward.normalize();
      const viewRight = viewForward.clone().cross(this.camera.up).normalize();
      const translation = viewForward.multiplyScalar(forwardAmount)
        .add(viewRight.multiplyScalar(rightAmount));
      if (translation.lengthSq() > 0.0001) {
        translation.normalize().multiplyScalar(5.2 * deltaSeconds);
        const nextTarget = this.controls.target.clone().add(translation);
        nextTarget.x = THREE.MathUtils.clamp(nextTarget.x, worldBounds.minX - 1.5, worldBounds.maxX + 1.5);
        nextTarget.z = THREE.MathUtils.clamp(nextTarget.z, worldBounds.minZ - 1.5, worldBounds.maxZ + 1.5);
        const applied = nextTarget.sub(this.controls.target);
        this.controls.target.add(applied);
        this.camera.position.add(applied);
      }
    }

    if (turnAmount !== 0) {
      const offset = this.camera.position.clone().sub(this.controls.target);
      offset.applyAxisAngle(this.camera.up, turnAmount * 1.25 * deltaSeconds);
      this.camera.position.copy(this.controls.target).add(offset);
    }
  }

  private resetCamera(): void {
    this.camera.position.copy(defaultCameraPosition);
    this.controls.target.copy(defaultCameraTarget);
    this.controls.update();
  }

  private updateCharacterSeparation(): void {
    const characters = [...this.agents.values()].filter(character => character.group.visible);
    if (this.owner) {
      characters.push(this.owner);
    }
    const minimumDistance = 0.58;
    for (let leftIndex = 0; leftIndex < characters.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < characters.length; rightIndex += 1) {
        const left = characters[leftIndex];
        const right = characters[rightIndex];
        if (left.isSeated && right.isSeated) {
          continue;
        }
        if (this.doorTraffic.isInsideDoorCore(left.group.position)
          || this.doorTraffic.isInsideDoorCore(right.group.position)) {
          continue;
        }
        const offset = left.getPosition().sub(right.getPosition()).setY(0);
        const distance = offset.length();
        if (distance >= minimumDistance) {
          continue;
        }
        if (distance < 0.001) {
          offset.set(Math.cos(leftIndex * 2.4), 0, Math.sin(leftIndex * 2.4));
        } else {
          offset.divideScalar(distance);
        }
        const correction = (minimumDistance - distance) + 0.008;
        const leftFixed = left.isSeated || left.isWaitingForPassage;
        const rightFixed = right.isSeated || right.isWaitingForPassage;
        if (!leftFixed) {
          const share = rightFixed ? correction : correction * 0.5;
          left.setPosition(this.navigation.move(left.group.position, offset.clone().multiplyScalar(share)));
        }
        if (!rightFixed) {
          const share = leftFixed ? correction : correction * 0.5;
          right.setPosition(this.navigation.move(right.group.position, offset.clone().multiplyScalar(-share)));
        }
      }
    }
  }

  private updateDoorTraffic(seconds: number): void {
    const travelers: DoorTraveler[] = [...this.agents]
      .filter(([, controller]) => controller.group.visible)
      .map(([id, controller]) => ({
      id,
      position: controller.getPosition(),
      remainingPath: controller.getRemainingPath(),
      moving: controller.isMoving
      }));
    if (this.owner) {
      travelers.push({
        id: 'owner',
        position: this.owner.getPosition(),
        remainingPath: this.owner.getRemainingPath(),
        moving: this.owner.isMoving
      });
    }

    const doorWaiting = this.doorTraffic.update(travelers, seconds);
    const crowdWaiting = this.updateCrowdAvoidance(travelers, doorWaiting, seconds);
    const waiting = new Set([...doorWaiting, ...crowdWaiting]);
    for (const [id, controller] of this.agents) {
      controller.setMovementPaused(waiting.has(id));
    }
    this.owner?.setMovementPaused(waiting.has('owner'));
  }

  private updateCrowdAvoidance(
    travelers: readonly DoorTraveler[],
    doorWaiting: ReadonlySet<string>,
    seconds: number
  ): ReadonlySet<string> {
    const waiting = new Set<string>();
    const activeYielders = new Set<string>();

    for (let leftIndex = 0; leftIndex < travelers.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < travelers.length; rightIndex += 1) {
        const left = travelers[leftIndex];
        const right = travelers[rightIndex];
        if (left.position.distanceTo(right.position) > 1.04
          || this.doorTraffic.isInsideDoorCore(left.position)
          || this.doorTraffic.isInsideDoorCore(right.position)) {
          continue;
        }

        const leftHeadsTowardRight = this.travelsToward(left, right.position);
        const rightHeadsTowardLeft = this.travelsToward(right, left.position);
        const yielder = this.chooseCrowdYielder(
          left,
          right,
          leftHeadsTowardRight,
          rightHeadsTowardLeft
        );
        if (!yielder || doorWaiting.has(yielder.id)) {
          continue;
        }
        const blocker = yielder.id === left.id ? right : left;
        activeYielders.add(yielder.id);

        let conflict = this.crowdConflicts.get(yielder.id);
        if (!conflict || conflict.blockerId !== blocker.id) {
          conflict = {
            blockerId: blocker.id,
            since: seconds,
            lastDetourAt: Number.NEGATIVE_INFINITY,
            releaseUntil: 0
          };
          this.crowdConflicts.set(yielder.id, conflict);
        }
        if (seconds < conflict.releaseUntil) {
          continue;
        }

        const shouldDetour = !blocker.moving || seconds - conflict.since >= 0.62;
        if (shouldDetour && seconds - conflict.lastDetourAt >= 1.1
          && this.tryCrowdDetour(yielder, blocker, travelers)) {
          conflict.lastDetourAt = seconds;
          conflict.releaseUntil = seconds + 0.9;
          continue;
        }

        // One character yields briefly while the other clears the shared lane.
        // If it does not clear, the timed detour above takes over on a later frame.
        waiting.add(yielder.id);
      }
    }

    for (const id of [...this.crowdConflicts.keys()]) {
      if (!activeYielders.has(id)) {
        this.crowdConflicts.delete(id);
      }
    }
    const recovered = this.recoverStalledTravelers(travelers, doorWaiting, waiting, seconds);
    for (const id of recovered) {
      waiting.delete(id);
      this.crowdConflicts.delete(id);
    }
    return waiting;
  }

  private chooseCrowdYielder(
    left: DoorTraveler,
    right: DoorTraveler,
    leftHeadsTowardRight: boolean,
    rightHeadsTowardLeft: boolean
  ): DoorTraveler | undefined {
    if (!leftHeadsTowardRight && !rightHeadsTowardLeft) {
      return undefined;
    }
    if (leftHeadsTowardRight && !rightHeadsTowardLeft) {
      return left;
    }
    if (rightHeadsTowardLeft && !leftHeadsTowardRight) {
      return right;
    }
    if (left.moving !== right.moving) {
      return left.moving ? left : right;
    }
    // Stable priority prevents reciprocal "after you" oscillation. The selected
    // actor keeps yielding until the pair has actually separated.
    return left.id.localeCompare(right.id) > 0 ? left : right;
  }

  private travelsToward(traveler: DoorTraveler, obstacle: THREE.Vector3): boolean {
    if (!traveler.moving) {
      return false;
    }
    const next = traveler.remainingPath[0];
    if (!next) {
      return false;
    }
    const direction = next.clone().sub(traveler.position).setY(0);
    const offset = obstacle.clone().sub(traveler.position).setY(0);
    const distance = offset.length();
    if (direction.lengthSq() < 0.0001 || distance < 0.001) {
      return distance < 0.64;
    }
    direction.normalize();
    const forwardDistance = direction.dot(offset);
    const lateralDistance = Math.abs(direction.x * offset.z - direction.z * offset.x);
    return forwardDistance > -0.08 && forwardDistance < 1.22 && lateralDistance < 0.64;
  }

  private tryCrowdDetour(
    traveler: DoorTraveler,
    blocker: DoorTraveler,
    allTravelers: readonly DoorTraveler[]
  ): boolean {
    const controller = this.characterFor(traveler.id);
    const destination = traveler.remainingPath.at(-1);
    const next = traveler.remainingPath[0];
    if (!controller || !destination || !next || controller.isSeated) {
      return false;
    }
    const direction = next.clone().sub(traveler.position).setY(0);
    if (direction.lengthSq() < 0.0001) {
      return false;
    }
    direction.normalize();
    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x);
    const preferredSide = stableSide(`${traveler.id}|${blocker.id}`);

    for (const side of [preferredSide, -preferredSide]) {
      for (const lateral of [0.74, 0.9, 1.08]) {
        const before = blocker.position.clone()
          .addScaledVector(direction, -0.5)
          .addScaledVector(perpendicular, side * lateral);
        const after = blocker.position.clone()
          .addScaledVector(direction, 0.62)
          .addScaledVector(perpendicular, side * lateral);
        const beforeWalkable = this.navigation.isWalkable(before, 0.28);
        const afterWalkable = this.navigation.isWalkable(after, 0.28);
        const beforeClear = this.hasCrowdClearance(before, traveler.id, allTravelers);
        const afterClear = this.hasCrowdClearance(after, traveler.id, allTravelers);
        if (!beforeWalkable || !afterWalkable || !beforeClear || !afterClear) {
          continue;
        }

        const first = this.navigation.plan(traveler.position, before, 0.28);
        const second = this.navigation.plan(before, after, 0.28);
        const third = this.navigation.plan(after, destination, 0.28);
        const route = [...first, ...second, ...third];
        const clearsBlocker = routeClearsPoint(
          traveler.position,
          [...first, ...second],
          blocker.position,
          0.52
        );
        if (first.length === 0 || second.length === 0 || third.length === 0 || !clearsBlocker) {
          continue;
        }
        controller.setPath(route);
        return true;
      }
    }

    // Tight furniture can make a small local sidestep impossible. Fall back to
    // a full office route that treats every other character as a temporary
    // circular obstacle and may therefore take the other side of the room.
    const dynamicObstacles = allTravelers
      .filter(other => other.id !== traveler.id)
      .map(other => other.position);
    const route = this.navigation.planAvoiding(
      traveler.position,
      destination,
      dynamicObstacles,
      0.28
    );
    if (route.length === 0) {
      return false;
    }
    controller.setPath(route);
    return true;
  }

  private hasCrowdClearance(
    position: THREE.Vector3,
    travelerId: string,
    travelers: readonly DoorTraveler[]
  ): boolean {
    return travelers.every(other => other.id === travelerId || position.distanceTo(other.position) >= 0.6);
  }

  private recoverStalledTravelers(
    travelers: readonly DoorTraveler[],
    doorWaiting: ReadonlySet<string>,
    crowdWaiting: ReadonlySet<string>,
    seconds: number
  ): ReadonlySet<string> {
    const recoveredIds = new Set<string>();
    const activeIds = new Set(travelers.map(traveler => traveler.id));
    for (const traveler of travelers) {
      if (!traveler.moving) {
        this.movementWatches.delete(traveler.id);
        continue;
      }
      // Door queues are intentional and self-heal through their lease timeout.
      // Crowd yielders, on the other hand, must stay under the watchdog: an
      // unsuccessful sidestep next to furniture must not pause them forever.
      if (doorWaiting.has(traveler.id) && !crowdWaiting.has(traveler.id)) {
        this.movementWatches.delete(traveler.id);
        continue;
      }
      let watch = this.movementWatches.get(traveler.id);
      if (!watch) {
        watch = {
          position: traveler.position.clone(),
          observedAt: seconds,
          lastRecoveryAt: Number.NEGATIVE_INFINITY
        };
        this.movementWatches.set(traveler.id, watch);
        continue;
      }
      if (seconds - watch.observedAt < 0.7) {
        continue;
      }

      const progress = traveler.position.distanceTo(watch.position);
      watch.position.copy(traveler.position);
      watch.observedAt = seconds;
      if (progress >= 0.045) {
        watch.stuckSince = undefined;
        continue;
      }
      watch.stuckSince ??= seconds;
      if (seconds - watch.stuckSince < 1.05 || seconds - watch.lastRecoveryAt < 1.6) {
        continue;
      }

      const nearestBlocker = travelers
        .filter(other => other.id !== traveler.id)
        .sort((left, right) => traveler.position.distanceToSquared(left.position)
          - traveler.position.distanceToSquared(right.position))[0];
      const recovered = nearestBlocker
        && traveler.position.distanceTo(nearestBlocker.position) < 1.35
        && this.tryCrowdDetour(traveler, nearestBlocker, travelers);
      if (!recovered) {
        const controller = this.characterFor(traveler.id);
        const destination = traveler.remainingPath.at(-1);
        if (controller && destination) {
          const replanned = this.navigation.planAvoiding(
            traveler.position,
            destination,
            travelers.filter(other => other.id !== traveler.id).map(other => other.position),
            0.28
          );
          if (replanned.length > 0) {
            controller.setPath(replanned);
            recoveredIds.add(traveler.id);
          }
        }
      } else {
        recoveredIds.add(traveler.id);
      }
      watch.lastRecoveryAt = seconds;
      watch.stuckSince = undefined;
    }

    for (const id of [...this.movementWatches.keys()]) {
      if (!activeIds.has(id)) {
        this.movementWatches.delete(id);
      }
    }
    return recoveredIds;
  }

  private updateLeisureBehaviors(seconds: number): void {
    for (const [id, behavior] of this.agentBehaviors) {
      if (behavior.phase !== 'present'
        || !isLeisureBehavior(behavior)
        || requestsAttention(id, behavior.status)) {
        continue;
      }
      const controller = this.agents.get(id);
      if (!controller) {
        continue;
      }
      const sociallyBusy = this.isSociallyBusy(id);
      if (behavior.pendingDwellPoiId
        && !controller.isMoving
        && !sociallyBusy
        && behavior.destination?.poiId === behavior.pendingDwellPoiId) {
        behavior.nextMoveAt = seconds + leisureDwellSeconds(id, behavior);
        behavior.pendingDwellPoiId = undefined;
      }
      if (sociallyBusy || controller.isMoving || seconds < behavior.nextMoveAt) {
        continue;
      }

      behavior.cycle += 1;
      if ((behavior.index + behavior.cycle) % 4 === 0) {
        const gesture = behavior.status === 'completed' ? 'celebrate' : 'lookAround';
        const duration = leisureGestureDuration(id, gesture, behavior.cycle);
        controller.playGesture(gesture, duration);
        behavior.nextMoveAt = seconds + duration
          + variedSeconds(7, 22, `${id}:post-gesture:${behavior.cycle}`);
        continue;
      }

      this.poiManager.release(id);
      const preferredKinds = leisurePoiKinds(behavior.retiring ? 'completed' : behavior.status, behavior.cycle);
      const destination = this.poiManager.claim(id, preferredKinds, behavior.index + behavior.cycle * 3)
        ?? this.poiManager.claim(id, ['lounge', 'meeting', 'idle'], behavior.index + behavior.cycle * 3);
      if (!destination) {
        behavior.nextMoveAt = seconds + variedSeconds(7, 17, `${id}:no-poi:${behavior.cycle}`);
        continue;
      }
      behavior.destination = destination;
      behavior.pendingDwellPoiId = destination.poiId;
      behavior.nextMoveAt = Number.POSITIVE_INFINITY;
      controller.setRestPose(destination.restPose, destination.facing, destination.visualOffset);
      controller.setPath(this.navigation.plan(controller.group.position, destination.position));
    }

    this.queueAmbientInteraction(seconds);
  }

  private queueAmbientInteraction(seconds: number): void {
    if (seconds < this.nextAmbientInteractionAt
      || this.socialQueue.length > 0
      || this.ambientSocialGroups.size >= 2) {
      return;
    }
    this.nextAmbientInteractionAt = seconds + variedSeconds(
      12,
      32,
      `ambient-cadence:${this.ambientInteractionSequence}`
    );
    const candidates = [...this.agentBehaviors.entries()]
      .filter(([id, behavior]) => behavior.phase === 'present'
        && isLeisureBehavior(behavior)
        && !requestsAttention(id, behavior.status)
        && !this.isSociallyBusy(id)
        && !this.agents.get(id)?.isMoving
        && (behavior.kind === 'primary' || behavior.departAt - seconds > 18))
      .map(([id]) => id)
      .sort();
    if (candidates.length < 2) {
      return;
    }

    const desiredSize = candidates.length >= 4 && this.ambientInteractionSequence % 4 === 3
      ? 4
      : candidates.length >= 3 && this.ambientInteractionSequence % 3 !== 0
        ? 3
        : 2;
    const venueOrder: readonly AmbientSocialVenue[] = ['sofa', 'meeting', 'standing'];
    const venueOffset = this.ambientInteractionSequence % venueOrder.length;
    for (let offset = 0; offset < venueOrder.length; offset += 1) {
      const venue = venueOrder[(venueOffset + offset) % venueOrder.length];
      if (this.tryStartAmbientSocialGroup(candidates, venue, desiredSize, seconds)) {
        this.ambientInteractionSequence += 1;
        return;
      }
    }

    // All authored formations are currently occupied. Retry sooner than the
    // normal cadence without evicting a resting or working character.
    this.nextAmbientInteractionAt = seconds + variedSeconds(
      6,
      14,
      `ambient-retry:${this.ambientInteractionSequence}`
    );
  }

  private tryStartAmbientSocialGroup(
    candidates: readonly string[],
    venue: AmbientSocialVenue,
    requestedSize: number,
    seconds: number
  ): boolean {
    const definition = this.ambientVenueDefinition(venue, requestedSize);
    const targetPoiIds = definition.poiIds;
    if (targetPoiIds.length < 2) {
      return false;
    }

    const candidateSet = new Set(candidates);
    const selectedIds: string[] = [];
    for (const poiId of targetPoiIds) {
      const occupant = this.poiManager.getOccupant(poiId);
      if (!occupant) {
        continue;
      }
      if (!candidateSet.has(occupant)) {
        return false;
      }
      if (!selectedIds.includes(occupant)) {
        selectedIds.push(occupant);
      }
    }

    const rotatedCandidates = [...candidates]
      .slice(this.ambientInteractionSequence % candidates.length)
      .concat([...candidates].slice(0, this.ambientInteractionSequence % candidates.length))
      .filter(id => !selectedIds.includes(id))
      .sort((left, right) => {
        const leftPosition = this.agents.get(left)?.getPosition();
        const rightPosition = this.agents.get(right)?.getPosition();
        return (leftPosition?.distanceToSquared(definition.focus) ?? Number.POSITIVE_INFINITY)
          - (rightPosition?.distanceToSquared(definition.focus) ?? Number.POSITIVE_INFINITY);
      });
    selectedIds.push(...rotatedCandidates.slice(0, targetPoiIds.length - selectedIds.length));
    if (selectedIds.length < 2) {
      return false;
    }

    const assignments: { agentId: string; poiId: string }[] = [];
    const remainingPoiIds = [...targetPoiIds];
    const remainingAgentIds: string[] = [];
    for (const id of selectedIds) {
      const currentPoiId = this.poiManager.getPoiId(id);
      const currentIndex = currentPoiId ? remainingPoiIds.indexOf(currentPoiId) : -1;
      if (currentIndex >= 0) {
        assignments.push({ agentId: id, poiId: remainingPoiIds.splice(currentIndex, 1)[0] });
      } else {
        remainingAgentIds.push(id);
      }
    }
    remainingAgentIds.forEach((id, index) => {
      assignments.push({ agentId: id, poiId: remainingPoiIds[index] });
    });

    const participantState = selectedIds.map(id => ({
      id,
      controller: this.agents.get(id),
      behavior: this.agentBehaviors.get(id)
    }));
    if (participantState.some(item => !item.controller || !item.behavior)) {
      return false;
    }
    const destinations = this.poiManager.claimGroup(assignments);
    if (!destinations) {
      return false;
    }

    const key = `ambient-group:${this.ambientInteractionSequence + 1}:${venue}:${selectedIds.join(':')}`;
    const members: AmbientSocialMember[] = participantState.map(item => ({
      id: item.id,
      target: destinations.get(item.id)!,
      departureAt: item.behavior!.departAt
    }));
    const group: AmbientSocialGroup = {
      key,
      venue,
      members,
      focus: definition.focus,
      phase: 'gathering',
      startedAt: seconds,
      gatherDeadline: seconds + 38,
      talkStartedAt: 0,
      talkUntil: 0,
      speakerCadence: ambientSpeakerCadence(key, venue),
      firstSpeakerIndex: this.ambientInteractionSequence % members.length
    };
    this.ambientSocialGroups.set(key, group);

    for (const member of members) {
      const controller = this.agents.get(member.id)!;
      const behavior = this.agentBehaviors.get(member.id)!;
      behavior.destination = member.target;
      behavior.pendingDwellPoiId = undefined;
      behavior.nextMoveAt = Number.POSITIVE_INFINITY;
      behavior.nextGestureAt = Number.POSITIVE_INFINITY;
      behavior.departAt = Number.POSITIVE_INFINITY;
      controller.setConversationMode();
      controller.setActivity('idle');
      controller.setRestPose(
        member.target.restPose,
        member.target.facing,
        member.target.visualOffset
      );
      controller.setPath(this.navigation.plan(controller.group.position, member.target.position));
    }
    return true;
  }

  private ambientVenueDefinition(
    venue: AmbientSocialVenue,
    requestedSize: number
  ): { poiIds: string[]; focus: THREE.Vector3 } {
    if (venue === 'sofa') {
      const size = Math.min(3, Math.max(2, requestedSize));
      const pairOffset = this.ambientInteractionSequence % 2;
      const poiIds = size === 2
        ? [`lounge-${pairOffset}`, `lounge-${pairOffset + 1}`]
        : ['lounge-0', 'lounge-1', 'lounge-2'];
      return {
        poiIds,
        focus: new THREE.Vector3(loungeTableFixture.x, 0, loungeTableFixture.z)
      };
    }
    if (venue === 'meeting') {
      const size = Math.min(4, Math.max(2, requestedSize));
      const pair = this.ambientInteractionSequence % 2 === 0
        ? ['meeting-0', 'meeting-1']
        : ['meeting-2', 'meeting-3'];
      const poiIds = size === 2
        ? pair
        : size === 3
          ? ['meeting-0', 'meeting-2', 'meeting-1']
          : ['meeting-0', 'meeting-2', 'meeting-1', 'meeting-3'];
      return { poiIds, focus: new THREE.Vector3(6.43, 0, 3.52) };
    }

    const formation = standingConversationGroups[
      this.ambientInteractionSequence % standingConversationGroups.length
    ];
    const size = Math.min(formation.spots.length, Math.max(2, requestedSize));
    return {
      poiIds: formation.spots.slice(0, size).map((_, index) => `${formation.id}-${index}`),
      focus: formation.focus.clone()
    };
  }

  private queueSocialInteraction(snapshot: AgentSnapshot, behavior: AgentBehavior, seconds: number): void {
    const interaction = snapshot.interactionKind;
    if (!interaction) {
      return;
    }
    const interactionGroup = interaction === 'userPrompt' || interaction === 'agentResponse'
      ? 'owner-conversation'
      : interaction;
    const occurrence = snapshot.generationId ?? snapshot.lastActivityAt ?? seconds.toFixed(3);
    const key = `${interactionGroup}:${snapshot.id}:${occurrence}`;
    if (behavior.lastInteractionKey === key
      || this.socialQueue.some(encounter => encounter.key === key)
      || this.socialEncounters.has(key)) {
      return;
    }
    behavior.lastInteractionKey = key;

    const isOwnerConversation = interaction === 'userPrompt' || interaction === 'agentResponse';
    const hostId = isOwnerConversation ? 'owner' : snapshot.parentAgentId;
    if (!hostId || hostId === snapshot.id) {
      return;
    }
    this.finishAmbientSocialGroupsFor([snapshot.id, hostId], seconds);
    const firstSpeakerId = interaction === 'userPrompt' || interaction === 'delegationStarted'
      ? hostId
      : snapshot.id;
    this.socialQueue.push({
      key,
      visitorId: snapshot.id,
      hostId,
      firstSpeakerId,
      phase: 'queued',
      queuedAt: seconds,
      expiresAt: seconds + 90,
      talkStartedAt: 0,
      talkUntil: 0,
      returnDeadline: 0,
      visitorDepartureAt: behavior.departAt
    });
    if (isOwnerConversation) {
      this.ownerAutonomyAction = `cursor-conversation:${snapshot.id}`;
      this.nextOwnerAutonomyAt = Math.max(this.nextOwnerAutonomyAt, seconds + 14);
    }
    behavior.nextMoveAt = Math.max(behavior.nextMoveAt, seconds + 36);
    // A completed subagent must not disappear while it is waiting to hand its
    // result back. The original departure deadline is restored after the visit.
    behavior.departAt = Number.POSITIVE_INFINITY;
    if (this.socialQueue.length > 64) {
      const removed = this.socialQueue.splice(0, this.socialQueue.length - 64);
      for (const stale of removed) {
        this.restoreQueuedDeparture(stale, seconds);
      }
    }
  }

  private advanceAmbientSocialGroups(seconds: number): void {
    for (const group of [...this.ambientSocialGroups.values()]) {
      const invalidMember = group.members.some(member => {
        const behavior = this.agentBehaviors.get(member.id);
        const controller = this.agents.get(member.id);
        return !behavior
          || !controller
          || !controller.group.visible
          || behavior.phase !== 'present'
          || !isLeisureBehavior(behavior)
          || requestsAttention(member.id, behavior.status);
      });
      if (invalidMember) {
        this.finishAmbientSocialGroup(group, seconds);
        continue;
      }

      if (group.phase === 'gathering') {
        let everyoneArrived = true;
        for (const member of group.members) {
          const controller = this.agents.get(member.id)!;
          const distance = controller.getPosition().distanceTo(member.target.position);
          if (distance <= 0.18 && !controller.isMoving) {
            controller.stopMovement();
            controller.setRestPose(
              member.target.restPose,
              member.target.facing,
              member.target.visualOffset
            );
            controller.face(group.focus);
            controller.setActivity('listen');
            continue;
          }

          everyoneArrived = false;
          if (!controller.isMoving && distance > 0.18) {
            controller.setPath(this.navigation.plan(controller.group.position, member.target.position));
          }
        }

        if (everyoneArrived) {
          group.settledAt ??= seconds;
          if (seconds - group.settledAt >= 0.9) {
            group.phase = 'talking';
            group.talkStartedAt = seconds;
            group.talkUntil = seconds + ambientConversationDuration(group.key, group.venue);
          }
        } else {
          group.settledAt = undefined;
        }
        if (seconds >= group.gatherDeadline) {
          this.finishAmbientSocialGroup(group, seconds);
        }
        continue;
      }

      const speakerStep = Math.floor((seconds - group.talkStartedAt) / group.speakerCadence);
      const speakerIndex = (group.firstSpeakerIndex + speakerStep) % group.members.length;
      group.members.forEach((member, index) => {
        const controller = this.agents.get(member.id)!;
        controller.stopMovement();
        controller.face(group.focus);
        const isSpeaker = index === speakerIndex;
        controller.setActivity(isSpeaker ? 'talk' : 'listen');
        controller.setConversationMode(isSpeaker ? 'talk' : 'listen', index % 2 === 0 ? 'lower' : 'upper');
      });
      if (seconds >= group.talkUntil) {
        this.finishAmbientSocialGroup(group, seconds);
      }
    }
  }

  private finishAmbientSocialGroupsFor(ids: readonly string[], seconds: number): void {
    const participantIds = new Set(ids);
    for (const group of [...this.ambientSocialGroups.values()]) {
      if (group.members.some(member => participantIds.has(member.id))) {
        this.finishAmbientSocialGroup(group, seconds);
      }
    }
  }

  private finishAmbientSocialGroup(group: AmbientSocialGroup, seconds: number): void {
    if (!this.ambientSocialGroups.delete(group.key)) {
      return;
    }
    for (const member of group.members) {
      const controller = this.agents.get(member.id);
      const behavior = this.agentBehaviors.get(member.id);
      controller?.setConversationMode();
      if (!controller || !behavior) {
        this.poiManager.release(member.id);
        continue;
      }

      if (behavior.status === 'offline'
        || (behavior.status === 'completed' && behavior.kind === 'subagent')) {
        behavior.departAt = Number.isFinite(member.departureAt)
          ? Math.max(member.departureAt, seconds + 2.5)
          : seconds + 2.5;
      } else {
        behavior.departAt = member.departureAt;
      }

      if (behavior.phase !== 'present') {
        this.poiManager.release(member.id);
        continue;
      }
      if (!isLeisureBehavior(behavior) || requestsAttention(member.id, behavior.status)) {
        this.assignStatusDestination(member.id, controller, behavior);
        continue;
      }

      // Let the group naturally remain seated or standing for a short while
      // after the last exchange instead of everyone leaving in the same frame.
      behavior.destination = member.target;
      behavior.pendingDwellPoiId = undefined;
      behavior.nextMoveAt = seconds + variedSeconds(
        4,
        18,
        `${group.key}:after:${member.id}`
      );
      behavior.nextGestureAt = seconds + variedSeconds(
        3,
        12,
        `${group.key}:after-gesture:${member.id}`
      );
      controller.setActivity(activityForStatus(behavior.status));
      controller.setRestPose(
        member.target.restPose,
        member.target.facing,
        member.target.visualOffset
      );
    }
  }

  private updateSocialBehaviors(seconds: number): void {
    this.advanceAmbientSocialGroups(seconds);
    this.advanceSocialEncounters(seconds);
    this.startQueuedSocialEncounters(seconds);

    const sociallyBusy = new Set<string>();
    for (const encounter of this.socialEncounters.values()) {
      sociallyBusy.add(encounter.visitorId);
      if (encounter.phase !== 'returning') {
        sociallyBusy.add(encounter.hostId);
      }
    }
    for (const group of this.ambientSocialGroups.values()) {
      group.members.forEach(member => sociallyBusy.add(member.id));
    }
    for (const [id, behavior] of this.agentBehaviors) {
      if (!sociallyBusy.has(id)) {
        this.agents.get(id)?.setActivity(activityForStatus(behavior.status));
      }
    }

    // A quiet ambient fallback remains for agents waiting in the meeting room,
    // but real Cursor interactions always take priority over it.
    const waiting = [...this.agentBehaviors.entries()]
      .filter(([id, behavior]) => behavior.phase === 'present'
        && behavior.status === 'waitingForUser'
        && !sociallyBusy.has(id))
      .map(([id]) => id)
      .sort();
    for (let index = 0; index < waiting.length; index += 2) {
      const left = this.agents.get(waiting[index]);
      const rightId = waiting[index + 1];
      const right = rightId ? this.agents.get(rightId) : undefined;
      if (!left || left.isMoving) {
        continue;
      }
      if (!right || right.isMoving) {
        left.setActivity('listen');
        continue;
      }
      const leftTalks = (Math.floor(seconds / 6.5) + index / 2) % 2 === 0;
      left.setActivity(leftTalks ? 'talk' : 'listen');
      right.setActivity(leftTalks ? 'listen' : 'talk');
    }
  }

  private startQueuedSocialEncounters(seconds: number): void {
    for (let index = 0; index < this.socialQueue.length;) {
      const encounter = this.socialQueue[index];
      if (seconds >= encounter.expiresAt) {
        this.restoreQueuedDeparture(encounter, seconds);
        this.socialQueue.splice(index, 1);
        continue;
      }
      const visitor = this.characterFor(encounter.visitorId);
      const host = this.characterFor(encounter.hostId);
      const visitorBehavior = this.agentBehaviors.get(encounter.visitorId);
      const hostBehavior = encounter.hostId === 'owner'
        ? undefined
        : this.agentBehaviors.get(encounter.hostId);
      if (!visitor || !host || (visitorBehavior && visitorBehavior.phase !== 'present')
        || (hostBehavior && hostBehavior.phase !== 'present')
        || host.isMoving
        || this.isSociallyBusy(encounter.visitorId)
        || this.isSociallyBusy(encounter.hostId)) {
        index += 1;
        continue;
      }

      const approach = this.findConversationApproach(
        visitor,
        host,
        visitorBehavior?.index ?? this.ownerAutonomySequence
      );
      if (!approach) {
        index += 1;
        continue;
      }
      encounter.visitorRestState = visitor.getRestState();
      encounter.visitorReturnPosition = visitor.getPosition();
      encounter.hostRestState = host.getRestState();
      encounter.meetingPosition = approach.position;
      encounter.phase = 'approaching';
      visitor.setConversationMode();
      host.setConversationMode();
      visitor.setRestPose('stand');
      visitor.setPath(approach.path);
      this.socialEncounters.set(encounter.key, encounter);
      this.socialQueue.splice(index, 1);
    }
  }

  private advanceSocialEncounters(seconds: number): void {
    for (const encounter of [...this.socialEncounters.values()]) {
      const visitor = this.characterFor(encounter.visitorId);
      const host = this.characterFor(encounter.hostId);
      if (!visitor || !host) {
        visitor?.setConversationMode();
        host?.setConversationMode();
        this.restoreQueuedDeparture(encounter, seconds);
        this.socialEncounters.delete(encounter.key);
        continue;
      }

      if (!visitor.group.visible || !host.group.visible) {
        if (encounter.phase !== 'returning') {
          this.finishSocialEncounter(encounter, visitor, host, seconds);
        }
        continue;
      }

      if (encounter.phase === 'approaching') {
        if (seconds >= encounter.expiresAt) {
          this.finishSocialEncounter(encounter, visitor, host, seconds);
          continue;
        }
        const distance = visitor.getPosition().distanceTo(host.getPosition());
        if (distance <= 1.72 && !visitor.isMoving) {
          visitor.stopMovement();
          visitor.face(host.getPosition());
          host.face(visitor.getPosition());
          encounter.phase = 'talking';
          encounter.talkStartedAt = seconds;
          encounter.talkUntil = seconds + socialDurationSeconds(encounter);
          continue;
        }
        if (!visitor.isMoving && !host.isMoving) {
          const behavior = this.agentBehaviors.get(encounter.visitorId);
          const approach = this.findConversationApproach(visitor, host, behavior?.index ?? 0);
          if (approach) {
            encounter.meetingPosition = approach.position;
            visitor.setPath(approach.path);
          }
        }
        continue;
      }

      if (encounter.phase === 'talking') {
        visitor.stopMovement();
        visitor.face(host.getPosition());
        host.face(visitor.getPosition());
        const speakerCadence = socialSpeakerCadence(encounter);
        const firstSpeaks = Math.floor((seconds - encounter.talkStartedAt) / speakerCadence) % 2 === 0;
        const speakerId = firstSpeaks
          ? encounter.firstSpeakerId
          : encounter.firstSpeakerId === encounter.visitorId ? encounter.hostId : encounter.visitorId;
        visitor.setConversationMode(speakerId === encounter.visitorId ? 'talk' : 'listen', 'lower');
        host.setConversationMode(speakerId === encounter.hostId ? 'talk' : 'listen', 'upper');
        if (seconds >= encounter.talkUntil) {
          this.finishSocialEncounter(encounter, visitor, host, seconds);
        }
        continue;
      }

      if (encounter.phase === 'returning'
        && (!visitor.isMoving || seconds >= encounter.returnDeadline)) {
        this.restoreQueuedDeparture(encounter, seconds);
        this.socialEncounters.delete(encounter.key);
      }
    }
  }

  private finishSocialEncounter(
    encounter: SocialEncounter,
    visitor: CharacterController,
    host: CharacterController,
    seconds: number
  ): void {
    visitor.setConversationMode();
    host.setConversationMode();
    if (encounter.hostRestState) {
      host.setRestPose(
        encounter.hostRestState.pose,
        encounter.hostRestState.facing,
        encounter.hostRestState.visualOffset
      );
    }
    const behavior = this.agentBehaviors.get(encounter.visitorId);
    const destination = behavior?.destination;
    if (destination && behavior?.phase === 'present') {
      visitor.setRestPose(destination.restPose, destination.facing, destination.visualOffset);
      visitor.setPath(this.navigation.plan(visitor.group.position, destination.position));
    } else if (encounter.visitorRestState) {
      visitor.setRestPose(
        encounter.visitorRestState.pose,
        encounter.visitorRestState.facing,
        encounter.visitorRestState.visualOffset
      );
      if (encounter.visitorId === 'owner' && encounter.visitorReturnPosition) {
        visitor.setPath(this.navigation.plan(visitor.group.position, encounter.visitorReturnPosition));
      }
    }
    encounter.phase = 'returning';
    encounter.returnDeadline = seconds + 24;
  }

  private restoreQueuedDeparture(encounter: SocialEncounter, seconds: number): void {
    const behavior = this.agentBehaviors.get(encounter.visitorId);
    if (!behavior || (behavior.status !== 'offline'
      && !(behavior.status === 'completed' && behavior.kind === 'subagent'))) {
      return;
    }
    behavior.departAt = Number.isFinite(encounter.visitorDepartureAt)
      ? Math.max(encounter.visitorDepartureAt, seconds + 2.5)
      : seconds + 2.5;
  }

  private findConversationApproach(
    visitor: CharacterController,
    host: CharacterController,
    seed: number
  ): { position: THREE.Vector3; path: THREE.Vector3[] } | undefined {
    const visitorPosition = visitor.getPosition();
    const hostPosition = host.getPosition();
    const currentDistance = visitorPosition.distanceTo(hostPosition);
    if (currentDistance >= 0.78 && currentDistance <= 1.62
      && this.navigation.isWalkable(visitorPosition)) {
      return { position: visitorPosition, path: [] };
    }

    const preferred = Math.atan2(visitorPosition.z - hostPosition.z, visitorPosition.x - hostPosition.x);
    const offsets = [0, 0.72, -0.72, 1.45, -1.45, Math.PI];
    for (const radius of [1.08, 1.28, 1.5]) {
      for (const offset of offsets) {
        const angle = preferred + offset + (seed % 3) * 0.08;
        const candidate = new THREE.Vector3(
          hostPosition.x + Math.cos(angle) * radius,
          0,
          hostPosition.z + Math.sin(angle) * radius
        );
        if (!this.navigation.isWalkable(candidate)) {
          continue;
        }
        const path = this.navigation.plan(visitorPosition, candidate);
        if (path.length > 0) {
          return { position: candidate, path };
        }
      }
    }
    return undefined;
  }

  private characterFor(id: string): CharacterController | undefined {
    return id === 'owner' ? this.owner : this.agents.get(id);
  }

  private isSociallyBusy(id: string): boolean {
    return [...this.socialEncounters.values()].some(encounter =>
      encounter.visitorId === id || (encounter.hostId === id && encounter.phase !== 'returning')
    ) || [...this.ambientSocialGroups.values()].some(group =>
      group.members.some(member => member.id === id)
    );
  }

  private updateAgentGestures(seconds: number): void {
    for (const [id, behavior] of this.agentBehaviors) {
      if (behavior.phase !== 'present') {
        continue;
      }
      const controller = this.agents.get(id);
      if (!controller || controller.isMoving) {
        continue;
      }

      if (requestsAttention(id, behavior.status)) {
        controller.setRestPose('stand', behavior.destination?.facing ?? Math.PI);
        if (this.owner) {
          controller.face(this.owner.getPosition());
        }
        if (!this.isSociallyBusy(id)
          && controller.visualState !== 'attention'
          && seconds >= behavior.nextGestureAt
          && controller.playGesture('attention')) {
          behavior.nextGestureAt = seconds + 9 + ((behavior.index * 3 + behavior.cycle * 5) % 7);
          behavior.cycle += 1;
        }
        continue;
      }

      if (behavior.celebrationPending) {
        if (!behavior.celebrationStarted) {
          controller.setRestPose('stand', behavior.destination?.facing ?? Math.PI);
          behavior.celebrationStarted = controller.playGesture(
            'celebrate',
            leisureGestureDuration(id, 'celebrate', behavior.cycle)
          );
        } else if (controller.visualState !== 'celebrate') {
          controller.setRestPose(
            behavior.destination?.restPose ?? 'stand',
            behavior.destination?.facing ?? Math.PI,
            behavior.destination?.visualOffset
          );
          behavior.celebrationPending = false;
        }
        continue;
      }

      if (!isLeisureBehavior(behavior)
        || this.isSociallyBusy(id)
        || seconds < behavior.nextGestureAt) {
        continue;
      }
      behavior.cycle += 1;
      const gesture = behavior.status === 'completed' && behavior.cycle % 3 === 0
        ? 'celebrate'
        : behavior.destination?.poiId.startsWith('kitchen-')
          ? 'drink'
          : behavior.cycle % 5 === 0
            ? 'stretch'
            : behavior.cycle % 3 === 0
          ? 'wave'
          : 'lookAround';
      if (gesture === 'wave' && this.owner) {
        controller.face(this.owner.getPosition());
      }
      const duration = leisureGestureDuration(id, gesture, behavior.cycle);
      if (controller.playGesture(gesture, duration)) {
        behavior.nextMoveAt = Math.max(behavior.nextMoveAt, seconds + duration + 0.8);
        behavior.nextGestureAt = seconds + duration
          + variedSeconds(5, 19, `${id}:gesture-gap:${behavior.cycle}`);
      } else {
        behavior.nextGestureAt = seconds + variedSeconds(1.5, 3.5, `${id}:gesture-retry:${behavior.cycle}`);
      }
    }
  }

  private updateAgentLifecycle(seconds: number): void {
    for (const [id, behavior] of this.agentBehaviors) {
      if (behavior.phase === 'present' && seconds >= behavior.departAt) {
        this.beginDeparture(id, seconds);
        continue;
      }
      if (behavior.phase !== 'departing') {
        continue;
      }
      const controller = this.agents.get(id);
      if (!controller) {
        behavior.phase = 'departed';
        continue;
      }
      const exit = departurePoint(behavior.index);
      if ((!controller.isMoving && controller.group.position.distanceTo(exit) < 0.38)
        || seconds >= behavior.removeAt) {
        this.scene.remove(controller.group);
        controller.dispose();
        this.agents.delete(id);
        this.agentWindowIds.delete(id);
        this.agentIdentityKeys.delete(id);
        this.poiManager.release(id);
        behavior.phase = 'departed';
        this.departedActivities.set(id, behavior.lastActivityAt);
        this.pruneDepartedRecords();
      }
    }
  }

  private beginDeparture(id: string, seconds = this.sceneSeconds): void {
    const behavior = this.agentBehaviors.get(id);
    const controller = this.agents.get(id);
    if (!behavior || !controller || behavior.phase === 'departed' || behavior.phase === 'departing') {
      return;
    }
    const exit = departurePoint(behavior.index);
    const direction = exit.clone().sub(controller.group.position);
    this.poiManager.release(id);
    behavior.destination = undefined;
    behavior.pendingDwellPoiId = undefined;
    behavior.phase = 'departing';
    behavior.removeAt = seconds + 42;
    behavior.nextMoveAt = Number.POSITIVE_INFINITY;
    controller.setRestPose('stand', Math.atan2(direction.x, direction.z));
    controller.setActivity('idle');
    controller.setPath(this.navigation.plan(controller.group.position, exit));
  }

  private scheduleSubagentRetirement(id: string, seconds: number): void {
    const behavior = this.agentBehaviors.get(id);
    const controller = this.agents.get(id);
    if (!behavior || !controller || behavior.kind !== 'subagent'
      || behavior.phase === 'departed' || behavior.phase === 'departing') {
      return;
    }
    if (behavior.retiring && Number.isFinite(behavior.departAt)) {
      return;
    }

    behavior.status = 'completed';
    behavior.retiring = true;
    behavior.statusChangedAt = seconds;
    behavior.departAt = seconds + retirementDelay('completed', behavior.index);
    behavior.removeAt = Number.POSITIVE_INFINITY;
    behavior.nextMoveAt = seconds + 3 + (behavior.index % 3) * 1.5;
    behavior.nextGestureAt = seconds + 4 + (behavior.index % 4);
    behavior.celebrationPending = true;
    behavior.celebrationStarted = false;
    controller.setState('completed', statusColors.completed);
    controller.setActivity('idle');
    this.assignStatusDestination(id, controller, behavior);
  }

  private persistWorldState(seconds: number): void {
    if (!this.owner || !this.onStateChanged || seconds < this.nextPersistAt) {
      return;
    }
    this.nextPersistAt = seconds + 0.75;
    const position = this.owner.getPosition();
    this.onStateChanged({
      ownerPosition: [position.x, position.y, position.z],
      cameraPosition: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      cameraTarget: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
      departedAgents: Object.fromEntries(this.departedActivities)
    });
  }

  private pruneDepartedRecords(): void {
    if (this.departedActivities.size <= 256) {
      return;
    }
    const keep = new Set(
      [...this.departedActivities.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 256)
        .map(([id]) => id)
    );
    for (const id of this.departedActivities.keys()) {
      if (!keep.has(id)) {
        this.departedActivities.delete(id);
        const behavior = this.agentBehaviors.get(id);
        if (behavior?.phase === 'departed') {
          this.agentBehaviors.delete(id);
        }
      }
    }
  }

  private buildLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0xdaf1ff, 0x253224, 2.0));
    const keyLight = new THREE.DirectionalLight(0xfff4df, 3.4);
    keyLight.position.set(4, 11, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -15;
    keyLight.shadow.camera.right = 15;
    keyLight.shadow.camera.top = 15;
    keyLight.shadow.camera.bottom = -15;
    this.scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x58c8ff, 18, 12, 2);
    fillLight.position.set(-5.4, 3.2, 2.5);
    this.scene.add(fillLight);
  }

  private addRug(position: [number, number, number], size: [number, number], color: number, opacity = 1): void {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.94,
      transparent: opacity < 1,
      opacity
    });
    const rug = new THREE.Mesh(new THREE.BoxGeometry(size[0], 0.018, size[1]), material);
    rug.position.set(position[0], position[1], position[2]);
    rug.receiveShadow = true;
    this.room.add(rug);
  }

  private createDesk(x: number, z: number, width: number, accent: number): void {
    const desk = new THREE.Group();
    desk.position.set(x, 0, z);
    addBox(desk, [width, 0.12, 0.92], [0, 0.78, 0], 0x80573d, { roughness: 0.68 });
    addBox(desk, [0.1, 0.76, 0.1], [-width * 0.4, 0.38, 0], 0x263944);
    addBox(desk, [0.1, 0.76, 0.1], [width * 0.4, 0.38, 0], 0x263944);

    const screenMaterial = new THREE.MeshStandardMaterial({
      color: 0x12222c,
      emissive: accent,
      emissiveIntensity: 0.5,
      roughness: 0.34
    });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(width * 0.45, 0.52, 0.07), screenMaterial);
    screen.position.set(0, 1.15, -0.18);
    screen.castShadow = true;
    desk.add(screen);
    addBox(desk, [0.08, 0.28, 0.08], [0, 0.94, -0.18], 0x263944);
    addBox(desk, [0.5, 0.025, 0.22], [0, 0.855, 0.18], 0x18252c, { roughness: 0.52 });
    for (const xOffset of [-0.18, -0.09, 0, 0.09, 0.18]) {
      for (const zOffset of [0.13, 0.19, 0.25]) {
        addBox(desk, [0.055, 0.012, 0.035], [xOffset, 0.874, zOffset], 0x5f717a, {
          roughness: 0.44,
          castShadow: false
        });
      }
    }
    addBox(desk, [0.22, 0.012, 0.28], [width * 0.31, 0.852, 0.18], 0x28343a, {
      roughness: 0.78,
      castShadow: false
    });
    const mouse = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 12, 8),
      standardMaterial(0x111b21, 0.38)
    );
    mouse.scale.set(0.78, 0.32, 1.15);
    mouse.position.set(width * 0.31, 0.886, 0.18);
    mouse.castShadow = true;
    desk.add(mouse);

    const chair = new THREE.Group();
    addBox(chair, [0.48, 0.08, 0.44], [0, 0.46, 0], 0x274655);
    addBox(chair, [0.48, 0.62, 0.08], [0, 0.76, 0.19], 0x274655);
    chair.position.set(0, 0, 0.86);
    desk.add(chair);
    this.room.add(desk);
  }

  private createKitchenette(): void {
    const kitchen = new THREE.Group();
    kitchen.position.set(-9.05, 0, 1.4);
    addBox(kitchen, [0.65, 0.88, 2.35], [0, 0.44, 0], 0x6c7d78, { roughness: 0.74 });
    addBox(kitchen, [0.72, 0.1, 2.45], [0.04, 0.92, 0], 0xb6a17f, { roughness: 0.62 });
    addBox(kitchen, [0.48, 0.72, 0.62], [0.02, 1.31, -0.55], 0x26343a, { roughness: 0.42 });
    addBox(kitchen, [0.04, 0.34, 0.36], [0.28, 1.36, -0.55], 0x101b21, { roughness: 0.36 });
    addBox(kitchen, [0.18, 0.04, 0.4], [0.34, 1.04, -0.55], 0x1a252b, { roughness: 0.4 });
    const machineLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x7ef5b3, emissive: 0x39d98a, emissiveIntensity: 1.2 })
    );
    machineLight.position.set(0.31, 1.43, -0.35);
    kitchen.add(machineLight);
    const sink = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.21, 0.025, 20),
      standardMaterial(0x526a73, 0.24)
    );
    sink.position.set(0.26, 0.98, 0.45);
    kitchen.add(sink);
    addBox(kitchen, [0.08, 0.35, 0.08], [0.35, 1.18, 0.7], 0x637a84, { roughness: 0.26 });
    addBox(kitchen, [0.2, 0.07, 0.07], [0.44, 1.34, 0.7], 0x637a84, { roughness: 0.26 });
    for (const z of [-0.02, 0.18]) {
      const mug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.06, 0.13, 12),
        standardMaterial(z < 0 ? 0x53a9cf : 0xe5c56f, 0.5)
      );
      mug.position.set(0.26, 1.06, z);
      kitchen.add(mug);
    }
    this.room.add(kitchen);
  }

  private createPlant(x: number, z: number, scale = 1): void {
    const plant = new THREE.Group();
    plant.position.set(x, 0, z);
    plant.scale.setScalar(scale);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.45, 12), standardMaterial(0xb86f4f));
    pot.position.y = 0.23;
    pot.castShadow = true;
    plant.add(pot);

    for (const [leafX, leafY, leafZ] of [
      [0, 0.77, 0],
      [-0.18, 0.66, 0.03],
      [0.18, 0.69, -0.06],
      [0.03, 0.9, 0.08]
    ] as const) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), standardMaterial(0x3d8a5d, 0.92));
      leaf.scale.set(0.75, 1.15, 0.65);
      leaf.position.set(leafX, leafY, leafZ);
      leaf.castShadow = true;
      plant.add(leaf);
    }

    this.room.add(plant);
  }

  private createMedielSoftWallLogo(): void {
    const loungeWall = partitionWalls.find(wall => wall.id === 'work-south-a');
    if (!loungeWall) {
      return;
    }

    // This is a real wall-mounted poster, not a camera-facing billboard. The
    // plane follows the lounge side of the partition and is offset by only a
    // few millimetres so it cannot flicker with the wall surface.
    const wallFrontZ = loungeWall.position[2] + loungeWall.size[2] / 2;
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
      // The PNG contains the green brush circle and white wordmark in its
      // alpha channel. Pixels around them also carry green RGB values but are
      // fully transparent; respecting alpha is what reveals the real logo.
      transparent: true,
      alphaTest: 0.01,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    logo.position.set(
      loungeWall.position[0],
      loungeWall.position[1],
      wallFrontZ + 0.008
    );
    logo.visible = false;
    this.room.add(logo);

    new THREE.TextureLoader().load(medielSoftLogoUrl, texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

      const image = texture.image as { width?: number; height?: number };
      const sourceWidth = Math.max(1, image.width ?? 1);
      const sourceHeight = Math.max(1, image.height ?? 1);
      const sourceAspect = sourceWidth / sourceHeight;
      const maxWidth = 2.08;
      const maxHeight = 2.08;
      const renderWidth = sourceAspect >= maxWidth / maxHeight
        ? maxWidth
        : maxHeight * sourceAspect;
      const renderHeight = sourceAspect >= maxWidth / maxHeight
        ? maxWidth / sourceAspect
        : maxHeight;

      logo.scale.set(renderWidth, renderHeight, 1);
      material.map = texture;
      material.needsUpdate = true;
      logo.visible = true;
    });
  }

  private buildOffice(): void {
    this.officeFloor = addBox(this.room, [19.8, 0.24, 12.8], [0, -0.15, 0], 0xc7b89d, { roughness: 0.96, castShadow: false });
    addBox(this.room, [19.8, 3.6, 0.16], [0, 1.67, -6.32], 0x203946, { castShadow: false });
    addBox(this.room, [0.16, 3.6, 12.8], [-9.82, 1.67, 0], 0x1a303b, { castShadow: false });
    addBox(this.room, [0.16, 3.6, 12.8], [9.82, 1.67, 0], 0x1a303b, { castShadow: false });
    partitionWalls.forEach(wall => addBox(this.room, wall.size, wall.position, wall.color, { castShadow: false }));
    this.createMedielSoftWallLogo();

    this.addRug([-7.42, -0.011, -3.45], [3.55, 4.75], 0x4f3a2a);
    this.addRug([-0.85, -0.011, -3.42], [8.25, 4.72], 0x29404a);
    this.addRug([6.58, -0.011, -3.42], [5.45, 4.72], 0x4b3035);
    this.addRug([-2.28, -0.011, 3.85], [8.4, 4.05], 0x3a3152);
    this.addRug([6.45, -0.011, 3.52], [5.75, 4.62], 0x284b50);
    this.addRug([-8.1, -0.011, 1.4], [2.55, 2.35], 0x40544b);

    for (const x of [-8.3, -6.7, -4.25, -2.3, -0.35, 1.6, 4.65, 6.55, 8.45]) {
      addBox(this.room, [1.45, 1.55, 0.055], [x, 2.18, -6.21], 0x9ed8ed, {
        emissive: 0x2a718d,
        roughness: 0.22,
        castShadow: false
      });
    }

    for (const [label, accent, x, z] of [
      ['ŘEDITELNA', '#f4b85c', -6.9, -0.98],
      ['STUDIO', '#39d98a', 0, -0.98],
      ['DEBUG LAB', '#ff5f6d', 6.2, -0.98],
      ['LOUNGE', '#9d7cff', -4.4, 1.04],
      ['PORADA', '#43b9c8', 6.2, 1.04],
      ['KUCHYŇKA', '#8fd4a8', -8.05, 0.05]
    ] as const) {
      const sign = createTextSprite(label, accent);
      sign.scale.set(1.34, 0.22, 1);
      sign.position.set(x, 2.52, z);
      this.room.add(sign);
    }

    this.createDesk(ownerDeskFixture.x, ownerDeskFixture.z, ownerDeskFixture.width, ownerDeskFixture.accent);
    agentDeskFixtures.forEach(item => this.createDesk(item.x, item.z, item.width, item.accent));
    this.createKitchenette();

    const meetingTable = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 0.13, 28),
      standardMaterial(0x6b4a3a, 0.66)
    );
    meetingTable.scale.z = 0.72;
    meetingTable.position.set(6.43, 0.72, 3.52);
    meetingTable.castShadow = true;
    this.room.add(meetingTable);
    addBox(this.room, [0.22, 0.7, 0.22], [6.43, 0.35, 3.52], 0x263944);

    for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      const chair = new THREE.Group();
      addBox(chair, [0.48, 0.08, 0.44], [0, 0.42, 0], 0x315967);
      addBox(chair, [0.48, 0.55, 0.08], [0, 0.69, 0.18], 0x315967);
      chair.position.set(6.43 + Math.cos(angle) * 1.63, 0, 3.52 + Math.sin(angle) * 1.28);
      chair.rotation.y = -angle + Math.PI / 2;
      this.room.add(chair);
    }

    const sofa = new THREE.Group();
    addBox(sofa, [loungeSofaFixture.width, 0.42, loungeSofaFixture.depth], [0, 0.34, 0], 0x514474);
    addBox(sofa, [loungeSofaFixture.width, 0.72, 0.2], [0, 0.72, loungeSofaFixture.depth / 2 - 0.1], 0x64558a);
    addBox(sofa, [0.2, 0.58, loungeSofaFixture.depth], [-loungeSofaFixture.width / 2, 0.43, 0], 0x64558a);
    addBox(sofa, [0.2, 0.58, loungeSofaFixture.depth], [loungeSofaFixture.width / 2, 0.43, 0], 0x64558a);
    sofa.position.set(loungeSofaFixture.x, 0, loungeSofaFixture.z);
    this.room.add(sofa);

    addBox(
      this.room,
      [loungeTableFixture.width, 0.12, loungeTableFixture.depth],
      [loungeTableFixture.x, 0.48, loungeTableFixture.z],
      0x6b4a3a
    );
    addBox(this.room, [0.1, 0.45, 0.1], [loungeTableFixture.x - 0.65, 0.23, loungeTableFixture.z], 0x263944);
    addBox(this.room, [0.1, 0.45, 0.1], [loungeTableFixture.x + 0.65, 0.23, loungeTableFixture.z], 0x263944);

    addBox(this.room, [3.35, 1.32, 0.09], [6.45, 1.86, -6.14], 0x15252d, {
      emissive: 0x6d2733,
      roughness: 0.5,
      castShadow: false
    });
    const debugLabel = createTextSprite('BUILD • TEST • REVIEW', '#ff5f6d');
    debugLabel.scale.set(1.65, 0.24, 1);
    debugLabel.position.set(6.45, 2.72, -6.03);
    this.room.add(debugLabel);

    addBox(this.room, [1.9, 0.92, 0.68], [-8.2, 0.46, 3.58], 0x304b57);
    addBox(this.room, [0.82, 0.48, 0.055], [-8.2, 1.08, 3.22], 0x16242b, { emissive: 0x275a70 });
    const receptionLabel = createTextSprite('VSTUP', '#6dcbe4');
    receptionLabel.scale.set(1.1, 0.2, 1);
    receptionLabel.position.set(-8.25, 1.72, 3.25);
    this.room.add(receptionLabel);

    this.createPlant(-8.75, -5.4, 0.9);
    this.createPlant(2.9, -5.4, 0.9);
    this.createPlant(8.95, -5.4, 0.86);
    this.createPlant(2.02, 5.5, 0.82);
    this.createPlant(8.95, 5.5, 0.84);
  }
}

function activityForStatus(status: AgentSnapshot['status']): CharacterActivity {
  switch (status) {
    case 'working': return 'work';
    case 'waitingForUser': return 'listen';
    case 'error': return 'concerned';
    case 'offline': return 'sleepy';
    default: return 'idle';
  }
}

function isLeisureStatus(status: AgentSnapshot['status']): boolean {
  return status === 'idle'
    || status === 'unknown'
    || status === 'waitingForUser'
    || status === 'completed';
}

function isLeisureBehavior(behavior: AgentBehavior): boolean {
  return behavior.retiring || isLeisureStatus(behavior.status);
}

function requestsAttention(id: string, status: AgentSnapshot['status']): boolean {
  return status === 'waitingForUser' && !id.startsWith('cursor-window-manager-');
}

function isRetiringSubagent(
  snapshot: AgentSnapshot,
  kind: NonNullable<AgentSnapshot['kind']>
): boolean {
  return kind === 'subagent'
    && (snapshot.status === 'completed'
      || snapshot.status === 'offline'
      || snapshot.interactionKind === 'handoffCompleted');
}

function retirementDelay(status: AgentSnapshot['status'], index: number): number {
  const baseSeconds = status === 'completed' ? 72 : status === 'error' ? 58 : 48;
  return baseSeconds + (index % 3) * 9;
}

function leisurePoiKinds(
  status: AgentSnapshot['status'],
  cycle: number
): readonly OfficePoiKind[] {
  if (status === 'waitingForUser') {
    return cycle % 5 === 0 ? ['kitchen', 'lounge'] : cycle % 3 === 0 ? ['lounge', 'meeting'] : ['meeting', 'lounge'];
  }
  if (status === 'completed') {
    return cycle % 4 === 0 ? ['kitchen', 'idle', 'lounge'] : ['lounge', 'idle'];
  }
  if (cycle % 4 === 0) {
    return ['kitchen', 'lounge', 'idle'];
  }
  if (cycle % 3 === 0) {
    return ['meeting', 'idle', 'lounge'];
  }
  return cycle % 2 === 0 ? ['lounge', 'idle'] : ['idle', 'lounge'];
}

function leisureDwellSeconds(id: string, behavior: AgentBehavior): number {
  const destination = behavior.destination;
  const poiId = destination?.poiId ?? 'fallback';
  let range: readonly [number, number];
  if (poiId.startsWith('kitchen-')) {
    range = [7, 24];
  } else if (destination?.restPose === 'sofaSeat') {
    range = [18, behavior.status === 'completed' ? 72 : 58];
  } else if (poiId.startsWith('meeting-')) {
    range = [12, 46];
  } else if (poiId.startsWith('lounge-')) {
    range = [14, behavior.status === 'completed' ? 62 : 48];
  } else {
    range = [10, 38];
  }
  return variedSeconds(range[0], range[1], `${id}:dwell:${poiId}:${behavior.cycle}`);
}

function leisureGestureDuration(id: string, gesture: CharacterGesture, cycle: number): number {
  const ranges: Record<CharacterGesture, readonly [number, number]> = {
    lookAround: [1.8, 5.8],
    wave: [1.5, 4.6],
    attention: [3.4, 3.4],
    stretch: [2.6, 6.8],
    drink: [3.1, 9.2],
    celebrate: [2.2, 5.1]
  };
  const [minimum, maximum] = ranges[gesture];
  return variedSeconds(minimum, maximum, `${id}:gesture:${gesture}:${cycle}`);
}

function socialDurationSeconds(encounter: SocialEncounter): number {
  const idleConversation = encounter.key.startsWith('ambient:')
    || encounter.key.startsWith('owner-ambient:');
  return idleConversation
    ? variedSeconds(6.5, 24, `${encounter.key}:duration`)
    : variedSeconds(8, 13, `${encounter.key}:duration`);
}

function socialSpeakerCadence(encounter: SocialEncounter): number {
  const idleConversation = encounter.key.startsWith('ambient:')
    || encounter.key.startsWith('owner-ambient:');
  return idleConversation
    ? variedSeconds(1.35, 4.4, `${encounter.key}:speaker-cadence`)
    : variedSeconds(1.8, 3.1, `${encounter.key}:speaker-cadence`);
}

function ambientConversationDuration(key: string, venue: AmbientSocialVenue): number {
  const ranges: Record<AmbientSocialVenue, readonly [number, number]> = {
    sofa: [16, 46],
    meeting: [13, 38],
    standing: [8, 29]
  };
  const [minimum, maximum] = ranges[venue];
  return variedSeconds(minimum, maximum, `${key}:group-duration`);
}

function ambientSpeakerCadence(key: string, venue: AmbientSocialVenue): number {
  const ranges: Record<AmbientSocialVenue, readonly [number, number]> = {
    sofa: [1.6, 4.8],
    meeting: [1.4, 4.1],
    standing: [1.2, 3.7]
  };
  const [minimum, maximum] = ranges[venue];
  return variedSeconds(minimum, maximum, `${key}:group-speaker-cadence`);
}

function variedSeconds(minimum: number, maximum: number, seed: string): number {
  if (maximum <= minimum) {
    return minimum;
  }
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unit = (hash >>> 0) / 0xffffffff;
  return minimum + (maximum - minimum) * unit;
}

function snapshotActivityTime(snapshot: AgentSnapshot): number {
  if (!snapshot.lastActivityAt) {
    return Date.now();
  }
  const parsed = Date.parse(snapshot.lastActivityAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function teamKeyFor(snapshot: AgentSnapshot): string {
  if (snapshot.kind === 'subagent' && snapshot.parentAgentId) {
    return snapshot.parentAgentId;
  }
  return snapshot.windowId ?? snapshot.id;
}

function logicalAgentIdentity(snapshot: AgentSnapshot): string {
  const value = snapshot.workspacePath?.trim()
    || snapshot.workspace?.trim()
    || snapshot.windowLabel?.split('·')[0]?.trim()
    || snapshot.id;
  return value.replace(/[\\/]+$/gu, '').toLocaleLowerCase('cs');
}

function appearanceKeyFor(snapshot: AgentSnapshot): string {
  const role = visualRoleFor(snapshot);
  return role === 'manager'
    ? `${role}:${logicalAgentIdentity(snapshot)}`
    : `${role}:${snapshot.id}`;
}

function encounterReferences(encounter: SocialEncounter, id: string): boolean {
  return encounter.visitorId === id || encounter.hostId === id || encounter.firstSpeakerId === id;
}

function rebindEncounter(encounter: SocialEncounter, previousId: string, nextId: string): void {
  if (encounter.visitorId === previousId) encounter.visitorId = nextId;
  if (encounter.hostId === previousId) encounter.hostId = nextId;
  if (encounter.firstSpeakerId === previousId) encounter.firstSpeakerId = nextId;
  encounter.key = encounter.key.replaceAll(previousId, nextId);
}

function stableSide(value: string): 1 | -1 {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash & 1) === 0 ? 1 : -1;
}

function routeClearsPoint(
  start: THREE.Vector3,
  route: readonly THREE.Vector3[],
  obstacle: THREE.Vector3,
  clearance: number
): boolean {
  let from = start;
  for (const to of route) {
    if (distanceToSegment2D(obstacle, from, to) < clearance) {
      return false;
    }
    from = to;
  }
  return true;
}

function distanceToSegment2D(point: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3): number {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared < 1e-8) {
    return Math.hypot(point.x - from.x, point.z - from.z);
  }
  const projection = THREE.MathUtils.clamp(
    ((point.x - from.x) * deltaX + (point.z - from.z) * deltaZ) / lengthSquared,
    0,
    1
  );
  return Math.hypot(
    point.x - (from.x + deltaX * projection),
    point.z - (from.z + deltaZ * projection)
  );
}
