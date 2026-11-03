/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonIcon,
  euiFocusRing,
  EuiPopover,
  EuiToolTip,
  transparentize,
  useEuiShadow,
  useEuiTheme,
} from '@elastic/eui';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import React, { memo, useCallback, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { WorkflowStepExecutionDto } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import { getSectionTitle } from './get_section_title';
import { StepContextMenuPanel } from './node_action_menu';
import { NodeIconChip, NodeStepIcon } from './node_icon_chip';
import { nodeLabelTypography } from './node_styles';
import { resolveNodeChipStyle } from './resolve_node_chip_style';
import { getSectionPalette } from './section_palette';
import { useCloseOnOutsidePointerDown } from './use_close_on_outside_pointer_down';
import { useWorkflowGraphActions } from './workflow_graph_actions_context';
import { getStepIconType } from '../step_icons';

interface SectionGroupNodeData extends Record<string, unknown> {
  /** The section's step name, which keys its collapsed state. */
  readonly label: string;
  readonly stepType: string;
  readonly step?: { readonly title?: unknown; readonly description?: unknown };
  /** Status rolled up from the section's steps; a section has no execution of its own. */
  readonly stepExecution?: WorkflowStepExecutionDto;
  /** True when the body has at least one inner step (threaded from use_workflow_layout). */
  readonly hasBodySteps?: boolean;
}

const SECTION_MENU_INSIDE_TEST_SUBJS = ['workflowGraphSectionMenuPanel'] as const;

function WorkflowGraphSectionGroupNodeInner(node: NodeProps<Node<SectionGroupNodeData>>) {
  const { label, stepType, step, stepExecution, hasBodySteps } = node.data;
  const euiThemeContext = useEuiTheme();
  const { euiTheme } = euiThemeContext;
  const { colors } = euiTheme;
  const actions = useWorkflowGraphActions();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuClusterRef = useRef<HTMLDivElement | null>(null);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);

  useCloseOnOutsidePointerDown(
    isMenuOpen,
    closeMenu,
    menuClusterRef,
    SECTION_MENU_INSIDE_TEST_SUBJS
  );

  const title = getSectionTitle(step, label);
  const description =
    typeof step?.description === 'string' && step.description.trim() !== ''
      ? step.description
      : undefined;
  const { onToggleSection } = actions;

  const handleAddFirstStep = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Keep the click from reaching onNodeClick, which would select the section.
      e.stopPropagation();
      if (!actions.edit) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      actions.edit.onInsert(
        { mode: 'branch', stepName: label, branch: { kind: 'steps' } },
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      );
    },
    [actions.edit, label]
  );

  // TODO: switch to xxs when available
  const nodeShadow = useEuiShadow('xs', { border: 'none' });
  const targetHandlePos = node.targetPosition ?? Position.Top;
  const sourceHandlePos = node.sourcePosition ?? Position.Bottom;

  const execStatus = stepExecution?.status;
  const isSuccess = execStatus === ExecutionStatus.COMPLETED;
  const isFailed =
    execStatus === ExecutionStatus.FAILED || execStatus === ExecutionStatus.TIMED_OUT;

  const chip = resolveNodeChipStyle(euiTheme, stepType, false, { isSuccess, isFailed });
  const panelBorder = isSuccess
    ? colors.success
    : isFailed
    ? colors.danger
    : colors.borderBasePlain;
  const borderRadius = euiTheme.border.radius.small;

  const cardLabel = execStatus
    ? i18n.translate('workflowsUi.sectionGroupNode.ariaLabelWithStatus', {
        defaultMessage: 'Section: {label}, status: {status}',
        values: { label: title, status: execStatus },
      })
    : i18n.translate('workflowsUi.sectionGroupNode.ariaLabel', {
        defaultMessage: 'Section: {label}',
        values: { label: title },
      });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Keys pressed on inner controls (toggle, menu, add-first-step) are theirs.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      actions.onStepSelect?.(node.id);
      return;
    }
    if (actions.edit && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      actions.edit.onDeleteNode(node.id);
    }
  };

  const menuLabel = i18n.translate('workflowsUi.sectionGroupNode.sectionActions', {
    defaultMessage: 'Section actions',
  });
  const addFirstStepLabel = i18n.translate('workflowsUi.sectionGroupNode.addFirstStep', {
    defaultMessage: 'Add first step in {label}',
    values: { label: title },
  });
  const collapseLabel = i18n.translate('workflowsUi.sectionGroupNode.collapse', {
    defaultMessage: 'Collapse section {label}',
    values: { label: title },
  });

  return (
    <>
      <Handle type="target" position={targetHandlePos} style={{ opacity: 0 }} />
      <div
        role="button"
        tabIndex={0}
        aria-label={cardLabel}
        onKeyDown={handleKeyDown}
        css={[
          {
            width: '100%',
            height: '100%',
            background: transparentize(getSectionPalette(colors).tint, 0.4),
            border: `${euiTheme.border.width.thin} solid ${panelBorder}`,
            borderRadius,
            position: 'relative',
            transition: 'border-color 120ms ease',
            // The section's colour, in a bar that run status never repaints.
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: -1,
              width: 4,
              borderRadius: `${borderRadius} 0 0 ${borderRadius}`,
              background: getSectionPalette(colors).strong,
              pointerEvents: 'none',
            },
            '&:focus': { outline: 'none' },
            '&:focus-visible': euiFocusRing(euiThemeContext),
          },
          nodeShadow,
        ]}
      >
        <div
          data-test-subj="workflowGraphSectionGroupHeader"
          css={{
            display: 'flex',
            alignItems: 'center',
            gap: euiTheme.size.s,
            padding: `${euiTheme.size.s} ${euiTheme.size.m}`,
            ...nodeLabelTypography(euiTheme, '24px'),
            color: colors.textHeading,
          }}
        >
          {onToggleSection && (
            <span
              css={{ display: 'flex', flex: '0 0 auto' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              {onToggleSection && (
                <EuiToolTip content={collapseLabel} disableScreenReaderOutput>
                  <EuiButtonIcon
                    iconType="chevronSingleDown"
                    size="s"
                    color="text"
                    aria-label={collapseLabel}
                    aria-expanded
                    onClick={() => onToggleSection(label)}
                    data-test-subj="workflowGraphSectionToggle"
                  />
                </EuiToolTip>
              )}
            </span>
          )}
          <NodeIconChip
            background={chip.background}
            border={chip.border}
            borderRadius={borderRadius}
            size={28}
            data-test-subj="workflowGraphSectionGroupChip"
          >
            <NodeStepIcon
              iconType={getStepIconType(stepType)}
              iconColor={chip.iconColor}
              stepType={stepType}
              isTrigger={false}
            />
          </NodeIconChip>
          <div css={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span
              css={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={title}
            >
              {title}
            </span>
            {description && (
              <span
                css={{
                  ...nodeLabelTypography(euiTheme, '16px'),
                  fontWeight: 400,
                  color: colors.subduedText,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={description}
                data-test-subj="workflowGraphSectionDescription"
              >
                {description}
              </span>
            )}
          </div>
          <div
            ref={menuClusterRef}
            css={{ display: 'flex', alignItems: 'center', flex: '0 0 auto' }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            {actions.edit && (
              <EuiPopover
                isOpen={isMenuOpen}
                closePopover={closeMenu}
                panelPaddingSize="none"
                anchorPosition="downRight"
                aria-label={menuLabel}
                ownFocus
                panelProps={{ 'data-test-subj': 'workflowGraphSectionMenuPanel' }}
                button={
                  <EuiToolTip content={menuLabel} disableScreenReaderOutput>
                    <EuiButtonIcon
                      iconType="ellipsis"
                      size="s"
                      color="text"
                      aria-label={menuLabel}
                      aria-haspopup="menu"
                      aria-expanded={isMenuOpen}
                      onClick={() => setIsMenuOpen((v) => !v)}
                      data-test-subj="workflowGraphSectionMenuButton"
                    />
                  </EuiToolTip>
                }
              >
                <StepContextMenuPanel
                  editLabel={i18n.translate('workflowsUi.sectionGroupNode.editSection', {
                    defaultMessage: 'Edit section',
                  })}
                  deleteLabel={i18n.translate('workflowsUi.sectionGroupNode.deleteSection', {
                    defaultMessage: 'Delete section and its steps',
                  })}
                  onEdit={() => {
                    closeMenu();
                    actions.edit?.onEditStep(node.id);
                  }}
                  onDelete={() => {
                    closeMenu();
                    actions.edit?.onDeleteNode(node.id);
                  }}
                  editTestSubj="workflowGraphSectionMenuEdit"
                  deleteTestSubj="workflowGraphSectionMenuDelete"
                  extraItems={[
                    ...(actions.edit.onUngroupSection
                      ? [
                          {
                            label: i18n.translate('workflowsUi.sectionGroupNode.ungroup', {
                              defaultMessage: 'Ungroup (keep steps)',
                            }),
                            iconType: 'merge',
                            onClick: () => {
                              closeMenu();
                              actions.edit?.onUngroupSection?.(node.id);
                            },
                            testSubj: 'workflowGraphSectionMenuUngroup',
                          },
                        ]
                      : []),
                    ...(actions.edit.onExtractSection && hasBodySteps
                      ? [
                          {
                            label: i18n.translate('workflowsUi.sectionGroupNode.extract', {
                              defaultMessage: 'Extract to new workflow',
                            }),
                            iconType: 'workflow',
                            onClick: () => {
                              closeMenu();
                              actions.edit?.onExtractSection?.(node.id);
                            },
                            testSubj: 'workflowGraphSectionMenuExtract',
                          },
                        ]
                      : []),
                  ]}
                />
              </EuiPopover>
            )}
          </div>
        </div>
        {!hasBodySteps && (
          <div
            css={{
              margin: `0 ${euiTheme.size.m} ${euiTheme.size.m}`,
              padding: euiTheme.size.s,
              borderRadius: euiTheme.border.radius.small,
              border: `1px dashed ${euiTheme.colors.borderBaseSubdued}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 40,
            }}
          >
            {actions.edit && (
              <EuiToolTip content={addFirstStepLabel} disableScreenReaderOutput>
                <EuiButtonIcon
                  iconType="plusCircle"
                  aria-label={addFirstStepLabel}
                  onClick={handleAddFirstStep}
                  size="m"
                  color="text"
                  css={{ opacity: 0.5 }}
                  data-test-subj="workflowGraphSectionAddFirstStep"
                />
              </EuiToolTip>
            )}
          </div>
        )}
      </div>
      <Handle type="source" position={sourceHandlePos} style={{ opacity: 0 }} />
    </>
  );
}

export const WorkflowGraphSectionGroupNode = memo(WorkflowGraphSectionGroupNodeInner);
