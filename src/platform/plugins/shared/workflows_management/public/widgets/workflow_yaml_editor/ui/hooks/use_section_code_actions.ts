/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useRef } from 'react';
import type { monaco } from '@kbn/code-editor';
import type { WorkflowLookup } from '../../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';
import { registerSectionCodeActionProvider } from '../../lib/register_section_code_action_provider';

interface UseSectionCodeActionsParams {
  editorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  workflowLookupRef: React.MutableRefObject<WorkflowLookup | undefined>;
  isReadOnlyYaml: boolean;
}

/**
 * Adds "Wrap in section" for selected steps and "Unwrap section" on a section header to the
 * editor's code actions. Registered once; everything it needs is read when it is asked.
 */
export const useSectionCodeActions = ({
  editorRef,
  workflowLookupRef,
  isReadOnlyYaml,
}: UseSectionCodeActionsParams): void => {
  const isReadOnlyRef = useRef(isReadOnlyYaml);
  isReadOnlyRef.current = isReadOnlyYaml;

  useEffect(() => {
    const disposable = registerSectionCodeActionProvider({
      getLookup: () => workflowLookupRef.current,
      isEditorModel: (model) =>
        model.uri.toString() === editorRef.current?.getModel()?.uri.toString(),
      isReadOnly: () => isReadOnlyRef.current,
      getEditor: () => editorRef.current,
    });
    return () => disposable.dispose();
  }, [editorRef, workflowLookupRef]);
};
