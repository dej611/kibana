/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import React from 'react';
import { mount } from 'enzyme';
import { act } from 'react-dom/test-utils';
import { EuiSwitchEvent, EuiFieldNumber, EuiSwitch, EuiRange } from '@elastic/eui';
import { IUiSettingsClient, SavedObjectsClientContract, HttpSetup } from 'kibana/public';
import { IStorageWrapper } from 'src/plugins/kibana_utils/public';
import { IndexPatternPrivateState, IndexPattern } from '../../../types';
import { dataPluginMock } from '../../../../../../../../src/plugins/data/public/mocks';
import { rangeOperation } from '../index';
import { RangeIndexPatternColumn } from './ranges';
import { autoInterval } from 'src/plugins/data/common';
import { MODES, DEFAULT_INTERVAL, TYPING_DEBOUNCE_TIME } from './constants';

const defaultOptions = {
  storage: {} as IStorageWrapper,
  // need this for MAX_HISTOGRAM value
  uiSettings: ({
    get: () => 100,
  } as unknown) as IUiSettingsClient,
  savedObjectsClient: {} as SavedObjectsClientContract,
  dateRange: {
    fromDate: 'now-1y',
    toDate: 'now',
  },
  data: dataPluginMock.createStartContract(),
  http: {} as HttpSetup,
};

describe('ranges', () => {
  let state: IndexPatternPrivateState;
  const InlineOptions = rangeOperation.paramEditor!;
  const sourceField = 'MyField';

  function setToHistogramMode() {
    const column = state.layers.first.columns.col1 as RangeIndexPatternColumn;
    column.dataType = 'number';
    column.scale = 'interval';
    column.params.type = MODES.Histogram;
  }

  function setToRangeMode() {
    const column = state.layers.first.columns.col1 as RangeIndexPatternColumn;
    column.dataType = 'string';
    column.scale = 'ordinal';
    column.params.type = MODES.Range;
  }

  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    state = {
      indexPatternRefs: [],
      indexPatterns: {},
      existingFields: {},
      currentIndexPatternId: '1',
      isFirstExistenceFetch: false,
      layers: {
        first: {
          indexPatternId: '1',
          columnOrder: ['col1', 'col2'],
          columns: {
            // Start with the histogram type
            col1: {
              label: sourceField,
              dataType: 'number',
              operationType: 'range',
              scale: 'interval',
              isBucketed: true,
              sourceField,
              params: {
                type: MODES.Histogram,
                interval: autoInterval,
                ranges: [{ from: 0, to: DEFAULT_INTERVAL, label: '' }],
                maxBars: 'auto',
              },
            },
            col2: {
              label: 'Count',
              dataType: 'number',
              isBucketed: false,
              sourceField: 'Records',
              operationType: 'count',
            },
          },
        },
      },
    };
  });

  describe('toEsAggConfig', () => {
    afterAll(() => setToHistogramMode());

    it('should reflect params correctly', () => {
      const esAggsConfig = rangeOperation.toEsAggsConfig(
        state.layers.first.columns.col1 as RangeIndexPatternColumn,
        'col1',
        {} as IndexPattern
      );
      expect(esAggsConfig).toEqual(
        expect.objectContaining({
          type: MODES.Histogram,
          params: expect.objectContaining({
            field: sourceField,
            interval: autoInterval,
            maxBars: null,
          }),
        })
      );
    });

    it('should reflect the type correctly', () => {
      setToRangeMode();

      const esAggsConfig = rangeOperation.toEsAggsConfig(
        state.layers.first.columns.col1 as RangeIndexPatternColumn,
        'col1',
        {} as IndexPattern
      );

      expect(esAggsConfig).toEqual(
        expect.objectContaining({
          type: MODES.Range,
        })
      );
    });
  });

  describe('getPossibleOperationForField', () => {
    it('should return operation with the right type for number', () => {
      expect(
        rangeOperation.getPossibleOperationForField({
          aggregatable: true,
          searchable: true,
          name: 'test',
          displayName: 'test',
          type: 'number',
        })
      ).toEqual({
        dataType: 'number',
        isBucketed: true,
        scale: 'interval',
      });
    });

    it('should not return operation if field type is not number', () => {
      expect(
        rangeOperation.getPossibleOperationForField({
          aggregatable: false,
          searchable: true,
          name: 'test',
          displayName: 'test',
          type: 'string',
        })
      ).toEqual(undefined);
    });
  });

  describe('paramEditor', () => {
    describe('Modify intervals in basic mode', () => {
      it('should start with auto interval', () => {
        const setStateSpy = jest.fn();
        const instance = mount(
          <InlineOptions
            {...defaultOptions}
            state={state}
            setState={setStateSpy}
            columnId="col1"
            currentColumn={state.layers.first.columns.col1 as RangeIndexPatternColumn}
            layerId="first"
          />
        );
        expect(instance.find(EuiSwitch).prop('checked')).toBe(true);
        expect(
          instance
            .find('input')
            .find('[data-test-subj="lns-indexPattern-range-maxBars-field"]')
            .prop('value')
        ).toBe('');
      });

      it('should update state when changing Max bars number', () => {
        const setStateSpy = jest.fn();

        const instance = mount(
          <InlineOptions
            {...defaultOptions}
            state={state}
            setState={setStateSpy}
            columnId="col1"
            currentColumn={state.layers.first.columns.col1 as RangeIndexPatternColumn}
            layerId="first"
          />
        );
        act(() => {
          instance.find(EuiRange).prop('onChange')!(
            {
              currentTarget: {
                value: '50',
              },
            } as React.ChangeEvent<HTMLInputElement>,
            true
          );
          jest.advanceTimersByTime(TYPING_DEBOUNCE_TIME * 4);

          expect(setStateSpy).toHaveBeenCalledWith({
            ...state,
            layers: {
              first: {
                ...state.layers.first,
                columns: {
                  ...state.layers.first.columns,
                  col1: {
                    ...state.layers.first.columns.col1,
                    params: {
                      ...state.layers.first.columns.col1.params,
                      maxBars: 50,
                    },
                  },
                },
              },
            },
          });
        });
      });

      it('should pass to granularity mode when disabling auto interval', () => {
        const setStateSpy = jest.fn();
        const instance = mount(
          <InlineOptions
            {...defaultOptions}
            state={state}
            setState={setStateSpy}
            columnId="col1"
            currentColumn={state.layers.first.columns.col1 as RangeIndexPatternColumn}
            layerId="first"
          />
        );

        act(() => {
          instance.find(EuiSwitch).prop('onChange')!({
            target: {
              checked: true,
            },
          } as EuiSwitchEvent);

          expect(
            instance
              .find('[data-test-subj="indexPattern-ranges-section-label"]')
              .find(EuiFieldNumber)
          ).toBeDefined();
        });
      });

      it('should update state when changing granularity interval', () => {});
    });

    describe('Specify range intervals manually', () => {
      it('should show one range interval to start with', () => {});

      it('should add a new range', () => {});
    });
  });
});
