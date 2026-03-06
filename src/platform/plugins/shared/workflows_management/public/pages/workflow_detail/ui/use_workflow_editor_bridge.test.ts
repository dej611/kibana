/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook, act } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type { monaco } from '@kbn/monaco';

const mockDispatch = jest.fn();
const mockUseSelector = jest.fn();

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: () => mockDispatch,
  useSelector: (selector: unknown) => mockUseSelector(selector),
}));

const mockNotifications = {
  toasts: {
    addSuccess: jest.fn(),
    addError: jest.fn(),
    addWarning: jest.fn(),
  },
};

jest.mock('../../../hooks/use_kibana', () => ({
  useKibana: () => ({ services: { notifications: mockNotifications } }),
}));

const mockCreateWorkflow = { mutateAsync: jest.fn() };
const mockDeleteWorkflows = { mutateAsync: jest.fn() };

jest.mock('../../../entities/workflows/model/use_workflow_actions', () => ({
  useWorkflowActions: () => ({
    createWorkflow: mockCreateWorkflow,
    deleteWorkflows: mockDeleteWorkflows,
  }),
}));

jest.mock('../../../entities/connectors/model/use_available_connectors', () => ({
  useAvailableConnectors: () => ({ connectorTypes: {} }),
}));

const mockInsertStepSnippet = jest.fn();
jest.mock(
  '../../../widgets/workflow_yaml_editor/lib/snippets/insert_step_snippet',
  () => ({
    insertStepSnippet: (...args: unknown[]) => mockInsertStepSnippet(...args),
  })
);

const mockNavigateToErrorPosition = jest.fn();
jest.mock('../../../widgets/workflow_yaml_editor/lib/utils', () => ({
  navigateToErrorPosition: (...args: unknown[]) => mockNavigateToErrorPosition(...args),
}));

jest.mock('../../../../common/schema', () => ({
  getWorkflowZodSchema: () => ({}),
  getWorkflowZodSchemaLoose: () => ({}),
}));

const mockParseWorkflowYaml = jest.fn();
const mockStringifyWorkflowDefinition = jest.fn();
const mockGetStepNodesWithType = jest.fn();

jest.mock('../../../../common/lib/yaml', () => ({
  parseWorkflowYaml: (...args: unknown[]) => mockParseWorkflowYaml(...args),
  stringifyWorkflowDefinition: (...args: unknown[]) => mockStringifyWorkflowDefinition(...args),
  getStepNodesWithType: (...args: unknown[]) => mockGetStepNodesWithType(...args),
}));

const mockBuildExtractedWorkflow = jest.fn();
jest.mock(
  '../../../features/workflow_visual_editor/lib/extract_sub_workflow',
  () => ({
    buildExtractedWorkflow: (...args: unknown[]) => mockBuildExtractedWorkflow(...args),
  })
);

const mockFilterStepTree = jest.fn();
jest.mock(
  '../../../features/workflow_visual_editor/lib/walk_step_tree',
  () => ({
    filterStepTree: (...args: unknown[]) => mockFilterStepTree(...args),
  })
);

import {
  selectEditorWorkflowLookup,
  selectYamlString as selectYamlStringSelector,
} from '../../../entities/workflows/store/workflow_detail/selectors';
import { useWorkflowEditorBridge } from './use_workflow_editor_bridge';

const createMockEditor = () => ({
  getModel: jest.fn(),
  getPosition: jest.fn(),
  setPosition: jest.fn(),
});

const createEditorRef = (
  editor: ReturnType<typeof createMockEditor> | null = null
): MutableRefObject<monaco.editor.IStandaloneCodeEditor | null> =>
  ({ current: editor } as MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>);

describe('useWorkflowEditorBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSelector.mockReturnValue('');
  });

  describe('handleDeleteSteps', () => {
    it('dispatches setYamlString with updated YAML when steps are deleted', () => {
      const workflow = {
        name: 'test',
        steps: [
          { name: 'a', type: 'action' },
          { name: 'b', type: 'action' },
        ],
      };
      mockParseWorkflowYaml.mockReturnValue({ success: true, data: workflow });
      mockFilterStepTree.mockReturnValue([{ name: 'b', type: 'action' }]);
      mockStringifyWorkflowDefinition.mockReturnValue('updated-yaml');

      const { result } = renderHook(() => useWorkflowEditorBridge(createEditorRef()));

      act(() => {
        result.current.handleDeleteSteps(['a']);
      });

      expect(mockFilterStepTree).toHaveBeenCalledWith(workflow.steps, expect.any(Function));
      expect(mockStringifyWorkflowDefinition).toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalled();
    });

    it('does nothing when stepNames is empty', () => {
      const { result } = renderHook(() => useWorkflowEditorBridge(createEditorRef()));

      act(() => {
        result.current.handleDeleteSteps([]);
      });

      expect(mockParseWorkflowYaml).not.toHaveBeenCalled();
    });

    it('does nothing when YAML parsing fails', () => {
      mockParseWorkflowYaml.mockReturnValue({ success: false, error: 'bad yaml' });

      const { result } = renderHook(() => useWorkflowEditorBridge(createEditorRef()));

      act(() => {
        result.current.handleDeleteSteps(['a']);
      });

      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  describe('handleAddStepBetween', () => {
    it('does not insert snippet when neither source nor target step is found', () => {
      const mockEditor = createMockEditor();
      const mockModel = { getValue: jest.fn().mockReturnValue('yaml'), getPositionAt: jest.fn() };
      mockEditor.getModel.mockReturnValue(mockModel);
      mockGetStepNodesWithType.mockReturnValue([]);

      const { result } = renderHook(() =>
        useWorkflowEditorBridge(createEditorRef(mockEditor as any))
      );

      act(() => {
        result.current.handleAddStepBetween('source', 'target', 'action');
      });

      expect(mockInsertStepSnippet).not.toHaveBeenCalled();
    });

    it('positions editor at target step and inserts snippet', () => {
      const mockEditor = createMockEditor();
      const mockModel = {
        getValue: jest.fn().mockReturnValue('yaml'),
        getPositionAt: jest.fn().mockReturnValue({ lineNumber: 5, column: 1 }),
      };
      mockEditor.getModel.mockReturnValue(mockModel);
      mockEditor.getPosition.mockReturnValue({ lineNumber: 4, column: 1 });

      const mockStepNode = {
        get: jest.fn().mockReturnValue({ value: 'target-step' }),
        range: [10, 20, 30],
      };
      // isScalar check: the yaml library's isScalar checks for Scalar instances.
      // We mock getStepNodesWithType to return our mock node.
      mockGetStepNodesWithType.mockReturnValue([mockStepNode]);

      // We need to mock isScalar from 'yaml' to return true for our mock value
      jest.spyOn(require('yaml'), 'isScalar').mockReturnValue(true);

      const { result } = renderHook(() =>
        useWorkflowEditorBridge(createEditorRef(mockEditor as any))
      );

      act(() => {
        result.current.handleAddStepBetween('source', 'target-step', 'action');
      });

      expect(mockEditor.setPosition).toHaveBeenCalledWith({ lineNumber: 4, column: 1 });
      expect(mockInsertStepSnippet).toHaveBeenCalled();
    });
  });

  describe('handleAddStepAfter', () => {
    it('does not insert snippet when step is not found', () => {
      const mockEditor = createMockEditor();
      const mockModel = { getValue: jest.fn().mockReturnValue('yaml'), getPositionAt: jest.fn() };
      mockEditor.getModel.mockReturnValue(mockModel);
      mockGetStepNodesWithType.mockReturnValue([]);

      const { result } = renderHook(() =>
        useWorkflowEditorBridge(createEditorRef(mockEditor as any))
      );

      act(() => {
        result.current.handleAddStepAfter('missing-step', 'action');
      });

      expect(mockInsertStepSnippet).not.toHaveBeenCalled();
    });
  });

  describe('handleNodeClick', () => {
    it('navigates to step position when workflowLookup has step info', () => {
      const mockEditor = createMockEditor();
      mockUseSelector.mockImplementation((selector: unknown) => {
        if (selector === selectEditorWorkflowLookup) {
          return {
            steps: { 'step-a': { lineStart: 10 } },
            triggers: {},
          };
        }
        if (selector === selectYamlStringSelector) {
          return '';
        }
        return undefined;
      });

      const { result } = renderHook(() =>
        useWorkflowEditorBridge(createEditorRef(mockEditor as any))
      );

      act(() => {
        result.current.handleNodeClick('step-a', 'step');
      });

      expect(mockNavigateToErrorPosition).toHaveBeenCalledWith(mockEditor, 10, 1);
    });

    it('does nothing when editor is null', () => {
      const { result } = renderHook(() => useWorkflowEditorBridge(createEditorRef(null)));

      act(() => {
        result.current.handleNodeClick('step-a', 'step');
      });

      expect(mockNavigateToErrorPosition).not.toHaveBeenCalled();
    });
  });

  describe('handleExtractConfirm', () => {
    it('shows error toast when sub-workflow creation fails', async () => {
      const creationError = new Error('Network failure');
      mockCreateWorkflow.mutateAsync.mockRejectedValue(creationError);

      const { result } = renderHook(() => useWorkflowEditorBridge(createEditorRef()));

      act(() => {
        result.current.handleExtractSubWorkflow(['step-a'], [0, 0]);
      });

      mockParseWorkflowYaml.mockReturnValue({
        success: true,
        data: { name: 'test', steps: [{ name: 'step-a', type: 'action' }] },
      });
      mockBuildExtractedWorkflow.mockReturnValue({
        newWorkflowDefinition: {},
        updatedSteps: [],
        executeStep: { with: {} },
        executeStepIndex: 0,
      });
      mockStringifyWorkflowDefinition.mockReturnValue('yaml');

      await act(async () => {
        await result.current.handleExtractConfirm('sub-workflow');
      });

      expect(mockNotifications.toasts.addError).toHaveBeenCalledWith(
        creationError,
        expect.objectContaining({ title: expect.any(String) })
      );
    });

    it('shows success toast on successful extraction', async () => {
      mockCreateWorkflow.mutateAsync.mockResolvedValue({ id: 'new-id' });

      const { result } = renderHook(() => useWorkflowEditorBridge(createEditorRef()));

      act(() => {
        result.current.handleExtractSubWorkflow(['step-a'], [0, 0]);
      });

      mockParseWorkflowYaml.mockReturnValue({
        success: true,
        data: { name: 'test', steps: [{ name: 'step-a', type: 'action' }] },
      });
      mockBuildExtractedWorkflow.mockReturnValue({
        newWorkflowDefinition: {},
        updatedSteps: [{ name: 'execute', type: 'workflow.execute', with: {} }],
        executeStep: { name: 'execute', type: 'workflow.execute', with: {} },
        executeStepIndex: 0,
      });
      mockStringifyWorkflowDefinition.mockReturnValue('yaml');

      await act(async () => {
        await result.current.handleExtractConfirm('sub-workflow');
      });

      expect(mockNotifications.toasts.addSuccess).toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalled();
    });

    it('attempts cleanup and warns on linkage failure', async () => {
      mockCreateWorkflow.mutateAsync.mockResolvedValue({ id: 'new-id' });
      mockDeleteWorkflows.mutateAsync.mockResolvedValue(undefined);

      const linkageError = new Error('linkage failed');
      mockStringifyWorkflowDefinition
        .mockReturnValueOnce('new-workflow-yaml')
        .mockImplementationOnce(() => {
          throw linkageError;
        });

      const { result } = renderHook(() => useWorkflowEditorBridge(createEditorRef()));

      act(() => {
        result.current.handleExtractSubWorkflow(['step-a'], [0, 0]);
      });

      mockParseWorkflowYaml.mockReturnValue({
        success: true,
        data: { name: 'test', steps: [{ name: 'step-a', type: 'action' }] },
      });
      mockBuildExtractedWorkflow.mockReturnValue({
        newWorkflowDefinition: {},
        updatedSteps: [{ name: 'execute', type: 'workflow.execute', with: {} }],
        executeStep: { name: 'execute', type: 'workflow.execute', with: {} },
        executeStepIndex: 0,
      });

      await act(async () => {
        await result.current.handleExtractConfirm('sub-workflow');
      });

      expect(mockDeleteWorkflows.mutateAsync).toHaveBeenCalledWith({ ids: ['new-id'] });
      expect(mockNotifications.toasts.addWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.any(String),
        })
      );
    });

    it('warns about orphaned workflow when cleanup also fails', async () => {
      mockCreateWorkflow.mutateAsync.mockResolvedValue({ id: 'new-id' });
      mockDeleteWorkflows.mutateAsync.mockRejectedValue(new Error('delete failed'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      mockStringifyWorkflowDefinition
        .mockReturnValueOnce('new-workflow-yaml')
        .mockImplementationOnce(() => {
          throw new Error('linkage failed');
        });

      const { result } = renderHook(() => useWorkflowEditorBridge(createEditorRef()));

      act(() => {
        result.current.handleExtractSubWorkflow(['step-a'], [0, 0]);
      });

      mockParseWorkflowYaml.mockReturnValue({
        success: true,
        data: { name: 'test', steps: [{ name: 'step-a', type: 'action' }] },
      });
      mockBuildExtractedWorkflow.mockReturnValue({
        newWorkflowDefinition: {},
        updatedSteps: [{ name: 'execute', type: 'workflow.execute', with: {} }],
        executeStep: { name: 'execute', type: 'workflow.execute', with: {} },
        executeStepIndex: 0,
      });

      await act(async () => {
        await result.current.handleExtractConfirm('sub-workflow');
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to clean up orphaned sub-workflow:',
        expect.any(Error)
      );
      expect(mockNotifications.toasts.addWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('new-id'),
        })
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleDeleteStep', () => {
    it('delegates to handleDeleteSteps with a single-item array', () => {
      mockParseWorkflowYaml.mockReturnValue({
        success: true,
        data: { name: 'test', steps: [{ name: 'a', type: 'action' }] },
      });
      mockFilterStepTree.mockReturnValue([]);
      mockStringifyWorkflowDefinition.mockReturnValue('updated');

      const { result } = renderHook(() => useWorkflowEditorBridge(createEditorRef()));

      act(() => {
        result.current.handleDeleteStep('a');
      });

      expect(mockFilterStepTree).toHaveBeenCalled();
    });
  });
});
