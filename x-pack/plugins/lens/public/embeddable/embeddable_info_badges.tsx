/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiPopover,
  EuiToolTip,
  EuiButtonIcon,
  EuiHorizontalRule,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { useState } from 'react';
import type { FeatureBadge } from '../types';
import './embeddable_info_badges.scss';

export const EmbeddableFeatureBadge = ({ badges }: { badges: FeatureBadge[] }) => {
  const { euiTheme } = useEuiTheme();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const onButtonClick = () => setIsPopoverOpen((isOpen) => !isOpen);
  const closePopover = () => setIsPopoverOpen(false);
  if (!badges.length) {
    return null;
  }
  return (
    <EuiPopover
      panelPaddingSize="none"
      button={
        <EuiToolTip
          content={i18n.translate('xpack.lens.embeddable.featureBadge.iconDescription', {
            defaultMessage: `Visualization modifiers`,
          })}
        >
          <EuiButtonIcon
            color={'text'}
            onClick={onButtonClick}
            iconType="iInCircle"
            aria-label={`Visualization modifiers`}
          />
        </EuiToolTip>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
    >
      <div>
        {badges.map(({ icon, title, meta, content }, index) => (
          <React.Fragment key={`${title}-${index}`}>
            {index ? <EuiHorizontalRule margin="none" /> : null}
            <EuiTitle
              size="xs"
              css={css`color=${euiTheme.colors.title}`}
              className="lnsEmbeddablePanelFeatureList_header"
            >
              <h3>
                {icon} {title}
              </h3>
            </EuiTitle>
            {content}
            {meta ? (
              <ul className="lnsEmbeddablePanelFeatureList">
                {meta.map(({ layerTitle, dataView, value }, layerIndex) => {
                  return (
                    <li
                      key={`${layerTitle}-${dataView}-${layerIndex}`}
                      className="lnsEmbeddablePanelFeatureList__item"
                    >
                      <EuiFlexGroup justifyContent="spaceBetween">
                        <EuiFlexItem grow={false}>{layerTitle}</EuiFlexItem>
                        {value ? (
                          <EuiFlexItem
                            grow={false}
                            className="lnsEmbeddablePanelFeatureList__value"
                          >
                            {value}
                          </EuiFlexItem>
                        ) : null}
                      </EuiFlexGroup>
                      <EuiFlexGroup>
                        <EuiFlexItem grow={false}>
                          <EuiText color="subdued" size="xs">
                            {dataView}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </EuiPopover>
  );
};
