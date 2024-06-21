/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import './helpers.scss';
import { tracksOverlays } from '@kbn/presentation-containers';
import { toMountPoint } from '@kbn/react-kibana-mount';
import { IncompatibleActionError } from '@kbn/ui-actions-plugin/public';
import { hasEditCapabilities, apiHasParentApi } from '@kbn/presentation-publishing';
import type { LensPluginStartDependencies } from '../../plugin';
import { StartServices } from '../../types';
import { isLensApi } from '../../react_embeddable/type_guards';

interface Context extends StartServices {
  api: unknown;
  startDependencies: LensPluginStartDependencies;
  isNewPanel?: boolean;
  deletePanel?: () => void;
}

export async function isEditActionCompatible(api: unknown) {
  return hasEditCapabilities(api) && api.isEditingEnabled?.();
}

export async function executeEditAction({
  api,
  startDependencies,
  isNewPanel,
  deletePanel,
  ...startServices
}: Context) {
  const isCompatibleAction = await isEditActionCompatible(api);
  if (!isCompatibleAction || !isLensApi(api) || !apiHasParentApi(api)) {
    throw new IncompatibleActionError();
  }
  const rootEmbeddable = api.parentApi;
  const overlayTracker = tracksOverlays(rootEmbeddable) ? rootEmbeddable : undefined;
  const ConfigPanel = await api.openConfigPanel(startDependencies, isNewPanel, deletePanel);

  if (ConfigPanel) {
    const handle = startServices.overlays.openFlyout(
      toMountPoint(
        React.cloneElement(ConfigPanel, {
          closeFlyout: () => {
            if (overlayTracker) overlayTracker.clearOverlays();
            handle.close();
          },
        }),
        startServices
      ),
      {
        className: 'lnsConfigPanel__overlay',
        size: 's',
        'data-test-subj': 'customizeLens',
        type: 'push',
        paddingSize: 'm',
        hideCloseButton: true,
        onClose: (overlayRef) => {
          if (overlayTracker) overlayTracker.clearOverlays();
          overlayRef.close();
        },
        outsideClickCloses: true,
      }
    );
    overlayTracker?.openOverlay(handle, { focusedPanelId: api.uuid });
  }
}
