// Entity Types - Expanded for Insurance & Cause Analysis
export type EntityType =
  | "Person"
  | "Organization"
  | "Location"
  | "Concept"
  | "Event"
  | "Technology"
  // --- New Additions ---
  | "Activity"
  | "Case"
  | "Cause"       // Orange Node
  | "Effect"      // Red Node
  | "Product"
  | "Amount"
  | "Status"
  | "Time"
  | "Job"
  | "Outcome"
  | "Branch"
  | "Customer"
  | "Metric"
  | "Document"
  | "Unknown"     // Fallback
  | string;       // Allow dynamic strings from AI

// Relationship Types - Expanded for Causal Logic
export type RelationshipType =
  | "RELATED_TO"
  | "PART_OF"
  | "WORKS_AT"
  | "LOCATED_IN"
  | "MENTIONS"
  | "CREATED_BY"
  // --- New Additions ---
  | "CAUSES"            // Red Arrow
  | "RESULTED_IN"       // Red Arrow
  | "LED_TO"
  | "PERFORMS_ACTIVITY"
  | "OCCURRED_ON"
  | "VALUED_AT"
  | "HANDLED_BY"
  | "COVERED_UNDER"
  | "HAS_ATTRIBUTE"
  | "PROFILED_AS"
  | "CATEGORIZED_BY"
  | "REPORTED_VIA"
  | "SEQUENCE"
  | "SEQUENCE_AFTER"
  | string;             // Allow dynamic strings

// Entity Interface
export interface Entity {
  id: string;
  type: EntityType;
  label: string;
  properties: Record<string, any>;
  documentId?: string;
  metadata?: {
    source?: string;
    confidence?: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

// Relationship Interface
export interface Relationship {
  id: string;
  from: string; // Entity ID
  to: string;   // Entity ID
  type: RelationshipType;
  properties?: Record<string, any>;
  documentId?: string;
  confidence?: number;
  source?: string;
  createdAt?: string;
}

// Document Interface
export interface Document {
  id: string;
  filename: string;
  content: string;
  fileType: "text" | "pdf" | "csv" | "docx";
  uploadedAt: string;
  processedAt?: string;
  entityCount?: number;
  relationshipCount?: number;
  // Metadata for grouping (L1/L2 etc)
  domain?: string;
  level?: string;
}

// Extracted Entity (from AI)
export interface ExtractedEntity {
  id?: string;
  type: EntityType;
  label: string;
  properties?: Record<string, any>;
  confidence?: number;
}

// Extracted Relationship (from AI)
export interface ExtractedRelationship {
  from: string; // Entity label or ID
  to: string;   // Entity label or ID
  type: RelationshipType;
  confidence?: number;
  properties?: Record<string, any>;
}

// Entity Extraction Result
export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

// Graph Data for Visualization
export interface GraphData {
  nodes: Entity[];
  edges: Relationship[];
}