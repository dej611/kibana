/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import React from 'react';

jest.mock('@kbn/kibana-react-plugin/public', () => {
  const original = jest.requireActual('@kbn/kibana-react-plugin/public');

  return {
    ...original,
    toMountPoint: (node: React.ReactNode) => node,
  };
});

import { CoreStart } from '@kbn/core/public';
import { coreMock } from '@kbn/core/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { usageCollectionPluginMock } from '@kbn/usage-collection-plugin/public/mocks';

import { DataViewEditorLazy } from './components/data_view_editor_lazy';
import { DataViewEditorPlugin } from './plugin';

import { DataViewsServicePublic } from '@kbn/data-views-plugin/public';

const noop = () => {};

describe('DataViewEditorPlugin', () => {
  const coreStart: CoreStart = coreMock.createStart();
  const pluginStart = {
    data: dataPluginMock.createStartContract(),
    usageCollection: usageCollectionPluginMock.createSetupContract(),
    dataViews: dataPluginMock.createStartContract().dataViews as DataViewsServicePublic,
  };

  let plugin: DataViewEditorPlugin;

  beforeEach(() => {
    plugin = new DataViewEditorPlugin();
  });

  test('should expose a handler to open the data view field editor', async () => {
    const startApi = await plugin.start(coreStart, pluginStart);
    expect(startApi.openEditor).toBeDefined();
  });

  test('should call core.overlays.openFlyout when opening the editor', async () => {
    const openFlyout = jest.fn();
    const onSaveSpy = jest.fn();

    const coreStartMocked = {
      ...coreStart,
      overlays: {
        ...coreStart.overlays,
        openFlyout,
      },
    };
    const { openEditor } = await plugin.start(coreStartMocked, pluginStart);

    openEditor({ onSave: onSaveSpy });

    expect(openFlyout).toHaveBeenCalled();

    const [[{ __reactMount__ }]] = openFlyout.mock.calls;
    expect(__reactMount__.props.children.type).toBe(DataViewEditorLazy);

    // We force call the "onSave" prop from the <RuntimeFieldEditorFlyoutContent /> component
    // and make sure that the the spy is being called.
    // Note: we are testing implementation details, if we change or rename the "onSave" prop on
    // the component, we will need to update this test accordingly.
    expect(__reactMount__.props.children.props.onSave).toBeDefined();
    __reactMount__.props.children.props.onSave();
    expect(onSaveSpy).toHaveBeenCalled();
  });

  test('should return a handler to close the flyout', async () => {
    const { openEditor } = await plugin.start(coreStart, pluginStart);

    const closeEditorHandler = openEditor({ onSave: noop });
    expect(typeof closeEditorHandler).toBe('function');
  });
});
