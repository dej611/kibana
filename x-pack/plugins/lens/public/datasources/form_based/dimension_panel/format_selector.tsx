/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiFormRow,
  EuiComboBox,
  EuiSpacer,
  EuiRange,
  EuiFieldText,
  EuiSwitch,
  EuiCode,
  EuiIcon,
  EuiLink,
  EuiText,
} from '@elastic/eui';
import { useDebouncedValue } from '@kbn/visualization-ui-components/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { FORMATS_UI_SETTINGS } from '@kbn/field-formats-plugin/common';
import { FormattedMessage } from '@kbn/i18n-react';
import { LensAppServices } from '../../../app_plugin/types';
import { GenericIndexPatternColumn } from '../form_based';
import { isColumnFormatted } from '../operations/definitions/helpers';
import { ValueFormatConfig } from '../operations/definitions/column_types';

const supportedFormats: Record<
  string,
  { title: string; defaultDecimals?: number; supportsCompact: boolean }
> = {
  number: {
    title: i18n.translate('xpack.lens.indexPattern.numberFormatLabel', {
      defaultMessage: 'Number',
    }),
    supportsCompact: true,
  },
  percent: {
    title: i18n.translate('xpack.lens.indexPattern.percentFormatLabel', {
      defaultMessage: 'Percent',
    }),
    supportsCompact: true,
  },
  bytes: {
    title: i18n.translate('xpack.lens.indexPattern.bytesFormatLabel', {
      defaultMessage: 'Bytes (1024)',
    }),
    supportsCompact: false,
  },
  bits: {
    title: i18n.translate('xpack.lens.indexPattern.bitsFormatLabel', {
      defaultMessage: 'Bits (1000)',
    }),
    defaultDecimals: 0,
    supportsCompact: false,
  },
  custom: {
    title: i18n.translate('xpack.lens.indexPattern.customFormatLabel', {
      defaultMessage: 'Custom format',
    }),
    defaultDecimals: 0,
    supportsCompact: false,
  },
};

const defaultOption = {
  value: '',
  label: i18n.translate('xpack.lens.indexPattern.defaultFormatLabel', {
    defaultMessage: 'Default',
  }),
};

const singleSelectionOption = { asPlainText: true };

const label = i18n.translate('xpack.lens.indexPattern.columnFormatLabel', {
  defaultMessage: 'Value format',
});

const decimalsLabel = i18n.translate('xpack.lens.indexPattern.decimalPlacesLabel', {
  defaultMessage: 'Decimals',
});

const suffixLabel = i18n.translate('xpack.lens.indexPattern.suffixLabel', {
  defaultMessage: 'Suffix',
});

const compactLabel = i18n.translate('xpack.lens.indexPattern.compactLabel', {
  defaultMessage: 'Compact',
});

type FormatParams = NonNullable<ValueFormatConfig['params']>;
type FormatParamsKeys = keyof FormatParams;

interface FormatSelectorProps {
  selectedColumn: GenericIndexPatternColumn;
  onChange: (newFormat?: { id: string; params?: FormatParams }) => void;
}

const RANGE_MIN = 0;
const RANGE_MAX = 15;

function useDebouncedInputforParam<T extends FormatParamsKeys>(
  name: T,
  defaultValue: FormatParams[T],
  currentFormat: ValueFormatConfig | undefined,
  onChange: FormatSelectorProps['onChange']
) {
  const onChangeParam = useCallback(
    (value: FormatParams[T]) => {
      if (!currentFormat) {
        return;
      }
      onChange({
        id: currentFormat.id,
        params: {
          ...currentFormat.params,
          [name]: value,
        } as FormatParams,
      });
    },
    [currentFormat, name, onChange]
  );

  const { handleInputChange: setter, inputValue: value } = useDebouncedValue(
    {
      onChange: onChangeParam,
      value: currentFormat?.params?.[name] || defaultValue,
    },
    { allowFalsyValue: true }
  );
  return { setter, value };
}

export function FormatSelector(props: FormatSelectorProps) {
  const { docLinks, uiSettings } = useKibana<LensAppServices>().services;
  const { selectedColumn, onChange } = props;
  const currentFormat = isColumnFormatted(selectedColumn)
    ? selectedColumn.params?.format
    : undefined;

  const [decimals, setDecimals] = useState(currentFormat?.params?.decimals ?? 2);

  const { setter: setSuffix, value: suffix } = useDebouncedInputforParam(
    'suffix' as const,
    '',
    currentFormat,
    onChange
  );

  const { setter: setCompact, value: compact } = useDebouncedInputforParam(
    'compact' as const,
    false,
    currentFormat,
    onChange
  );

  const defaultNumeralPatternInKibana = uiSettings.get(
    FORMATS_UI_SETTINGS.FORMAT_NUMBER_DEFAULT_PATTERN
  );
  const { setter: setPattern, value: pattern } = useDebouncedInputforParam(
    'pattern' as const,
    defaultNumeralPatternInKibana,
    currentFormat,
    onChange
  );

  const selectedFormat = currentFormat?.id ? supportedFormats[currentFormat.id] : undefined;
  const stableOptions = useMemo(
    () => [
      defaultOption,
      ...Object.entries(supportedFormats).map(([id, format]) => ({
        value: id,
        label: format.title ?? id,
      })),
    ],
    []
  );

  const onChangeWrapped = useCallback(
    (choices) => {
      if (choices.length === 0) {
        return;
      }

      if (!choices[0].value) {
        onChange();
        return;
      }
      const id = choices[0].value;
      const defaultDecimals = supportedFormats[id].defaultDecimals;
      onChange({
        id: choices[0].value,
        params: { decimals: defaultDecimals ?? decimals },
      });
      setDecimals(defaultDecimals ?? decimals);
    },
    [onChange, decimals]
  );

  const currentOption = useMemo(
    () =>
      currentFormat
        ? [
            {
              value: currentFormat.id,
              label: selectedFormat?.title ?? currentFormat.id,
            },
          ]
        : [defaultOption],
    [currentFormat, selectedFormat?.title]
  );

  return (
    <>
      <EuiFormRow
        label={label}
        display="columnCompressed"
        fullWidth
        helpText={
          currentFormat?.id === 'custom' ? (
            <FormattedMessage
              id="xpack.lens.indexPattern.customFormat.description"
              defaultMessage="Numeral.js format pattern (Default: {defaultPattern})"
              values={{
                defaultPattern: <EuiCode>{defaultNumeralPatternInKibana}</EuiCode>,
              }}
            />
          ) : null
        }
      >
        <div>
          <EuiComboBox
            fullWidth
            compressed
            isClearable={false}
            data-test-subj="indexPattern-dimension-format"
            aria-label={label}
            singleSelection={singleSelectionOption}
            options={stableOptions}
            selectedOptions={currentOption}
            onChange={onChangeWrapped}
          />
          {currentFormat && currentFormat.id !== 'custom' ? (
            <>
              <EuiSpacer size="s" />
              <EuiRange
                showInput="inputWithPopover"
                value={decimals}
                min={RANGE_MIN}
                max={RANGE_MAX}
                onChange={(e) => {
                  const value = Number(e.currentTarget.value);
                  setDecimals(value);
                  const validatedValue = Math.min(RANGE_MAX, Math.max(RANGE_MIN, value));
                  onChange({
                    id: currentFormat.id,
                    params: {
                      ...currentFormat.params,
                      decimals: validatedValue,
                    },
                  });
                }}
                data-test-subj="indexPattern-dimension-formatDecimals"
                compressed
                fullWidth
                prepend={decimalsLabel}
                aria-label={decimalsLabel}
              />

              <EuiSpacer size="s" />
              <EuiFieldText
                value={suffix}
                onChange={(e) => {
                  setSuffix(e.currentTarget.value);
                }}
                data-test-subj="indexPattern-dimension-formatSuffix"
                compressed
                fullWidth
                prepend={suffixLabel}
                aria-label={suffixLabel}
              />
            </>
          ) : null}
        </div>
      </EuiFormRow>
      {selectedFormat?.supportsCompact ? (
        <EuiFormRow label={compactLabel} display="columnCompressedSwitch" fullWidth>
          <EuiSwitch
            compressed
            showLabel={false}
            label={compactLabel}
            checked={Boolean(compact)}
            onChange={() => setCompact(!compact)}
            data-test-subj="lns-indexpattern-dimension-formatCompact"
          />
        </EuiFormRow>
      ) : null}
      {currentFormat?.id === 'custom' ? (
        <EuiFormRow
          display="columnCompressed"
          label={' '}
          hasEmptyLabelSpace
          helpText={
            <EuiText size="xs">
              <EuiLink target="_blank" href={docLinks?.links.indexPatterns.fieldFormattersNumber}>
                <FormattedMessage
                  id="xpack.lens.indexPattern.number.documentationLabel"
                  defaultMessage="Syntax Help"
                />
                &nbsp;
                <EuiIcon type="link" />
              </EuiLink>
            </EuiText>
          }
        >
          <EuiFieldText
            data-test-subj={'numberEditorFormatPattern'}
            value={pattern}
            placeholder={defaultNumeralPatternInKibana}
            onChange={(e) => {
              setPattern(e.target.value);
            }}
          />
        </EuiFormRow>
      ) : null}
    </>
  );
}
