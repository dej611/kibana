/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DatasourceDimensionDropProps,
  isDraggedOperation,
  DraggedOperation,
  DropType,
  VisualizationDimensionGroupConfig,
} from '../../../types';
import { getOperationDisplay, hasOperationSupportForMultipleFields } from '../../operations';
import { hasField, isDraggedField } from '../../pure_utils';
import { DragContextState } from '../../../drag_drop/providers';
import { OperationMetadata } from '../../../types';
import { getOperationTypesForField } from '../../operations';
import { GenericIndexPatternColumn } from '../../indexpattern';
import {
  IndexPatternPrivateState,
  IndexPattern,
  IndexPatternField,
  DraggedField,
} from '../../types';

type GetDropProps = DatasourceDimensionDropProps<IndexPatternPrivateState> & {
  dragging?: DragContextState['dragging'];
  groupId: string;
};

type DropProps = { dropTypes: DropType[]; nextLabel?: string } | undefined;

const operationLabels = getOperationDisplay();

export function getNewOperation(
  field: IndexPatternField | undefined | false,
  filterOperations: (meta: OperationMetadata) => boolean,
  targetColumn: GenericIndexPatternColumn,
  prioritizedOperation?: GenericIndexPatternColumn['operationType']
) {
  if (!field) {
    return;
  }
  const newOperations = getOperationTypesForField(field, filterOperations);
  if (!newOperations.length) {
    return;
  }
  // Detects if we can change the field only, otherwise change field + operation
  const shouldOperationPersist = targetColumn && newOperations.includes(targetColumn.operationType);
  if (shouldOperationPersist) {
    return targetColumn.operationType;
  }
  const existsPrioritizedOperation =
    prioritizedOperation && newOperations.includes(prioritizedOperation);
  return existsPrioritizedOperation ? prioritizedOperation : newOperations[0];
}

export function getField(
  column: GenericIndexPatternColumn | undefined,
  indexPattern: IndexPattern
) {
  if (!column) {
    return;
  }
  const field = (hasField(column) && indexPattern.getFieldByName(column.sourceField)) || undefined;
  return field;
}

export function getDropProps(props: GetDropProps) {
  const { state, columnId, layerId, dragging, groupId, filterOperations } = props;
  if (!dragging) {
    return;
  }

  if (isDraggedField(dragging)) {
    return getDropPropsForField({ ...props, dragging });
  }

  if (
    isDraggedOperation(dragging) &&
    dragging.layerId === layerId &&
    columnId !== dragging.columnId
  ) {
    const sourceColumn = state.layers[dragging.layerId].columns[dragging.columnId];
    const targetColumn = state.layers[layerId].columns[columnId];
    const layerIndexPattern = state.indexPatterns[state.layers[layerId].indexPatternId];

    const isSameGroup = groupId === dragging.groupId;
    if (isSameGroup) {
      return getDropPropsForSameGroup(targetColumn);
    } else if (hasTheSameField(sourceColumn, targetColumn)) {
      return;
    } else if (filterOperations(sourceColumn)) {
      return getDropPropsForCompatibleGroup(
        props.dimensionGroups,
        dragging.columnId,
        sourceColumn,
        targetColumn,
        layerIndexPattern
      );
    } else {
      return getDropPropsFromIncompatibleGroup({ ...props, dragging });
    }
  }
}

function hasTheSameField(
  sourceColumn: GenericIndexPatternColumn,
  targetColumn?: GenericIndexPatternColumn
) {
  return (
    targetColumn &&
    hasField(targetColumn) &&
    hasField(sourceColumn) &&
    targetColumn.sourceField === sourceColumn.sourceField &&
    !hasOperationSupportForMultipleFields(targetColumn, sourceColumn)
  );
}

function getDropPropsForField({
  state,
  columnId,
  layerId,
  dragging,
  filterOperations,
}: GetDropProps & { dragging: DraggedField }): DropProps {
  const targetColumn = state.layers[layerId].columns[columnId];
  const isTheSameIndexPattern = state.layers[layerId].indexPatternId === dragging.indexPatternId;
  const newOperation = getNewOperation(dragging.field, filterOperations, targetColumn);

  if (!!(isTheSameIndexPattern && newOperation)) {
    const nextLabel = operationLabels[newOperation].displayName;

    if (!targetColumn) {
      return { dropTypes: ['field_add'], nextLabel };
    } else if (
      (hasField(targetColumn) && targetColumn.sourceField !== dragging.field.name) ||
      !hasField(targetColumn)
    ) {
      return hasField(targetColumn) &&
        hasOperationSupportForMultipleFields(targetColumn, undefined, dragging.field)
        ? {
            dropTypes: ['field_replace', 'field_combine'],
          }
        : {
            dropTypes: ['field_replace'],
            nextLabel,
          };
    }
  }
  return;
}

function getDropPropsForSameGroup(targetColumn?: GenericIndexPatternColumn): DropProps {
  return targetColumn ? { dropTypes: ['reorder'] } : { dropTypes: ['duplicate_compatible'] };
}

function getDropPropsForCompatibleGroup(
  dimensionGroups: VisualizationDimensionGroupConfig[],
  sourceId: string,
  sourceColumn?: GenericIndexPatternColumn,
  targetColumn?: GenericIndexPatternColumn,
  indexPattern?: IndexPattern
): DropProps {
  const canSwap =
    targetColumn &&
    dimensionGroups
      .find((group) => group.accessors.some((accessor) => accessor.columnId === sourceId))
      ?.filterOperations(targetColumn);
  const swapType = canSwap ? ['swap_compatible' as const] : [];

  if (!targetColumn) {
    return { dropTypes: ['move_compatible', 'duplicate_compatible', ...swapType] };
  }
  if (!indexPattern || !hasField(targetColumn)) {
    return { dropTypes: ['replace_compatible', 'replace_duplicate_compatible', ...swapType] };
  }
  return {
    dropTypes: [
      'replace_compatible',
      'replace_duplicate_compatible',
      ...swapType,
      ...(hasOperationSupportForMultipleFields(targetColumn, sourceColumn)
        ? ['combine_compatible']
        : []),
    ] as DropType[],
  };
}

function getDropPropsFromIncompatibleGroup({
  state,
  columnId,
  layerId,
  dragging,
  filterOperations,
}: GetDropProps & { dragging: DraggedOperation }): DropProps {
  const targetColumn = state.layers[layerId].columns[columnId];
  const sourceColumn = state.layers[dragging.layerId].columns[dragging.columnId];

  const layerIndexPattern = state.indexPatterns[state.layers[layerId].indexPatternId];
  if (!layerIndexPattern) {
    return;
  }
  const sourceField = getField(sourceColumn, layerIndexPattern);
  const newOperationForSource = getNewOperation(sourceField, filterOperations, targetColumn);

  if (newOperationForSource) {
    const targetField = getField(targetColumn, layerIndexPattern);
    const canSwap = !!getNewOperation(targetField, dragging.filterOperations, sourceColumn);

    const dropTypes: DropType[] = [];
    if (targetColumn) {
      dropTypes.push('replace_incompatible', 'replace_duplicate_incompatible');
      if (canSwap) {
        dropTypes.push('swap_incompatible');
      }
      if (hasOperationSupportForMultipleFields(targetColumn, sourceColumn)) {
        dropTypes.push('combine_incompatible');
      }
    } else {
      dropTypes.push('move_incompatible', 'duplicate_incompatible');
    }

    return {
      dropTypes,
      nextLabel: operationLabels[newOperationForSource].displayName,
    };
  }
}
