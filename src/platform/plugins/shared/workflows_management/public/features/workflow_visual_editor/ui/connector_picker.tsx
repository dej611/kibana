/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiListGroup,
  EuiListGroupItem,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React from 'react';
import { i18n } from '@kbn/i18n';

const CONNECTOR_PICKER_TITLE = i18n.translate('workflows.visualEditor.connectorPicker.title', {
  defaultMessage: 'Select a connector',
});

const NO_CONNECTORS_MESSAGE = i18n.translate(
  'workflows.visualEditor.connectorPicker.noConnectors',
  { defaultMessage: 'No connectors configured for this type.' }
);

const CREATE_NEW_CONNECTOR_LABEL = i18n.translate(
  'workflows.visualEditor.connectorPicker.createNew',
  { defaultMessage: 'Create new connector' }
);

const wrapperStyle = css({ padding: '12px 16px' });

interface ConnectorPickerProps {
  instances: Array<{ id: string; name: string; isDeprecated: boolean }>;
  onSelect: (connectorId: string) => void;
  onCreateNew: () => void;
}

export const ConnectorPicker = React.memo<ConnectorPickerProps>(
  ({ instances, onSelect, onCreateNew }) => {
    const activeInstances = instances.filter((inst) => !inst.isDeprecated);
    const hasInstances = activeInstances.length > 0;

    return (
      <div css={wrapperStyle}>
        <EuiTitle size="xxxs">
          <h4>{CONNECTOR_PICKER_TITLE}</h4>
        </EuiTitle>
        <EuiSpacer size="s" />
        {hasInstances ? (
          <EuiListGroup flush gutterSize="none" maxWidth={false}>
            {activeInstances.map((inst) => (
              <EuiListGroupItem
                key={inst.id}
                label={inst.name}
                size="s"
                onClick={() => onSelect(inst.id)}
                iconType="logoElastic"
              />
            ))}
          </EuiListGroup>
        ) : (
          <EuiText size="s" color="subdued">
            <p>{NO_CONNECTORS_MESSAGE}</p>
          </EuiText>
        )}
        <EuiSpacer size="s" />
        <EuiFlexGroup justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="s" iconType="plusInCircle" onClick={onCreateNew}>
              {CREATE_NEW_CONNECTOR_LABEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
    );
  }
);
ConnectorPicker.displayName = 'ConnectorPicker';
