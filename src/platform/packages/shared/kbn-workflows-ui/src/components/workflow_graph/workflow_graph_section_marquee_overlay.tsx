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
  EuiButtonIcon,
  EuiText,
  EuiToolTip,
  transparentize,
  useEuiTheme,
} from '@elastic/eui';
import { ViewportPortal } from '@xyflow/react';
import React from 'react';
import { i18n } from '@kbn/i18n';
import type { MarqueeRect, SectionMarqueeProposal } from './use_section_marquee';

/** Room between the steps a section would wrap and the frame drawn around them. */
const FRAME_PADDING_PX = 16;

interface WorkflowGraphSectionMarqueeOverlayProps {
  readonly dragRect: MarqueeRect | null;
  readonly proposal: SectionMarqueeProposal | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * What the section marquee shows: the rectangle while it is dragged, then a frame around
 * the steps a section would wrap, with the button that wraps them, or why it cannot.
 */
export function WorkflowGraphSectionMarqueeOverlay({
  dragRect,
  proposal,
  onConfirm,
  onCancel,
}: WorkflowGraphSectionMarqueeOverlayProps) {
  const { euiTheme } = useEuiTheme();
  const { colors } = euiTheme;

  const cancelLabel = i18n.translate('workflowsUi.sectionMarquee.cancel', {
    defaultMessage: 'Cancel',
  });

  return (
    <>
      {dragRect && (
        <div
          data-test-subj="workflowGraphSectionMarqueeDrag"
          css={{
            position: 'absolute',
            left: dragRect.x,
            top: dragRect.y,
            width: dragRect.width,
            height: dragRect.height,
            border: `1px dashed ${colors.primary}`,
            background: transparentize(colors.primary, 0.08),
            pointerEvents: 'none',
            zIndex: euiTheme.levels.content,
          }}
        />
      )}
      {proposal && (
        <ViewportPortal>
          <div
            // Keeps a click on the frame or its button from panning or selecting.
            className="nopan nodrag"
            data-test-subj="workflowGraphSectionMarqueeFrame"
            css={{
              position: 'absolute',
              transform: `translate(${proposal.bounds.x - FRAME_PADDING_PX}px, ${
                proposal.bounds.y - FRAME_PADDING_PX
              }px)`,
              width: proposal.bounds.width + FRAME_PADDING_PX * 2,
              height: proposal.bounds.height + FRAME_PADDING_PX * 2,
              border: `${euiTheme.border.width.thick} dashed ${
                proposal.kind === 'range' ? colors.primary : colors.danger
              }`,
              borderRadius: euiTheme.border.radius.medium,
              background: transparentize(
                proposal.kind === 'range' ? colors.primary : colors.danger,
                0.06
              ),
              pointerEvents: 'none',
            }}
          >
            <div
              css={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: euiTheme.size.s,
                display: 'flex',
                alignItems: 'center',
                gap: euiTheme.size.xs,
                pointerEvents: 'auto',
              }}
            >
              {proposal.kind === 'range' ? (
                <EuiButton
                  size="s"
                  fill
                  iconType="grid"
                  onClick={onConfirm}
                  data-test-subj="workflowGraphSectionMarqueeConfirm"
                >
                  {i18n.translate('workflowsUi.sectionMarquee.wrap', {
                    defaultMessage: 'Wrap {count, plural, one {# step} other {# steps}} in section',
                    values: { count: proposal.stepNames.length },
                  })}
                </EuiButton>
              ) : (
                <EuiText
                  size="xs"
                  color="danger"
                  data-test-subj="workflowGraphSectionMarqueeRefused"
                >
                  {i18n.translate('workflowsUi.sectionMarquee.nested', {
                    defaultMessage: "Sections can't be nested",
                  })}
                </EuiText>
              )}
              <EuiToolTip content={cancelLabel} disableScreenReaderOutput>
                <EuiButtonIcon
                  iconType="cross"
                  size="s"
                  color="text"
                  aria-label={cancelLabel}
                  onClick={onCancel}
                  data-test-subj="workflowGraphSectionMarqueeCancel"
                />
              </EuiToolTip>
            </div>
          </div>
        </ViewportPortal>
      )}
    </>
  );
}
