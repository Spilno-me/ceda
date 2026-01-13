/**
 * CEDA-47: Document Management Interfaces
 *
 * Defines types for AI-native knowledge organization.
 * Documents are the atomic units of knowledge that can be linked,
 * searched, and traversed as a graph.
 */

/**
 * Document types for categorization
 */
export type DocumentType = 'pattern' | 'observation' | 'session' | 'insight' | 'note';

/**
 * Link types defining relationships between documents
 */
export type DocumentLinkType = 'references' | 'related' | 'parent' | 'derived_from';

/**
 * Represents a link between two documents
 */
export interface DocumentLink {
  /** ID of the document containing the link (source) */
  sourceId: string;
  /** ID of the document being linked to (target) */
  targetId: string;
  /** Type of relationship */
  linkType: DocumentLinkType;
  /** Timestamp when the link was created */
  createdAt: Date;
}

/**
 * Core document interface for AI-native knowledge organization
 */
export interface Document {
  /** Unique document identifier */
  id: string;
  /** Document type for categorization */
  type: DocumentType;
  /** Document title */
  title: string;
  /** Document content (markdown supported) */
  content: string;
  /** Company identifier for multi-tenant isolation */
  company: string;
  /** Project identifier (optional) */
  project?: string;
  /** User identifier - USER is the doorway for access */
  user: string;
  /** Tags for categorization and filtering */
  tags: string[];
  /** Outgoing links to other documents */
  links: DocumentLink[];
  /** Incoming links from other documents (computed) */
  backlinks: DocumentLink[];
  /** Vector embedding for semantic search (auto-generated) */
  embedding?: number[];
  /** Timestamp when document was created */
  createdAt: Date;
  /** Timestamp when document was last updated */
  updatedAt: Date;
}

/**
 * Request payload for creating a document
 */
export interface CreateDocumentDto {
  /** Document type */
  type: DocumentType;
  /** Document title */
  title: string;
  /** Document content */
  content: string;
  /** Company identifier (required) */
  company: string;
  /** Project identifier (optional) */
  project?: string;
  /** User identifier (required) */
  user: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Request payload for updating a document
 */
export interface UpdateDocumentDto {
  /** Document title (optional) */
  title?: string;
  /** Document content (optional) */
  content?: string;
  /** Tags for categorization (optional) */
  tags?: string[];
  /** Company identifier (required for authorization) */
  company: string;
  /** User identifier (required for authorization) */
  user: string;
}

/**
 * Request payload for linking documents
 */
export interface LinkDocumentDto {
  /** Target document ID to link to */
  targetId: string;
  /** Type of link relationship */
  linkType: DocumentLinkType;
  /** Company identifier (required for authorization) */
  company: string;
  /** User identifier (required for authorization) */
  user: string;
}

/**
 * Request payload for unlinking documents
 */
export interface UnlinkDocumentDto {
  /** Company identifier (required for authorization) */
  company: string;
  /** User identifier (required for authorization) */
  user: string;
}

/**
 * Query parameters for graph traversal
 */
export interface GraphQueryParams {
  /** Company identifier for filtering */
  company: string;
  /** Maximum depth for graph traversal (default: 2) */
  depth?: number;
  /** Starting document ID (optional, for subgraph) */
  startId?: string;
  /** User identifier for access control */
  user: string;
}

/**
 * Node in the document graph
 */
export interface GraphNode {
  /** Document ID */
  id: string;
  /** Document title */
  title: string;
  /** Document type */
  type: DocumentType;
  /** Tags */
  tags: string[];
}

/**
 * Edge in the document graph
 */
export interface GraphEdge {
  /** Source document ID */
  source: string;
  /** Target document ID */
  target: string;
  /** Link type */
  linkType: DocumentLinkType;
}

/**
 * Document graph response
 */
export interface DocumentGraph {
  /** Nodes in the graph */
  nodes: GraphNode[];
  /** Edges in the graph */
  edges: GraphEdge[];
  /** Total node count */
  nodeCount: number;
  /** Total edge count */
  edgeCount: number;
}

/**
 * Search query parameters
 */
export interface DocumentSearchParams {
  /** Search query string */
  query: string;
  /** Company identifier for filtering */
  company: string;
  /** User identifier for access control */
  user: string;
  /** Filter by document type (optional) */
  type?: DocumentType;
  /** Filter by tags (optional) */
  tags?: string[];
  /** Maximum results to return (default: 20) */
  limit?: number;
}

/**
 * Search result with relevance score
 */
export interface DocumentSearchResult {
  /** The matching document */
  document: Document;
  /** Relevance score (0-1) */
  score: number;
}
