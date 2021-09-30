/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MockRouter, mockRequestHandler, mockDependencies } from '../../__mocks__';

import { registerSearchRelevanceSuggestionsRoutes } from './search_relevance_suggestions';

describe('search relevance insights routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /internal/app_search/engines/{name}/search_relevance_suggestions', () => {
    const mockRouter = new MockRouter({
      method: 'post',
      path: '/internal/app_search/engines/{engineName}/search_relevance_suggestions',
    });

    beforeEach(() => {
      registerSearchRelevanceSuggestionsRoutes({
        ...mockDependencies,
        router: mockRouter.router,
      });
    });

    it('creates a request to enterprise search', () => {
      mockRouter.callRoute({
        params: { engineName: 'some-engine' },
      });

      expect(mockRequestHandler.createRequest).toHaveBeenCalledWith({
        path: '/api/as/v0/engines/:engineName/search_relevance_suggestions',
      });
    });
  });
});
