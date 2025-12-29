import { surrealDB } from "@/lib/surrealdb-client";
import { azureOpenAI } from "./azure-openai";
import { graphOps } from "./graph-operations";

export class GraphAnalytics {
  private get db() {
    return surrealDB.getClient();
  }

  /**
   * Phase 3: Community Detection
   * Finds clusters of connected entities and generates a "Community Summary" node.
   */
  async detectAndSummarizeCommunities() {
    console.log("[Analytics] Starting Community Detection...");
    
    // 1. Fetch all relationships (The "Structure")
    const relationships = await graphOps.getAllRelationships();
    
    // 2. Simple Clustering (Heuristic: Group by 'type' or connected components)
    // In a real Python backend, we would use the 'Leiden' algorithm.
    // Here, we will cluster by heavily connected nodes (Naive approach for POC).
    const clusters = this.simpleClustering(relationships);

    console.log(`[Analytics] Detected ${Object.keys(clusters).length} potential communities.`);

    // 3. Generate Summaries for each Cluster
    for (const [clusterId, entityIds] of Object.entries(clusters)) {
        // Skip small clusters (less than 3 nodes) to save tokens and noise
        if (entityIds.length < 3) continue;

        await this.generateCommunitySummary(clusterId, entityIds);
    }

    console.log("[Analytics] Community Detection Complete.");
  }

  /**
   * Generates a summary for a specific group of nodes
   */
  private async generateCommunitySummary(clusterId: string, entityIds: string[]) {
      try {
          // Fetch the actual labels/content for these entities
          const entities = await this.db.query(`SELECT * FROM entity WHERE id IN $ids`, { ids: entityIds });
          // @ts-ignore
          const entityData = entities[0]?.result || [];
          
          if (entityData.length === 0) return;

          const contextText = entityData
             .map((e: any) => `${e.label} (${e.type}): ${JSON.stringify(e.properties)}`)
             .join("\n");

          // Ask AI to summarize this "Community"
          const prompt = `
            You are analyzing a 'Community' detected in a Knowledge Graph.
            
            Entities in this community:
            ${contextText.substring(0, 6000)} // Limit context window

            Task:
            1. Identify the common theme connecting these entities.
            2. Write a detailed summary of what this group represents (e.g., "A cluster of compliance violations related to Product X").
            3. Assign a specialized label (e.g., "Compliance_Cluster_A").

            Return strictly JSON: { "theme": "...", "summary": "...", "label": "..." }
          `;

          // --- REAL AI CALL (Replaced Mock Data) ---
          const result = await azureOpenAI.generateCompletion(prompt);
          
          if (!result || !result.label) {
              console.warn(`[Analytics] AI returned invalid data for cluster ${clusterId}`);
              return;
          }

          console.log(`[Analytics] Generated Summary for Cluster ${clusterId}: ${result.label}`);

          // 4. Save the "Community" as a Node in the Graph
          // This allows "Global Search" to find this summary!
          const communityId = `community:${clusterId}`;
          await this.db.create(communityId, {
              type: "Community",
              label: result.label,
              properties: {
                  theme: result.theme,
                  summary: result.summary,
                  member_count: entityIds.length,
                  generatedAt: new Date().toISOString()
              },
              metadata: {
                  generatedBy: "GraphAnalytics",
                  algorithm: "SimpleClustering"
              }
          });

          // Link members to the Community
          for (const memberId of entityIds) {
              // Create a "BELONGS_TO" relationship so you can visualize the cluster
              await graphOps.createRelationship(memberId, communityId, "BELONGS_TO", { confidence: 1.0 });
          }

      } catch (e) {
          console.error(`[Analytics] Failed to summarize cluster ${clusterId}`, e);
      }
  }

  // A simplified clustering algorithm (Connected Components)
  private simpleClustering(relationships: any[]): Record<string, string[]> {
      const clusters: Record<string, Set<string>> = {};
      let clusterCount = 0;
      const nodeToCluster = new Map<string, string>();

      for (const rel of relationships) {
          const u = rel.from;
          const v = rel.to;
          if (!u || !v) continue;

          const uClust = nodeToCluster.get(u);
          const vClust = nodeToCluster.get(v);

          if (!uClust && !vClust) {
              // New cluster
              const id = `c_${++clusterCount}`;
              clusters[id] = new Set([u, v]);
              nodeToCluster.set(u, id);
              nodeToCluster.set(v, id);
          } else if (uClust && !vClust) {
              // Add v to u's cluster
              clusters[uClust].add(v);
              nodeToCluster.set(v, uClust);
          } else if (!uClust && vClust) {
              // Add u to v's cluster
              clusters[vClust].add(u);
              nodeToCluster.set(u, vClust);
          }
          // Note: Merging two existing clusters is omitted here for simplicity in this POC,
          // but in production, you would union the sets if uClust !== vClust.
      }

      // Convert Sets to Arrays
      const result: Record<string, string[]> = {};
      for (const [id, set] of Object.entries(clusters)) {
          result[id] = Array.from(set);
      }
      return result;
  }
}

export const graphAnalytics = new GraphAnalytics();