/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import supertest from 'supertest';
import { registerGetRoute } from '../../../saved_objects/routes/get';
import { ContextService } from '@kbn/core-http-context-server-internal';
import type { HttpService, InternalHttpServiceSetup } from '@kbn/core-http-server-internal';
import { createHttpServer, createCoreContext } from '@kbn/core-http-server-mocks';
import { savedObjectsClientMock } from '../../../saved_objects/service/saved_objects_client.mock';
import type { CoreUsageStatsClient } from '../../../core_usage_data';
import { executionContextServiceMock } from '@kbn/core-execution-context-server-mocks';
import { coreUsageStatsClientMock } from '../../../core_usage_data/core_usage_stats_client.mock';
import { coreUsageDataServiceMock } from '../../../core_usage_data/core_usage_data_service.mock';
import { contextServiceMock, coreMock } from '../../../mocks';
import type { InternalSavedObjectsRequestHandlerContext } from '../../../saved_objects/internal_types';

const coreId = Symbol('core');

describe('GET /api/saved_objects/{type}/{id}', () => {
  let server: HttpService;
  let httpSetup: InternalHttpServiceSetup;
  let handlerContext: ReturnType<typeof coreMock.createRequestHandlerContext>;
  let savedObjectsClient: ReturnType<typeof savedObjectsClientMock.create>;
  let coreUsageStatsClient: jest.Mocked<CoreUsageStatsClient>;

  beforeEach(async () => {
    const coreContext = createCoreContext({ coreId });
    server = createHttpServer(coreContext);
    await server.preboot({ context: contextServiceMock.createPrebootContract() });

    const contextService = new ContextService(coreContext);
    httpSetup = await server.setup({
      context: contextService.setup({ pluginDependencies: new Map() }),
      executionContext: executionContextServiceMock.createInternalSetupContract(),
    });

    handlerContext = coreMock.createRequestHandlerContext();
    savedObjectsClient = handlerContext.savedObjects.client;

    httpSetup.registerRouteHandlerContext<InternalSavedObjectsRequestHandlerContext, 'core'>(
      coreId,
      'core',
      (ctx, req, res) => {
        return handlerContext;
      }
    );

    const router =
      httpSetup.createRouter<InternalSavedObjectsRequestHandlerContext>('/api/saved_objects/');
    coreUsageStatsClient = coreUsageStatsClientMock.create();
    coreUsageStatsClient.incrementSavedObjectsGet.mockRejectedValue(new Error('Oh no!')); // intentionally throw this error, which is swallowed, so we can assert that the operation does not fail
    const coreUsageData = coreUsageDataServiceMock.createSetupContract(coreUsageStatsClient);
    registerGetRoute(router, { coreUsageData });

    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('formats successful response and records usage stats', async () => {
    const clientResponse = {
      id: 'logstash-*',
      title: 'logstash-*',
      type: 'logstash-type',
      attributes: {},
      timeFieldName: '@timestamp',
      notExpandable: true,
      references: [],
    };

    savedObjectsClient.get.mockResolvedValue(clientResponse);

    const result = await supertest(httpSetup.server.listener)
      .get('/api/saved_objects/index-pattern/logstash-*')
      .expect(200);

    expect(result.body).toEqual(clientResponse);
    expect(coreUsageStatsClient.incrementSavedObjectsGet).toHaveBeenCalledWith({
      request: expect.anything(),
    });
  });

  it('calls upon savedObjectClient.get', async () => {
    await supertest(httpSetup.server.listener)
      .get('/api/saved_objects/index-pattern/logstash-*')
      .expect(200);

    expect(savedObjectsClient.get).toHaveBeenCalled();

    const args = savedObjectsClient.get.mock.calls[0];
    expect(args).toEqual(['index-pattern', 'logstash-*']);
  });
});
