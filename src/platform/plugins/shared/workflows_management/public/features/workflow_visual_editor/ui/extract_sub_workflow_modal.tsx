/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiListGroup,
  EuiListGroupItem,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import React, { useCallback, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { getErrorMessage } from '../model/types';

interface ExtractSubWorkflowModalProps {
  selectedStepNames: string[];
  defaultName: string;
  onConfirm: (newWorkflowName: string) => Promise<void>;
  onCancel: () => void;
}

export const ExtractSubWorkflowModal: React.FC<ExtractSubWorkflowModalProps> = ({
  selectedStepNames,
  defaultName,
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState(defaultName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MAX_NAME_LENGTH = 128;
  const FORBIDDEN_PATTERN = /[{}[\]:\n\r]/;
  const trimmedName = name.trim();
  const isNameValid =
    trimmedName.length > 0 &&
    trimmedName.length <= MAX_NAME_LENGTH &&
    !FORBIDDEN_PATTERN.test(trimmedName);

  const handleConfirm = useCallback(async () => {
    if (!isNameValid) return;
    setIsLoading(true);
    setError(null);
    try {
      await onConfirm(trimmedName);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, [trimmedName, isNameValid, onConfirm]);

  return (
    <EuiModal onClose={onCancel} maxWidth={500}>
      <EuiModalHeader>
        <EuiModalHeaderTitle>
          {i18n.translate('workflows.extractSubWorkflow.modal.title', {
            defaultMessage: 'Extract workflow',
          })}
        </EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        <EuiFormRow
          label={i18n.translate('workflows.extractSubWorkflow.modal.nameLabel', {
            defaultMessage: 'New workflow name',
          })}
          isInvalid={!isNameValid && name.length > 0}
          error={
            !isNameValid && name.length > 0
              ? trimmedName.length > MAX_NAME_LENGTH
                ? i18n.translate('workflows.extractSubWorkflow.modal.nameTooLong', {
                    defaultMessage: 'Name must be {max} characters or fewer',
                    values: { max: MAX_NAME_LENGTH },
                  })
                : FORBIDDEN_PATTERN.test(trimmedName)
                ? i18n.translate('workflows.extractSubWorkflow.modal.nameForbiddenChars', {
                    defaultMessage:
                      'Name must not contain special characters like braces, brackets, or colons',
                  })
                : i18n.translate('workflows.extractSubWorkflow.modal.nameRequired', {
                    defaultMessage: 'Name is required',
                  })
              : undefined
          }
        >
          <EuiFieldText
            value={name}
            onChange={(e) => setName(e.target.value)}
            isInvalid={!isNameValid && name.length > 0}
            disabled={isLoading}
            autoFocus
          />
        </EuiFormRow>

        <EuiSpacer size="m" />

        <EuiText size="s">
          <p>
            {i18n.translate('workflows.extractSubWorkflow.modal.description', {
              defaultMessage:
                'The following steps will be extracted into a new workflow and replaced with a workflow.execute step:',
            })}
          </p>
        </EuiText>

        <EuiSpacer size="s" />

        <EuiListGroup flush bordered maxWidth={false}>
          {selectedStepNames.map((stepName) => (
            <EuiListGroupItem key={stepName} label={stepName} size="s" />
          ))}
        </EuiListGroup>

        {error && (
          <>
            <EuiSpacer size="m" />
            <EuiCallOut
              announceOnMount
              title={i18n.translate('workflows.extractSubWorkflow.modal.errorTitle', {
                defaultMessage: 'Failed to extract sub-workflow',
              })}
              color="danger"
              iconType="error"
              size="s"
            >
              <p>{error}</p>
            </EuiCallOut>
          </>
        )}
      </EuiModalBody>

      <EuiModalFooter>
        <EuiFlexGroup justifyContent="flexEnd" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onCancel} disabled={isLoading}>
              {i18n.translate('workflows.extractSubWorkflow.modal.cancel', {
                defaultMessage: 'Cancel',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton onClick={handleConfirm} fill isLoading={isLoading} disabled={!isNameValid}>
              {i18n.translate('workflows.extractSubWorkflow.modal.confirm', {
                defaultMessage: 'Extract',
              })}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiModalFooter>
    </EuiModal>
  );
};
