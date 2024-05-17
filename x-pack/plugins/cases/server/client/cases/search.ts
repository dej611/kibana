/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { isArray, isEmpty } from 'lodash';

import type { CasesFindResponse, CasesSearchRequest } from '../../../common/types/api';
import { CasesFindResponseRt, CasesSearchRequestRt } from '../../../common/types/api';
import type { CustomFieldsConfiguration } from '../../../common/types/domain';
import { decodeOrThrow, decodeWithExcessOrThrow } from '../../common/runtime_types';

import type { CasesClient, CasesClientArgs } from '..';
import { Operations } from '../../authorization';
import { LICENSING_CASE_ASSIGNMENT_FEATURE } from '../../common/constants';
import { createCaseError } from '../../common/error';
import { asArray, transformCases } from '../../common/utils';
import type { CasesSearchParams } from '../types';
import { constructQueryOptions, constructSearch } from '../utils';
import { validateSearchCasesCustomFields } from './validators';

/**
 * Retrieves a case and optionally its comments.
 *
 * @ignore
 */
export const search = async (
  params: CasesSearchRequest,
  clientArgs: CasesClientArgs,
  casesClient: CasesClient
): Promise<CasesFindResponse> => {
  const {
    services: { caseService, licensingService },
    authorization,
    logger,
    savedObjectsSerializer,
    spaceId,
  } = clientArgs;

  try {
    const paramArgs = decodeWithExcessOrThrow(CasesSearchRequestRt)(params);
    const configArgs = paramArgs.owner ? { owner: paramArgs.owner } : {};
    const configurations = await casesClient.configure.get(configArgs);
    const customFieldsConfiguration: CustomFieldsConfiguration = configurations
      .map((config) => config.customFields)
      .flat();

    /**
     * Assign users to a case is only available to Platinum+
     */

    if (!isEmpty(paramArgs.assignees)) {
      const hasPlatinumLicenseOrGreater = await licensingService.isAtLeastPlatinum();

      if (!hasPlatinumLicenseOrGreater) {
        throw Boom.forbidden(
          'In order to filter cases by assignees, you must be subscribed to an Elastic Platinum license'
        );
      }

      licensingService.notifyUsage(LICENSING_CASE_ASSIGNMENT_FEATURE);
    }

    /**
     * Validate custom fields
     */
    if (paramArgs?.customFields && !isEmpty(paramArgs?.customFields)) {
      /**
       * throw error if params has customFields and no owner
       */

      const isValidArray =
        isArray(paramArgs.owner) &&
        (!paramArgs.owner.length || paramArgs.owner.length > 1 || isEmpty(paramArgs.owner[0]));

      if (!paramArgs.owner || isValidArray) {
        throw Boom.badRequest('Owner must be provided. Multiple owners are not supported.');
      }

      validateSearchCasesCustomFields({
        customFieldsConfiguration,
        customFields: paramArgs.customFields,
      });
    }

    const { filter: authorizationFilter, ensureSavedObjectsAreAuthorized } =
      await authorization.getAuthorizationFilter(Operations.findCases);

    const options: CasesSearchParams = {
      tags: paramArgs.tags,
      reporters: paramArgs.reporters,
      sortField: paramArgs.sortField,
      status: paramArgs.status,
      severity: paramArgs.severity,
      owner: paramArgs.owner,
      from: paramArgs.from,
      to: paramArgs.to,
      assignees: paramArgs.assignees,
      category: paramArgs.category,
      customFields: paramArgs.customFields,
    };

    const statusStatsOptions = constructQueryOptions({
      ...options,
      status: undefined,
      customFieldsConfiguration,
      authorizationFilter,
    });

    const caseQueryOptions = constructQueryOptions({
      ...options,
      customFieldsConfiguration,
      authorizationFilter,
    });

    const caseSearch = constructSearch(paramArgs.search, spaceId, savedObjectsSerializer);

    const [cases, statusStats] = await Promise.all([
      caseService.findCasesGroupedByID({
        caseOptions: {
          ...paramArgs,
          ...caseQueryOptions,
          ...caseSearch,
          searchFields: asArray(paramArgs.searchFields),
        },
      }),
      caseService.getCaseStatusStats({
        searchOptions: statusStatsOptions,
      }),
    ]);

    ensureSavedObjectsAreAuthorized([...cases.casesMap.values()]);

    const res = transformCases({
      casesMap: cases.casesMap,
      page: cases.page,
      perPage: cases.perPage,
      total: cases.total,
      countOpenCases: statusStats.open,
      countInProgressCases: statusStats['in-progress'],
      countClosedCases: statusStats.closed,
    });

    return decodeOrThrow(CasesFindResponseRt)(res);
  } catch (error) {
    throw createCaseError({
      message: `Failed to find cases: ${JSON.stringify(params)}: ${error}`,
      error,
      logger,
    });
  }
};
