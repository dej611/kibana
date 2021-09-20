/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import type { FailedShard, Reason } from './types';
import { KibanaServerError } from '../../../../kibana_utils/common';

export function getFailedShards(err: KibanaServerError<any>): FailedShard | undefined {
  const errorInfo = err.attributes;
  const failedShards = errorInfo?.failed_shards || errorInfo?.caused_by?.failed_shards;
  return failedShards ? failedShards[0] : undefined;
}

function getNestedCause(err: KibanaServerError<any>): { reason: Reason } {
  const { reason, caused_by: causedBy } = err.attributes || err;
  if (causedBy) {
    return getNestedCause(causedBy);
  }
  return { reason };
}

export function getRootCause(err: KibanaServerError) {
  // Give shard failures priority, then try to get the error navigating nested objects
  return getFailedShards(err)?.reason || getNestedCause(err);
}
