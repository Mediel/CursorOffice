import * as THREE from 'three';
import { doorPortals, type DoorPortal } from './layout';

export type DoorTraveler = {
  id: string;
  position: THREE.Vector3;
  remainingPath: readonly THREE.Vector3[];
  moving: boolean;
};

type DoorState = {
  holderId?: string;
  holderEntrySide: number;
  acquiredAt: number;
  queue: string[];
};

type ApproachingTraveler = {
  traveler: DoorTraveler;
  routeDistance: number;
};

const reservationApproachDistance = 1.55;
const releaseDistance = 0.72;
const reservationTimeout = 12;

/**
 * Serialises traffic through openings that are only wide enough for one actor.
 * Static navigation keeps actors out of walls; this manager handles the dynamic
 * case where two valid paths would otherwise meet in the same doorway.
 */
export class DoorTrafficManager {
  private readonly states = new Map<string, DoorState>(
    doorPortals.map(portal => [portal.id, {
      holderEntrySide: 1,
      acquiredAt: 0,
      queue: []
    }])
  );

  public update(travelers: readonly DoorTraveler[], seconds: number): ReadonlySet<string> {
    const travelerById = new Map(travelers.map(traveler => [traveler.id, traveler]));

    // Release after the holder's whole body has cleared the threshold. A bounded
    // timeout also makes the gate self-healing if an agent changes route mid-pass.
    for (const portal of doorPortals) {
      const state = this.state(portal);
      if (!state.holderId) {
        continue;
      }
      const holder = travelerById.get(state.holderId);
      const longitudinal = holder ? portalCoordinate(holder.position, portal) : 0;
      const clearedDoor = Boolean(holder)
        && state.holderEntrySide * longitudinal < -releaseDistance;
      const routeAbandoned = holder !== undefined
        && distance2D(holder.position, portal.center) > reservationApproachDistance + 0.7
        && routeToPortal(holder, portal) === undefined;
      if (!holder || !holder.moving || clearedDoor || routeAbandoned
        || seconds - state.acquiredAt >= reservationTimeout) {
        state.holderId = undefined;
      }
    }

    const heldTravelers = new Set(
      [...this.states.values()].map(state => state.holderId).filter((id): id is string => Boolean(id))
    );
    const approachingByPortal = new Map<string, ApproachingTraveler[]>();

    // A route can contain several doors. Only register its first upcoming one so
    // close passages cannot reserve the same traveler at the same time.
    for (const traveler of travelers) {
      if (!traveler.moving || heldTravelers.has(traveler.id)) {
        continue;
      }
      const nextDoor = firstUpcomingDoor(traveler);
      if (!nextDoor || nextDoor.routeDistance > reservationApproachDistance) {
        continue;
      }
      const candidates = approachingByPortal.get(nextDoor.portal.id) ?? [];
      candidates.push({ traveler, routeDistance: nextDoor.routeDistance });
      approachingByPortal.set(nextDoor.portal.id, candidates);
    }

    const waiting = new Set<string>();
    for (const portal of doorPortals) {
      const state = this.state(portal);
      const approaching = (approachingByPortal.get(portal.id) ?? [])
        .sort((left, right) => left.routeDistance - right.routeDistance || left.traveler.id.localeCompare(right.traveler.id));
      const approachingIds = new Set(approaching.map(item => item.traveler.id));
      state.queue = state.queue.filter(id => approachingIds.has(id));
      for (const item of approaching) {
        if (!state.queue.includes(item.traveler.id)) {
          state.queue.push(item.traveler.id);
        }
      }

      if (!state.holderId) {
        const nextId = state.queue.shift();
        if (nextId) {
          const holder = travelerById.get(nextId);
          state.holderId = nextId;
          state.holderEntrySide = holder ? entrySide(holder, portal) : 1;
          state.acquiredAt = seconds;
        }
      }

      for (const id of state.queue) {
        waiting.add(id);
      }
    }

    return waiting;
  }

  /** The core of a doorway is intentionally excluded from lateral separation. */
  public isInsideDoorCore(position: THREE.Vector3): boolean {
    return doorPortals.some(portal => {
      const longitudinal = Math.abs(portalCoordinate(position, portal));
      const lateral = Math.abs(lateralCoordinate(position, portal));
      return longitudinal <= 0.66 && lateral <= portal.halfWidth + 0.18;
    });
  }

  private state(portal: DoorPortal): DoorState {
    return this.states.get(portal.id)!;
  }
}

function firstUpcomingDoor(
  traveler: DoorTraveler
): { portal: DoorPortal; routeDistance: number } | undefined {
  let best: { portal: DoorPortal; routeDistance: number } | undefined;
  for (const portal of doorPortals) {
    const routeDistance = routeToPortal(traveler, portal);
    if (routeDistance === undefined || (best && routeDistance >= best.routeDistance)) {
      continue;
    }
    best = { portal, routeDistance };
  }
  return best;
}

function routeToPortal(traveler: DoorTraveler, portal: DoorPortal): number | undefined {
  const points = [traveler.position, ...traveler.remainingPath];
  let travelled = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const fromLongitudinal = portalCoordinate(from, portal);
    const toLongitudinal = portalCoordinate(to, portal);
    const delta = toLongitudinal - fromLongitudinal;
    if (Math.abs(delta) > 1e-6) {
      const fraction = -fromLongitudinal / delta;
      if (fraction >= 0 && fraction <= 1) {
        const crossing = from.clone().lerp(to, fraction);
        if (Math.abs(lateralCoordinate(crossing, portal)) <= portal.halfWidth + 0.08) {
          return travelled + from.distanceTo(crossing);
        }
      }
    }
    travelled += from.distanceTo(to);
  }
  return undefined;
}

function entrySide(traveler: DoorTraveler, portal: DoorPortal): number {
  const coordinate = portalCoordinate(traveler.position, portal);
  if (Math.abs(coordinate) > 0.03) {
    return Math.sign(coordinate);
  }
  const next = traveler.remainingPath[0];
  return next ? -Math.sign(portalCoordinate(next, portal)) || 1 : 1;
}

function portalCoordinate(position: THREE.Vector3, portal: DoorPortal): number {
  return portal.travelAxis === 'x'
    ? position.x - portal.center.x
    : position.z - portal.center.z;
}

function lateralCoordinate(position: THREE.Vector3, portal: DoorPortal): number {
  return portal.travelAxis === 'x'
    ? position.z - portal.center.z
    : position.x - portal.center.x;
}

function distance2D(left: THREE.Vector3, right: THREE.Vector3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}
