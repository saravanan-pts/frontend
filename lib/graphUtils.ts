// lib/graphUtils.ts

/**
 * Normalizes the entity type string for display.
 * Includes defensive coding to prevent "type.charAt is not a function" errors.
 * Also performs visual cleanup (underscores -> spaces, capitalization).
 */
export const normalizeType = (type: any, label: any): string => {
    // 1. Safety Check: Handle null/undefined/empty types
    if (!type) {
        return "Concept";
    }

    // 2. Convert to String explicitly to avoid crashing on objects/numbers
    let clean = String(type);

    // 3. Visual Cleanup: Replace underscores with spaces (e.g., "marital_status" -> "marital status")
    clean = clean.replace(/_/g, " ");

    // 4. Capitalization: Ensure Title Case (e.g., "marital status" -> "Marital Status")
    // This is a robust fallback in case the backend sends lowercase data.
    if (clean.length > 0) {
        clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    // 5. Generic Fallback
    if (clean === "Unknown" || clean === "") {
        return "Concept";
    }

    return clean;
};

/**
 * Assigns a specific, consistent color to each entity type.
 * TUNED FOR DARK BACKGROUNDS (High Contrast / Neon-like).
 */
export const getEntityColor = (type: any): string => {
    // Safety check: Ensure we always work with a lowercase string, 
    // even if 'type' is null/undefined.
    const t = String(type || "").toLowerCase().trim();
    
    switch (t) {
        // --- Core Business Logic (Your Custom Types) ---
        case 'case':          return '#A78BFA'; // Soft Violet (Pop against dark)
        case 'maritalstatus': return '#F472B6'; // Bright Pink
        case 'marital status':return '#F472B6'; // Handle space variation
        case 'role':          return '#22D3EE'; // Cyan / Electric Blue (Jobs)
        case 'job':           return '#22D3EE'; // Cyan (Same as Role)
        case 'branch':        return '#A3E635'; // Lime Green
        
        // --- Standard Entities ---
        case 'event':         return '#FB923C'; // Bright Orange
        case 'person':        return '#60A5FA'; // Sky Blue
        case 'organization':  return '#34D399'; // Emerald / Mint Green
        case 'location':      return '#FBBF24'; // Amber / Gold
        
        // --- Business Objects ---
        case 'account':       return '#F87171'; // Red / Coral
        case 'claim':         return '#38BDF8'; // Light Blue
        case 'policy':        return '#2DD4BF'; // Teal
        case 'vehicle':       return '#C084FC'; // Purple
        
        // --- Metadata ---
        case 'time':          return '#94A3B8'; // Slate 400 (Visible Grey)
        case 'document':      return '#E879F9'; // Fuchsia
        
        // --- Fallback (Concept) ---
        // Changed to Slate-400 (#9CA3AF) for visibility on dark BG 
        // without being blindingly bright or invisible like dark grey.
        case 'concept':       return '#9CA3AF'; // Cool Grey
        default:              return '#9CA3AF'; // Cool Grey
    }
};