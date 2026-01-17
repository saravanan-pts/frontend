// lib/graphUtils.ts

// The Backend now handles normalization, so this is just a helper 
// to ensure we always have a string.
export const normalizeType = (type: any, label: any): string => {
    // We trust the backend 'type', but fallback to Capitalized Label if missing
    if (type && type !== "Concept") return String(type);
    return "Concept";
};

// UI Colors still live in Frontend (Styling preference)
export const getEntityColor = (type: any) => {
    const t = String(type || "").toLowerCase().trim();
    
    switch (t) {
        case 'event': return '#F97316';       // Orange
        case 'person': return '#3B82F6';      // Blue
        case 'organization': return '#10B981';// Green
        case 'location': return '#EAB308';    // Yellow
        case 'account': return '#EF4444';     // Red
        case 'claim': return '#06B6D4';       // Cyan 
        case 'vehicle': return '#8B5CF6';     // Purple
        case 'time': return '#64748B';        // Grey
        case 'document': return '#94A3B8';    // Slate
        default: return '#6366F1';            // Indigo (Default)
    }
};