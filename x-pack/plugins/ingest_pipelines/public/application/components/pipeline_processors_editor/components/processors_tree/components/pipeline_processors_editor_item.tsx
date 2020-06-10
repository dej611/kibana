/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { i18n } from '@kbn/i18n';
import React, { FunctionComponent, memo, useState } from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
  EuiText,
  EuiLink,
  EuiIcon,
  EuiContextMenuPanel,
  EuiContextMenuItem,
  EuiPopover,
} from '@elastic/eui';

import { ProcessorInternal } from '../../../types';

import { usePipelineProcessorsContext } from '../../../context';

export interface Handlers {
  onMove: () => void;
  onCancelMove: () => void;
  onAddOnFailure: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export interface Props {
  processor: ProcessorInternal;
  selected: boolean;
  handlers: Handlers;
  description?: string;
}

export const PipelineProcessorsEditorItem: FunctionComponent<Props> = memo(
  ({
    processor,
    description,
    handlers: { onMove, onCancelMove, onAddOnFailure, onEdit, onDelete, onDuplicate },
    selected,
  }) => {
    const { links } = usePipelineProcessorsContext();
    const [isContextMenuOpen, setIsContextMenuOpen] = useState<boolean>(false);
    return (
      <EuiFlexGroup
        gutterSize="none"
        responsive={false}
        alignItems="center"
        justifyContent="spaceBetween"
      >
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false} className="pipelineProcessorsEditor__tree__item__name">
              <b>{processor.type}</b>
            </EuiFlexItem>
            <EuiFlexItem grow={false} className="pipelineProcessorsEditor__tree__item__name">
              {description ? (
                <EuiText size="s" color="subdued">
                  {description}
                </EuiText>
              ) : (
                <EuiFlexGroup alignItems="center" gutterSize="none" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s" color="subdued">
                      {`#${processor.id}`}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      position="top"
                      content={i18n.translate(
                        'xpack.ingestPipelines.pipelineEditor.item.uniqueIdToolTipDescription',
                        {
                          defaultMessage:
                            'A unique identifier for this "{type}" processor. This value will not be saved for this processor. To provide your own processor description that can be saved use the tag field. Click on the help icon below to learn more.',
                          values: { type: processor.type },
                        }
                      )}
                    >
                      <EuiLink target="_blank" href={links.learnMoreAboutProcessorsUrl}>
                        <EuiIcon color="primary" type="questionInCircle" />
                      </EuiLink>
                    </EuiToolTip>
                  </EuiFlexItem>
                </EuiFlexGroup>
              )}
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={i18n.translate(
                  'xpack.ingestPipelines.pipelineEditor.item.editButtonLabel',
                  {
                    defaultMessage: 'Edit this processor',
                  }
                )}
              >
                <EuiButtonIcon
                  aria-label={i18n.translate(
                    'xpack.ingestPipelines.pipelineEditor.item.editButtonAriaLabel',
                    {
                      defaultMessage: 'Edit this processor',
                    }
                  )}
                  iconType="pencil"
                  size="s"
                  onClick={onEdit}
                />
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              {selected ? (
                <EuiToolTip
                  content={i18n.translate(
                    'xpack.ingestPipelines.pipelineEditor.item.cancelMoveButtonLabel',
                    {
                      defaultMessage: 'Cancel moving this processor',
                    }
                  )}
                >
                  <EuiButtonIcon
                    aria-label={i18n.translate(
                      'xpack.ingestPipelines.pipelineEditor.item.cancelMoveButtonAriaLabel',
                      {
                        defaultMessage: 'Cancel moving this processor',
                      }
                    )}
                    size="s"
                    onClick={onCancelMove}
                    iconType="crossInACircleFilled"
                  />
                </EuiToolTip>
              ) : (
                <EuiToolTip
                  content={i18n.translate(
                    'xpack.ingestPipelines.pipelineEditor.item.moveButtonLabel',
                    {
                      defaultMessage: 'Move this processor',
                    }
                  )}
                >
                  <EuiButtonIcon
                    aria-label={i18n.translate(
                      'xpack.ingestPipelines.pipelineEditor.item.moveButtonAriaLabel',
                      {
                        defaultMessage: 'Move this processor',
                      }
                    )}
                    size="s"
                    onClick={onMove}
                    iconType="sortable"
                  />
                </EuiToolTip>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiPopover
            anchorPosition="leftCenter"
            panelPaddingSize="none"
            isOpen={isContextMenuOpen}
            closePopover={() => setIsContextMenuOpen(false)}
            button={
              <EuiButtonIcon
                onClick={() => setIsContextMenuOpen((v) => !v)}
                iconType="boxesHorizontal"
                aria-label={i18n.translate(
                  'xpack.ingestPipelines.pipelineEditor.item.moreButtonAriaLabel',
                  {
                    defaultMessage: 'Show more actions for this processor',
                  }
                )}
              />
            }
          >
            <EuiContextMenuPanel
              items={[
                <EuiContextMenuItem
                  key="duplicate"
                  icon="copy"
                  onClick={() => {
                    setIsContextMenuOpen(false);
                    onDuplicate();
                  }}
                >
                  {i18n.translate(
                    'xpack.ingestPipelines.pipelineEditor.item.moreMenu.duplicateButtonLabel',
                    {
                      defaultMessage: 'Duplicate this processor',
                    }
                  )}
                </EuiContextMenuItem>,
                <EuiContextMenuItem
                  key="addOnFailure"
                  icon="indexClose"
                  onClick={() => {
                    setIsContextMenuOpen(false);
                    onAddOnFailure();
                  }}
                >
                  {i18n.translate(
                    'xpack.ingestPipelines.pipelineEditor.item.moreMenu.addOnFailureHandlerButtonLabel',
                    {
                      defaultMessage: 'Add on failure handler',
                    }
                  )}
                </EuiContextMenuItem>,
                <EuiContextMenuItem
                  key="delete"
                  icon="trash"
                  color="danger"
                  onClick={() => {
                    setIsContextMenuOpen(false);
                    onDelete();
                  }}
                >
                  {i18n.translate(
                    'xpack.ingestPipelines.pipelineEditor.item.moreMenu.deleteButtonLabel',
                    {
                      defaultMessage: 'Delete',
                    }
                  )}
                </EuiContextMenuItem>,
              ]}
            />
          </EuiPopover>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  },
  (prev, current) => {
    return (
      prev.handlers === current.handlers &&
      prev.processor.id === current.processor.id &&
      prev.processor.type === current.processor.type &&
      prev.processor.onFailure === current.processor.onFailure &&
      prev.description === current.description &&
      prev.selected === current.selected
    );
  }
);
