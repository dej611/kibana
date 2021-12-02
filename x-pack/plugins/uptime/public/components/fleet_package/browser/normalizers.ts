/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  BrowserFields,
  ConfigKeys,
  ThrottlingSuffix,
  ThrottlingConfigKey,
  configKeyToThrottlingSuffix,
} from '../types';
import {
  Normalizer,
  commonNormalizers,
  getNormalizer,
  getJsonToJavascriptNormalizer,
} from '../common/normalizers';

import { defaultBrowserSimpleFields, defaultBrowserAdvancedFields } from '../contexts';

export type BrowserNormalizerMap = Record<keyof BrowserFields, Normalizer>;

const defaultBrowserFields = {
  ...defaultBrowserSimpleFields,
  ...defaultBrowserAdvancedFields,
};

export const getBrowserNormalizer = (key: ConfigKeys) => {
  return getNormalizer(key, defaultBrowserFields);
};

export const getBrowserJsonToJavascriptNormalizer = (key: ConfigKeys) => {
  return getJsonToJavascriptNormalizer(key, defaultBrowserFields);
};

export function throttlingToParameterNormalizer(
  suffix: ThrottlingSuffix,
  throttlingConfigValue?: string
): unknown {
  if (!throttlingConfigValue || throttlingConfigValue === 'false') return null;
  return (
    throttlingConfigValue
      .split('/')
      .filter((p) => p.endsWith(suffix))[0]
      ?.slice(0, -1) ?? null
  );
}

export const isThrottlingEnabledNormalizer: Normalizer = function isThrottlingEnabledNormalizer(
  fields
) {
  const throttlingEnabled = fields?.[ConfigKeys.THROTTLING_CONFIG]?.value;

  // If we have any value that's not an explicit "false" it means throttling is "on"
  return throttlingEnabled !== 'false';
};

export function getThrottlingParamNormalizer(key: ThrottlingConfigKey): Normalizer {
  const paramSuffix = configKeyToThrottlingSuffix[key];
  return (fields) =>
    throttlingToParameterNormalizer(paramSuffix, fields?.[ConfigKeys.THROTTLING_CONFIG]?.value) ??
    defaultBrowserFields[key];
}

export const browserNormalizers: BrowserNormalizerMap = {
  [ConfigKeys.METADATA]: getBrowserJsonToJavascriptNormalizer(ConfigKeys.METADATA),
  [ConfigKeys.SOURCE_ZIP_URL]: getBrowserNormalizer(ConfigKeys.SOURCE_ZIP_URL),
  [ConfigKeys.SOURCE_ZIP_USERNAME]: getBrowserNormalizer(ConfigKeys.SOURCE_ZIP_USERNAME),
  [ConfigKeys.SOURCE_ZIP_PASSWORD]: getBrowserNormalizer(ConfigKeys.SOURCE_ZIP_PASSWORD),
  [ConfigKeys.SOURCE_ZIP_FOLDER]: getBrowserNormalizer(ConfigKeys.SOURCE_ZIP_FOLDER),
  [ConfigKeys.SOURCE_INLINE]: getBrowserJsonToJavascriptNormalizer(ConfigKeys.SOURCE_INLINE),
  [ConfigKeys.SOURCE_ZIP_PROXY_URL]: getBrowserNormalizer(ConfigKeys.SOURCE_ZIP_PROXY_URL),
  [ConfigKeys.PARAMS]: getBrowserNormalizer(ConfigKeys.PARAMS),
  [ConfigKeys.SCREENSHOTS]: getBrowserNormalizer(ConfigKeys.SCREENSHOTS),
  [ConfigKeys.SYNTHETICS_ARGS]: getBrowserJsonToJavascriptNormalizer(ConfigKeys.SYNTHETICS_ARGS),
  [ConfigKeys.IS_THROTTLING_ENABLED]: isThrottlingEnabledNormalizer,
  [ConfigKeys.DOWNLOAD_SPEED]: getThrottlingParamNormalizer(ConfigKeys.DOWNLOAD_SPEED),
  [ConfigKeys.UPLOAD_SPEED]: getThrottlingParamNormalizer(ConfigKeys.UPLOAD_SPEED),
  [ConfigKeys.LATENCY]: getThrottlingParamNormalizer(ConfigKeys.LATENCY),
  [ConfigKeys.THROTTLING_CONFIG]: getBrowserNormalizer(ConfigKeys.THROTTLING_CONFIG),
  [ConfigKeys.ZIP_URL_TLS_CERTIFICATE_AUTHORITIES]: getBrowserJsonToJavascriptNormalizer(
    ConfigKeys.ZIP_URL_TLS_CERTIFICATE_AUTHORITIES
  ),
  [ConfigKeys.ZIP_URL_TLS_CERTIFICATE]: getBrowserJsonToJavascriptNormalizer(
    ConfigKeys.ZIP_URL_TLS_CERTIFICATE
  ),
  [ConfigKeys.ZIP_URL_TLS_KEY]: getBrowserJsonToJavascriptNormalizer(ConfigKeys.ZIP_URL_TLS_KEY),
  [ConfigKeys.ZIP_URL_TLS_KEY_PASSPHRASE]: getBrowserNormalizer(
    ConfigKeys.ZIP_URL_TLS_KEY_PASSPHRASE
  ),
  [ConfigKeys.ZIP_URL_TLS_VERIFICATION_MODE]: getBrowserNormalizer(
    ConfigKeys.ZIP_URL_TLS_VERIFICATION_MODE
  ),
  [ConfigKeys.ZIP_URL_TLS_VERSION]: getBrowserJsonToJavascriptNormalizer(
    ConfigKeys.ZIP_URL_TLS_VERSION
  ),
  [ConfigKeys.JOURNEY_FILTERS_MATCH]: getBrowserJsonToJavascriptNormalizer(
    ConfigKeys.JOURNEY_FILTERS_MATCH
  ),
  [ConfigKeys.JOURNEY_FILTERS_TAGS]: getBrowserJsonToJavascriptNormalizer(
    ConfigKeys.JOURNEY_FILTERS_TAGS
  ),
  [ConfigKeys.IGNORE_HTTPS_ERRORS]: getBrowserNormalizer(ConfigKeys.IGNORE_HTTPS_ERRORS),
  ...commonNormalizers,
};
