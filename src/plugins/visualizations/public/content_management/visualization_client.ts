/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { SearchQuery } from '@kbn/content-management-plugin/common';
import type { ContentManagementPublicStart } from '@kbn/content-management-plugin/public';
import { type VisualizationCrudTypes, CONTENT_ID } from '../../common/content_management';
import { getContentManagement } from '../services';

export function visualizeClientFactory(cm: ContentManagementPublicStart = getContentManagement()) {
  const get = async (id: string) => {
    return cm.client.get<VisualizationCrudTypes['GetIn'], VisualizationCrudTypes['GetOut']>({
      contentTypeId: CONTENT_ID,
      id,
    });
  };

  const create = async ({
    data,
    options,
  }: Omit<VisualizationCrudTypes['CreateIn'], 'contentTypeId'>) => {
    const res = await cm.client.create<
      VisualizationCrudTypes['CreateIn'],
      VisualizationCrudTypes['CreateOut']
    >({
      contentTypeId: CONTENT_ID,
      data,
      options,
    });
    return res;
  };

  const update = async ({
    id,
    data,
    options,
  }: Omit<VisualizationCrudTypes['UpdateIn'], 'contentTypeId'>) => {
    const res = await cm.client.update<
      VisualizationCrudTypes['UpdateIn'],
      VisualizationCrudTypes['UpdateOut']
    >({
      contentTypeId: CONTENT_ID,
      id,
      data,
      options,
    });
    return res;
  };

  const deleteVisualization = async (id: string) => {
    const res = await cm.client.delete<
      VisualizationCrudTypes['DeleteIn'],
      VisualizationCrudTypes['DeleteOut']
    >({
      contentTypeId: CONTENT_ID,
      id,
    });
    return res;
  };

  const search = async (
    query: SearchQuery = {},
    options?: VisualizationCrudTypes['SearchOptions']
  ) => {
    return cm.client.search<
      VisualizationCrudTypes['SearchIn'],
      VisualizationCrudTypes['SearchOut']
    >({
      contentTypeId: CONTENT_ID,
      query,
      options,
    });
  };

  return {
    get,
    create,
    update,
    delete: deleteVisualization,
    search,
  };
}
