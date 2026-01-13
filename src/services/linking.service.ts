/**
 * CEDA-48: Linking Service
 *
 * Provides bidirectional linking between patterns and observations.
 * Enables network traversal and relationship discovery across the knowledge graph.
 */

import { Injectable } from '@nestjs/common';
import {
  LinkableNode,
  LinkableType,
  Link,
  LinkType,
  WrapEntityDto,
  CreateLinkDto,
  NetworkQueryParams,
  NetworkGraph,
  NetworkNode,
  NetworkEdge,
  RelatedPattern,
  WrapResponse,
  LinkResponse,
} from '../interfaces';
import { PatternLibraryService } from './pattern-library.service';
import { ObservationService } from './observation.service';

@Injectable()
export class LinkingService {
  private nodes: Map<string, LinkableNode> = new Map();
  private links: Map<string, Link> = new Map();

  constructor(
    private readonly patternLibrary: PatternLibraryService,
    private readonly observationService: ObservationService,
  ) {}

  /**
   * Generate a unique node ID based on entity type and ID
   */
  private generateNodeId(type: LinkableType, entityId: string): string {
    return `${type}_${entityId}`;
  }

  /**
   * Generate a unique link ID
   */
  private generateLinkId(): string {
    return `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Wrap a pattern as a linkable node
   */
  wrapPattern(patternId: string, company: string, user: string, dto?: Partial<WrapEntityDto>): WrapResponse {
    const nodeId = this.generateNodeId('pattern', patternId);

    const existingNode = this.nodes.get(nodeId);
    if (existingNode) {
      if (existingNode.company !== company) {
        console.warn(`[LinkingService] Access denied: pattern ${patternId} belongs to different company`);
        return {
          wrapped: false,
          node: existingNode,
          isNew: false,
        };
      }
      return {
        wrapped: true,
        node: this.computeBacklinks(existingNode),
        isNew: false,
      };
    }

    const pattern = this.patternLibrary.getPattern(patternId);
    if (!pattern) {
      console.warn(`[LinkingService] Pattern not found: ${patternId}`);
      throw new Error(`Pattern not found: ${patternId}`);
    }

    const now = new Date();
    const node: LinkableNode = {
      id: nodeId,
      type: 'pattern',
      entityId: patternId,
      company,
      user,
      name: dto?.name || pattern.name,
      description: dto?.description || pattern.description,
      links: [],
      backlinks: [],
      createdAt: now,
      updatedAt: now,
    };

    this.nodes.set(nodeId, node);
    console.log(`[LinkingService] Wrapped pattern: ${patternId} as node ${nodeId}`);

    return {
      wrapped: true,
      node,
      isNew: true,
    };
  }

  /**
   * Wrap an observation as a linkable node
   */
  async wrapObservation(observationId: string, company: string, user: string, dto?: Partial<WrapEntityDto>): Promise<WrapResponse> {
    const nodeId = this.generateNodeId('observation', observationId);

    const existingNode = this.nodes.get(nodeId);
    if (existingNode) {
      if (existingNode.company !== company) {
        console.warn(`[LinkingService] Access denied: observation ${observationId} belongs to different company`);
        return {
          wrapped: false,
          node: existingNode,
          isNew: false,
        };
      }
      return {
        wrapped: true,
        node: this.computeBacklinks(existingNode),
        isNew: false,
      };
    }

    const observation = await this.observationService.getObservation(observationId);
    if (!observation) {
      console.warn(`[LinkingService] Observation not found: ${observationId}`);
      throw new Error(`Observation not found: ${observationId}`);
    }

    if (observation.company !== company) {
      console.warn(`[LinkingService] Access denied: observation ${observationId} belongs to different company`);
      throw new Error(`Access denied: observation belongs to different company`);
    }

    const now = new Date();
    const node: LinkableNode = {
      id: nodeId,
      type: 'observation',
      entityId: observationId,
      company,
      user,
      name: dto?.name || `Observation: ${observation.input.substring(0, 50)}...`,
      description: dto?.description || observation.feedback,
      links: [],
      backlinks: [],
      createdAt: now,
      updatedAt: now,
    };

    this.nodes.set(nodeId, node);
    console.log(`[LinkingService] Wrapped observation: ${observationId} as node ${nodeId}`);

    return {
      wrapped: true,
      node,
      isNew: true,
    };
  }

  /**
   * Link an observation to a pattern (bidirectional)
   */
  async linkObservationToPattern(
    observationId: string,
    patternId: string,
    linkType: LinkType,
    company: string,
    user: string,
    weight?: number,
    metadata?: Record<string, unknown>,
  ): Promise<LinkResponse> {
    const observationNodeId = this.generateNodeId('observation', observationId);
    const patternNodeId = this.generateNodeId('pattern', patternId);

    let observationNode = this.nodes.get(observationNodeId);
    if (!observationNode) {
      const wrapResult = await this.wrapObservation(observationId, company, user);
      if (!wrapResult.wrapped) {
        throw new Error(`Failed to wrap observation: ${observationId}`);
      }
      observationNode = wrapResult.node;
    }

    let patternNode = this.nodes.get(patternNodeId);
    if (!patternNode) {
      const wrapResult = this.wrapPattern(patternId, company, user);
      if (!wrapResult.wrapped) {
        throw new Error(`Failed to wrap pattern: ${patternId}`);
      }
      patternNode = wrapResult.node;
    }

    if (observationNode.company !== company || patternNode.company !== company) {
      console.warn(`[LinkingService] Access denied: entities belong to different companies`);
      throw new Error(`Access denied: entities belong to different companies`);
    }

    const existingLink = observationNode.links.find(
      link => link.targetId === patternNodeId && link.linkType === linkType
    );
    if (existingLink) {
      console.warn(`[LinkingService] Link already exists: ${observationNodeId} -> ${patternNodeId}`);
      return {
        linked: true,
        link: existingLink,
        isNew: false,
      };
    }

    const linkId = this.generateLinkId();
    const now = new Date();
    const link: Link = {
      id: linkId,
      sourceId: observationNodeId,
      targetId: patternNodeId,
      linkType,
      weight,
      metadata,
      createdAt: now,
    };

    observationNode.links.push(link);
    observationNode.updatedAt = now;
    this.nodes.set(observationNodeId, observationNode);
    this.links.set(linkId, link);

    console.log(`[LinkingService] Linked: ${observationNodeId} -[${linkType}]-> ${patternNodeId}`);

    return {
      linked: true,
      link,
      isNew: true,
    };
  }

  /**
   * Create a generic link between any two entities
   */
  async createLink(dto: CreateLinkDto): Promise<LinkResponse> {
    const sourceNodeId = this.generateNodeId(dto.sourceType, dto.sourceId);
    const targetNodeId = this.generateNodeId(dto.targetType, dto.targetId);

    let sourceNode = this.nodes.get(sourceNodeId);
    if (!sourceNode) {
      if (dto.sourceType === 'pattern') {
        const wrapResult = this.wrapPattern(dto.sourceId, dto.company, dto.user);
        if (!wrapResult.wrapped) {
          throw new Error(`Failed to wrap source pattern: ${dto.sourceId}`);
        }
        sourceNode = wrapResult.node;
      } else {
        const wrapResult = await this.wrapObservation(dto.sourceId, dto.company, dto.user);
        if (!wrapResult.wrapped) {
          throw new Error(`Failed to wrap source observation: ${dto.sourceId}`);
        }
        sourceNode = wrapResult.node;
      }
    }

    let targetNode = this.nodes.get(targetNodeId);
    if (!targetNode) {
      if (dto.targetType === 'pattern') {
        const wrapResult = this.wrapPattern(dto.targetId, dto.company, dto.user);
        if (!wrapResult.wrapped) {
          throw new Error(`Failed to wrap target pattern: ${dto.targetId}`);
        }
        targetNode = wrapResult.node;
      } else {
        const wrapResult = await this.wrapObservation(dto.targetId, dto.company, dto.user);
        if (!wrapResult.wrapped) {
          throw new Error(`Failed to wrap target observation: ${dto.targetId}`);
        }
        targetNode = wrapResult.node;
      }
    }

    if (sourceNode.company !== dto.company || targetNode.company !== dto.company) {
      throw new Error(`Access denied: entities belong to different companies`);
    }

    const existingLink = sourceNode.links.find(
      link => link.targetId === targetNodeId && link.linkType === dto.linkType
    );
    if (existingLink) {
      return {
        linked: true,
        link: existingLink,
        isNew: false,
      };
    }

    const linkId = this.generateLinkId();
    const now = new Date();
    const link: Link = {
      id: linkId,
      sourceId: sourceNodeId,
      targetId: targetNodeId,
      linkType: dto.linkType,
      weight: dto.weight,
      metadata: dto.metadata,
      createdAt: now,
    };

    sourceNode.links.push(link);
    sourceNode.updatedAt = now;
    this.nodes.set(sourceNodeId, sourceNode);
    this.links.set(linkId, link);

    console.log(`[LinkingService] Created link: ${sourceNodeId} -[${dto.linkType}]-> ${targetNodeId}`);

    return {
      linked: true,
      link,
      isNew: true,
    };
  }

  /**
   * Get the network graph starting from a pattern
   */
  getPatternNetwork(patternId: string, depth: number, company: string, user: string, linkTypes?: LinkType[]): NetworkGraph {
    return this.getNetwork({
      entityId: patternId,
      entityType: 'pattern',
      depth,
      company,
      user,
      linkTypes,
    });
  }

  /**
   * Get the network graph starting from any entity
   */
  getNetwork(params: NetworkQueryParams): NetworkGraph {
    const { entityId, entityType, depth = 2, company, user, linkTypes } = params;
    const rootNodeId = this.generateNodeId(entityType, entityId);

    const nodes: Map<string, NetworkNode> = new Map();
    const edges: NetworkEdge[] = [];
    const visited: Set<string> = new Set();

    const addNode = (node: LinkableNode, currentDepth: number): void => {
      if (!nodes.has(node.id)) {
        nodes.set(node.id, {
          id: node.id,
          entityId: node.entityId,
          type: node.type,
          name: node.name,
          description: node.description,
          depth: currentDepth,
        });
      }
    };

    const traverse = (nodeId: string, currentDepth: number): void => {
      if (currentDepth > depth || visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);
      const node = this.nodes.get(nodeId);

      if (!node || node.company !== company) {
        return;
      }

      addNode(node, currentDepth);

      for (const link of node.links) {
        if (linkTypes && linkTypes.length > 0 && !linkTypes.includes(link.linkType)) {
          continue;
        }

        const targetNode = this.nodes.get(link.targetId);
        if (targetNode && targetNode.company === company) {
          addNode(targetNode, currentDepth + 1);
          edges.push({
            source: link.sourceId,
            target: link.targetId,
            linkType: link.linkType,
            weight: link.weight,
          });
          traverse(link.targetId, currentDepth + 1);
        }
      }

      for (const otherNode of this.nodes.values()) {
        if (otherNode.company !== company) continue;

        for (const link of otherNode.links) {
          if (link.targetId === nodeId) {
            if (linkTypes && linkTypes.length > 0 && !linkTypes.includes(link.linkType)) {
              continue;
            }

            addNode(otherNode, currentDepth + 1);
            const edgeExists = edges.some(
              e => e.source === link.sourceId && e.target === link.targetId
            );
            if (!edgeExists) {
              edges.push({
                source: link.sourceId,
                target: link.targetId,
                linkType: link.linkType,
                weight: link.weight,
              });
            }
            traverse(otherNode.id, currentDepth + 1);
          }
        }
      }
    };

    traverse(rootNodeId, 0);

    return {
      nodes: Array.from(nodes.values()),
      edges,
      nodeCount: nodes.size,
      edgeCount: edges.length,
      rootId: rootNodeId,
      depth,
    };
  }

  /**
   * Get related patterns for a given pattern
   */
  getRelatedPatterns(patternId: string, company: string, user: string): RelatedPattern[] {
    const patternNodeId = this.generateNodeId('pattern', patternId);
    const patternNode = this.nodes.get(patternNodeId);

    if (!patternNode || patternNode.company !== company) {
      return [];
    }

    const relatedPatterns: Map<string, RelatedPattern> = new Map();

    for (const link of patternNode.links) {
      const targetNode = this.nodes.get(link.targetId);
      if (targetNode && targetNode.type === 'pattern' && targetNode.company === company) {
        const pattern = this.patternLibrary.getPattern(targetNode.entityId);
        if (pattern) {
          relatedPatterns.set(targetNode.entityId, {
            patternId: targetNode.entityId,
            name: pattern.name,
            linkType: link.linkType,
            strength: link.weight || 0.5,
            sharedObservations: this.countSharedObservations(patternId, targetNode.entityId, company),
          });
        }
      }
    }

    for (const node of this.nodes.values()) {
      if (node.company !== company) continue;

      for (const link of node.links) {
        if (link.targetId === patternNodeId && node.type === 'pattern') {
          const pattern = this.patternLibrary.getPattern(node.entityId);
          if (pattern && !relatedPatterns.has(node.entityId)) {
            relatedPatterns.set(node.entityId, {
              patternId: node.entityId,
              name: pattern.name,
              linkType: link.linkType,
              strength: link.weight || 0.5,
              sharedObservations: this.countSharedObservations(patternId, node.entityId, company),
            });
          }
        }
      }
    }

    const observationNodeIds = new Set<string>();
    for (const node of this.nodes.values()) {
      if (node.company !== company || node.type !== 'observation') continue;

      const linksToPattern = node.links.some(link => link.targetId === patternNodeId);
      if (linksToPattern) {
        observationNodeIds.add(node.id);
      }
    }

    for (const obsNodeId of observationNodeIds) {
      const obsNode = this.nodes.get(obsNodeId);
      if (!obsNode) continue;

      for (const link of obsNode.links) {
        const targetNode = this.nodes.get(link.targetId);
        if (targetNode && targetNode.type === 'pattern' && targetNode.entityId !== patternId && targetNode.company === company) {
          const pattern = this.patternLibrary.getPattern(targetNode.entityId);
          if (pattern) {
            const existing = relatedPatterns.get(targetNode.entityId);
            if (existing) {
              existing.sharedObservations++;
              existing.strength = Math.min(1, existing.strength + 0.1);
            } else {
              relatedPatterns.set(targetNode.entityId, {
                patternId: targetNode.entityId,
                name: pattern.name,
                linkType: 'related',
                strength: 0.3,
                sharedObservations: 1,
              });
            }
          }
        }
      }
    }

    return Array.from(relatedPatterns.values()).sort((a, b) => b.strength - a.strength);
  }

  /**
   * Count shared observations between two patterns
   */
  private countSharedObservations(patternId1: string, patternId2: string, company: string): number {
    const patternNodeId1 = this.generateNodeId('pattern', patternId1);
    const patternNodeId2 = this.generateNodeId('pattern', patternId2);

    const observationsForPattern1 = new Set<string>();
    const observationsForPattern2 = new Set<string>();

    for (const node of this.nodes.values()) {
      if (node.company !== company || node.type !== 'observation') continue;

      for (const link of node.links) {
        if (link.targetId === patternNodeId1) {
          observationsForPattern1.add(node.entityId);
        }
        if (link.targetId === patternNodeId2) {
          observationsForPattern2.add(node.entityId);
        }
      }
    }

    let count = 0;
    for (const obsId of observationsForPattern1) {
      if (observationsForPattern2.has(obsId)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Compute backlinks for a node
   */
  private computeBacklinks(node: LinkableNode): LinkableNode {
    const backlinks: Link[] = [];

    for (const otherNode of this.nodes.values()) {
      for (const link of otherNode.links) {
        if (link.targetId === node.id) {
          backlinks.push(link);
        }
      }
    }

    return {
      ...node,
      backlinks,
    };
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string, company: string, user: string): LinkableNode | null {
    const node = this.nodes.get(nodeId);

    if (!node) {
      return null;
    }

    if (node.company !== company) {
      console.warn(`[LinkingService] Access denied: node ${nodeId} belongs to different company`);
      return null;
    }

    return this.computeBacklinks(node);
  }

  /**
   * Get node count
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Get link count
   */
  getLinkCount(): number {
    return this.links.size;
  }

  /**
   * Clear all nodes and links (for testing)
   */
  clearAll(): void {
    this.nodes.clear();
    this.links.clear();
  }
}
