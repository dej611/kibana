/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DefaultInspectorAdapters, RenderMode } from '@kbn/expressions-plugin/common';
import { apiPublishesSettings } from '@kbn/presentation-containers/interfaces/publishes_settings';
import { fetch$, apiHasExecutionContext, FetchContext } from '@kbn/presentation-publishing';
import { apiPublishesSearchSession } from '@kbn/presentation-publishing/interfaces/fetch/publishes_search_session';
import { KibanaExecutionContext } from '@kbn/core/public';
import { BehaviorSubject, Subscription } from 'rxjs';
import { getEditPath } from '../../common/constants';
import {
  ExpressionWrapperProps,
  GetStateType,
  LensApi,
  LensRuntimeState,
  VisualizationContextHelper,
} from './types';
import { getExpressionRendererParams } from './expressions/expression_params';
import { ReactiveConfigs } from './initializers/initialize_observables';
import { LensEmbeddableStartServices } from './types';
import { prepareCallbacks } from './expressions/callbacks';
import { buildUserMessagesHelper } from './userMessages/methods';
import { getLogError } from './expressions/telemetry';

/**
 * The function computes the expression used to render the panel and produces the necessary props
 * for the ExpressionWrapper component, binding any outer context to them.
 * @returns
 */
export function loadEmbeddableData(
  uuid: string,
  getState: GetStateType,
  api: LensApi,
  parentApi: unknown,
  {
    expressionParams$,
    expressionAbortController$,
    viewMode$,
    hasRenderCompleted$,
    state$,
  }: ReactiveConfigs['variables'] & { state$: BehaviorSubject<LensRuntimeState> },
  services: LensEmbeddableStartServices,
  { getVisualizationContext, updateVisualizationContext }: VisualizationContextHelper,
  updateRenderCount: () => void
) {
  // reset the render on reload
  hasRenderCompleted$.next(false);
  const dispatchRenderComplete = () => hasRenderCompleted$.next(true);

  const { getUserMessages, addUserMessages, resetRuntimeMessages } = buildUserMessagesHelper(
    getVisualizationContext,
    services
  );

  const unifiedSearch$ = new BehaviorSubject<
    Pick<FetchContext, 'query' | 'filters' | 'timeRange' | 'timeslice' | 'searchSessionId'>
  >({
    query: undefined,
    filters: undefined,
    timeRange: undefined,
    timeslice: undefined,
    searchSessionId: undefined,
  });

  async function reload() {
    resetRuntimeMessages();

    const currentState = getState();

    const { searchSessionId, ...unifiedSearch } = unifiedSearch$.getValue();

    const settings = apiPublishesSettings(parentApi)
      ? {
          syncColors: parentApi.settings.syncColors$.getValue(),
          syncCursor: parentApi.settings.syncCursor$.getValue(),
          syncTooltips: parentApi.settings.syncTooltips$.getValue(),
        }
      : {};

    const getExecutionContext = () => {
      const parentContext = apiHasExecutionContext(parentApi)
        ? parentApi.executionContext
        : undefined;
      const lastState = getState();
      if (lastState.attributes) {
        const child: KibanaExecutionContext = {
          type: 'lens',
          name: lastState.attributes.visualizationType ?? '',
          id: uuid || 'new',
          description: lastState.attributes.title || lastState.title || '',
          url: getEditPath(lastState.savedObjectId),
        };

        return parentContext
          ? {
              ...parentContext,
              child,
            }
          : child;
      }
    };

    const onDataCallback = (adapters: Partial<DefaultInspectorAdapters> | undefined) => {
      updateVisualizationContext({
        activeData: adapters?.tables?.tables,
      });
    };

    // const parentApiContext = apiHasAppContext(parentApi) ? parentApi.getAppContext() : undefined;
    const { params, abortController, ...rest } = await getExpressionRendererParams(currentState, {
      unifiedSearch,
      api,
      settings,
      renderMode: viewMode$.getValue() as RenderMode,
      services,
      searchSessionId,
      abortController: expressionAbortController$.getValue(),
      getExecutionContext,
      logError: getLogError(getExecutionContext),
      addUserMessages,
      ...prepareCallbacks(
        api,
        parentApi,
        getState,
        services,
        getExecutionContext,
        onDataCallback,
        dispatchRenderComplete
      ),
    });
    if (params?.expression != null) {
      expressionParams$.next(params);
    } else {
      // trigger a render complete on error
      dispatchRenderComplete();
    }
    expressionAbortController$.next(abortController);

    updateRenderCount();
    updateVisualizationContext({
      doc: currentState.attributes,
      mergedSearchContext: params?.searchContext || {},
      ...rest,
    });
  }

  const subscriptions: Subscription[] = [
    // on data change from the parentApi, reload
    fetch$(api).subscribe(async (data) => {
      const searchSessionId = apiPublishesSearchSession(parentApi) ? data.searchSessionId : '';
      unifiedSearch$.next({
        query: data.query,
        filters: data.filters,
        timeRange: data.timeRange,
        timeslice: data.timeslice,
        searchSessionId,
      });

      reload();
    }),
    // On state change, reload
    // this is used to refresh the chart on inline editing
    state$.subscribe(reload),

    // reload on view mode change only if drilldowns are set
    viewMode$.subscribe(() => {
      // only reload if drilldowns are set
      if (getState().enhancements?.dynamicActions) {
        reload();
      }
    }),
  ];

  return {
    getUserMessages,
    addUserMessages,
    cleanup: () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    },
  };
}

export function hasExpressionParamsToRender(
  params: Partial<ExpressionWrapperProps>
): params is ExpressionWrapperProps {
  return params.expression != null;
}
