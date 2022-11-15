/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useRef } from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiFlexGroup, EuiFlexItem, EuiText, EuiIcon, EuiEmptyPrompt } from '@elastic/eui';
import {
  ExpressionRendererEvent,
  ReactExpressionRendererType,
  ReactExpressionRendererProps,
} from '@kbn/expressions-plugin/public';
import type { KibanaExecutionContext } from '@kbn/core/public';
import { ExecutionContextSearch } from '@kbn/data-plugin/public';
import { DefaultInspectorAdapters, RenderMode } from '@kbn/expressions-plugin/common';
import classNames from 'classnames';
import { getOriginalRequestErrorMessages } from '../editor_frame_service/error_helper';
import { ErrorMessage } from '../editor_frame_service/types';
import { LensInspector } from '../lens_inspector_service';

export interface ExpressionWrapperProps {
  ExpressionRenderer: ReactExpressionRendererType;
  expression: string | null;
  errors: ErrorMessage[] | undefined;
  variables?: Record<string, unknown>;
  interactive?: boolean;
  searchContext: ExecutionContextSearch;
  searchSessionId?: string;
  handleEvent: (event: ExpressionRendererEvent) => void;
  onData$: (
    data: unknown,
    inspectorAdapters?: Partial<DefaultInspectorAdapters> | undefined
  ) => void;
  onRender$: () => void;
  renderMode?: RenderMode;
  syncColors?: boolean;
  syncTooltips?: boolean;
  syncCursor?: boolean;
  hasCompatibleActions?: ReactExpressionRendererProps['hasCompatibleActions'];
  style?: React.CSSProperties;
  className?: string;
  canEdit: boolean;
  onRuntimeError: (message?: string) => void;
  onExpressionError: () => void;
  executionContext?: KibanaExecutionContext;
  lensInspector: LensInspector;
  noPadding?: boolean;
}

interface VisualizationErrorProps {
  errors: ExpressionWrapperProps['errors'];
  canEdit: boolean;
  onExpressionError: ExpressionWrapperProps['onExpressionError'];
  searchSessionId?: string;
}

export function VisualizationErrorPanel({
  errors,
  canEdit,
  onExpressionError,
  searchSessionId,
}: VisualizationErrorProps) {
  // use a combination of sessionid + error messages to decide whether to trigger a rerender
  const rerenderKey = `${searchSessionId || ''}-${errors
    ?.map(({ longMessage }) => longMessage)
    .join('-')}`;

  const keyRef = useRef(rerenderKey);
  // Skip error logging when no search session id is passed
  if (keyRef.current !== rerenderKey) {
    keyRef.current = rerenderKey;
    onExpressionError();
  }

  const showMore = errors && errors.length > 1;
  const canFixInLens = canEdit && errors?.some(({ type }) => type === 'fixable');
  return (
    <div className="lnsEmbeddedError">
      <EuiEmptyPrompt
        iconType="alert"
        iconColor="danger"
        data-test-subj="embeddable-lens-failure"
        body={
          <>
            {errors ? (
              <>
                <p>{errors[0].longMessage}</p>
                {showMore && !canFixInLens ? (
                  <p>
                    <FormattedMessage
                      id="xpack.lens.embeddable.moreErrors"
                      defaultMessage="Edit in Lens editor to see more errors"
                    />
                  </p>
                ) : null}
                {canFixInLens ? (
                  <p>
                    <FormattedMessage
                      id="xpack.lens.embeddable.fixErrors"
                      defaultMessage="Edit in Lens editor to fix the error"
                    />
                  </p>
                ) : null}
              </>
            ) : (
              <p>
                <FormattedMessage
                  id="xpack.lens.embeddable.failure"
                  defaultMessage="Visualization couldn't be displayed"
                />
              </p>
            )}
          </>
        }
      />
    </div>
  );
}

export function ExpressionWrapper({
  ExpressionRenderer: ExpressionRendererComponent,
  expression,
  searchContext,
  variables,
  handleEvent,
  interactive,
  searchSessionId,
  onData$,
  onRender$,
  renderMode,
  syncColors,
  syncTooltips,
  syncCursor,
  hasCompatibleActions,
  style,
  className,
  errors,
  canEdit,
  onRuntimeError,
  onExpressionError,
  executionContext,
  lensInspector,
  noPadding,
}: ExpressionWrapperProps) {
  return (
    <I18nProvider>
      {errors || expression === null || expression === '' ? (
        <VisualizationErrorPanel
          errors={errors}
          canEdit={canEdit}
          onExpressionError={onExpressionError}
          searchSessionId={searchSessionId}
        />
      ) : (
        <div className={classNames('lnsExpressionRenderer', className)} style={style}>
          <ExpressionRendererComponent
            className="lnsExpressionRenderer__component"
            padding={noPadding ? undefined : 's'}
            variables={variables}
            expression={expression}
            interactive={interactive}
            searchContext={searchContext}
            searchSessionId={searchSessionId}
            onData$={onData$}
            onRender$={onRender$}
            inspectorAdapters={lensInspector.adapters}
            renderMode={renderMode}
            syncColors={syncColors}
            syncTooltips={syncTooltips}
            syncCursor={syncCursor}
            executionContext={executionContext}
            renderError={(errorMessage, error) => {
              const messages = getOriginalRequestErrorMessages(error);
              onRuntimeError(messages[0] ?? errorMessage);

              return (
                <div data-test-subj="expression-renderer-error">
                  <EuiFlexGroup direction="column" alignItems="center" justifyContent="center">
                    <EuiFlexItem>
                      <EuiIcon type="alert" color="danger" />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      {messages.map((message) => (
                        <EuiText size="s">{message}</EuiText>
                      ))}
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </div>
              );
            }}
            onEvent={handleEvent}
            hasCompatibleActions={hasCompatibleActions}
          />
        </div>
      )}
    </I18nProvider>
  );
}
