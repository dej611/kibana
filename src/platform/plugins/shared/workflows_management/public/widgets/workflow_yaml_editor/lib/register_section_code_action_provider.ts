/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { monaco, YAML_LANG_ID } from '@kbn/code-editor';
import { i18n } from '@kbn/i18n';
import { planSectionCodeActions, toMinimalEdit } from './section_code_actions';
import type { WorkflowLookup } from '../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';

export const SELECT_SECTION_NAME_COMMAND_ID = 'workflows.editor.action.selectSectionName';

interface RegisterSectionCodeActionProviderParams {
  /** Read on every invocation, so the provider can be registered once. */
  getLookup: () => WorkflowLookup | undefined;
  /** Other yaml models can share the page (version preview), and only this one is editable. */
  isEditorModel: (model: monaco.editor.ITextModel) => boolean;
  isReadOnly: () => boolean;
  /** The editor, to select the new section's name in after it is wrapped. */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null | undefined;
}

const NO_ACTIONS: monaco.languages.CodeActionList = { actions: [], dispose: () => {} };

/** The change from the model's text to `after`, as an edit of only what differs. */
const toWorkspaceEdit = (
  model: monaco.editor.ITextModel,
  before: string,
  after: string
): monaco.languages.WorkspaceEdit => {
  const { start, end, text } = toMinimalEdit(before, after);
  return {
    edits: [
      {
        resource: model.uri,
        versionId: model.getVersionId(),
        textEdit: {
          range: monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end)),
          text,
        },
      },
    ],
  };
};

/** Selects the value of the step named `sectionName`, so it can be typed over. */
const selectSectionName = (
  editor: monaco.editor.IStandaloneCodeEditor | null | undefined,
  sectionName: string
): void => {
  const model = editor?.getModel();
  if (!editor || !model) return;
  for (let line = 1; line <= model.getLineCount(); line += 1) {
    const content = model.getLineContent(line);
    const match = /^(\s*-\s+name:\s*)(.*?)\s*$/.exec(content);
    if (match && match[2] === sectionName) {
      const startColumn = match[1].length + 1;
      editor.setSelection(
        new monaco.Selection(line, startColumn, line, startColumn + sectionName.length)
      );
      editor.revealLineInCenter(line);
      return;
    }
  }
};

/**
 * Offers to wrap the selected steps in a section, and to unwrap a section from its header.
 * Each is a minimal edit of the text, so a workflow is grouped without being rewritten.
 */
export const registerSectionCodeActionProvider = ({
  getLookup,
  isEditorModel,
  isReadOnly,
  getEditor,
}: RegisterSectionCodeActionProviderParams): monaco.IDisposable => {
  const commandDisposable = monaco.editor.registerCommand(
    SELECT_SECTION_NAME_COMMAND_ID,
    (_accessor, sectionName: string) => selectSectionName(getEditor(), sectionName)
  );

  const providerDisposable = monaco.languages.registerCodeActionProvider(YAML_LANG_ID, {
    provideCodeActions: (model, range) => {
      const lookup = getLookup();
      if (!lookup || isReadOnly() || !isEditorModel(model)) return NO_ACTIONS;

      const yaml = model.getValue();
      const { wrap, unwrap } = planSectionCodeActions({
        yaml,
        lookup,
        selection: {
          startLine: range.startLineNumber,
          startColumn: range.startColumn,
          endLine: range.endLineNumber,
          endColumn: range.endColumn,
        },
      });

      const actions: monaco.languages.CodeAction[] = [];
      if (wrap) {
        actions.push({
          title: i18n.translate('workflows.yamlEditor.wrapInSection', {
            defaultMessage: 'Wrap {count, plural, one {# step} other {# steps}} in section',
            values: { count: wrap.stepNames.length },
          }),
          kind: 'refactor.rewrite',
          edit: toWorkspaceEdit(model, yaml, wrap.yaml),
          command: {
            id: SELECT_SECTION_NAME_COMMAND_ID,
            title: i18n.translate('workflows.yamlEditor.nameSection', {
              defaultMessage: 'Name the section',
            }),
            arguments: [wrap.sectionName],
          },
        });
      }
      if (unwrap) {
        actions.push({
          title: i18n.translate('workflows.yamlEditor.unwrapSection', {
            defaultMessage: 'Unwrap section "{name}"',
            values: { name: unwrap.sectionName },
          }),
          kind: 'refactor.rewrite',
          edit: toWorkspaceEdit(model, yaml, unwrap.yaml),
        });
      }
      return { actions, dispose: () => {} };
    },
  });

  return {
    dispose: () => {
      commandDisposable.dispose();
      providerDisposable.dispose();
    },
  };
};
