import * as THREE from 'three';
import { navigationAnchors, officeObstacles, worldBounds, type OfficeObstacle } from './layout';

const defaultActorRadius = 0.26;
const defaultDynamicClearance = 0.66;

export class OfficeNavigation {
  public plan(start: THREE.Vector3, destination: THREE.Vector3, radius = defaultActorRadius): THREE.Vector3[] {
    const safeStart = this.isWalkable(start, radius) ? start.clone() : this.constrainDestination(start, radius);
    const safeDestination = this.constrainDestination(destination, radius);
    if (this.canTraverse(safeStart, safeDestination, radius)) {
      return [safeDestination];
    }

    const points = [
      safeStart,
      ...navigationAnchors.filter(point => this.isWalkable(point, radius)).map(point => point.clone()),
      safeDestination
    ];
    const path = this.findPath(points, radius);
    return path.length > 1 ? path.slice(1) : [];
  }

  /**
   * Plans around both furniture and the current character positions. This is
   * intentionally used as a recovery path instead of for every frame: static
   * A* stays cheap while a stalled traveler can still escape a temporary crowd.
   */
  public planAvoiding(
    start: THREE.Vector3,
    destination: THREE.Vector3,
    avoid: readonly THREE.Vector3[],
    radius = defaultActorRadius,
    clearance = defaultDynamicClearance
  ): THREE.Vector3[] {
    const safeStart = this.isWalkable(start, radius) ? start.clone() : this.constrainDestination(start, radius);
    const safeDestination = this.constrainDestination(destination, radius);
    const relevantAvoid = avoid
      .filter(point => point.distanceToSquared(safeDestination) > clearance * clearance * 0.72)
      .map(point => point.clone().setY(0));
    if (relevantAvoid.length === 0) {
      return this.plan(safeStart, safeDestination, radius);
    }

    const ringDistance = clearance + 0.18;
    const escapePoints = relevantAvoid.flatMap((point, obstacleIndex) =>
      Array.from({ length: 12 }, (_, step) => {
        const angle = ((step + obstacleIndex * 0.5) / 12) * Math.PI * 2;
        return new THREE.Vector3(
          point.x + Math.cos(angle) * ringDistance,
          0,
          point.z + Math.sin(angle) * ringDistance
        );
      })
    );
    const points = [
      safeStart,
      ...navigationAnchors.filter(point => this.isWalkable(point, radius)).map(point => point.clone()),
      ...escapePoints.filter(point => this.isWalkable(point, radius)),
      safeDestination
    ];
    const path = this.findPath(points, radius, (from, to) =>
      segmentClearsDynamicObstacles(from, to, relevantAvoid, clearance)
    );
    return path.length > 1 ? path.slice(1) : [];
  }

  public constrainDestination(position: THREE.Vector3, radius = defaultActorRadius): THREE.Vector3 {
    const candidate = this.clampToBounds(position, radius);
    if (this.isWalkable(candidate, radius)) {
      return candidate;
    }

    let nearest: THREE.Vector3 | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let ring = 1; ring <= 22; ring += 1) {
      const ringRadius = ring * 0.13;
      for (let step = 0; step < 32; step += 1) {
        const angle = (step / 32) * Math.PI * 2;
        const probe = this.clampToBounds(new THREE.Vector3(
          candidate.x + Math.cos(angle) * ringRadius,
          0,
          candidate.z + Math.sin(angle) * ringRadius
        ), radius);
        const distance = probe.distanceToSquared(candidate);
        if (distance < nearestDistance && this.isWalkable(probe, radius)) {
          nearest = probe;
          nearestDistance = distance;
        }
      }
      if (nearest) {
        return nearest;
      }
    }

    return navigationAnchors
      .filter(point => this.isWalkable(point, radius))
      .reduce((nearestPoint, point) =>
        point.distanceToSquared(candidate) < nearestPoint.distanceToSquared(candidate) ? point : nearestPoint
      )
      .clone();
  }

  public move(current: THREE.Vector3, delta: THREE.Vector3, radius = defaultActorRadius): THREE.Vector3 {
    const desired = this.clampToBounds(current.clone().add(delta), radius);
    if (this.canTraverse(current, desired, radius)) {
      return desired;
    }

    const slideX = this.clampToBounds(new THREE.Vector3(desired.x, current.y, current.z), radius);
    const slideZ = this.clampToBounds(new THREE.Vector3(current.x, current.y, desired.z), radius);
    const canSlideX = this.canTraverse(current, slideX, radius);
    const canSlideZ = this.canTraverse(current, slideZ, radius);
    if (canSlideX && canSlideZ) {
      return slideX.distanceToSquared(current) >= slideZ.distanceToSquared(current) ? slideX : slideZ;
    }
    if (canSlideX) return slideX;
    if (canSlideZ) return slideZ;
    return current.clone();
  }

  public isWalkable(position: THREE.Vector3, radius = defaultActorRadius): boolean {
    if (position.x < worldBounds.minX + radius || position.x > worldBounds.maxX - radius
      || position.z < worldBounds.minZ + radius || position.z > worldBounds.maxZ - radius) {
      return false;
    }
    return !officeObstacles.some(obstacle => pointInsideExpandedObstacle(position, obstacle, radius));
  }

  private canTraverse(from: THREE.Vector3, to: THREE.Vector3, radius: number): boolean {
    if (!this.isWalkable(from, radius) || !this.isWalkable(to, radius)) {
      return false;
    }
    return !officeObstacles.some(obstacle => segmentIntersectsExpandedObstacle(from, to, obstacle, radius));
  }

  private findPath(
    points: readonly THREE.Vector3[],
    radius: number,
    edgeAllowed: (from: THREE.Vector3, to: THREE.Vector3) => boolean = () => true
  ): THREE.Vector3[] {
    const goal = points.length - 1;
    const open = new Set<number>([0]);
    const previous = new Map<number, number>();
    const costs = new Map<number, number>([[0, 0]]);
    const estimates = new Map<number, number>([[0, points[0].distanceTo(points[goal])]]);

    while (open.size > 0) {
      const current = [...open].reduce((best, candidate) =>
        (estimates.get(candidate) ?? Number.POSITIVE_INFINITY) < (estimates.get(best) ?? Number.POSITIVE_INFINITY)
          ? candidate : best
      );
      if (current === goal) {
        return reconstruct(points, previous, goal);
      }

      open.delete(current);
      for (let neighbour = 0; neighbour < points.length; neighbour += 1) {
        if (neighbour === current
          || !this.canTraverse(points[current], points[neighbour], radius)
          || !edgeAllowed(points[current], points[neighbour])) {
          continue;
        }
        const tentative = (costs.get(current) ?? Number.POSITIVE_INFINITY)
          + points[current].distanceTo(points[neighbour]);
        if (tentative >= (costs.get(neighbour) ?? Number.POSITIVE_INFINITY)) {
          continue;
        }
        previous.set(neighbour, current);
        costs.set(neighbour, tentative);
        estimates.set(neighbour, tentative + points[neighbour].distanceTo(points[goal]));
        open.add(neighbour);
      }
    }
    return [];
  }

  private clampToBounds(position: THREE.Vector3, radius: number): THREE.Vector3 {
    position.x = THREE.MathUtils.clamp(position.x, worldBounds.minX + radius, worldBounds.maxX - radius);
    position.z = THREE.MathUtils.clamp(position.z, worldBounds.minZ + radius, worldBounds.maxZ - radius);
    position.y = 0;
    return position;
  }
}

function segmentClearsDynamicObstacles(
  from: THREE.Vector3,
  to: THREE.Vector3,
  obstacles: readonly THREE.Vector3[],
  clearance: number
): boolean {
  return obstacles.every(obstacle => {
    const fromDistance = distance2D(from, obstacle);
    const toDistance = distance2D(to, obstacle);
    if (fromDistance < clearance) {
      // A recovery route may start inside another character's personal space.
      // Permit only an edge that immediately increases the separation.
      const movement = to.clone().sub(from).setY(0);
      const outward = from.clone().sub(obstacle).setY(0);
      return toDistance > fromDistance + 0.06
        && movement.lengthSq() > 0.0001
        && movement.dot(outward) > 0;
    }
    return distanceToSegment2D(obstacle, from, to) >= clearance;
  });
}

function distance2D(left: THREE.Vector3, right: THREE.Vector3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function distanceToSegment2D(point: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3): number {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared < 1e-8) {
    return distance2D(point, from);
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

function pointInsideExpandedObstacle(point: THREE.Vector3, obstacle: OfficeObstacle, radius: number): boolean {
  return point.x >= obstacle.minX - radius && point.x <= obstacle.maxX + radius
    && point.z >= obstacle.minZ - radius && point.z <= obstacle.maxZ + radius;
}

function segmentIntersectsExpandedObstacle(
  from: THREE.Vector3,
  to: THREE.Vector3,
  obstacle: OfficeObstacle,
  radius: number
): boolean {
  const minX = obstacle.minX - radius;
  const maxX = obstacle.maxX + radius;
  const minZ = obstacle.minZ - radius;
  const maxZ = obstacle.maxZ + radius;
  let near = 0;
  let far = 1;
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;

  for (const [origin, delta, minimum, maximum] of [
    [from.x, deltaX, minX, maxX],
    [from.z, deltaZ, minZ, maxZ]
  ] as const) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    let first = (minimum - origin) / delta;
    let second = (maximum - origin) / delta;
    if (first > second) [first, second] = [second, first];
    near = Math.max(near, first);
    far = Math.min(far, second);
    if (near > far) return false;
  }
  return far >= 0 && near <= 1;
}

function reconstruct(
  points: readonly THREE.Vector3[],
  previous: ReadonlyMap<number, number>,
  goal: number
): THREE.Vector3[] {
  const indexes = [goal];
  let current = goal;
  while (previous.has(current)) {
    current = previous.get(current)!;
    indexes.unshift(current);
  }
  return indexes.map(index => points[index].clone());
}
