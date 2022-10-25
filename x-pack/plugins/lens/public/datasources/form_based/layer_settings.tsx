/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFormRow,
  EuiRange,
  EuiFlexGroup,
  EuiFlexItem,
  EuiBadge,
  EuiText,
  EuiLink,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DatasourceLayerSettingsProps } from '../../types';
import type { FormBasedPrivateState } from './types';

const samplingValue = [0.0001, 0.001, 0.01, 0.1, 1];

export function LayerSettingsPanel({
  state,
  setState,
  layerId,
}: DatasourceLayerSettingsProps<FormBasedPrivateState>) {
  const samplingIndex = samplingValue.findIndex((v) => v === state.layers[layerId].sampling);
  const currentSamplingIndex = samplingIndex > -1 ? samplingIndex : samplingValue.length - 1;
  return (
    <EuiFormRow
      display="rowCompressed"
      data-test-subj="lns-indexPattern-random-sampling-row"
      fullWidth
      helpText={
        <FormattedMessage
          id="xpack.lens.xyChart.randomSampling.help"
          defaultMessage="The sampling is accomplished by providing a random subset of the entire set of documents. The lower the value the higher the error and speed: consider the usage of lower values for big datasets. {link}"
          values={{
            link: (
              <EuiLink
                href="https://www.elastic.co/guide/en/elasticsearch/reference/master/search-aggregations-random-sampler-aggregation.html"
                target="_blank"
                external
              >
                <FormattedMessage
                  id="xpack.lens.xyChart.randomSampling.learnMore"
                  defaultMessage="Learn more"
                />
              </EuiLink>
            ),
          }}
        />
      }
      label={
        <>
          {i18n.translate('xpack.lens.xyChart.randomSampling.label', {
            defaultMessage: 'Random sampling',
          })}{' '}
          <EuiBadge color="hollow">
            {i18n.translate('xpack.lens.randomSampling.experimentalLabel', {
              defaultMessage: 'Technical preview',
            })}
          </EuiBadge>
        </>
      }
    >
      <EuiFlexGroup>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <FormattedMessage
              id="xpack.lens.xyChart.randomSampling.speedLabel"
              defaultMessage="Speed"
            />
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiRange
            data-test-subj="lns-indexPattern-random-sampling"
            value={currentSamplingIndex}
            onChange={(e) => {
              setState({
                ...state,
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...state.layers[layerId],
                    sampling: samplingValue[Number(e.currentTarget.value)],
                  },
                },
              });
            }}
            showInput={false}
            showRange={false}
            showTicks
            step={1}
            min={0}
            max={samplingValue.length - 1}
            ticks={samplingValue.map((v, i) => ({ label: `${v * 100}%`, value: i }))}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <FormattedMessage
              id="xpack.lens.xyChart.randomSampling.accuracyLabel"
              defaultMessage="Accuracy"
            />
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFormRow>
  );
}
