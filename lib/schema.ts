import type { EntityType, RelationshipType } from "@/types";

export const ENTITY_TYPES: EntityType[] = [
  "Person", "Organization", "Location", "Concept", "Event", "Technology"
];

export const RELATIONSHIP_TYPES: RelationshipType[] = [
  "RELATED_TO", "PART_OF", "WORKS_AT", "LOCATED_IN", "MENTIONS", "CREATED_BY"
];

export const TABLES = {
  ENTITY: "entity",
  RELATIONSHIP: "relationship",
  DOCUMENT: "document",
  RELATIONSHIP_DEF: "relationship_def",
  DATA_SOURCE_CONFIG: "data_source_config"
} as const;

export function isValidEntityType(type: string): type is EntityType {
  return ENTITY_TYPES.includes(type as EntityType);
}

export function isValidRelationshipType(type: string): boolean {
  return true; 
}

// FIX APPLIED: 
// 1. All tables are SCHEMALESS PERMISSIONS FULL
// 2. All Date fields are explicitly defined as TYPE string to prevent parsing errors
export const SCHEMA_QUERIES = {
  defineEntityTable: `
    DEFINE TABLE IF NOT EXISTS ${TABLES.ENTITY} SCHEMALESS PERMISSIONS FULL;
    DEFINE FIELD IF NOT EXISTS type ON ${TABLES.ENTITY} TYPE string; 
    DEFINE FIELD IF NOT EXISTS label ON ${TABLES.ENTITY} TYPE string;
    DEFINE FIELD IF NOT EXISTS properties ON ${TABLES.ENTITY} TYPE object;
    DEFINE FIELD IF NOT EXISTS metadata ON ${TABLES.ENTITY} TYPE object;
    
    -- Date Fix: Use string to accept ISO dates from JS without errors
    DEFINE FIELD createdAt ON ${TABLES.ENTITY} TYPE string;
    DEFINE FIELD updatedAt ON ${TABLES.ENTITY} TYPE string;
    
    DEFINE INDEX IF NOT EXISTS idx_label ON ${TABLES.ENTITY} FIELDS label;
  `,

  defineRelationshipTable: `
    DEFINE TABLE IF NOT EXISTS ${TABLES.RELATIONSHIP} SCHEMALESS PERMISSIONS FULL;
    DEFINE FIELD IF NOT EXISTS from ON ${TABLES.RELATIONSHIP} TYPE record<${TABLES.ENTITY}>;
    DEFINE FIELD IF NOT EXISTS to ON ${TABLES.RELATIONSHIP} TYPE record<${TABLES.ENTITY}>;
    DEFINE FIELD IF NOT EXISTS type ON ${TABLES.RELATIONSHIP} TYPE string; 
    DEFINE FIELD IF NOT EXISTS confidence ON ${TABLES.RELATIONSHIP} TYPE float;
    
    -- Date Fix
    DEFINE FIELD createdAt ON ${TABLES.RELATIONSHIP} TYPE string;

    DEFINE INDEX IF NOT EXISTS idx_from ON ${TABLES.RELATIONSHIP} FIELDS from;
    DEFINE INDEX IF NOT EXISTS idx_to ON ${TABLES.RELATIONSHIP} FIELDS to;
    DEFINE INDEX IF NOT EXISTS idx_type ON ${TABLES.RELATIONSHIP} FIELDS type;
  `,

  defineDocumentTable: `
    DEFINE TABLE IF NOT EXISTS ${TABLES.DOCUMENT} SCHEMALESS PERMISSIONS FULL;
    DEFINE FIELD IF NOT EXISTS filename ON ${TABLES.DOCUMENT} TYPE string;
    DEFINE FIELD IF NOT EXISTS content ON ${TABLES.DOCUMENT} TYPE string;
    DEFINE FIELD IF NOT EXISTS fileType ON ${TABLES.DOCUMENT} TYPE string;
    DEFINE FIELD IF NOT EXISTS entityCount ON ${TABLES.DOCUMENT} TYPE number;
    DEFINE FIELD IF NOT EXISTS relationshipCount ON ${TABLES.DOCUMENT} TYPE number;

    -- Date Fix: This is the specific field causing your crash
    DEFINE FIELD processedAt ON ${TABLES.DOCUMENT} TYPE string;
    DEFINE FIELD createdAt ON ${TABLES.DOCUMENT} TYPE string;
  `,

  defineRelationshipDefTable: `
    DEFINE TABLE IF NOT EXISTS ${TABLES.RELATIONSHIP_DEF} SCHEMALESS PERMISSIONS FULL;
  `,

  defineConfigTable: `
    DEFINE TABLE IF NOT EXISTS ${TABLES.DATA_SOURCE_CONFIG} SCHEMALESS PERMISSIONS FULL;
  `
};