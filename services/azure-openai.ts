import { OpenAIClient, AzureKeyCredential } from "@azure/openai";
import type { EntityExtractionResult } from "@/types";

export class AzureOpenAIService {
  private client: OpenAIClient | null = null;
  private maxRetries = 3;
  private baseDelay = 1000;

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;

    if (!endpoint || !apiKey) {
      console.warn("Azure OpenAI credentials not found.");
      return;
    }

    try {
      this.client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
    } catch (error) {
      console.error("Failed to initialize Azure OpenAI client:", error);
    }
  }

  // --- 1. GENERIC COMPLETION (For Community Summaries) ---
  // Used by: services/graph-analytics.ts
  async generateCompletion(prompt: string, jsonMode: boolean = true): Promise<any> {
    return this.callOpenAI(prompt, 0.5, jsonMode);
  }

  // --- 2. ENTITY COMPARISON (For Entity Resolution) ---
  // Used by: services/entity-resolver.ts
  async areEntitiesSame(newEntity: any, existingEntity: any): Promise<boolean> {
      const prompt = `
        Task: Entity Resolution
        Compare these two entities and determine if they refer to the SAME real-world object or person.
        
        Entity A: "${newEntity.label}" (Type: ${newEntity.type})
        Context A: ${JSON.stringify(newEntity.properties)}

        Entity B: "${existingEntity.label}" (Type: ${existingEntity.type})
        Context B: ${JSON.stringify(existingEntity.properties)}

        Reply with JSON only: { "isMatch": true } or { "isMatch": false }
      `;
      
      try {
          const result = await this.callOpenAI(prompt, 0.0, true);
          return result.isMatch === true;
      } catch (e) {
          console.warn("Resolution failed, assuming false", e);
          return false;
      }
  }

  // --- 3. ADVANCED GRAPH EXTRACTION ---
  // Used by: services/document-processor.ts
  // UPGRADE: Now forces extraction of "description" for context-aware resolution.
  async extractEntitiesAndRelationships(text: string): Promise<EntityExtractionResult> {
    const prompt = `
      Analyze this text and extract Knowledge Graph elements.
      
      ### EXTRACTION RULES
      1. **Entities:** Extract precise entities (Person, Organization, Location, Event, Concept).
         - **CRITICAL:** You MUST add a 'description' property to every entity summarizing its context (e.g. "CEO of Google", "Date of meeting"). 
         - This 'description' is required for identifying duplicates later.
      2. **Relationships:** Use precise verbs (EMPLOYED_BY, LOCATED_IN, PERFORMED). Avoid generic "RELATED_TO".
      3. **Events:** If the text describes a specific action/transaction, create an 'Event' node.
      
      ### INPUT TEXT
      ${text.substring(0, 8000)}

      ### OUTPUT FORMAT (JSON)
      { 
        "entities": [ { "label": "...", "type": "...", "properties": { "description": "..." } } ], 
        "relationships": [ { "from": "...", "to": "...", "type": "..." } ] 
      }
    `;
    return this.callOpenAI(prompt, 0.0, true);
  }

  // --- 4. STRUCTURED MAPPING EXTRACTION ---
  // Used by: services/document-processor.ts (for CSV/Excel)
  async extractGraphWithMapping(rowText: string, mapping: any[]): Promise<EntityExtractionResult> {
    const rules = mapping.map((m: any) => 
      `- If you see column "${m.header_column}", create relationship "${m.relationship_type}" to entity "${m.target_entity}".`
    ).join("\n");

    const prompt = `
      You are an expert in Knowledge Graphs.
      
      ### MAPPING RULES
      ${rules}

      ### ENRICHMENT RULES
      1. **Context:** Add a 'description' property to every entity based on the other columns in the row.
      2. **Events:** If the row represents a log or transaction, treat the main entity as an 'Event'.
      
      ### INPUT ROW
      ${rowText}

      ### OUTPUT JSON
      { "entities": [...], "relationships": [...] }
    `;
    return this.callOpenAI(prompt, 0.0, true);
  }

  // --- HELPER ---
  private async callOpenAI(prompt: string, temperature: number, jsonMode: boolean): Promise<any> {
    if (!this.client) throw new Error("Azure OpenAI Client not initialized");
    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "";

    let attempt = 0;
    while (attempt < this.maxRetries) {
      try {
        const response = await this.client.getChatCompletions(
          deploymentName,
          [
            { role: "system", content: "You are a precise Knowledge Graph extractor. Output valid JSON only." },
            { role: "user", content: prompt }
          ],
          { 
              temperature, 
              maxTokens: 4000, 
              responseFormat: jsonMode ? { type: "json_object" } : undefined 
          }
        );

        const content = response.choices[0]?.message?.content || "{}";
        
        if (jsonMode) {
             // Clean potential markdown formatting
             const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
             return JSON.parse(cleaned);
        }
        return content;

      } catch (error: any) {
        attempt++;
        console.warn(`[AzureOpenAI] Attempt ${attempt} failed: ${error.message}`);
        if (attempt >= this.maxRetries) throw error;
        await this.sleep(this.baseDelay * Math.pow(2, attempt - 1));
      }
    }
    throw new Error("Azure OpenAI Retries exhausted");
  }

  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
}

export const azureOpenAI = new AzureOpenAIService();