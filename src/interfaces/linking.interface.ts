/**
 * CEDA-48: Bidirectional Linking Interfaces
 *
 * Defines types for bidirectional linking between patterns and observations.
 * Enables network traversal and relationship discovery across the knowledge graph.
 */

/**
 * Types of entities that can be linked
 */
export type LinkableType = 'pattern' | 'observation';

/**
 * Types of links between entities
 */
export type LinkType = 'derived_from' | 'supports' | 'contradicts' | 'related' | 'refines';

/**
 * A linkable node in the knowledge graph
 */
export interface LinkableNode {
  /** Unique node identifier */
  id: string;
  /** Type of the linkable entity */
  type: LinkableType;
  /** Reference to the original entity ID */
  entityId: string;
  /** Company identifier for multi-tenant isolation */
  company: string;
  /** User identifier */
  user: string;
  /** Display name for the node */
  name: string;
  /** Optional description */
  description?: string;
  /** Outgoing links to other nodes */
  links: Link[];
  /** Incoming links from other nodes (computed) */
  backlinks: Link[];
  /** Timestamp when node was created */
  createdAt: Date;
  /** Timestamp when node was last updated */
  updatedAt: Date;
}

/**
 * A link between two nodes
 */
export interface Link {
  /** Unique link identifier */
  id: string;
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Type of relationship */
  linkType: LinkType;
  /** Optional weight/strength of the link (0-1) */
  weight?: number;
  /** Optional metadata about the link */
  metadata?: Record<string, unknown>;
  /** Timestamp when link was created */
  createdAt: Date;
}

/**
 * Request payload for wrapping an entity as a linkable node
 */
export interface WrapEntityDto {
  /** Company identifier (required) */
  company: string;
  /** User identifier (required) */
  user: string;
  /** Optional display name override */
  name?: string;
  /** Optional description */
  description?: string;
}

/**
 * Request payload for creating a link between entities
 */
export interface CreateLinkDto {
  /** Source entity ID */
  sourceId: string;
  /** Source entity type */
  sourceType: LinkableType;
  /** Target entity ID */
  targetId: string;
  /** Target entity type */
  targetType: LinkableType;
  /** Type of link relationship */
  linkType: LinkType;
  /** Optional weight/strength (0-1) */
  weight?: number;
  /** Company identifier (required) */
  company: string;
  /** User identifier (required) */
  user: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Query parameters for network traversal
 */
export interface NetworkQueryParams {
  /** Starting entity ID */
  entityId: string;
  /** Entity type */
  entityType: LinkableType;
  /** Maximum depth for traversal (default: 2) */
  depth?: number;
  /** Company identifier for filtering */
  company: string;
  /** User identifier for access control */
  user: string;
  /** Optional filter by link types */
  linkTypes?: LinkType[];
}

/**
 * Node in the network graph response
 */
export interface NetworkNode {
  /** Node ID */
  id: string;
  /** Entity ID */
  entityId: string;
  /** Entity type */
  type: LinkableType;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Distance from the starting node */
  depth: number;
}

/**
 * Edge in the network graph response
 */
export interface NetworkEdge {
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Link type */
  linkType: LinkType;
  /** Link weight */
  weight?: number;
}

/**
 * Network graph response
 */
export interface NetworkGraph {
  /** Nodes in the network */
  nodes: NetworkNode[];
  /** Edges in the network */
  edges: NetworkEdge[];
  /** Total node count */
  nodeCount: number;
  /** Total edge count */
  edgeCount: number;
  /** Starting entity ID */
  rootId: string;
  /** Maximum depth traversed */
  depth: number;
}

/**
 * Related pattern result
 */
export interface RelatedPattern {
  /** Pattern ID */
  patternId: string;
  /** Pattern name */
  name: string;
  /** Relationship type */
  linkType: LinkType;
  /** Relationship strength (0-1) */
  strength: number;
  /** Number of shared observations */
  sharedObservations: number;
}

/**
 * Response for wrap operation
 */
export interface WrapResponse {
  /** Whether the wrap was successful */
  wrapped: boolean;
  /** The created or existing linkable node */
  node: LinkableNode;
  /** Whether this was a new node or existing */
  isNew: boolean;
}

/**
 * Response for link operation
 */
export interface LinkResponse {
  /** Whether the link was successful */
  linked: boolean;
  /** The created link */
  link: Link;
  /** Whether this was a new link or existing */
  isNew: boolean;
}
