/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Extracts a human-readable message from an unknown error.
 *
 * Handles:
 *  - Standard `Error` instances
 *  - Kibana HTTP errors with `{ body: { message: string } }`
 *  - Falls back to a generic message for anything else
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'body' in error) {
    const { body } = error as Record<string, unknown>;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as Record<string, unknown>;
      if (typeof message === 'string') {
        return message;
      }
    }
  }
  return 'An unexpected error occurred';
}
