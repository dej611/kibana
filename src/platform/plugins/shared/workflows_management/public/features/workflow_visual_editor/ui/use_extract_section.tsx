/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiCode, EuiConfirmModal, EuiText, useGeneratedHtmlId } from '@elastic/eui';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { useQueryClient } from '@kbn/react-query';
import type { NodeRef } from '@kbn/workflows';
import { getSectionTitle, WorkflowApi } from '@kbn/workflows-ui';
import {
  buildExtractedWorkflowYaml,
  readSectionForExtraction,
  replaceSectionWithWorkflowExecute,
} from '@kbn/workflows-yaml';
import type { SectionExtraction } from '@kbn/workflows-yaml';
import { useKibana } from '../../../hooks/use_kibana';
import type { MutationResult } from '../lib/yaml_mutations';

interface UseExtractSectionParams {
  readonly yamlString: string;
  readonly canCreateWorkflow: boolean;
  readonly nodeRefs: Readonly<Record<string, NodeRef | undefined>>;
  readonly applyMutation: (result: MutationResult) => boolean;
  /** Called once the section has been replaced by the step that runs the new workflow. */
  readonly onExtracted: (nodeId: string, sectionName: string) => void;
}

interface PendingExtraction {
  readonly nodeId: string;
  readonly sectionName: string;
  readonly workflowName: string;
  readonly extraction: SectionExtraction;
}

const ReferenceList = ({ heading, references }: { heading: string; references: string[] }) =>
  references.length === 0 ? null : (
    <>
      <p>{heading}</p>
      <ul>
        {references.map((reference) => (
          <li key={reference}>
            <EuiCode>{reference}</EuiCode>
          </li>
        ))}
      </ul>
    </>
  );

/**
 * Moves a section's steps into a new workflow and puts a `workflow.execute` step in the
 * section's place. The new workflow runs on its own, so it can't read what the steps read
 * from the rest of this workflow, and the rest can't read what the steps produced: when the
 * scan finds either, they are listed for the user to confirm first.
 *
 * The new workflow is saved straight away, because the step needs its id. The change to
 * this workflow is an ordinary edit: it is not saved until the workflow is, and it can be
 * undone, which leaves the new workflow behind.
 */
export const useExtractSection = ({
  yamlString,
  canCreateWorkflow,
  nodeRefs,
  applyMutation,
  onExtracted,
}: UseExtractSectionParams): {
  readonly onExtractSection: ((nodeId: string) => void) | undefined;
  readonly extractModal: React.ReactNode;
} => {
  const { http, notifications } = useKibana().services;
  const queryClient = useQueryClient();
  const workflowApi = useMemo(() => new WorkflowApi(http), [http]);
  const modalTitleId = useGeneratedHtmlId();
  const yamlRef = useRef(yamlString);
  yamlRef.current = yamlString;
  const [pending, setPending] = useState<PendingExtraction | undefined>();
  const [isExtracting, setIsExtracting] = useState(false);

  const extract = useCallback(
    async ({ nodeId, sectionName, workflowName, extraction }: PendingExtraction) => {
      setIsExtracting(true);
      try {
        const created = await workflowApi.createWorkflow({
          yaml: buildExtractedWorkflowYaml({
            name: workflowName,
            description: extraction.description,
            stepsYaml: extraction.stepsYaml,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ['workflows'] });

        const replaced = replaceSectionWithWorkflowExecute(
          yamlRef.current,
          sectionName,
          created.id
        );
        if (!replaced.success) {
          notifications.toasts.addDanger({
            title: i18n.translate('workflows.visualEditor.extractSection.notReplaced', {
              defaultMessage:
                'Created the workflow "{name}", but could not replace the section "{section}"',
              values: { name: workflowName, section: sectionName },
            }),
            text: replaced.error,
          });
          return;
        }
        if (!applyMutation(replaced)) return;
        onExtracted(nodeId, sectionName);
        notifications.toasts.addSuccess({
          title: i18n.translate('workflows.visualEditor.extractSection.success', {
            defaultMessage: 'Section extracted',
          }),
          text: i18n.translate('workflows.visualEditor.extractSection.successText', {
            defaultMessage: 'Created the workflow "{name}". "{section}" now runs it.',
            values: { name: workflowName, section: sectionName },
          }),
          'data-test-subj': 'workflowVisualEditorExtractSectionSuccessToast',
        });
      } catch (error) {
        notifications.toasts.addError(error instanceof Error ? error : new Error(String(error)), {
          title: i18n.translate('workflows.visualEditor.extractSection.failed', {
            defaultMessage: 'Could not create the workflow',
          }),
        });
      } finally {
        setIsExtracting(false);
        setPending(undefined);
      }
    },
    [workflowApi, queryClient, applyMutation, onExtracted, notifications.toasts]
  );

  const onExtractSection = useCallback(
    (nodeId: string) => {
      const ref = nodeRefs[nodeId];
      if (ref?.kind !== 'step') return;
      const extraction = readSectionForExtraction(yamlRef.current, ref.stepName);
      if (!extraction.success) {
        notifications.toasts.addDanger({
          title: i18n.translate('workflows.visualEditor.extractSection.refused', {
            defaultMessage: 'Could not extract the section',
          }),
          text: extraction.error,
        });
        return;
      }
      const next: PendingExtraction = {
        nodeId,
        sectionName: ref.stepName,
        workflowName: getSectionTitle({ title: extraction.title }, ref.stepName),
        extraction,
      };
      if (extraction.inboundReferences.length === 0 && extraction.outboundReferences.length === 0) {
        void extract(next);
        return;
      }
      setPending(next);
    },
    [nodeRefs, notifications.toasts, extract]
  );

  const extractModal = pending ? (
    <EuiConfirmModal
      title={i18n.translate('workflows.visualEditor.extractSection.modalTitle', {
        defaultMessage: 'Extract "{name}" to a new workflow?',
        values: { name: pending.workflowName },
      })}
      titleProps={{ id: modalTitleId }}
      aria-labelledby={modalTitleId}
      onCancel={() => setPending(undefined)}
      onConfirm={() => extract(pending)}
      isLoading={isExtracting}
      cancelButtonText={i18n.translate('workflows.visualEditor.extractSection.cancel', {
        defaultMessage: 'Cancel',
      })}
      confirmButtonText={i18n.translate('workflows.visualEditor.extractSection.confirm', {
        defaultMessage: 'Extract',
      })}
      data-test-subj="workflowVisualEditorExtractSectionModal"
    >
      <EuiText size="s">
        <p>
          {i18n.translate('workflows.visualEditor.extractSection.modalBody', {
            defaultMessage:
              'The steps move into a new workflow, and this section becomes a step that runs it. The new workflow runs on its own, so it cannot read the variables, constants, inputs, event data or step outputs of this one, and this one cannot read what the steps produce. You will need to pass values through inputs.',
          })}
        </p>
        <ReferenceList
          heading={i18n.translate('workflows.visualEditor.extractSection.inbound', {
            defaultMessage: 'Read by the steps, not available in the new workflow:',
          })}
          references={[...pending.extraction.inboundReferences]}
        />
        <ReferenceList
          heading={i18n.translate('workflows.visualEditor.extractSection.outbound', {
            defaultMessage: 'Read by the rest of this workflow, no longer produced here:',
          })}
          references={[...pending.extraction.outboundReferences]}
        />
      </EuiText>
    </EuiConfirmModal>
  ) : null;

  return {
    onExtractSection: canCreateWorkflow ? onExtractSection : undefined,
    extractModal,
  };
};
