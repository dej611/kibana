/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { getKbnServerError, reportServerError } from '@kbn/kibana-utils-plugin/server';
import type { CoreSetup } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import type { LensByValueInput } from '@kbn/lens-plugin/public/embeddable/embeddable';
import type { LensServerPluginSetup } from '@kbn/lens-plugin/server';
import type { SavedDashboardPanel } from '../../common/content_management';
import { convertSavedDashboardPanelToPanelState, type DashboardAttributes } from '../../common';

export const setupQueryExtractionRoute = (
  { http, getStartServices }: CoreSetup,
  extractQueries: LensServerPluginSetup['extractQueries']
) => {
  const router = http.createRouter();

  router.versioned
    .get({
      access: 'public',
      path: '/api/dashboards/dashboard/{id}/getQueries',
      options: {
        authRequired: false,
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            params: schema.object(
              {
                id: schema.string({
                  minLength: 1,
                  maxLength: 1_000,
                }),
              },
              { unknowns: 'allow' }
            ),
          },
          // @ts-expect-error
          body: schema.any(),
        },
      },
      async (context, request, response) => {
        console.log('Hello');
        try {
          const [coreStart] = await getStartServices();
          const client = coreStart.savedObjects.getScopedClient(request);

          const SO = await client.get('dashboard', request.params.id);

          const panels = JSON.parse(
            (SO.attributes as DashboardAttributes).panelsJSON
          ) as SavedDashboardPanel[];

          const supportedPanels = panels.filter(({ type }) => type === 'lens');

          const queriesByPanel: Array<{ title?: string; queries: object[] }> = [];

          for (const panel of supportedPanels) {
            const panelState = convertSavedDashboardPanelToPanelState<LensByValueInput>(panel);

            // TODO not sure if this is type safe
            const attributes = panelState.explicitInput.attributes!;

            // copied from initializeSavedVis in Lens embeddable
            const savedVis = {
              ...attributes,
              type: 'lens',
              // savedObjectId: (input as LensByReferenceInput)?.savedObjectId,
            };

            const queries = await extractQueries(
              savedVis,
              {
                elasticsearch: (await context.core).elasticsearch.client.asCurrentUser,
                savedObjects: client,
              },
              request
            );

            queriesByPanel.push({
              title: panel.title,
              queries,
            });
          }

          return response.ok({
            body: {
              panels: queriesByPanel,
            },
          });
        } catch (e) {
          console.log(e);
          const kbnErr = getKbnServerError(e);
          return reportServerError(response, kbnErr);
        }
      }
    );
};
