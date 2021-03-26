/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import './table_basic.scss';

import React, { useCallback, useMemo, useRef, useState, useContext } from 'react';
import { i18n } from '@kbn/i18n';
import useDeepCompareEffect from 'react-use/lib/useDeepCompareEffect';
import {
  EuiButtonIcon,
  EuiDataGrid,
  EuiDataGridControlColumn,
  EuiDataGridColumn,
  EuiDataGridSorting,
  EuiDataGridStyle,
} from '@elastic/eui';
import { CustomPaletteState, PaletteOutput } from 'src/plugins/charts/common';
import { FormatFactory, LensFilterEvent, LensTableRowContextMenuEvent } from '../../types';
import { VisualizationContainer } from '../../visualization_container';
import { EmptyPlaceholder } from '../../shared_components';
import { LensIconChartDatatable } from '../../assets/chart_datatable';
import { ColumnState } from '../visualization';
import {
  DataContextType,
  DatatableRenderProps,
  LensSortAction,
  LensResizeAction,
  LensGridDirection,
  LensToggleAction,
} from './types';
import { createGridColumns } from './columns';
import { createGridCell } from './cell_value';
import {
  createGridFilterHandler,
  createGridHideHandler,
  createGridResizeHandler,
  createGridSortingConfig,
  createTransposeColumnFilterHandler,
} from './table_actions';

export const DataContext = React.createContext<DataContextType>({});

const gridStyle: EuiDataGridStyle = {
  border: 'horizontal',
  header: 'underline',
};

export interface ColumnConfig {
  columns: Array<
    Exclude<ColumnState, 'palette'> & {
      type: 'lens_datatable_column';
      palette: PaletteOutput<CustomPaletteState>;
    }
  >;
  sortingColumnId: string | undefined;
  sortingDirection: LensGridDirection;
}

export const DatatableComponent = (props: DatatableRenderProps) => {
  const [firstTable] = Object.values(props.data.tables);

  const [columnConfig, setColumnConfig] = useState({
    columns: props.args.columns,
    sortingColumnId: props.args.sortingColumnId,
    sortingDirection: props.args.sortingDirection,
  });
  const [firstLocalTable, updateTable] = useState(firstTable);
  const [currentPalette] = useState(props.paletteService.get('custom'));

  useDeepCompareEffect(() => {
    setColumnConfig({
      columns: props.args.columns,
      sortingColumnId: props.args.sortingColumnId,
      sortingDirection: props.args.sortingDirection,
    });
  }, [props.args.columns, props.args.sortingColumnId, props.args.sortingDirection]);

  useDeepCompareEffect(() => {
    updateTable(firstTable);
  }, [firstTable]);

  const firstTableRef = useRef(firstLocalTable);
  firstTableRef.current = firstLocalTable;

  const untransposedDataRef = useRef(props.untransposedData);
  untransposedDataRef.current = props.untransposedData;

  const hasAtLeastOneRowClickAction = props.rowHasRowClickTriggerActions?.some((x) => x);

  const { getType, dispatchEvent, renderMode, formatFactory } = props;

  const formatters: Record<string, ReturnType<FormatFactory>> = useMemo(
    () =>
      firstLocalTable.columns.reduce(
        (map, column) => ({
          ...map,
          [column.id]: formatFactory(column.meta?.params),
        }),
        {}
      ),
    [firstLocalTable, formatFactory]
  );

  const onClickValue = useCallback(
    (data: LensFilterEvent['data']) => {
      dispatchEvent({ name: 'filter', data });
    },
    [dispatchEvent]
  );

  const onEditAction = useCallback(
    (data: LensSortAction['data'] | LensResizeAction['data'] | LensToggleAction['data']) => {
      if (renderMode === 'edit') {
        dispatchEvent({ name: 'edit', data });
      }
    },
    [dispatchEvent, renderMode]
  );
  const onRowContextMenuClick = useCallback(
    (data: LensTableRowContextMenuEvent['data']) => {
      dispatchEvent({ name: 'tableRowContextMenuClick', data });
    },
    [dispatchEvent]
  );

  const handleFilterClick = useMemo(() => createGridFilterHandler(firstTableRef, onClickValue), [
    firstTableRef,
    onClickValue,
  ]);

  const handleTransposedColumnClick = useMemo(
    () => createTransposeColumnFilterHandler(onClickValue, untransposedDataRef),
    [onClickValue, untransposedDataRef]
  );

  const bucketColumns = useMemo(
    () =>
      columnConfig.columns
        .filter((_col, index) => {
          const col = firstTableRef.current.columns[index];
          return (
            col?.meta?.sourceParams?.type &&
            getType(col.meta.sourceParams.type as string)?.type === 'buckets'
          );
        })
        .map((col) => col.columnId),
    [firstTableRef, columnConfig, getType]
  );

  const isEmpty =
    firstLocalTable.rows.length === 0 ||
    (bucketColumns.length &&
      firstTable.rows.every((row) => bucketColumns.every((col) => row[col] == null)));

  const visibleColumns = useMemo(
    () =>
      columnConfig.columns
        .filter((col) => !!col.columnId && !col.hidden)
        .map((col) => col.columnId),
    [columnConfig]
  );

  const { sortingColumnId: sortBy, sortingDirection: sortDirection } = props.args;

  const isReadOnlySorted = renderMode !== 'edit';

  const onColumnResize = useMemo(
    () => createGridResizeHandler(columnConfig, setColumnConfig, onEditAction),
    [onEditAction, setColumnConfig, columnConfig]
  );

  const onColumnHide = useMemo(
    () => createGridHideHandler(columnConfig, setColumnConfig, onEditAction),
    [onEditAction, setColumnConfig, columnConfig]
  );

  const columns: EuiDataGridColumn[] = useMemo(
    () =>
      createGridColumns(
        bucketColumns,
        firstLocalTable,
        handleFilterClick,
        handleTransposedColumnClick,
        isReadOnlySorted,
        columnConfig,
        visibleColumns,
        formatFactory,
        onColumnResize,
        onColumnHide
      ),
    [
      bucketColumns,
      firstLocalTable,
      handleFilterClick,
      handleTransposedColumnClick,
      isReadOnlySorted,
      columnConfig,
      visibleColumns,
      formatFactory,
      onColumnResize,
      onColumnHide,
    ]
  );

  const isNumericMap: Record<string, boolean> = useMemo(() => {
    const numericMap: Record<string, boolean> = {};
    columnConfig.columns.forEach((column) => {
      numericMap[column.columnId] =
        firstLocalTable.columns.find((dataColumn) => dataColumn.id === column.columnId)?.meta
          .type === 'number';
    });
    return numericMap;
  }, [firstLocalTable, columnConfig]);

  const alignments: Record<string, 'left' | 'right' | 'center'> = useMemo(() => {
    const alignmentMap: Record<string, 'left' | 'right' | 'center'> = {};
    columnConfig.columns.forEach((column) => {
      if (column.alignment) {
        alignmentMap[column.columnId] = column.alignment;
      } else {
        alignmentMap[column.columnId] = isNumericMap[column.columnId] ? 'right' : 'left';
      }
    });
    return alignmentMap;
  }, [columnConfig, isNumericMap]);

  const minMaxByColumnId: Record<string, { min: number; max: number }> = useMemo(() => {
    const minMax: Record<string, { min: number; max: number }> = {};
    columnConfig.columns
      .filter(({ columnId }) => isNumericMap[columnId])
      .forEach(({ columnId }) => {
        minMax[columnId] = minMax[columnId] || { max: -Infinity, min: Infinity };
        firstLocalTable.rows.forEach((row) => {
          const rowValue = row[columnId];
          if (rowValue != null) {
            if (minMax[columnId].min > rowValue) {
              minMax[columnId].min = rowValue;
            }
            if (minMax[columnId].max < rowValue) {
              minMax[columnId].max = rowValue;
            }
          }
        });
      });
    return minMax;
  }, [firstLocalTable, isNumericMap, columnConfig]);

  const gradientHelpers: Record<string, (value: number) => string> = useMemo(() => {
    const fnsMap: Record<string, (value: number) => string> = {};
    columnConfig.columns
      .filter(({ columnId, colorMode }) => minMaxByColumnId[columnId] && colorMode !== 'none')
      .forEach(({ columnId, palette }) => {
        const minValue = palette?.params?.rangeMin ?? minMaxByColumnId[columnId].min;
        const maxValue = palette?.params?.rangeMax ?? minMaxByColumnId[columnId].max;
        const fn = currentPalette.getGradientColorHelper?.(minMaxByColumnId[columnId], {
          colors: palette?.params?.colors,
          stops: palette?.params?.stops.length ? palette?.params?.stops : [minValue, maxValue],
        });
        if (fn) {
          fnsMap[columnId] = fn;
        }
      });
    return fnsMap;
  }, [minMaxByColumnId, columnConfig, currentPalette]);

  const trailingControlColumns: EuiDataGridControlColumn[] = useMemo(() => {
    if (!hasAtLeastOneRowClickAction || !onRowContextMenuClick) {
      return [];
    }
    return [
      {
        headerCellRender: () => null,
        width: 40,
        id: 'trailingControlColumn',
        rowCellRender: function RowCellRender({ rowIndex }) {
          const { rowHasRowClickTriggerActions } = useContext(DataContext);
          return (
            <EuiButtonIcon
              aria-label={i18n.translate('xpack.lens.table.actionsLabel', {
                defaultMessage: 'Show actions',
              })}
              iconType={
                !!rowHasRowClickTriggerActions && !rowHasRowClickTriggerActions[rowIndex]
                  ? 'empty'
                  : 'boxesVertical'
              }
              color="text"
              onClick={() => {
                onRowContextMenuClick({
                  rowIndex,
                  table: firstTableRef.current,
                  columns: columnConfig.columns.map((col) => col.columnId),
                });
              }}
            />
          );
        },
      },
    ];
  }, [firstTableRef, onRowContextMenuClick, columnConfig, hasAtLeastOneRowClickAction]);

  const renderCellValue = useMemo(
    () => createGridCell(formatters, columnConfig, DataContext, props.uiSettings),
    [formatters, columnConfig, props.uiSettings]
  );

  const columnVisibility = useMemo(() => ({ visibleColumns, setVisibleColumns: () => {} }), [
    visibleColumns,
  ]);

  const sorting = useMemo<EuiDataGridSorting>(
    () => createGridSortingConfig(sortBy, sortDirection as LensGridDirection, onEditAction),
    [onEditAction, sortBy, sortDirection]
  );

  if (isEmpty) {
    return <EmptyPlaceholder icon={LensIconChartDatatable} />;
  }

  const dataGridAriaLabel =
    props.args.title ||
    i18n.translate('xpack.lens.table.defaultAriaLabel', {
      defaultMessage: 'Data table visualization',
    });

  return (
    <VisualizationContainer
      className="lnsDataTableContainer"
      reportTitle={props.args.title}
      reportDescription={props.args.description}
    >
      <DataContext.Provider
        value={{
          table: firstLocalTable,
          rowHasRowClickTriggerActions: props.rowHasRowClickTriggerActions,
          alignments,
          minMaxByColumnId,
          gradientHelpers,
        }}
      >
        <EuiDataGrid
          aria-label={dataGridAriaLabel}
          data-test-subj="lnsDataTable"
          columns={columns}
          columnVisibility={columnVisibility}
          trailingControlColumns={trailingControlColumns}
          rowCount={firstLocalTable.rows.length}
          renderCellValue={renderCellValue}
          gridStyle={gridStyle}
          sorting={sorting}
          onColumnResize={onColumnResize}
          toolbarVisibility={false}
        />
      </DataContext.Provider>
    </VisualizationContainer>
  );
};
