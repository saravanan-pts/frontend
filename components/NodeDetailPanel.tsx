"use client";

import { useState, useEffect, useMemo, memo } from "react";
import { X, Edit2, Trash2, Save, Plus, Link2 } from "lucide-react";
import { useGraphStore } from "@/lib/store";
import { useGraph } from "@/hooks/useGraph";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "@/lib/schema";
import type { Relationship } from "@/types";
import ConfirmDialog from "@/components/ConfirmDialog";
import InputDialog from "@/components/InputDialog";

interface NodeDetailPanelProps {
  onClose: () => void;
  onCreateRelationship?: (fromEntityId: string) => void;
  // We keep these for compatibility, but we will prioritize inline editing
  onEditRelationship?: (relationship: Relationship) => void;
  onDeleteRelationship?: (relationshipId: string) => void;
}

function NodeDetailPanel({ 
  onClose, 
  onCreateRelationship,
  onDeleteRelationship,
}: NodeDetailPanelProps) {
  const { selectedEntity, relationships, entities } = useGraphStore();
  // Import updateRelationship to handle edits inline
  const { updateEntity, deleteEntity, deleteRelationship, updateRelationship } = useGraph();
  
  // --- ENTITY STATE ---
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editedLabel, setEditedLabel] = useState("");
  const [editedType, setEditedType] = useState<string>("Concept");
  const [editedProperties, setEditedProperties] = useState<Record<string, any>>({});
  
  // --- RELATIONSHIP EDITING STATE (NEW) ---
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [editedRelType, setEditedRelType] = useState("");
  const [editedRelProps, setEditedRelProps] = useState<Record<string, any>>({});

  // Dialog states
  const [showDeleteRelationshipConfirm, setShowDeleteRelationshipConfirm] = useState(false);
  const [relationshipToDelete, setRelationshipToDelete] = useState<string | null>(null);
  const [showDeleteEntityConfirm, setShowDeleteEntityConfirm] = useState(false);
  const [showAddPropertyDialog, setShowAddPropertyDialog] = useState(false);

  // --- 1. SMART ENTITY TYPES ---
  const typeOptions = useMemo(() => {
    const options = new Set<string>(ENTITY_TYPES);
    options.add("Vendor");
    options.add("Project");
    options.add("Asset");
    options.add("Policy");
    options.add("Claim");
    entities.forEach((e) => { if (e.type) options.add(e.type); });
    return Array.from(options).sort();
  }, [entities]);

  // --- 2. SMART RELATIONSHIP TYPES (NEW) ---
  const relTypeOptions = useMemo(() => {
    // Start with defaults
    const options = new Set<string>(RELATIONSHIP_TYPES);
    options.add("RELATED_TO");
    options.add("HAS_POLICY");
    options.add("INSURES");
    options.add("FILED_CLAIM");
    options.add("DRIVEN_BY");

    // Add types found in current graph
    relationships.forEach((r) => { if (r.type) options.add(r.type); });

    return Array.from(options).sort();
  }, [relationships]);

  // Reset Entity State on Selection Change
  useEffect(() => {
    if (selectedEntity) {
      setEditedLabel(selectedEntity.label);
      setEditedType(selectedEntity.type);
      setEditedProperties(selectedEntity.properties || {});
      setIsEditing(false);
      setIsEditingLabel(false);
      setEditingRelId(null); // Close any open relationship edits
    }
  }, [selectedEntity]);

  if (!selectedEntity) {
    return (
      <div className="w-full h-full bg-gray-50 flex items-center justify-center text-gray-500">
        <p>Select a node to view details</p>
      </div>
    );
  }

  const connectedRelationships = relationships.filter(
    (rel) => rel.from === selectedEntity.id || rel.to === selectedEntity.id
  );

  // --- ENTITY HANDLERS ---
  const handleSaveEntity = async () => {
    try {
      const formattedType = editedType.charAt(0).toUpperCase() + editedType.slice(1);
      await updateEntity(selectedEntity.id, {
        label: editedLabel,
        type: formattedType,
        properties: editedProperties,
      });
      setIsEditing(false);
      setIsEditingLabel(false);
    } catch (error) { console.error(error); }
  };

  const handleSaveLabel = async () => {
    try {
      const formattedType = editedType.charAt(0).toUpperCase() + editedType.slice(1);
      await updateEntity(selectedEntity.id, { label: editedLabel, type: formattedType });
      setIsEditingLabel(false);
    } catch (error) { console.error(error); }
  };

  const handlePropertyChange = (key: string, value: any) => {
    setEditedProperties((prev) => ({ ...prev, [key]: value }));
  };

  // --- RELATIONSHIP HANDLERS (NEW) ---
  
  const startEditingRel = (rel: Relationship) => {
    setEditingRelId(rel.id);
    setEditedRelType(rel.type);
    setEditedRelProps(rel.properties || {});
  };

  const cancelEditingRel = () => {
    setEditingRelId(null);
    setEditedRelType("");
    setEditedRelProps({});
  };

  const saveRelationship = async () => {
    if (!editingRelId) return;
    try {
      // Clean type (uppercase, no spaces)
      const cleanType = editedRelType.trim().replace(/\s+/g, '_').toUpperCase();
      
      await updateRelationship(editingRelId, {
        type: cleanType,
        properties: editedRelProps
      });
      setEditingRelId(null);
    } catch (error) {
      console.error("Failed to update relationship:", error);
    }
  };

  const handleRelPropertyChange = (key: string, value: string) => {
    setEditedRelProps(prev => ({ ...prev, [key]: value }));
  };

  const handleRelationshipDelete = async (relId: string) => {
    setRelationshipToDelete(relId);
    setShowDeleteRelationshipConfirm(true);
  };

  const confirmDeleteRelationship = async () => {
    if (relationshipToDelete) {
      try {
        await deleteRelationship(relationshipToDelete);
        if (onDeleteRelationship) onDeleteRelationship(relationshipToDelete);
      } catch (error) { console.error(error); }
      setRelationshipToDelete(null);
    }
    setShowDeleteRelationshipConfirm(false);
  };

  // --- COMMON HELPERS ---
  const getEntityLabel = (id: string) => {
    const entity = entities.get(id);
    return entity ? entity.label : id;
  };

  const confirmDeleteEntity = async () => {
    try { await deleteEntity(selectedEntity.id); onClose(); } 
    catch (error) { console.error(error); }
    setShowDeleteEntityConfirm(false);
  };

  const confirmAddProperty = (key: string) => {
    if (key.trim()) {
      setEditedProperties((prev) => ({ ...prev, [key.trim()]: "" }));
    }
    setShowAddPropertyDialog(false);
  };

  return (
    <div className="w-full h-full bg-white border-l border-gray-200 flex flex-col">
      {/* --- HEADER (ENTITY LABEL) --- */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex-1">
          {isEditingLabel ? (
            <div className="space-y-2">
              <input
                value={editedLabel}
                onChange={(e) => setEditedLabel(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-lg font-semibold"
                autoFocus
                placeholder="Label"
              />
              <input 
                list="detail-panel-types"
                value={editedType}
                onChange={(e) => setEditedType(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder="Type or select..."
              />
              <datalist id="detail-panel-types">
                {typeOptions.map((t) => <option key={t} value={t} />)}
              </datalist>

              <div className="flex gap-2">
                <button onClick={handleSaveLabel} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Save</button>
                <button onClick={() => setIsEditingLabel(false)} className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{selectedEntity.label}</h2>
                <button onClick={() => setIsEditingLabel(true)} className="p-1 hover:bg-gray-200 rounded text-gray-500"><Edit2 className="w-4 h-4" /></button>
              </div>
              <p className="text-sm text-gray-500">{selectedEntity.type}</p>
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded ml-2"><X className="w-5 h-5" /></button>
      </div>

      {/* --- CONTENT --- */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* 1. ENTITY PROPERTIES */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700">Properties</h3>
            {!isEditing ? (
              <button onClick={() => setIsEditing(true)} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Edit2 className="w-4 h-4" /></button>
            ) : (
              <div className="flex gap-2">
                <button onClick={handleSaveEntity} className="p-1 hover:bg-green-100 rounded text-green-600"><Save className="w-4 h-4" /></button>
                <button onClick={() => setIsEditing(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {Object.entries(editedProperties).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2">
                <label className="text-sm font-medium text-gray-700 w-24 flex-shrink-0 pt-1">{key}:</label>
                {isEditing ? (
                  <input
                    value={String(value)}
                    onChange={(e) => handlePropertyChange(key, e.target.value)}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                ) : (
                  <span className="text-sm text-gray-600 flex-1 break-all pt-1">{String(value)}</span>
                )}
              </div>
            ))}
            {isEditing && (
              <button onClick={() => setShowAddPropertyDialog(true)} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 mt-2">
                <Plus className="w-4 h-4" /> Add Property
              </button>
            )}
          </div>
        </div>

        {/* 2. RELATIONSHIPS (UPDATED FOR INLINE EDITING) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700">Relationships ({connectedRelationships.length})</h3>
            {onCreateRelationship && (
              <button onClick={() => onCreateRelationship(selectedEntity.id)} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                <Link2 className="w-3 h-3" /> Add
              </button>
            )}
          </div>

          <div className="space-y-3">
            {connectedRelationships.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No connections yet.</p>
            ) : (
              connectedRelationships.map((rel) => {
                // CHECK: Is this specific relationship being edited?
                const isRelEditing = editingRelId === rel.id;
                
                return (
                  <div key={rel.id} className={`p-3 rounded-md text-sm border ${isRelEditing ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"}`}>
                    {isRelEditing ? (
                      // --- EDIT MODE ---
                      <div className="space-y-3">
                        {/* Type Input with Datalist */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                            <input 
                                list="rel-types-options"
                                value={editedRelType}
                                onChange={(e) => setEditedRelType(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm uppercase"
                            />
                            <datalist id="rel-types-options">
                                {relTypeOptions.map(t => <option key={t} value={t} />)}
                            </datalist>
                        </div>

                        {/* Properties (Simple Key-Value Edit) */}
                        {Object.keys(editedRelProps).length > 0 && (
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Properties</label>
                                {Object.entries(editedRelProps).map(([k, v]) => (
                                    <div key={k} className="flex gap-2 mb-1">
                                        <span className="text-xs text-gray-500 w-16 truncate pt-1">{k}</span>
                                        <input 
                                            value={String(v)}
                                            onChange={(e) => handleRelPropertyChange(k, e.target.value)}
                                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-1">
                           <button onClick={saveRelationship} className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">Save</button>
                           <button onClick={cancelEditingRel} className="px-3 py-1 bg-gray-300 text-gray-800 rounded text-xs hover:bg-gray-400">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      // --- VIEW MODE ---
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800">{rel.type}</span>
                            <span className="text-xs text-gray-500 border px-1 rounded">
                               {rel.confidence ? `${Math.round(rel.confidence * 100)}%` : "100%"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            {rel.from === selectedEntity.id ? "→ To: " : "← From: "} 
                            <span className="font-medium text-gray-800">
                                {getEntityLabel(rel.from === selectedEntity.id ? rel.to : rel.from)}
                            </span>
                          </p>
                        </div>
                        
                        <div className="flex gap-1 ml-2">
                          <button onClick={() => startEditingRel(rel)} className="p-1.5 hover:bg-blue-100 rounded text-blue-600 transition-colors" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleRelationshipDelete(rel.id)} className="p-1.5 hover:bg-red-100 rounded text-red-600 transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 3. METADATA */}
        <div className="pt-4 border-t border-gray-100">
          <h3 className="font-semibold mb-2 text-gray-700">Metadata</h3>
          <div className="space-y-1 text-xs text-gray-500">
            <p>ID: <span className="font-mono">{selectedEntity.id}</span></p>
            {selectedEntity.createdAt && <p>Created: {new Date(selectedEntity.createdAt).toLocaleDateString()}</p>}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <button onClick={() => setShowDeleteEntityConfirm(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded hover:bg-red-50 hover:border-red-300 transition-colors">
          <Trash2 className="w-4 h-4" /> Delete Entity
        </button>
      </div>

      {/* Confirmation Dialogs */}
      {showDeleteRelationshipConfirm && (
        <ConfirmDialog
          title="Delete Relationship"
          message="Are you sure?"
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={confirmDeleteRelationship}
          onCancel={() => { setShowDeleteRelationshipConfirm(false); setRelationshipToDelete(null); }}
          danger={true}
        />
      )}
      {showDeleteEntityConfirm && (
        <ConfirmDialog
          title="Delete Entity"
          message="This will delete the node and all connections."
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={confirmDeleteEntity}
          onCancel={() => setShowDeleteEntityConfirm(false)}
          danger={true}
        />
      )}
      {showAddPropertyDialog && (
        <InputDialog
          title="Add Property"
          message="Key Name:"
          placeholder="e.g. status"
          onSubmit={confirmAddProperty}
          onCancel={() => setShowAddPropertyDialog(false)}
          submitText="Add"
        />
      )}
    </div>
  );
}

export default memo(NodeDetailPanel);