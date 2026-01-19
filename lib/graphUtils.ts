// lib/graphUtils.ts

/**
 * Safely capitalizes a string. 
 * Use this in your Edit Forms to prevent "type.charAt is not a function" crashes.
 */
export const safeCapitalize = (text: any): string => {
    if (!text) return "";
    const str = String(text);
    return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Normalizes the entity type string for display.
 * CRITICAL FIX: Prioritizes 'normType' (editable property) over 'type' (immutable label).
 * This fixes the "reverting" bug when a user edits the type in the UI.
 */
export const normalizeType = (entityOrType: any, label?: any): string => {
    // 1. If passed a full entity object
    if (typeof entityOrType === 'object' && entityOrType !== null) {
        
        // A. Check Direct Property (Fixes Visualizer/Cytoscape flattened data)
        if (entityOrType.normType) {
            return normalizeString(entityOrType.normType);
        }

        // B. Check Nested Property (Fixes Raw API/DB data)
        if (entityOrType.properties && entityOrType.properties.normType) {
            return normalizeString(entityOrType.properties.normType);
        }
        
        // C. Fallback to the immutable label
        if (entityOrType.type && entityOrType.type !== "Concept") {
            return normalizeString(entityOrType.type);
        }

        // D. Fallback to label if type is generic
        if (label) return normalizeString(label);
        
        return "Concept";
    }

    // 2. If passed a direct string
    return normalizeString(entityOrType);
};

// Helper to clean strings (Removes underscores, Title Case)
const normalizeString = (input: any): string => {
    if (!input) return "Concept";
    
    let clean = String(input);
    clean = clean.replace(/_/g, " "); 

    if (clean.length > 0) {
        clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    if (clean === "Unknown" || clean === "") return "Concept";
    return clean;
};

/**
 * Assigns a specific, consistent color to each entity type.
 * TUNED FOR CLIENT PRESENTATION (Professional, Distinct, Cool Tones).
 */
export const getEntityColor = (type: any): string => {
    // Safety check: Ensure we always work with a lowercase string
    const t = String(type || "").toLowerCase().trim();
    
    switch (t) {
        // --- Core Business Logic ---
        case 'case':          return '#818CF8'; // Indigo 400
        case 'maritalstatus': return '#F472B6'; // Pink 400
        case 'marital status':return '#F472B6'; 
        case 'role':          return '#2DD4BF'; // Teal 400
        case 'job':           return '#2DD4BF'; 
        case 'branch':        return '#A3E635'; // Lime 400
        
        // --- Standard Entities ---
        case 'event':         return '#FB923C'; // Orange 400
        case 'person':        return '#38BDF8'; // Sky 400
        case 'organization':  return '#34D399'; // Emerald 400
        case 'location':      return '#FACC15'; // Yellow 400
        
        // --- Business Objects ---
        case 'account':       return '#F87171'; // Red 400
        case 'claim':         return '#60A5FA'; // Blue 400
        case 'policy':        return '#4ADE80'; // Green 400
        case 'vehicle':       return '#C084FC'; // Purple 400
        
        // --- Metadata ---
        case 'time':          return '#94A3B8'; // Slate 400
        case 'document':      return '#E879F9'; // Fuchsia 400
        
        // --- Fallback (Concept) ---
        // Lavender Blue: Professional, distinct, not "disabled" looking
        case 'concept':       return '#A5B4FC'; 
        default:              return '#A5B4FC'; 
    }
};