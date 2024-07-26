/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { CoreStart, OverlayRef } from '@kbn/core/public';
import { isOfAggregateQueryType } from '@kbn/es-query';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import { IncompatibleActionError } from '@kbn/ui-actions-plugin/public';
import { generateId } from '../../../id_generator';
import { setupPanelManagement } from '../../../react_embeddable/inline_editing/panel_management';
import { prepareInlineEditPanel } from '../../../react_embeddable/inline_editing/setup_inline_editing';
import { mountInlineEditPanel } from '../../../react_embeddable/inline_editing/mount';
import { LensRuntimeState } from '../../../react_embeddable/types';
import type { LensPluginStartDependencies } from '../../../plugin';
import type { LensChartLoadEvent } from './types';

const asyncNoop = async () => {};

export function isEmbeddableEditActionCompatible(
  core: CoreStart,
  attributes: LensRuntimeState['attributes']
) {
  // for ES|QL is compatible only when advanced setting is enabled
  const query = attributes.state.query;
  return isOfAggregateQueryType(query) ? core.uiSettings.get(ENABLE_ESQL) : true;
}

export async function executeEditEmbeddableAction({
  deps,
  core,
  attributes,
  lensEvent,
  container,
  onUpdate,
  onApply,
  onCancel,
}: {
  deps: LensPluginStartDependencies;
  core: CoreStart;
  attributes: LensRuntimeState['attributes'];
  lensEvent: LensChartLoadEvent;
  container?: HTMLElement | null;
  onUpdate: (newAttributes: LensRuntimeState['attributes']) => void;
  onApply?: (newAttributes: LensRuntimeState['attributes']) => void;
  onCancel?: () => void;
}) {
  const isCompatibleAction = isEmbeddableEditActionCompatible(core, attributes);
  if (!isCompatibleAction) {
    throw new IncompatibleActionError();
  }

  const uuid = generateId();
  const panelManagementApi = setupPanelManagement(uuid);
  const openInlineEditor = prepareInlineEditPanel(
    () => ({
      attributes,
    }),
    (newState: LensRuntimeState) => onUpdate(newState.attributes),
    { coreStart: core, ...deps },
    lensEvent?.renderComplete$,
    panelManagementApi,
    {
      getInspectorAdapters: () => lensEvent?.adapters,
      inspect(): OverlayRef {
        return { close: asyncNoop, onClose: Promise.resolve() };
      },
      closeInspector: asyncNoop,
    }
  );

  const ConfigPanel = await openInlineEditor();
  if (ConfigPanel) {
    // no need to pass the uuid in this use case
    mountInlineEditPanel(ConfigPanel, core, undefined, undefined, container);
  }
}
