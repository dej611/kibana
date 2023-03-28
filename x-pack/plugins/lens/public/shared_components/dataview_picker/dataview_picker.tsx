/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import React, { useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelectableProps,
  EuiTextColor,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { DataViewsList } from '@kbn/unified-search-plugin/public';
import { css } from '@emotion/react';
import { type IndexPatternRef } from '../../types';
import { type ToolbarButtonProps, ToolbarButton } from './toolbar_button';
import { RandomSamplingIcon } from './sampling_icon';

export type ChangeIndexPatternTriggerProps = ToolbarButtonProps & {
  label: string;
  title?: string;
  isDisabled?: boolean;
  samplingValue?: number;
};

function TriggerButton({
  label,
  title,
  togglePopover,
  isMissingCurrent,
  samplingValue,
  ...rest
}: ChangeIndexPatternTriggerProps &
  ToolbarButtonProps & {
    togglePopover: () => void;
    isMissingCurrent?: boolean;
  }) {
  const { euiTheme } = useEuiTheme();
  // be careful to only add color with a value, otherwise it will fallbacks to "primary"
  const colorProp = isMissingCurrent
    ? {
        color: 'danger' as const,
      }
    : {};
  const content =
    samplingValue != null && samplingValue !== 1 ? (
      <EuiFlexGroup justifyContent={'spaceBetween'}>
        <EuiFlexItem grow={1}>{label}</EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate('xpack.lens.indexPattern.randomSamplingInfo', {
              defaultMessage: '{value}% sampling',
              values: {
                value: samplingValue * 100,
              },
            })}
            display="block"
            position="top"
          >
            <>
              <RandomSamplingIcon
                color={euiTheme.colors.mediumShade}
                fill="currentColor"
                css={css`
                  margin-top: -1px;
                  vertical-align: middle;
                  display: inline-block;
                `}
              />
              <EuiTextColor
                color={euiTheme.colors.mediumShade}
                css={css`
                  padding-left: 8px;
                `}
              >
                {samplingValue * 100}%
              </EuiTextColor>
            </>
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
    ) : (
      label
    );
  return (
    <ToolbarButton
      title={title}
      onClick={() => togglePopover()}
      fullWidth
      {...colorProp}
      {...rest}
      textProps={{ style: { width: '100%' } }}
    >
      {content}
    </ToolbarButton>
  );
}

export function ChangeIndexPattern({
  indexPatternRefs,
  isMissingCurrent,
  indexPatternId,
  onChangeIndexPattern,
  trigger,
  selectableProps,
}: {
  trigger: ChangeIndexPatternTriggerProps;
  indexPatternRefs: IndexPatternRef[];
  isMissingCurrent?: boolean;
  onChangeIndexPattern: (newId: string) => void;
  indexPatternId?: string;
  selectableProps?: EuiSelectableProps;
}) {
  const [isPopoverOpen, setPopoverIsOpen] = useState(false);

  return (
    <>
      <EuiPopover
        panelClassName="lnsChangeIndexPatternPopover"
        button={
          <TriggerButton
            {...trigger}
            isMissingCurrent={isMissingCurrent}
            togglePopover={() => setPopoverIsOpen(!isPopoverOpen)}
          />
        }
        panelProps={{
          ['data-test-subj']: 'lnsChangeIndexPatternPopover',
        }}
        isOpen={isPopoverOpen}
        closePopover={() => setPopoverIsOpen(false)}
        display="block"
        panelPaddingSize="none"
        ownFocus
      >
        <div>
          <EuiPopoverTitle paddingSize="s">
            {i18n.translate('xpack.lens.indexPattern.changeDataViewTitle', {
              defaultMessage: 'Data view',
            })}
          </EuiPopoverTitle>

          <DataViewsList
            dataViewsList={indexPatternRefs}
            onChangeDataView={(newId) => {
              onChangeIndexPattern(newId);
              setPopoverIsOpen(false);
            }}
            currentDataViewId={indexPatternId}
            selectableProps={selectableProps}
          />
        </div>
      </EuiPopover>
    </>
  );
}
