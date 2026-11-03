/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useMemo, useState } from 'react';
import {
  getStoredCollapsedSections,
  setStoredCollapsedSections,
} from '../../../lib/workflow_editor_preferences';

interface UseCollapsedSectionsParams {
  /** `undefined` for a workflow that is not saved yet. */
  readonly workflowId: string | undefined;
  /** Names of the sections the workflow has now; remembered names outside it are ignored. */
  readonly sectionNames: ReadonlySet<string>;
}

interface UseCollapsedSectionsResult {
  readonly collapsedSections: ReadonlySet<string>;
  readonly toggleSection: (name: string) => void;
  /** Expands every named section that is collapsed. Does nothing when none is. */
  readonly expandSections: (names: readonly string[]) => void;
  /** Collapses or expands every named section in one change. Does nothing when none differs. */
  readonly setSectionsCollapsed: (names: readonly string[], collapsed: boolean) => void;
}

/**
 * Which sections the viewer has collapsed in the graph. A reading preference kept per
 * workflow in this browser: it never touches the workflow, so toggling a section does not
 * edit it or add an undo step.
 */
export const useCollapsedSections = ({
  workflowId,
  sectionNames,
}: UseCollapsedSectionsParams): UseCollapsedSectionsResult => {
  const [remembered, setRemembered] = useState<{
    workflowId: string | undefined;
    names: readonly string[];
  }>(() => ({ workflowId, names: getStoredCollapsedSections(workflowId) }));
  const rememberedNames = useMemo(
    () =>
      remembered.workflowId === workflowId
        ? remembered.names
        : getStoredCollapsedSections(workflowId),
    [remembered, workflowId]
  );

  const collapsedSections = useMemo(
    () => new Set(rememberedNames.filter((name) => sectionNames.has(name))),
    [rememberedNames, sectionNames]
  );

  const commit = useCallback(
    (names: readonly string[]) => {
      setStoredCollapsedSections(workflowId, names);
      setRemembered({ workflowId, names });
    },
    [workflowId]
  );

  const toggleSection = useCallback(
    (name: string) => {
      const current = [...collapsedSections];
      commit(current.includes(name) ? current.filter((n) => n !== name) : [...current, name]);
    },
    [collapsedSections, commit]
  );

  const expandSections = useCallback(
    (names: readonly string[]) => {
      const toExpand = new Set(names);
      const current = [...collapsedSections];
      if (current.some((name) => toExpand.has(name))) {
        commit(current.filter((name) => !toExpand.has(name)));
      }
    },
    [collapsedSections, commit]
  );

  const setSectionsCollapsed = useCallback(
    (names: readonly string[], collapsed: boolean) => {
      if (!collapsed) {
        expandSections(names);
        return;
      }
      const current = [...collapsedSections];
      const toCollapse = [...new Set(names)].filter((name) => !current.includes(name));
      if (toCollapse.length > 0) commit([...current, ...toCollapse]);
    },
    [collapsedSections, commit, expandSections]
  );

  return { collapsedSections, toggleSection, expandSections, setSectionsCollapsed };
};
