/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { monaco } from '@kbn/code-editor';
import { useSectionCodeActions } from './use_section_code_actions';
import type { WorkflowLookup } from '../../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';
import { registerSectionCodeActionProvider } from '../../lib/register_section_code_action_provider';

jest.mock('../../lib/register_section_code_action_provider', () => ({
  registerSectionCodeActionProvider: jest.fn(),
}));

const register = registerSectionCodeActionProvider as jest.Mock;

describe('useSectionCodeActions', () => {
  const dispose = jest.fn();
  const lookup = { steps: {} } as WorkflowLookup;

  beforeEach(() => {
    dispose.mockClear();
    register.mockReset().mockReturnValue({ dispose });
  });

  const setup = (isReadOnlyYaml = false) => {
    const model = { uri: { toString: () => 'inmemory://workflow.yaml' } };
    const editorRef = {
      current: { getModel: () => model },
    } as unknown as MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
    const workflowLookupRef = { current: lookup as WorkflowLookup | undefined };
    const hook = renderHook((props) => useSectionCodeActions(props), {
      initialProps: { editorRef, workflowLookupRef, isReadOnlyYaml },
    });
    return { hook, editorRef, workflowLookupRef, model };
  };

  it('registers the provider once, and disposes it on unmount', () => {
    const { hook } = setup();

    expect(register).toHaveBeenCalledTimes(1);
    hook.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('does not register again when only read-only changes, but the provider sees it', () => {
    const { hook, editorRef, workflowLookupRef } = setup(false);
    const params = register.mock.calls[0][0];
    expect(params.isReadOnly()).toBe(false);

    hook.rerender({ editorRef, workflowLookupRef, isReadOnlyYaml: true });

    expect(register).toHaveBeenCalledTimes(1);
    expect(params.isReadOnly()).toBe(true);
  });

  it('reads the latest lookup and editor model when it is asked', () => {
    const { workflowLookupRef, editorRef, model } = setup();
    const params = register.mock.calls[0][0];

    expect(params.getLookup()).toBe(lookup);
    workflowLookupRef.current = undefined;
    expect(params.getLookup()).toBeUndefined();

    expect(params.isEditorModel(model)).toBe(true);
    expect(params.isEditorModel({ uri: { toString: () => 'inmemory://preview.yaml' } })).toBe(
      false
    );
    expect(params.getEditor()).toBe(editorRef.current);
  });
});
