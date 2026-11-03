/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LineCounter, parseDocument } from 'yaml';
import { monaco } from '@kbn/code-editor';
import {
  registerSectionCodeActionProvider,
  SELECT_SECTION_NAME_COMMAND_ID,
} from './register_section_code_action_provider';
import { buildWorkflowLookup } from '../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';

const YAML_TEXT = `steps:
  - name: a
    type: console
  - name: b
    type: console
  - name: box
    type: section
    steps:
      - name: s1
        type: console
`;

const lookupOf = (yaml: string) => {
  const lineCounter = new LineCounter();
  return buildWorkflowLookup(
    parseDocument(yaml, { lineCounter, keepSourceTokens: true }),
    lineCounter
  );
};

/** A text model that is just enough for the provider: text, version and offsets. */
const fakeModel = (text: string, uri = 'inmemory://workflow.yaml') =>
  ({
    uri: { toString: () => uri },
    getValue: () => text,
    getVersionId: () => 7,
    getPositionAt: (offset: number) => {
      const before = text.slice(0, offset).split('\n');
      return new monaco.Position(before.length, before[before.length - 1].length + 1);
    },
    getLineContent: (line: number) => text.split('\n')[line - 1],
    getLineCount: () => text.split('\n').length,
  } as unknown as monaco.editor.ITextModel);

const range = (startLine: number, startColumn: number, endLine: number, endColumn: number) =>
  new monaco.Range(startLine, startColumn, endLine, endColumn);

describe('registerSectionCodeActionProvider', () => {
  let provider: monaco.languages.CodeActionProvider;
  let commandHandler: (accessor: unknown, sectionName: string) => void;
  const providerDispose = jest.fn();
  const commandDispose = jest.fn();
  let registerCodeActionProvider: jest.SpyInstance;
  let registerCommand: jest.SpyInstance;

  beforeEach(() => {
    providerDispose.mockClear();
    commandDispose.mockClear();
    registerCodeActionProvider = jest
      .spyOn(monaco.languages, 'registerCodeActionProvider')
      .mockImplementation((_language, codeActionProvider) => {
        provider = codeActionProvider;
        return { dispose: providerDispose };
      });
    registerCommand = jest
      .spyOn(monaco.editor, 'registerCommand')
      .mockImplementation((_id, handler) => {
        commandHandler = handler as typeof commandHandler;
        return { dispose: commandDispose };
      });
  });

  afterEach(() => {
    registerCodeActionProvider.mockRestore();
    registerCommand.mockRestore();
  });

  const register = (
    overrides: Partial<Parameters<typeof registerSectionCodeActionProvider>[0]> = {},
    model = fakeModel(YAML_TEXT)
  ) => {
    const editor = {
      getModel: () => model,
      setSelection: jest.fn(),
      revealLineInCenter: jest.fn(),
    };
    const disposable = registerSectionCodeActionProvider({
      getLookup: () => lookupOf(YAML_TEXT),
      isEditorModel: (candidate) => candidate === model,
      isReadOnly: () => false,
      getEditor: () => editor as unknown as monaco.editor.IStandaloneCodeEditor,
      ...overrides,
    });
    return { model, editor, disposable };
  };

  const provide = (model: monaco.editor.ITextModel, selection: monaco.Range) =>
    provider.provideCodeActions(
      model,
      selection,
      { markers: [], only: undefined, trigger: monaco.languages.CodeActionTriggerType.Invoke },
      {} as monaco.CancellationToken
    ) as monaco.languages.CodeActionList;

  /** Applies the single text edit of an action to the model's text. */
  const applyEdit = (model: monaco.editor.ITextModel, action: monaco.languages.CodeAction) => {
    const [{ textEdit }] = (action.edit as monaco.languages.WorkspaceEdit).edits as Array<{
      textEdit: { range: monaco.IRange; text: string };
    }>;
    const lines = model.getValue().split('\n');
    const offsetOf = (line: number, column: number) =>
      lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0) + column - 1;
    const text = model.getValue();
    return (
      text.slice(0, offsetOf(textEdit.range.startLineNumber, textEdit.range.startColumn)) +
      textEdit.text +
      text.slice(offsetOf(textEdit.range.endLineNumber, textEdit.range.endColumn))
    );
  };

  it('registers the provider for YAML and the command that names the section', () => {
    const { disposable } = register();

    expect(registerCodeActionProvider).toHaveBeenCalledWith('yaml', expect.any(Object));
    expect(registerCommand).toHaveBeenCalledWith(
      SELECT_SECTION_NAME_COMMAND_ID,
      expect.any(Function)
    );

    disposable.dispose();
    expect(providerDispose).toHaveBeenCalled();
    expect(commandDispose).toHaveBeenCalled();
  });

  it('offers to wrap the steps that are selected, and the edit does it', () => {
    const { model } = register();

    const { actions } = provide(model, range(2, 1, 5, 20));

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe('Wrap 2 steps in section');
    expect(actions[0].kind).toBe('refactor.rewrite');
    expect(applyEdit(model, actions[0])).toBe(`steps:
  - name: section
    type: section
    steps:
      - name: a
        type: console
      - name: b
        type: console
  - name: box
    type: section
    steps:
      - name: s1
        type: console
`);
    expect(actions[0].command).toEqual({
      id: SELECT_SECTION_NAME_COMMAND_ID,
      title: 'Name the section',
      arguments: ['section'],
    });
  });

  it('edits only the text that changes', () => {
    const { model } = register();
    const { actions } = provide(model, range(2, 1, 5, 20));
    const [{ textEdit }] = (actions[0].edit as monaco.languages.WorkspaceEdit).edits as Array<{
      textEdit: { range: monaco.IRange };
    }>;

    // The header goes in at the first step; nothing before it is touched.
    expect(textEdit.range.startLineNumber).toBe(2);
  });

  it('offers to unwrap a section from its header, and the edit does it', () => {
    const { model } = register();

    const { actions } = provide(model, range(6, 5, 6, 5));

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe('Unwrap section "box"');
    expect(applyEdit(model, actions[0])).toBe(`steps:
  - name: a
    type: console
  - name: b
    type: console
  - name: s1
    type: console
`);
    expect(actions[0].command).toBeUndefined();
  });

  it('offers nothing for another model, a read-only editor, or before the workflow is known', () => {
    const { model } = register();
    expect(
      provide(fakeModel(YAML_TEXT, 'inmemory://preview.yaml'), range(2, 1, 5, 20)).actions
    ).toEqual([]);

    register({ isReadOnly: () => true }, model);
    expect(provide(model, range(2, 1, 5, 20)).actions).toEqual([]);

    register({ getLookup: () => undefined }, model);
    expect(provide(model, range(2, 1, 5, 20)).actions).toEqual([]);
  });

  describe('naming the new section', () => {
    it('selects the section name so it can be typed over', () => {
      const text = 'steps:\n  - name: section\n    type: section\n';
      const { editor } = register({}, fakeModel(text));

      commandHandler(undefined, 'section');

      expect(editor.setSelection).toHaveBeenCalledWith(
        expect.objectContaining({
          startLineNumber: 2,
          startColumn: 11,
          endLineNumber: 2,
          endColumn: 18,
        })
      );
      expect(editor.revealLineInCenter).toHaveBeenCalledWith(2);
    });

    it('does nothing when the name is not there', () => {
      const { editor } = register({}, fakeModel('steps: []\n'));

      commandHandler(undefined, 'section');

      expect(editor.setSelection).not.toHaveBeenCalled();
    });
  });
});
