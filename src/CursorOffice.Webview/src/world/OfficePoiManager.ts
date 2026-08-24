import type { AgentDestination, OfficePoi, OfficePoiKind } from './layout';
import { officePois } from './layout';

export type ClaimedDestination = AgentDestination & { poiId: string };

/** Keeps chairs and activity spots exclusive so characters never stack. */
export class OfficePoiManager {
  private readonly occupiedByPoi = new Map<string, string>();
  private readonly poiByAgent = new Map<string, string>();

  public claim(
    agentId: string,
    kinds: readonly OfficePoiKind[],
    preferredIndex = 0,
    affinityKey = agentId
  ): ClaimedDestination | undefined {
    const currentId = this.poiByAgent.get(agentId);
    const current = currentId ? officePois.find(item => item.id === currentId) : undefined;
    if (current && kinds.includes(current.kind)) {
      return cloneDestination(current);
    }

    this.release(agentId);
    const candidates = officePois.filter(item => kinds.includes(item.kind));
    if (candidates.length === 0) {
      return undefined;
    }

    const start = positiveModulo(preferredIndex + stableHash(affinityKey), candidates.length);
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const candidate = candidates[(start + offset) % candidates.length];
      if (this.occupiedByPoi.has(candidate.id)) {
        continue;
      }
      this.occupiedByPoi.set(candidate.id, agentId);
      this.poiByAgent.set(agentId, candidate.id);
      return cloneDestination(candidate);
    }

    return undefined;
  }

  /** Claims an exact authored spot for deterministic scenes and future direct interactions. */
  public claimSpecific(agentId: string, poiId: string): ClaimedDestination | undefined {
    const candidate = officePois.find(item => item.id === poiId);
    if (!candidate) {
      return undefined;
    }
    const occupant = this.occupiedByPoi.get(poiId);
    if (occupant && occupant !== agentId) {
      return undefined;
    }
    this.release(agentId);
    this.occupiedByPoi.set(poiId, agentId);
    this.poiByAgent.set(agentId, poiId);
    return cloneDestination(candidate);
  }

  /**
   * Atomically reserves a complete authored formation. Existing occupants may
   * swap places only when every one of them participates in the same group.
   * A failed claim leaves all current reservations untouched.
   */
  public claimGroup(
    assignments: readonly { agentId: string; poiId: string }[]
  ): Map<string, ClaimedDestination> | undefined {
    const agentIds = new Set(assignments.map(item => item.agentId));
    const poiIds = new Set(assignments.map(item => item.poiId));
    if (agentIds.size !== assignments.length || poiIds.size !== assignments.length) {
      return undefined;
    }

    const pois = assignments.map(item => officePois.find(poi => poi.id === item.poiId));
    if (pois.some(poi => !poi)) {
      return undefined;
    }
    for (const assignment of assignments) {
      const occupant = this.occupiedByPoi.get(assignment.poiId);
      if (occupant && !agentIds.has(occupant)) {
        return undefined;
      }
    }

    for (const agentId of agentIds) {
      this.release(agentId);
    }
    const result = new Map<string, ClaimedDestination>();
    assignments.forEach((assignment, index) => {
      const poi = pois[index]!;
      this.occupiedByPoi.set(assignment.poiId, assignment.agentId);
      this.poiByAgent.set(assignment.agentId, assignment.poiId);
      result.set(assignment.agentId, cloneDestination(poi));
    });
    return result;
  }

  public release(agentId: string): void {
    const poiId = this.poiByAgent.get(agentId);
    if (!poiId) {
      return;
    }
    this.poiByAgent.delete(agentId);
    if (this.occupiedByPoi.get(poiId) === agentId) {
      this.occupiedByPoi.delete(poiId);
    }
  }

  /** Keeps an occupied destination stable when a logical actor receives a new runtime id. */
  public transferAgent(fromAgentId: string, toAgentId: string): void {
    if (fromAgentId === toAgentId) {
      return;
    }
    const poiId = this.poiByAgent.get(fromAgentId);
    this.release(toAgentId);
    if (!poiId) {
      return;
    }
    this.poiByAgent.delete(fromAgentId);
    if (this.occupiedByPoi.get(poiId) === fromAgentId) {
      this.occupiedByPoi.set(poiId, toAgentId);
      this.poiByAgent.set(toAgentId, poiId);
    }
  }

  public getPoiId(agentId: string): string | undefined {
    return this.poiByAgent.get(agentId);
  }

  public getOccupant(poiId: string): string | undefined {
    return this.occupiedByPoi.get(poiId);
  }
}

function cloneDestination(poi: OfficePoi): ClaimedDestination {
  return {
    poiId: poi.id,
    position: poi.position.clone(),
    restPose: poi.restPose,
    facing: poi.facing,
    visualOffset: poi.visualOffset?.clone()
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
