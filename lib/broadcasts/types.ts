// Pure types for broadcasts. Safe to import from both server actions
// and server-only modules without dragging "use server" semantics into
// either side.

export type VariableMappingEntry =
  | { source: "contact_name"; fallback?: string }
  | { source: "fixed"; value: string };

export type VariableMapping = {
  header?: VariableMappingEntry[];
  body?: VariableMappingEntry[];
};

export type AudienceFilter = {
  all?: boolean;
  tags?: string[];
  // ISO timestamp — include only contacts whose last conversation activity
  // is after this point. Applied at fetch time, not stored as a view.
  lastActiveAfter?: string;
};
