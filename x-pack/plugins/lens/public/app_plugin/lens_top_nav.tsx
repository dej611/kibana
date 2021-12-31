/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual } from 'lodash';
import { i18n } from '@kbn/i18n';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Datatable } from 'src/plugins/expressions';
import { TopNavMenuData } from '../../../../../src/plugins/navigation/public';
import {
  LensAppServices,
  LensTopNavActions,
  LensTopNavMenuProps,
  LensTopNavTooltips,
} from './types';
import { downloadMultipleAs } from '../../../../../src/plugins/share/public';
import { trackUiEvent } from '../lens_ui_telemetry';
import { tableHasFormulas } from '../../../../../src/plugins/data/common';
import { exporters, IndexPattern } from '../../../../../src/plugins/data/public';
import { useKibana } from '../../../../../src/plugins/kibana_react/public';
import {
  setState,
  useLensSelector,
  useLensDispatch,
  LensAppState,
  DispatchSetState,
} from '../state_management';
import { getIndexPatternsObjects, getIndexPatternsIds, getResolvedDateRange } from '../utils';

function getLensTopNavConfig(options: {
  showSaveAndReturn: boolean;
  enableExportToCSV: boolean;
  showCancel: boolean;
  isByValueMode: boolean;
  allowByValue: boolean;
  actions: LensTopNavActions;
  tooltips: LensTopNavTooltips;
  savingToLibraryPermitted: boolean;
  savingToDashboardPermitted: boolean;
}): TopNavMenuData[] {
  const {
    actions,
    showCancel,
    allowByValue,
    enableExportToCSV,
    showSaveAndReturn,
    savingToLibraryPermitted,
    savingToDashboardPermitted,
    tooltips,
  } = options;
  const topNavMenu: TopNavMenuData[] = [];

  const enableSaveButton =
    savingToLibraryPermitted ||
    (allowByValue &&
      savingToDashboardPermitted &&
      !options.isByValueMode &&
      !options.showSaveAndReturn);

  const saveButtonLabel = options.isByValueMode
    ? i18n.translate('xpack.lens.app.addToLibrary', {
        defaultMessage: 'Save to library',
      })
    : options.showSaveAndReturn
    ? i18n.translate('xpack.lens.app.saveAs', {
        defaultMessage: 'Save as',
      })
    : i18n.translate('xpack.lens.app.save', {
        defaultMessage: 'Save',
      });

  topNavMenu.push({
    label: i18n.translate('xpack.lens.app.inspect', {
      defaultMessage: 'Inspect',
    }),
    run: actions.inspect,
    testId: 'lnsApp_inspectButton',
    description: i18n.translate('xpack.lens.app.inspectAriaLabel', {
      defaultMessage: 'inspect',
    }),
    disableButton: false,
  });

  topNavMenu.push({
    label: i18n.translate('xpack.lens.app.downloadCSV', {
      defaultMessage: 'Download as CSV',
    }),
    run: actions.exportToCSV,
    testId: 'lnsApp_downloadCSVButton',
    description: i18n.translate('xpack.lens.app.downloadButtonAriaLabel', {
      defaultMessage: 'Download the data as CSV file',
    }),
    disableButton: !enableExportToCSV,
    tooltip: tooltips.showExportWarning,
  });

  if (showCancel) {
    topNavMenu.push({
      label: i18n.translate('xpack.lens.app.cancel', {
        defaultMessage: 'Cancel',
      }),
      run: actions.cancel,
      testId: 'lnsApp_cancelButton',
      description: i18n.translate('xpack.lens.app.cancelButtonAriaLabel', {
        defaultMessage: 'Return to the last app without saving changes',
      }),
    });
  }

  topNavMenu.push({
    label: saveButtonLabel,
    iconType: !showSaveAndReturn ? 'save' : undefined,
    emphasize: !showSaveAndReturn,
    run: actions.showSaveModal,
    testId: 'lnsApp_saveButton',
    description: i18n.translate('xpack.lens.app.saveButtonAriaLabel', {
      defaultMessage: 'Save the current lens visualization',
    }),
    disableButton: !enableSaveButton,
  });

  if (showSaveAndReturn) {
    topNavMenu.push({
      label: i18n.translate('xpack.lens.app.saveAndReturn', {
        defaultMessage: 'Save and return',
      }),
      emphasize: true,
      iconType: 'checkInCircleFilled',
      run: actions.saveAndReturn,
      testId: 'lnsApp_saveAndReturnButton',
      disableButton: !savingToDashboardPermitted,
      description: i18n.translate('xpack.lens.app.saveAndReturnButtonAriaLabel', {
        defaultMessage: 'Save the current lens visualization and return to the last app',
      }),
    });
  }
  return topNavMenu;
}

export const LensTopNavMenu = ({
  setHeaderActionMenu,
  initialInput,
  indicateNoData,
  lensInspector,
  setIsSaveModalVisible,
  getIsByValueMode,
  runSave,
  onAppLeave,
  redirectToOrigin,
  datasourceMap,
  title,
}: LensTopNavMenuProps) => {
  const {
    data,
    fieldFormats,
    navigation,
    uiSettings,
    application,
    attributeService,
    dashboardFeatureFlag,
  } = useKibana<LensAppServices>().services;

  const dispatch = useLensDispatch();
  const dispatchSetState: DispatchSetState = React.useCallback(
    (state: Partial<LensAppState>) => dispatch(setState(state)),
    [dispatch]
  );

  const [indexPatterns, setIndexPatterns] = useState<IndexPattern[]>([]);
  const [rejectedIndexPatterns, setRejectedIndexPatterns] = useState<string[]>([]);

  const {
    isSaveable,
    isLinkedToOriginatingApp,
    query,
    activeData,
    savedQuery,
    activeDatasourceId,
    datasourceStates,
  } = useLensSelector((state) => state.lens);
  const allLoaded = Object.values(datasourceStates).every(({ isLoading }) => isLoading === false);

  useEffect(() => {
    const activeDatasource =
      datasourceMap && activeDatasourceId && !datasourceStates[activeDatasourceId].isLoading
        ? datasourceMap[activeDatasourceId]
        : undefined;
    if (!activeDatasource) {
      return;
    }
    const indexPatternIds = getIndexPatternsIds({
      activeDatasources: Object.keys(datasourceStates).reduce(
        (acc, datasourceId) => ({
          ...acc,
          [datasourceId]: datasourceMap[datasourceId],
        }),
        {}
      ),
      datasourceStates,
    });
    const hasIndexPatternsChanged =
      indexPatterns.length + rejectedIndexPatterns.length !== indexPatternIds.length ||
      indexPatternIds.some(
        (id) =>
          ![...indexPatterns.map((ip) => ip.id), ...rejectedIndexPatterns].find(
            (loadedId) => loadedId === id
          )
      );

    // Update the cached index patterns if the user made a change to any of them
    if (hasIndexPatternsChanged) {
      getIndexPatternsObjects(indexPatternIds, data.indexPatterns).then(
        ({ indexPatterns: indexPatternObjects, rejectedIds }) => {
          setIndexPatterns(indexPatternObjects);
          setRejectedIndexPatterns(rejectedIds);
        }
      );
    }
  }, [
    datasourceStates,
    activeDatasourceId,
    rejectedIndexPatterns,
    datasourceMap,
    indexPatterns,
    data.indexPatterns,
  ]);

  const { TopNavMenu } = navigation.ui;
  const { from, to } = data.query.timefilter.timefilter.getTime();

  const savingToLibraryPermitted = Boolean(isSaveable && application.capabilities.visualize.save);
  const savingToDashboardPermitted = Boolean(
    isSaveable && application.capabilities.dashboard?.showWriteControls
  );

  const unsavedTitle = i18n.translate('xpack.lens.app.unsavedFilename', {
    defaultMessage: 'unsaved',
  });

  // Compute the list of visible columns, per layer/datatable, once
  const tableVisibleColumnsPerLayer = useMemo(() => {
    if (
      !activeData ||
      activeDatasourceId == null ||
      datasourceStates[activeDatasourceId]?.state == null
    ) {
      return {};
    }
    const datatableColumns: Record<string, Datatable['columns']> = {};
    const layerIds = Object.keys(activeData);
    for (const layerId of layerIds) {
      const visibleColumns = new Set(
        datasourceMap[activeDatasourceId]
          .getPublicAPI({
            state: datasourceStates[activeDatasourceId].state,
            layerId,
          })
          .getTableSpec()
          .map(({ columnId }) => columnId)
      );

      datatableColumns[layerId] = activeData[layerId].columns.filter(({ id }) =>
        visibleColumns.has(id)
      );
    }
    return datatableColumns;
  }, [activeData, activeDatasourceId, datasourceMap, datasourceStates]);
  const topNavConfig = useMemo(
    () =>
      getLensTopNavConfig({
        showSaveAndReturn: Boolean(
          isLinkedToOriginatingApp &&
            // Temporarily required until the 'by value' paradigm is default.
            (dashboardFeatureFlag.allowByValueEmbeddables || Boolean(initialInput))
        ),
        enableExportToCSV: Boolean(isSaveable && activeData && Object.keys(activeData).length),
        isByValueMode: getIsByValueMode(),
        allowByValue: dashboardFeatureFlag.allowByValueEmbeddables,
        showCancel: Boolean(isLinkedToOriginatingApp),
        savingToLibraryPermitted,
        savingToDashboardPermitted,
        tooltips: {
          showExportWarning: () => {
            if (activeData) {
              const layerIds = Object.keys(activeData);
              const formulaDetected = layerIds.some((layerId) => {
                const datatable = activeData[layerId];
                return tableHasFormulas(tableVisibleColumnsPerLayer[layerId], datatable.rows);
              });
              if (formulaDetected) {
                return i18n.translate('xpack.lens.app.downloadButtonFormulasWarning', {
                  defaultMessage:
                    'Your CSV contains characters that spreadsheet applications might interpret as formulas.',
                });
              }
            }
            return undefined;
          },
        },
        actions: {
          inspect: () => lensInspector.inspect({ title }),
          exportToCSV: () => {
            if (!activeData) {
              return;
            }
            const layerIds = Object.keys(activeData);

            const content = layerIds.reduce<Record<string, { content: string; type: string }>>(
              (memo, layerId, i) => {
                const datatable = activeData[layerId];
                // skip empty datatables
                if (datatable) {
                  const postFix = layerIds.length > 1 ? `-${i + 1}` : '';

                  const filteredDatatable = {
                    ...datatable,
                    columns: tableVisibleColumnsPerLayer[layerId],
                  };

                  memo[`${title || unsavedTitle}${postFix}.csv`] = {
                    content: exporters.datatableToCSV(filteredDatatable, {
                      csvSeparator: uiSettings.get('csv:separator', ','),
                      quoteValues: uiSettings.get('csv:quoteValues', true),
                      formatFactory: fieldFormats.deserialize,
                      escapeFormulaValues: false,
                    }),
                    type: exporters.CSV_MIME_TYPE,
                  };
                }
                return memo;
              },
              {}
            );
            if (content) {
              downloadMultipleAs(content);
            }
          },
          saveAndReturn: () => {
            if (savingToDashboardPermitted) {
              // disabling the validation on app leave because the document has been saved.
              onAppLeave((actions) => {
                return actions.default();
              });
              runSave(
                {
                  newTitle: title || '',
                  newCopyOnSave: false,
                  isTitleDuplicateConfirmed: false,
                  returnToOrigin: true,
                },
                {
                  saveToLibrary:
                    (initialInput && attributeService.inputIsRefType(initialInput)) ?? false,
                }
              );
            }
          },
          showSaveModal: () => {
            if (savingToDashboardPermitted || savingToLibraryPermitted) {
              setIsSaveModalVisible(true);
            }
          },
          cancel: () => {
            if (redirectToOrigin) {
              redirectToOrigin();
            }
          },
        },
      }),
    [
      activeData,
      attributeService,
      dashboardFeatureFlag.allowByValueEmbeddables,
      fieldFormats.deserialize,
      getIsByValueMode,
      initialInput,
      isLinkedToOriginatingApp,
      isSaveable,
      lensInspector,
      title,
      onAppLeave,
      redirectToOrigin,
      runSave,
      savingToDashboardPermitted,
      savingToLibraryPermitted,
      setIsSaveModalVisible,
      tableVisibleColumnsPerLayer,
      uiSettings,
      unsavedTitle,
    ]
  );

  const onQuerySubmitWrapped = useCallback(
    (payload) => {
      const { dateRange, query: newQuery } = payload;
      const currentRange = data.query.timefilter.timefilter.getTime();
      if (dateRange.from !== currentRange.from || dateRange.to !== currentRange.to) {
        data.query.timefilter.timefilter.setTime(dateRange);
        trackUiEvent('app_date_change');
      } else {
        // Query has changed, renew the session id.
        // recalculate resolvedDateRange (relevant for relative time range)
        dispatchSetState({
          searchSessionId: data.search.session.start(),
          resolvedDateRange: getResolvedDateRange(data.query.timefilter.timefilter),
        });
        trackUiEvent('app_query_change');
      }
      if (newQuery) {
        if (!isEqual(newQuery, query)) {
          dispatchSetState({ query: newQuery });
        }
      }
    },
    [data.query.timefilter.timefilter, data.search.session, dispatchSetState, query]
  );

  const onSavedWrapped = useCallback(
    (newSavedQuery) => {
      dispatchSetState({ savedQuery: newSavedQuery });
    },
    [dispatchSetState]
  );

  const onSavedQueryUpdatedWrapped = useCallback(
    (newSavedQuery) => {
      const savedQueryFilters = newSavedQuery.attributes.filters || [];
      const globalFilters = data.query.filterManager.getGlobalFilters();
      data.query.filterManager.setFilters([...globalFilters, ...savedQueryFilters]);
      dispatchSetState({
        query: newSavedQuery.attributes.query,
        savedQuery: { ...newSavedQuery },
      }); // Shallow query for reference issues
    },
    [data.query.filterManager, dispatchSetState]
  );

  const onClearSavedQueryWrapped = useCallback(() => {
    data.query.filterManager.setFilters(data.query.filterManager.getGlobalFilters());
    dispatchSetState({
      filters: data.query.filterManager.getGlobalFilters(),
      query: data.query.queryString.getDefaultQuery(),
      savedQuery: undefined,
    });
  }, [data.query.filterManager, data.query.queryString, dispatchSetState]);

  return (
    <TopNavMenu
      setMenuMountPoint={setHeaderActionMenu}
      config={topNavConfig}
      showSaveQuery={Boolean(application.capabilities.visualize.saveQuery)}
      savedQuery={savedQuery}
      onQuerySubmit={onQuerySubmitWrapped}
      onSaved={onSavedWrapped}
      onSavedQueryUpdated={onSavedQueryUpdatedWrapped}
      onClearSavedQuery={onClearSavedQueryWrapped}
      indexPatterns={indexPatterns}
      query={query}
      dateRangeFrom={from}
      dateRangeTo={to}
      indicateNoData={indicateNoData}
      showSearchBar={true}
      showDatePicker={
        indexPatterns.some((ip) => ip.isTimeBased()) ||
        Boolean(
          allLoaded &&
            activeDatasourceId &&
            datasourceMap[activeDatasourceId].isTimeBased(
              datasourceStates[activeDatasourceId].state
            )
        )
      }
      showQueryBar={true}
      showFilterBar={true}
      data-test-subj="lnsApp_topNav"
      screenTitle={'lens'}
      appName={'lens'}
    />
  );
};
