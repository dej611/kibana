/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { isObject } from 'lodash';
import { i18n } from '@kbn/i18n';
import type { TinymathAST, TinymathVariable } from '@kbn/tinymath';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiDescriptionList,
  EuiText,
  EuiSpacer,
  EuiModal,
  EuiModalHeader,
  EuiModalFooter,
} from '@elastic/eui';
import { monaco } from '@kbn/monaco';
import {
  CodeEditor,
  CodeEditorProps,
  Markdown,
} from '../../../../../../../../src/plugins/kibana_react/public';
import {
  OperationDefinition,
  GenericOperationDefinition,
  IndexPatternColumn,
  ParamEditorProps,
} from '../index';
import { ReferenceBasedIndexPatternColumn } from '../column_types';
import { IndexPattern, IndexPatternLayer } from '../../../types';
import { getColumnOrder } from '../../layer_helpers';
import { mathOperation } from './math';
import { documentField } from '../../../document_field';
import { ErrorWrapper, runASTValidation, shouldHaveFieldArgument, tryToParse } from './validation';
import {
  extractParamsForFormula,
  findVariables,
  getOperationParams,
  getSafeFieldName,
  groupArgsByType,
  hasMathNode,
  tinymathFunctions,
} from './util';
import { useDebounceWithOptions } from '../helpers';
import {
  LensMathSuggestion,
  SUGGESTION_TYPE,
  suggest,
  getSuggestion,
  getPossibleFunctions,
  getSignatureHelp,
} from './math_completion';
import { LANGUAGE_ID } from './math_tokenization';

import './formula.scss';

const defaultLabel = i18n.translate('xpack.lens.indexPattern.formulaLabel', {
  defaultMessage: 'Formula',
});
export interface FormulaIndexPatternColumn extends ReferenceBasedIndexPatternColumn {
  operationType: 'formula';
  params: {
    formula?: string;
    isFormulaBroken?: boolean;
    // last value on numeric fields can be formatted
    format?: {
      id: string;
      params?: {
        decimals: number;
      };
    };
  };
}

export const formulaOperation: OperationDefinition<
  FormulaIndexPatternColumn,
  'managedReference'
> = {
  type: 'formula',
  displayName: defaultLabel,
  getDefaultLabel: (column, indexPattern) => defaultLabel,
  input: 'managedReference',
  hidden: true,
  getDisabledStatus(indexPattern: IndexPattern) {
    return undefined;
  },
  getErrorMessage(layer, columnId, indexPattern, operationDefinitionMap) {
    const column = layer.columns[columnId] as FormulaIndexPatternColumn;
    if (!column.params.formula || !operationDefinitionMap) {
      return;
    }
    const { root, error } = tryToParse(column.params.formula);
    if (error || !root) {
      return [error!.message];
    }

    const errors = runASTValidation(root, layer, indexPattern, operationDefinitionMap);
    return errors.length ? errors.map(({ message }) => message) : undefined;
  },
  getPossibleOperation() {
    return {
      dataType: 'number',
      isBucketed: false,
      scale: 'ratio',
    };
  },
  toExpression: (layer, columnId) => {
    const currentColumn = layer.columns[columnId] as FormulaIndexPatternColumn;
    const params = currentColumn.params;
    // TODO: improve this logic
    const useDisplayLabel = currentColumn.label !== defaultLabel;
    const label = !params?.isFormulaBroken
      ? useDisplayLabel
        ? currentColumn.label
        : params?.formula
      : '';
    return [
      {
        type: 'function',
        function: 'mapColumn',
        arguments: {
          id: [columnId],
          name: [label || ''],
          exp: [
            {
              type: 'expression',
              chain: [
                {
                  type: 'function',
                  function: 'math',
                  arguments: {
                    expression: [`${currentColumn.references[0]}`],
                  },
                },
              ],
            },
          ],
        },
      },
    ];
  },
  buildColumn({ previousColumn, layer }, _, operationDefinitionMap) {
    let previousFormula = '';
    if (previousColumn) {
      if ('references' in previousColumn) {
        const metric = layer.columns[previousColumn.references[0]];
        if (metric && 'sourceField' in metric) {
          const fieldName = getSafeFieldName(metric.sourceField);
          // TODO need to check the input type from the definition
          previousFormula += `${previousColumn.operationType}(${metric.operationType}(${fieldName})`;
        }
      } else {
        if (previousColumn && 'sourceField' in previousColumn) {
          previousFormula += `${previousColumn.operationType}(${getSafeFieldName(
            previousColumn?.sourceField
          )}`;
        }
      }
      const formulaNamedArgs = extractParamsForFormula(previousColumn, operationDefinitionMap);
      if (formulaNamedArgs.length) {
        previousFormula +=
          ', ' + formulaNamedArgs.map(({ name, value }) => `${name}=${value}`).join(', ');
      }
      // close the formula at the end
      previousFormula += ')';
    }
    // carry over the format settings from previous operation for seamless transfer
    // NOTE: this works only for non-default formatters set in Lens
    let prevFormat = {};
    if (previousColumn?.params && 'format' in previousColumn.params) {
      prevFormat = { format: previousColumn.params.format };
    }
    return {
      label: 'Formula',
      dataType: 'number',
      operationType: 'formula',
      isBucketed: false,
      scale: 'ratio',
      params: previousFormula
        ? { formula: previousFormula, isFormulaBroken: false, ...prevFormat }
        : { ...prevFormat },
      references: [],
    };
  },
  isTransferable: (column, newIndexPattern, operationDefinitionMap) => {
    // Basic idea: if it has any math operation in it, probably it cannot be transferable
    const { root, error } = tryToParse(column.params.formula || '');
    if (!root) return true;
    return Boolean(!error && !hasMathNode(root));
  },

  paramEditor: FormulaEditor,
};

function FormulaEditor({
  layer,
  updateLayer,
  currentColumn,
  columnId,
  http,
  indexPattern,
  operationDefinitionMap,
}: ParamEditorProps<FormulaIndexPatternColumn>) {
  const [text, setText] = useState(currentColumn.params.formula);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const editorModel = React.useRef<monaco.editor.ITextModel>(
    monaco.editor.createModel(text ?? '', LANGUAGE_ID)
  );
  const overflowDiv = React.useRef<HTMLElement>();
  useEffect(() => {
    const node = (overflowDiv.current = document.createElement('div'));
    node.setAttribute('data-test-subj', 'lnsFormulaWidget');
    // Add the monaco-editor class because the monaco css depends on it to target
    // children
    node.classList.add('lnsFormulaOverflow', 'monaco-editor');
    document.body.appendChild(overflowDiv.current);
    const model = editorModel.current;
    return () => {
      // Clean up the manually-created model
      model.dispose();
      node.parentNode?.removeChild(node);
    };
  }, []);

  useDebounceWithOptions(
    () => {
      if (!editorModel.current) return;

      if (!text) {
        monaco.editor.setModelMarkers(editorModel.current, 'LENS', []);
        return;
      }

      let errors: ErrorWrapper[] = [];

      const { root, error } = tryToParse(text);
      if (!root) return;
      if (error) {
        errors = [error];
      } else {
        const validationErrors = runASTValidation(
          root,
          layer,
          indexPattern,
          operationDefinitionMap
        );
        if (validationErrors.length) {
          errors = validationErrors;
        }
      }

      if (errors.length) {
        monaco.editor.setModelMarkers(
          editorModel.current,
          'LENS',
          errors.flatMap((innerError) =>
            innerError.locations.map((location) => ({
              message: innerError.message,
              startColumn: location.min + 1,
              endColumn: location.max + 1,
              // Fake, assumes single line
              startLineNumber: 1,
              endLineNumber: 1,
              severity: monaco.MarkerSeverity.Error,
            }))
          )
        );
      } else {
        monaco.editor.setModelMarkers(editorModel.current, 'LENS', []);
      }
    },
    // Make it validate on flyout open in case of a broken formula left over
    // from a previous edit
    { skipFirstRender: text == null },
    256,
    [text]
  );

  const provideCompletionItems = useCallback(
    async (
      model: monaco.editor.ITextModel,
      position: monaco.Position,
      context: monaco.languages.CompletionContext
    ) => {
      const innerText = model.getValue();
      const textRange = model.getFullModelRange();
      let wordRange: monaco.Range;
      let aSuggestions: { list: LensMathSuggestion[]; type: SUGGESTION_TYPE } = {
        list: [],
        type: SUGGESTION_TYPE.FIELD,
      };

      const lengthAfterPosition = model.getValueLengthInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: textRange.endLineNumber,
        endColumn: textRange.endColumn,
      });

      if (context.triggerCharacter === '(') {
        const wordUntil = model.getWordAtPosition(position.delta(0, -3));
        if (wordUntil) {
          wordRange = new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
          );

          // Retrieve suggestions for subexpressions
          // TODO: make this work for expressions nested more than one level deep
          aSuggestions = await suggest(
            innerText.substring(0, innerText.length - lengthAfterPosition) + ')',
            innerText.length - lengthAfterPosition,
            context,
            indexPattern,
            operationDefinitionMap
          );
        }
      } else {
        const wordUntil = model.getWordUntilPosition(position);
        wordRange = new monaco.Range(
          position.lineNumber,
          wordUntil.startColumn,
          position.lineNumber,
          wordUntil.endColumn
        );
        aSuggestions = await suggest(
          innerText,
          innerText.length - lengthAfterPosition,
          context,
          indexPattern,
          operationDefinitionMap,
          wordUntil
        );
      }

      return {
        suggestions: aSuggestions.list.map((s) =>
          getSuggestion(s, aSuggestions.type, wordRange, operationDefinitionMap)
        ),
      };
    },
    [indexPattern, operationDefinitionMap]
  );

  const provideSignatureHelp = useCallback(
    async (
      model: monaco.editor.ITextModel,
      position: monaco.Position,
      token: monaco.CancellationToken,
      context: monaco.languages.SignatureHelpContext
    ) => {
      const innerText = model.getValue();
      const textRange = model.getFullModelRange();

      const lengthAfterPosition = model.getValueLengthInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: textRange.endLineNumber,
        endColumn: textRange.endColumn,
      });
      return getSignatureHelp(
        model.getValue(),
        innerText.length - lengthAfterPosition,
        operationDefinitionMap
      );
    },
    [operationDefinitionMap]
  );

  const codeEditorOptions: CodeEditorProps = {
    languageId: LANGUAGE_ID,
    value: text ?? '',
    onChange: setText,
    options: {
      automaticLayout: false,
      fontSize: 14,
      folding: false,
      lineNumbers: 'off',
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      wordWrap: 'on',
      // Disable suggestions that appear when we don't provide a default suggestion
      wordBasedSuggestions: false,
      wrappingIndent: 'indent',
      dimension: { width: 300, height: 280 },
      fixedOverflowWidgets: true,
    },
  };

  useEffect(() => {
    // Because the monaco model is owned by Lens, we need to manually attach handlers
    monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
      triggerCharacters: ['.', ',', '(', '='],
      provideCompletionItems,
    });
    monaco.languages.registerSignatureHelpProvider(LANGUAGE_ID, {
      signatureHelpTriggerCharacters: ['(', ',', '='],
      provideSignatureHelp,
    });
  }, [provideCompletionItems, provideSignatureHelp]);

  return (
    <div className="lnsIndexPatternDimensionEditor__section lnsIndexPatternDimensionEditor__section--shaded">
      <CodeEditor
        {...codeEditorOptions}
        height={50}
        width={'100%'}
        options={{
          ...codeEditorOptions.options,
          // Shared model and overflow node
          overflowWidgetsDomNode: overflowDiv?.current ?? undefined,
          model: editorModel.current,
        }}
      />
      <EuiSpacer />
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiButton onClick={() => setIsOpen(!isOpen)} iconType="expand" size="s">
            {i18n.translate('xpack.lens.formula.expandEditorLabel', {
              defaultMessage: 'Pop out',
            })}
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiButton
            disabled={currentColumn.params.formula === text}
            color={currentColumn.params.formula !== text ? 'primary' : 'text'}
            fill={currentColumn.params.formula !== text}
            onClick={() => {
              updateLayer(
                regenerateLayerFromAst(
                  text || '',
                  layer,
                  columnId,
                  currentColumn,
                  indexPattern,
                  operationDefinitionMap
                )
              );
            }}
            iconType="play"
            size="s"
          >
            {i18n.translate('xpack.lens.indexPattern.formulaSubmitLabel', {
              defaultMessage: 'Submit',
            })}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isOpen ? (
        <EuiModal
          onClose={() => {
            setIsOpen(false);
            setText(currentColumn.params.formula);
          }}
        >
          <EuiModalHeader>
            <h1>
              {i18n.translate('xpack.lens.formula.formulaEditorLabel', {
                defaultMessage: 'Formula editor',
              })}
            </h1>
          </EuiModalHeader>
          <EuiFlexGroup>
            <EuiFlexItem>
              <div className="lnsIndexPatternDimensionEditor__section lnsIndexPatternDimensionEditor__section--shaded">
                <CodeEditor
                  {...codeEditorOptions}
                  height={280}
                  width={300}
                  options={{
                    ...codeEditorOptions.options,
                    // Shared model and overflow node
                    overflowWidgetsDomNode: overflowDiv?.current ?? undefined,
                    model: editorModel?.current,
                  }}
                />
              </div>
            </EuiFlexItem>
            <EuiFlexItem>
              <div className="lnsIndexPatternDimensionEditor__section lnsIndexPatternDimensionEditor__section--shaded">
                <EuiText>
                  {i18n.translate('xpack.lens.formula.functionReferenceLabel', {
                    defaultMessage: 'Function reference',
                  })}
                </EuiText>
                <EuiSpacer size="s" />
                <div style={{ height: 250, overflow: 'auto' }}>
                  <EuiText size="s">
                    <Markdown
                      markdown={i18n.translate('xpack.lens.formulaDocumentation', {
                        defaultMessage: `
## How it works

Lens formulas let you do math using a combination of Elasticsearch aggregations and
math functions. There are three main types of functions:

* Elasticsearch metrics, like sum(bytes)
* Time series functions use Elasticsearch metrics as input, like cumulative_sum()
* Math functions like round()

An example formula that uses all of these:

round(100 * moving_average(avg(cpu.load.pct), window=10))

Elasticsearch functions take a field name, which can be in quotes. sum(bytes) is the same
as sum("bytes").

Some functions take named arguments, like moving_average(count(), window=5)

Math functions can take positional arguments, like pow(count(), 3) is the same as count() * count() * count()

### Basic math

Use the symbols +, -, /, and * to perform basic math.
                  `,
                        description:
                          'Text is in markdown. Do not translate function names or field names like sum(bytes)',
                      })}
                    />

                    <EuiDescriptionList
                      compressed
                      listItems={getPossibleFunctions(indexPattern)
                        .filter((key) => key in tinymathFunctions)
                        .map((key) => ({
                          title: `${key}`,
                          description: <Markdown markdown={tinymathFunctions[key].help} />,
                        }))}
                    />
                  </EuiText>

                  <EuiSpacer />

                  <EuiText>
                    {i18n.translate('xpack.lens.formula.elasticsearchFunctions', {
                      defaultMessage: 'Elasticsearch aggregations',
                      description: 'Do not translate Elasticsearch',
                    })}
                  </EuiText>
                  <EuiDescriptionList
                    compressed
                    listItems={getPossibleFunctions(indexPattern)
                      .filter((key) => key in operationDefinitionMap)
                      .map((key) => ({
                        title: `${key}: ${operationDefinitionMap[key].displayName}`,
                        description: getHelpText(key, operationDefinitionMap),
                      }))}
                  />
                </div>
              </div>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiModalFooter>
            <EuiButton
              color="text"
              onClick={() => {
                setIsOpen(false);
                setText(currentColumn.params.formula);
              }}
              iconType="cross"
            >
              {i18n.translate('xpack.lens.indexPattern.formulaCancelLabel', {
                defaultMessage: 'Cancel',
              })}
            </EuiButton>
            <EuiButton
              disabled={currentColumn.params.formula === text}
              color={currentColumn.params.formula !== text ? 'primary' : 'text'}
              fill={currentColumn.params.formula !== text}
              onClick={() => {
                updateLayer(
                  regenerateLayerFromAst(
                    text || '',
                    layer,
                    columnId,
                    currentColumn,
                    indexPattern,
                    operationDefinitionMap
                  )
                );
              }}
              iconType="play"
            >
              {i18n.translate('xpack.lens.indexPattern.formulaSubmitLabel', {
                defaultMessage: 'Submit',
              })}
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      ) : null}
    </div>
  );
}

function parseAndExtract(
  text: string,
  layer: IndexPatternLayer,
  columnId: string,
  indexPattern: IndexPattern,
  operationDefinitionMap: Record<string, GenericOperationDefinition>
) {
  const { root, error } = tryToParse(text);
  if (error || !root) {
    return { extracted: [], isValid: false };
  }
  // before extracting the data run the validation task and throw if invalid
  const errors = runASTValidation(root, layer, indexPattern, operationDefinitionMap);
  if (errors.length) {
    return { extracted: [], isValid: false };
  }
  /*
    { name: 'add', args: [ { name: 'abc', args: [5] }, 5 ] }
    */
  const extracted = extractColumns(columnId, operationDefinitionMap, root, layer, indexPattern);
  return { extracted, isValid: true };
}

export function regenerateLayerFromAst(
  text: string,
  layer: IndexPatternLayer,
  columnId: string,
  currentColumn: FormulaIndexPatternColumn,
  indexPattern: IndexPattern,
  operationDefinitionMap: Record<string, GenericOperationDefinition>
) {
  const { extracted, isValid } = parseAndExtract(
    text,
    layer,
    columnId,
    indexPattern,
    operationDefinitionMap
  );

  const columns = {
    ...layer.columns,
  };

  Object.keys(columns).forEach((k) => {
    if (k.startsWith(columnId)) {
      delete columns[k];
    }
  });

  extracted.forEach((extractedColumn, index) => {
    columns[`${columnId}X${index}`] = extractedColumn;
  });

  columns[columnId] = {
    ...currentColumn,
    params: {
      ...currentColumn.params,
      formula: text,
      isFormulaBroken: !isValid,
    },
    references: !isValid ? [] : [`${columnId}X${extracted.length - 1}`],
  };

  return {
    ...layer,
    columns,
    columnOrder: getColumnOrder({
      ...layer,
      columns,
    }),
  };

  // TODO
  // turn ast into referenced columns
  // set state
}

function extractColumns(
  idPrefix: string,
  operations: Record<string, GenericOperationDefinition>,
  ast: TinymathAST,
  layer: IndexPatternLayer,
  indexPattern: IndexPattern
) {
  const columns: IndexPatternColumn[] = [];

  function parseNode(node: TinymathAST) {
    if (typeof node === 'number' || node.type !== 'function') {
      // leaf node
      return node;
    }

    const nodeOperation = operations[node.name];
    if (!nodeOperation) {
      // it's a regular math node
      const consumedArgs = node.args.map(parseNode).filter(Boolean) as Array<
        number | TinymathVariable
      >;
      return {
        ...node,
        args: consumedArgs,
      };
    }

    // split the args into types for better TS experience
    const { namedArguments, variables, functions } = groupArgsByType(node.args);

    // operation node
    if (nodeOperation.input === 'field') {
      const [fieldName] = variables.filter((v): v is TinymathVariable => isObject(v));
      // a validation task passed before executing this and checked already there's a field
      const field = shouldHaveFieldArgument(node)
        ? indexPattern.getFieldByName(fieldName.value)!
        : documentField;

      const mappedParams = getOperationParams(nodeOperation, namedArguments || []);

      const newCol = (nodeOperation as OperationDefinition<
        IndexPatternColumn,
        'field'
      >).buildColumn(
        {
          layer,
          indexPattern,
          field,
        },
        mappedParams
      );
      const newColId = `${idPrefix}X${columns.length}`;
      newCol.customLabel = true;
      newCol.label = newColId;
      columns.push(newCol);
      // replace by new column id
      return newColId;
    }

    if (nodeOperation.input === 'fullReference') {
      const [referencedOp] = functions;
      const consumedParam = parseNode(referencedOp);

      const subNodeVariables = consumedParam ? findVariables(consumedParam) : [];
      const mathColumn = mathOperation.buildColumn({
        layer,
        indexPattern,
      });
      mathColumn.references = subNodeVariables.map(({ value }) => value);
      mathColumn.params.tinymathAst = consumedParam!;
      columns.push(mathColumn);
      mathColumn.customLabel = true;
      mathColumn.label = `${idPrefix}X${columns.length - 1}`;

      const mappedParams = getOperationParams(nodeOperation, namedArguments || []);
      const newCol = (nodeOperation as OperationDefinition<
        IndexPatternColumn,
        'fullReference'
      >).buildColumn(
        {
          layer,
          indexPattern,
          referenceIds: [`${idPrefix}X${columns.length - 1}`],
        },
        mappedParams
      );
      const newColId = `${idPrefix}X${columns.length}`;
      newCol.customLabel = true;
      newCol.label = newColId;
      columns.push(newCol);
      // replace by new column id
      return newColId;
    }
  }
  const root = parseNode(ast);
  if (root === undefined) {
    return [];
  }
  const variables = findVariables(root);
  const mathColumn = mathOperation.buildColumn({
    layer,
    indexPattern,
  });
  mathColumn.references = variables.map(({ value }) => value);
  mathColumn.params.tinymathAst = root!;
  const newColId = `${idPrefix}X${columns.length}`;
  mathColumn.customLabel = true;
  mathColumn.label = newColId;
  columns.push(mathColumn);
  return columns;
}

// TODO: i18n this whole thing, or move examples into the operation definitions with i18n
function getHelpText(
  type: string,
  operationDefinitionMap: ParamEditorProps<FormulaIndexPatternColumn>['operationDefinitionMap']
) {
  const definition = operationDefinitionMap[type];

  if (type === 'count') {
    return (
      <EuiText size="s">
        <p>Example: count()</p>
      </EuiText>
    );
  }

  return (
    <EuiText size="s">
      {definition.input === 'field' ? <p>Example: {type}(bytes)</p> : null}
      {definition.input === 'fullReference' && !('operationParams' in definition) ? (
        <p>Example: {type}(sum(bytes))</p>
      ) : null}

      {'operationParams' in definition && definition.operationParams ? (
        <p>
          <p>
            Example: {type}(sum(bytes),{' '}
            {definition.operationParams.map((p) => `${p.name}=5`).join(', ')})
          </p>
        </p>
      ) : null}
    </EuiText>
  );
}
