import { graphOps } from "./graph-operations";
import { azureOpenAI } from "./azure-openai";
import type { Entity, ExtractedEntity } from "@/types";

export class EntityResolver {
  
  /**
   * Smartly resolves a new extracted entity against the database.
   * Returns: The EXISTING entity (if found) or the NEW entity (if created).
   */
  async resolveAndCreate(extracted: ExtractedEntity, sourceId: string): Promise<Entity> {
    try {
      // --- FIX 1: Safely Handle Search Results ---
      // graphOps.searchEntities returns { entities: [], relationships: [] }
      // We must extract the array before using .find()
      const searchResult = await graphOps.searchEntities(extracted.label);
      const exactMatches = searchResult.entities || []; 

      // 1. Quick Check: Exact Label Match
      const exactMatch = exactMatches.find(e => e.label.toLowerCase() === extracted.label.toLowerCase());
      
      if (exactMatch) {
        console.log(`[Resolver] Exact match found: ${extracted.label}`);
        return exactMatch;
      }

      // 2. Fuzzy Check: Are there similar names?
      // (The searchEntities uses 'label ~ query' which handles partials)
      if (exactMatches.length > 0) {
        // 3. AI Disambiguation (The GraphRAG "Magic")
        // We pick the best candidate and ask the LLM
        const candidate = exactMatches[0];
        
        console.log(`[Resolver] Checking similarity: "${extracted.label}" vs "${candidate.label}"`);
        const isSame = await azureOpenAI.areEntitiesSame(extracted, candidate);

        if (isSame) {
            console.log(`[Resolver] Merging "${extracted.label}" into "${candidate.label}"`);
            // Optional: Merge new properties into existing entity
            return candidate;
        }
      }

      // 4. No match found -> Create New
      console.log(`[Resolver] Creating new entity: ${extracted.label}`);
      return await graphOps.createEntity({
        type: extracted.type,
        label: extracted.label,
        properties: extracted.properties || {},
        metadata: { source: sourceId, confidence: extracted.confidence },
      });

    } catch (error) {
      console.error("[Resolver] Error:", error);
      // Fallback: Create generic to avoid data loss
      return await graphOps.createEntity({
        type: extracted.type,
        label: extracted.label,
        properties: extracted.properties || {},
      });
    }
  }
}

export const entityResolver = new EntityResolver();