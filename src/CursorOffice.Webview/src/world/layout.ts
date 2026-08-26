import * as THREE from 'three';
import type { AgentStatus } from '../contracts';

export type Bounds2D = { minX: number; maxX: number; minZ: number; maxZ: number };
export type OfficeObstacle = Bounds2D & { id: string };
export type WallFixture = {
  id: string;
  size: [number, number, number];
  position: [number, number, number];
  color: number;
};
export type DeskFixture = {
  id: string;
  x: number;
  z: number;
  width: number;
  accent: number;
  seat: THREE.Vector3;
  facing: number;
  restPose: 'workSeat' | 'stand';
};
export type SofaFixture = {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  seatApproachZ: number;
  seatXs: readonly number[];
  seatedVisualOffset: THREE.Vector3;
};
export type TableFixture = {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
};
export type AgentDestination = {
  position: THREE.Vector3;
  restPose: 'stand' | 'workSeat' | 'loungeSeat' | 'sofaSeat';
  facing: number;
  /** Local-space presentation offset applied only while seated. */
  visualOffset?: THREE.Vector3;
};
export type OfficePoiKind = 'desk' | 'hotdesk' | 'meeting' | 'lounge' | 'kitchen' | 'coffee' | 'idle' | 'social' | 'debug';
export type OfficePoi = AgentDestination & {
  id: string;
  kind: OfficePoiKind;
};
export type DoorPortal = {
  id: string;
  center: THREE.Vector3;
  /** Direction in which a character crosses the wall. */
  travelAxis: 'x' | 'z';
  /** Half of the clear opening measured perpendicular to travel. */
  halfWidth: number;
};

export const worldBounds: Bounds2D = { minX: -9.5, maxX: 9.5, minZ: -6, maxZ: 6 };
export const ownerStart = new THREE.Vector3(-8.55, 0, 5.35);
export const ownerDesk = new THREE.Vector3(-7.05, 0, -3.15);
export const agentExit = new THREE.Vector3(-8.55, 0, 5.55);

export const ownerDeskFixture: DeskFixture = {
  id: 'owner-desk',
  x: -7.05,
  z: -4.05,
  width: 2.55,
  accent: 0xf4b85c,
  seat: ownerDesk,
  facing: Math.PI,
  restPose: 'workSeat'
};

/**
 * Sitting desks face each other across a center aisle so the door corridor
 * stays empty. Extra agents overflow onto standing hot-desks, not onto seats
 * stacked in doorways.
 */
export const agentDeskFixtures: readonly DeskFixture[] = [
  desk('work-a', -4.15, -2.05, 1.55, 0x39d98a, 0),
  desk('work-b', -2.3, -2.05, 1.55, 0xffbd4a, 0),
  desk('work-c', 2.2, -2.05, 1.55, 0x9d7cff, 0),
  desk('work-d', -4.15, -5.35, 1.55, 0x4da3ff),
  desk('work-e', -2.3, -5.35, 1.55, 0x43b9c8),
  desk('work-f', 2.2, -5.35, 1.55, 0xe880b5),
  desk('debug-a', 8.35, -2.05, 1.42, 0xff5f6d, 0),
  desk('debug-b', 8.35, -5.35, 1.42, 0xff8b63),
  desk('debug-c', 4.4, -5.35, 1.35, 0xff7a8a),
  desk('debug-d', 4.4, -2.85, 1.12, 0xff9a6a, 0, 'stand')
];
export const agentDesks = agentDeskFixtures.map(item => item.seat.clone());

/**
 * The walkable points stay in front of the solid sofa collider. Once seated,
 * the visual rig slides onto the cushion by seatedVisualOffset. Keeping both
 * values on one fixture prevents furniture and POI coordinates from drifting.
 */
export const loungeSofaFixture: SofaFixture = {
  id: 'lounge-sofa',
  x: -2.25,
  z: 4.96,
  width: 3.65,
  depth: 0.82,
  seatApproachZ: 4.18,
  seatXs: [-3.35, -2.35, -1.35],
  seatedVisualOffset: new THREE.Vector3(0, 0.08, -0.58)
};
export const loungeTableFixture: TableFixture = {
  id: 'lounge-table',
  x: -2.3,
  z: 3.22,
  width: 1.9,
  depth: 0.88
};

export const partitionWalls: readonly WallFixture[] = [
  wall('owner-east', 0.18, 5.38, -5.35, -3.31, 0x19313d),
  wall('debug-west', 0.18, 5.38, 3.65, -3.31, 0x19313d),
  wall('meeting-west', 0.18, 5.22, 3, 3.39, 0x1c3742),
  wall('owner-south-a', 2.1, 0.18, -8.55, -0.75, 0x1c3541),
  wall('owner-south-b', 0.9, 0.18, -5.8, -0.75, 0x1c3541),
  wall('work-south-a', 4.5, 0.18, -3.1, -0.75, 0x1c3541),
  wall('work-south-b', 2.8, 0.18, 2.25, -0.75, 0x1c3541),
  wall('debug-south-a', 1.9, 0.18, 4.6, -0.75, 0x1c3541),
  wall('debug-south-b', 2.8, 0.18, 8.25, -0.75, 0x1c3541),
  wall('meeting-north-a', 2.55, 0.18, 4.275, 0.75, 0x1d3a43),
  wall('meeting-north-b', 2.8, 0.18, 8.25, 0.75, 0x1d3a43)
];

/**
 * Narrow passages need dynamic traffic control in addition to static pathfinding.
 * Their centres and widths mirror the gaps between the partition wall fixtures.
 */
export const doorPortals: readonly DoorPortal[] = [
  door('owner-door', -6.875, -0.75, 'z', 1.25),
  door('studio-door', 0, -0.75, 'z', 1.7),
  door('debug-door', 6.2, -0.75, 'z', 1.3),
  door('meeting-door', 6.2, 0.75, 'z', 1.3)
];

export const navigationAnchors: readonly THREE.Vector3[] = [
  point(-8.55, 5.35), point(-7.2, 4.8), point(-6.1, 3.15), point(-4.5, 1.7),
  point(-8, 0), point(-6.9, -0.25), point(-6.9, -1.2), point(-7.05, -2.75),
  point(-4.7, 0), point(-2.2, 0), point(0, -0.25), point(0, -1.18),
  point(-4.15, -1.25), point(-2.3, -1.25), point(0, -1.25), point(2.2, -1.25),
  point(-4.15, -3.7), point(-2.3, -3.7), point(0, -3.7), point(2.2, -3.7),
  point(2.35, 0), point(4.45, 0), point(6.2, -0.25), point(6.2, -1.25),
  point(4.5, -1.25), point(6.2, -2.8), point(6.2, -3.7), point(6.2, -4.8),
  point(4.5, -3.7), point(8.35, -3.7), point(8.7, -1.25),
  point(-5.7, 2.6), point(-4.65, 4.05), point(-3.8, 4.12), point(-2.4, 4.12),
  point(-1.2, 4.12), point(-4.6, 4.55), point(-2.2, 2.2), point(-0.1, 2.2),
  point(-8.05, 0.75), point(-8.05, 1.75), point(-7.1, 0.95), point(-7.05, 1.85),
  point(-6.55, 2.55), point(-7.35, 2.55),
  point(-4.7, 5.45), point(-2.2, 5.55), point(0.35, 5.5), point(2.35, 4.8),
  point(6.2, 0.25), point(6.2, 1.2), point(4.55, 1.45), point(4.55, 3.5),
  point(4.75, 5.15), point(6.45, 5.2), point(8.25, 5.15), point(8.35, 3.5), point(8.25, 1.45)
];

export const meetingSpots = [point(4.72, 3.52), point(8.14, 3.52), point(6.43, 2.18), point(6.43, 4.88), point(5.05, 2.15), point(7.8, 4.88)];
export const loungeSpots = [
  ...loungeSofaFixture.seatXs.map(x => point(x, loungeSofaFixture.seatApproachZ)),
  point(-5.15, 4.45), point(-0.15, 4.4), point(1.4, 3.8)
];
export const kitchenSpots = [point(-8.05, 0.75), point(-8.05, 1.75)];
export const coffeeMachinePoiId = 'kitchen-0';
export const kitchenSinkPoiId = 'kitchen-1';
export const coffeeBreakSpots = [point(-7.1, 0.95), point(-7.05, 1.85), point(-6.55, 2.55)];
export const idleSpots = [point(-6.05, 3), point(-4.75, 2.15), point(-2.15, 2.25), point(0.15, 2.2), point(1.55, 4.65)];
export const errorSpots = [
  point(4.55, -3.7),
  point(5.15, -4.15),
  point(7.55, -3.7),
  point(8.15, -3.7),
  point(4.7, -1.85)
];

/** Authored open-floor formations used only by coordinated idle conversations. */
export const standingConversationGroups = [
  {
    id: 'social-west',
    focus: point(-5.0, 2.85),
    spots: [point(-5.65, 2.45), point(-4.35, 2.45), point(-5.55, 3.35), point(-4.45, 3.35)]
  },
  {
    id: 'social-east',
    focus: point(1.05, 3.35),
    spots: [point(0.4, 2.95), point(1.7, 2.95), point(0.5, 3.85), point(1.6, 3.85)]
  }
] as const;

export const officeObstacles: readonly OfficeObstacle[] = [
  ...partitionWalls.map(obstacleFromWall),
  obstacle('owner-desk', -8.325, -5.775, -4.52, -3.58),
  ...agentDeskFixtures.map(item => obstacle(item.id, item.x - item.width / 2, item.x + item.width / 2, item.z - 0.47, item.z + 0.47)),
  obstacle('meeting-table', 5.18, 7.68, 2.62, 4.42),
  obstacle(
    loungeSofaFixture.id,
    loungeSofaFixture.x - loungeSofaFixture.width / 2 - 0.125,
    loungeSofaFixture.x + loungeSofaFixture.width / 2 + 0.125,
    loungeSofaFixture.z - loungeSofaFixture.depth / 2 - 0.03,
    loungeSofaFixture.z + loungeSofaFixture.depth / 2 + 0.05
  ),
  obstacle(
    loungeTableFixture.id,
    loungeTableFixture.x - loungeTableFixture.width / 2,
    loungeTableFixture.x + loungeTableFixture.width / 2,
    loungeTableFixture.z - loungeTableFixture.depth / 2,
    loungeTableFixture.z + loungeTableFixture.depth / 2
  ),
  obstacle('reception', -9.15, -7.25, 3.15, 4.02),
  obstacle('kitchen-counter', -9.45, -8.65, 0.15, 2.65),
  obstacle('plant-owner', -9.1, -8.42, -5.78, -5.05),
  obstacle('plant-work', 2.88, 3.52, -5.82, -5.08),
  obstacle('plant-debug', 8.78, 9.42, -5.82, -5.08),
  obstacle('plant-lounge', 1.7, 2.35, 5.15, 5.82),
  obstacle('plant-meeting', 8.62, 9.28, 5.18, 5.82)
];

export const officePois: readonly OfficePoi[] = [
  ...agentDeskFixtures.map((item, index) => poi(`desk-${index}`, 'desk', item.seat, item.restPose, item.facing)),
  ...meetingSpots.map((item, index) => poi(
    `meeting-${index}`,
    'meeting',
    item,
    index < 4 ? 'loungeSeat' : 'stand',
    facingTowardMeeting(index)
  )),
  ...loungeSpots.map((item, index) => poi(
    `lounge-${index}`,
    'lounge',
    item,
    index < 3 ? 'sofaSeat' : 'stand',
    Math.PI,
    index < 3 ? loungeSofaFixture.seatedVisualOffset : undefined
  )),
  ...kitchenSpots.map((item, index) => poi(
    `kitchen-${index}`,
    'kitchen',
    item,
    'stand',
    -Math.PI / 2
  )),
  ...coffeeBreakSpots.map((item, index) => poi(
    `coffee-break-${index}`,
    'coffee',
    item,
    'stand',
    -Math.PI / 2
  )),
  ...idleSpots.map((item, index) => poi(
    `idle-${index}`,
    'idle',
    item,
    'stand',
    Math.PI * (index % 2 === 0 ? 0.5 : -0.5)
  )),
  ...standingConversationGroups.flatMap(group => group.spots.map((item, index) => poi(
    `${group.id}-${index}`,
    'social',
    item,
    'stand',
    Math.atan2(group.focus.x - item.x, group.focus.z - item.z)
  ))),
  ...errorSpots.map((item, index) => poi(`debug-${index}`, 'debug', item, 'stand', Math.PI)),
  ...buildStandingWorkSpots().map((item, index) => poi(
    `hotdesk-${index}`,
    'hotdesk',
    item,
    'stand',
    standingWorkFacing(item)
  ))
];

export function spawnPoint(index: number): THREE.Vector3 {
  const slot = index % 10;
  return new THREE.Vector3(-8.55 + (slot % 5) * 0.68, 0, 5.45 - Math.floor(slot / 5) * 0.68);
}

export function departurePoint(index: number): THREE.Vector3 {
  return new THREE.Vector3(agentExit.x + (index % 2) * 0.18, 0, agentExit.z - Math.floor(index / 2) * 0.14);
}

export function targetForAgent(status: AgentStatus, index: number): AgentDestination {
  switch (status) {
    case 'working': return workingDestination(index);
    case 'waitingForUser': return destination(
      slot(meetingSpots, index),
      index % meetingSpots.length < 4 ? 'loungeSeat' : 'stand',
      facingTowardMeeting(index)
    );
    case 'error': return destination(slot(errorSpots, index), 'stand', Math.PI);
    case 'completed':
    case 'offline': return loungeDestination(index);
    case 'idle':
    case 'unknown':
    default: return destination(slot(idleSpots, index), index % idleSpots.length >= 5 ? 'loungeSeat' : 'stand', Math.PI);
  }
}

export function leisureTargetForAgent(index: number, cycle: number): AgentDestination {
  const mixedIndex = index + cycle * 3;
  if (cycle % 3 === 0) return destination(slot(idleSpots.slice(0, 5), mixedIndex), 'stand', Math.PI * 0.5);
  return loungeDestination(mixedIndex);
}

function desk(
  id: string,
  x: number,
  z: number,
  width: number,
  accent: number,
  facing = Math.PI,
  restPose: DeskFixture['restPose'] = 'workSeat'
): DeskFixture {
  const seatDistance = restPose === 'stand' ? 0.58 : 0.9;
  return {
    id,
    x,
    z,
    width,
    accent,
    facing,
    restPose,
    seat: new THREE.Vector3(x - Math.sin(facing) * seatDistance, 0, z - Math.cos(facing) * seatDistance)
  };
}

function workingDestination(index: number): AgentDestination {
  if (index < agentDeskFixtures.length) {
    const item = agentDeskFixtures[index];
    return destination(item.seat.clone(), item.restPose, item.facing);
  }
  return destination(overflowStandingSpot(index - agentDeskFixtures.length), 'stand', Math.PI);
}

function overflowStandingSpot(index: number): THREE.Vector3 {
  const authored = officePois.filter(item => item.kind === 'hotdesk').map(item => item.position);
  if (authored.length === 0) {
    return slot(idleSpots, index);
  }
  if (index < authored.length) {
    return authored[index].clone();
  }
  const extra = index - authored.length + 1;
  const base = authored[index % authored.length];
  const angle = extra * 2.399963229728653;
  const radius = 0.85 * Math.sqrt(extra);
  return new THREE.Vector3(base.x + Math.cos(angle) * radius, 0, base.z + Math.sin(angle) * radius);
}

function buildStandingWorkSpots(): THREE.Vector3[] {
  const spots: THREE.Vector3[] = [];
  const occupied = [
    ...agentDeskFixtures.map(item => item.seat),
    ownerDesk,
    ...errorSpots,
    ...idleSpots,
    ...loungeSpots,
    ...meetingSpots
  ];
  for (let x = -8.2; x <= 8.2; x += 1.05) {
    for (let z = -5.15; z <= 5.15; z += 1.05) {
      const candidate = point(x, z);
      if (!isOpenFloor(candidate, 0.3) || isDoorLane(candidate)) {
        continue;
      }
      if (occupied.some(item => distance2D(item, candidate) < 0.82)) {
        continue;
      }
      if (spots.some(item => distance2D(item, candidate) < 0.92)) {
        continue;
      }
      spots.push(candidate);
    }
  }
  return spots;
}

function standingWorkFacing(position: THREE.Vector3): number {
  return Math.atan2(-position.x, -position.z);
}

function isOpenFloor(position: THREE.Vector3, radius: number): boolean {
  if (position.x < worldBounds.minX + radius || position.x > worldBounds.maxX - radius
    || position.z < worldBounds.minZ + radius || position.z > worldBounds.maxZ - radius) {
    return false;
  }
  return !officeObstacles.some(item =>
    position.x >= item.minX - radius && position.x <= item.maxX + radius
    && position.z >= item.minZ - radius && position.z <= item.maxZ + radius
  );
}

function isDoorLane(position: THREE.Vector3): boolean {
  return doorPortals.some(portal => {
    const longitudinal = portal.travelAxis === 'x'
      ? position.x - portal.center.x
      : position.z - portal.center.z;
    const lateral = portal.travelAxis === 'x'
      ? position.z - portal.center.z
      : position.x - portal.center.x;
    return Math.abs(longitudinal) <= 1.4 && Math.abs(lateral) <= portal.halfWidth + 0.5;
  });
}

function distance2D(left: THREE.Vector3, right: THREE.Vector3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function wall(id: string, width: number, depth: number, x: number, z: number, color: number): WallFixture {
  return { id, size: [width, 2.8, depth], position: [x, 1.37, z], color };
}

function door(
  id: string,
  x: number,
  z: number,
  travelAxis: DoorPortal['travelAxis'],
  clearWidth: number
): DoorPortal {
  return { id, center: new THREE.Vector3(x, 0, z), travelAxis, halfWidth: clearWidth / 2 };
}

function obstacleFromWall(item: WallFixture): OfficeObstacle {
  return obstacle(item.id, item.position[0] - item.size[0] / 2, item.position[0] + item.size[0] / 2, item.position[2] - item.size[2] / 2, item.position[2] + item.size[2] / 2);
}

function obstacle(id: string, minX: number, maxX: number, minZ: number, maxZ: number): OfficeObstacle {
  return { id, minX, maxX, minZ, maxZ };
}

function destination(
  position: THREE.Vector3,
  restPose: AgentDestination['restPose'],
  facing: number,
  visualOffset?: THREE.Vector3
): AgentDestination {
  return { position, restPose, facing, visualOffset: visualOffset?.clone() };
}

function poi(
  id: string,
  kind: OfficePoiKind,
  position: THREE.Vector3,
  restPose: AgentDestination['restPose'],
  facing: number,
  visualOffset?: THREE.Vector3
): OfficePoi {
  return { id, kind, position: position.clone(), restPose, facing, visualOffset: visualOffset?.clone() };
}

function loungeDestination(index: number): AgentDestination {
  const normalizedIndex = positiveModulo(index, loungeSpots.length);
  return destination(
    slot(loungeSpots, index),
    normalizedIndex < 3 ? 'sofaSeat' : 'stand',
    Math.PI,
    normalizedIndex < 3 ? loungeSofaFixture.seatedVisualOffset : undefined
  );
}

function slot(spots: readonly THREE.Vector3[], index: number): THREE.Vector3 {
  const result = spots[index % spots.length].clone();
  const overflow = Math.floor(index / spots.length);
  if (overflow > 0) {
    result.x += (index % 2 === 0 ? 1 : -1) * Math.min(overflow * 0.18, 0.5);
    result.z += (overflow % 2 === 0 ? 1 : -1) * 0.18;
  }
  return result;
}

function point(x: number, z: number): THREE.Vector3 { return new THREE.Vector3(x, 0, z); }

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function facingTowardMeeting(index: number): number {
  const spot = meetingSpots[index % meetingSpots.length];
  return Math.atan2(6.43 - spot.x, 3.52 - spot.z);
}
