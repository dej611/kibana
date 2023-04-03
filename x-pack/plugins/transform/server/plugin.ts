/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { CoreSetup, CoreStart, Plugin, Logger, PluginInitializerContext } from '@kbn/core/server';

import { LicenseType } from '@kbn/licensing-plugin/common/types';

import { PluginSetupDependencies, PluginStartDependencies } from './types';
import { registerRoutes } from './routes';
import { License } from './services';
import { registerTransformHealthRuleType } from './lib/alerting';

const basicLicense: LicenseType = 'basic';

const PLUGIN = {
  id: 'transform',
  minimumLicenseType: basicLicense,
  getI18nName: (): string =>
    i18n.translate('xpack.transform.appTitle', {
      defaultMessage: 'Transforms',
    }),
};

export class TransformServerPlugin implements Plugin<{}, void, any, any> {
  private readonly logger: Logger;

  private fieldFormatsStart: PluginStartDependencies['fieldFormats'] | null = null;

  constructor(initContext: PluginInitializerContext) {
    this.logger = initContext.logger.get();
  }

  setup(
    { http, getStartServices, elasticsearch }: CoreSetup<PluginStartDependencies>,
    { licensing, features, alerting }: PluginSetupDependencies
  ): {} {
    features.registerElasticsearchFeature({
      id: PLUGIN.id,
      management: {
        data: [PLUGIN.id],
      },
      catalogue: [PLUGIN.id],
      privileges: [
        {
          requiredClusterPrivileges: ['monitor_transform'],
          ui: [],
        },
      ],
    });

    getStartServices().then(([coreStart, { dataViews }]) => {
      const license = new License({
        pluginId: PLUGIN.id,
        minimumLicenseType: PLUGIN.minimumLicenseType,
        defaultErrorMessage: i18n.translate('xpack.transform.licenseCheckErrorMessage', {
          defaultMessage: 'License check failed',
        }),
        licensing,
        logger: this.logger,
        coreStart,
      });

      registerRoutes({
        router: http.createRouter(),
        license,
        dataViews,
        coreStart,
      });
    });

    if (alerting) {
      registerTransformHealthRuleType({
        alerting,
        logger: this.logger,
        getFieldFormatsStart: () => this.fieldFormatsStart!,
      });
    }

    return {};
  }

  start(core: CoreStart, plugins: PluginStartDependencies) {
    this.fieldFormatsStart = plugins.fieldFormats;
  }

  stop() {}
}
