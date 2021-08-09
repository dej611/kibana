/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import './xy_config_panel.scss';
import React, { useMemo, useState, memo, useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import { Position, ScaleType, VerticalAlignment, HorizontalAlignment } from '@elastic/charts';
import { debounce } from 'lodash';
import {
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  htmlIdGenerator,
  EuiColorPicker,
  EuiColorPickerProps,
  EuiToolTip,
  EuiIcon,
  EuiSuperSelect,
  EuiComboBox,
  EuiRange,
} from '@elastic/eui';
import type { PaletteRegistry } from 'src/plugins/charts/public';
import type {
  VisualizationLayerWidgetProps,
  VisualizationToolbarProps,
  VisualizationDimensionEditorProps,
  FramePublicAPI,
} from '../types';
import { State, visualizationTypes, XYState } from './types';
import type { FormatFactory } from '../../common';
import {
  SeriesType,
  YAxisMode,
  AxesSettingsConfig,
  AxisExtentConfig,
  YConfig,
  LineStyle,
  FillStyle,
} from '../../common/expressions';
import { isHorizontalChart, isHorizontalSeries, getSeriesColor } from './state_helpers';
import { trackUiEvent } from '../lens_ui_telemetry';
import { LegendSettingsPopover } from '../shared_components';
import { AxisSettingsPopover } from './axis_settings_popover';
import { getAxesConfiguration, GroupsConfiguration } from './axes_configuration';
import { PalettePicker, TooltipWrapper } from '../shared_components';
import { getAccessorColorConfig, getColorAssignments } from './color_assignment';
import { getScaleType, getSortedAccessors } from './to_expression';
import { VisualOptionsPopover } from './visual_options_popover/visual_options_popover';

type UnwrapArray<T> = T extends Array<infer P> ? P : T;
type AxesSettingsConfigKeys = keyof AxesSettingsConfig;

function updateLayer(state: State, layer: UnwrapArray<State['layers']>, index: number): State {
  const newLayers = [...state.layers];
  newLayers[index] = layer;

  return {
    ...state,
    layers: newLayers,
  };
}

const legendOptions: Array<{
  id: string;
  value: 'auto' | 'show' | 'hide';
  label: string;
}> = [
  {
    id: `xy_legend_auto`,
    value: 'auto',
    label: i18n.translate('xpack.lens.xyChart.legendVisibility.auto', {
      defaultMessage: 'Auto',
    }),
  },
  {
    id: `xy_legend_show`,
    value: 'show',
    label: i18n.translate('xpack.lens.xyChart.legendVisibility.show', {
      defaultMessage: 'Show',
    }),
  },
  {
    id: `xy_legend_hide`,
    value: 'hide',
    label: i18n.translate('xpack.lens.xyChart.legendVisibility.hide', {
      defaultMessage: 'Hide',
    }),
  },
];

export function LayerHeader(props: VisualizationLayerWidgetProps<State>) {
  const { state, layerId } = props;
  const horizontalOnly = isHorizontalChart(state.layers);
  const index = state.layers.findIndex((l) => l.layerId === layerId);
  const layer = state.layers[index];

  if (!layer) {
    return null;
  }

  const options = visualizationTypes
    .filter((t) => isHorizontalSeries(t.id as SeriesType) === horizontalOnly)
    .map((t) => ({
      value: t.id,
      inputDisplay: (
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type={t.icon} />
          </EuiFlexItem>
          <EuiFlexItem grow>{t.label}</EuiFlexItem>
        </EuiFlexGroup>
      ),
      'data-test-subj': `lnsXY_seriesType-${t.id}`,
    }));

  // else show a super select with the chart options to pick from
  return (
    <EuiSuperSelect
      className="lnsLayerChartSwitch"
      compressed
      fullWidth
      options={options}
      valueOfSelected={layer.seriesType}
      onChange={(seriesType) => {
        trackUiEvent('xy_change_layer_display');
        props.setState(
          updateLayer(state, { ...layer, seriesType: seriesType as SeriesType }, index)
        );
      }}
    />
  );
}

export function LayerContextMenu(props: VisualizationLayerWidgetProps<State>) {
  const { state, layerId } = props;
  const horizontalOnly = isHorizontalChart(state.layers);
  const index = state.layers.findIndex((l) => l.layerId === layerId);
  const layer = state.layers[index];

  if (!layer) {
    return null;
  }

  return (
    <EuiFormRow
      label={i18n.translate('xpack.lens.xyChart.chartTypeLabel', {
        defaultMessage: 'Chart type',
      })}
    >
      <EuiButtonGroup
        legend={i18n.translate('xpack.lens.xyChart.chartTypeLegend', {
          defaultMessage: 'Chart type',
        })}
        name="chartType"
        className="eui-displayInlineBlock lnsLayerChartSwitch"
        options={visualizationTypes
          .filter((t) => isHorizontalSeries(t.id as SeriesType) === horizontalOnly)
          .map((t) => ({
            className: `lnsLayerChartSwitch__item ${
              layer.seriesType === t.id ? 'lnsLayerChartSwitch__item-isSelected' : ''
            }`,
            id: t.id,
            label: t.label,
            iconType: t.icon || 'empty',
            'data-test-subj': `lnsXY_seriesType-${t.id}`,
          }))}
        idSelected={layer.seriesType}
        onChange={(seriesType) => {
          trackUiEvent('xy_change_layer_display');
          props.setState(
            updateLayer(state, { ...layer, seriesType: seriesType as SeriesType }, index)
          );
        }}
        isIconOnly
      />
    </EuiFormRow>
  );
}

const getDataBounds = function (
  activeData: FramePublicAPI['activeData'],
  axes: GroupsConfiguration
) {
  const groups: Partial<Record<string, { min: number; max: number }>> = {};
  axes.forEach((axis) => {
    let min = Number.MAX_VALUE;
    let max = Number.MIN_VALUE;
    axis.series.forEach((series) => {
      activeData?.[series.layer]?.rows.forEach((row) => {
        const value = row[series.accessor];
        if (!Number.isNaN(value)) {
          if (value < min) {
            min = value;
          }
          if (value > max) {
            max = value;
          }
        }
      });
    });
    if (min !== Number.MAX_VALUE && max !== Number.MIN_VALUE) {
      groups[axis.groupId] = {
        min: Math.round((min + Number.EPSILON) * 100) / 100,
        max: Math.round((max + Number.EPSILON) * 100) / 100,
      };
    }
  });

  return groups;
};

function hasPercentageAxis(axisGroups: GroupsConfiguration, groupId: string, state: XYState) {
  return Boolean(
    axisGroups
      .find((group) => group.groupId === groupId)
      ?.series.some(({ layer: layerId }) =>
        state?.layers.find(
          (layer) => layer.layerId === layerId && layer.seriesType.includes('percentage')
        )
      )
  );
}

export const XyToolbar = memo(function XyToolbar(props: VisualizationToolbarProps<State>) {
  const { state, setState, frame } = props;

  const shouldRotate = state?.layers.length ? isHorizontalChart(state.layers) : false;
  const axisGroups = getAxesConfiguration(state?.layers, shouldRotate, frame.activeData);
  const dataBounds = getDataBounds(frame.activeData, axisGroups);

  const tickLabelsVisibilitySettings = {
    x: state?.tickLabelsVisibilitySettings?.x ?? true,
    yLeft: state?.tickLabelsVisibilitySettings?.yLeft ?? true,
    yRight: state?.tickLabelsVisibilitySettings?.yRight ?? true,
  };
  const onTickLabelsVisibilitySettingsChange = (optionId: AxesSettingsConfigKeys): void => {
    const newTickLabelsVisibilitySettings = {
      ...tickLabelsVisibilitySettings,
      ...{
        [optionId]: !tickLabelsVisibilitySettings[optionId],
      },
    };
    setState({
      ...state,
      tickLabelsVisibilitySettings: newTickLabelsVisibilitySettings,
    });
  };

  const gridlinesVisibilitySettings = {
    x: state?.gridlinesVisibilitySettings?.x ?? true,
    yLeft: state?.gridlinesVisibilitySettings?.yLeft ?? true,
    yRight: state?.gridlinesVisibilitySettings?.yRight ?? true,
  };

  const onGridlinesVisibilitySettingsChange = (optionId: AxesSettingsConfigKeys): void => {
    const newGridlinesVisibilitySettings = {
      ...gridlinesVisibilitySettings,
      ...{
        [optionId]: !gridlinesVisibilitySettings[optionId],
      },
    };
    setState({
      ...state,
      gridlinesVisibilitySettings: newGridlinesVisibilitySettings,
    });
  };

  const labelsOrientation = {
    x: state?.labelsOrientation?.x ?? 0,
    yLeft: state?.labelsOrientation?.yLeft ?? 0,
    yRight: state?.labelsOrientation?.yRight ?? 0,
  };

  const onLabelsOrientationChange = (axis: AxesSettingsConfigKeys, orientation: number): void => {
    const newLabelsOrientation = {
      ...labelsOrientation,
      ...{
        [axis]: orientation,
      },
    };
    setState({
      ...state,
      labelsOrientation: newLabelsOrientation,
    });
  };

  const axisTitlesVisibilitySettings = {
    x: state?.axisTitlesVisibilitySettings?.x ?? true,
    yLeft: state?.axisTitlesVisibilitySettings?.yLeft ?? true,
    yRight: state?.axisTitlesVisibilitySettings?.yRight ?? true,
  };
  const onAxisTitlesVisibilitySettingsChange = (
    axis: AxesSettingsConfigKeys,
    checked: boolean
  ): void => {
    const newAxisTitlesVisibilitySettings = {
      ...axisTitlesVisibilitySettings,
      ...{
        [axis]: checked,
      },
    };
    setState({
      ...state,
      axisTitlesVisibilitySettings: newAxisTitlesVisibilitySettings,
    });
  };

  const nonOrdinalXAxis = state?.layers.every(
    (layer) =>
      !layer.xAccessor ||
      getScaleType(
        props.frame.datasourceLayers[layer.layerId].getOperationForColumnId(layer.xAccessor),
        ScaleType.Linear
      ) !== 'ordinal'
  );

  // only allow changing endzone visibility if it could show up theoretically (if it's a time viz)
  const onChangeEndzoneVisiblity = state?.layers.every(
    (layer) =>
      layer.xAccessor &&
      getScaleType(
        props.frame.datasourceLayers[layer.layerId].getOperationForColumnId(layer.xAccessor),
        ScaleType.Linear
      ) === 'time'
  )
    ? (checked: boolean): void => {
        setState({
          ...state,
          hideEndzones: !checked,
        });
      }
    : undefined;

  const legendMode =
    state?.legend.isVisible && !state?.legend.showSingleSeries
      ? 'auto'
      : !state?.legend.isVisible
      ? 'hide'
      : 'show';
  const hasBarOrAreaOnLeftAxis = Boolean(
    axisGroups
      .find((group) => group.groupId === 'left')
      ?.series?.some((series) => {
        const seriesType = state.layers.find((l) => l.layerId === series.layer)?.seriesType;
        return seriesType?.includes('bar') || seriesType?.includes('area');
      })
  );
  const setLeftExtent = useCallback(
    (extent: AxisExtentConfig | undefined) => {
      setState({
        ...state,
        yLeftExtent: extent,
      });
    },
    [setState, state]
  );
  const hasBarOrAreaOnRightAxis = Boolean(
    axisGroups
      .find((group) => group.groupId === 'left')
      ?.series?.some((series) => {
        const seriesType = state.layers.find((l) => l.layerId === series.layer)?.seriesType;
        return seriesType?.includes('bar') || seriesType?.includes('area');
      })
  );
  const setRightExtent = useCallback(
    (extent: AxisExtentConfig | undefined) => {
      setState({
        ...state,
        yRightExtent: extent,
      });
    },
    [setState, state]
  );

  return (
    <EuiFlexGroup gutterSize="m" justifyContent="spaceBetween" responsive={false}>
      <EuiFlexItem>
        <EuiFlexGroup gutterSize="none" responsive={false}>
          <VisualOptionsPopover
            state={state}
            setState={setState}
            datasourceLayers={frame.datasourceLayers}
          />
          <LegendSettingsPopover
            legendOptions={legendOptions}
            mode={legendMode}
            location={state?.legend.isInside ? 'inside' : 'outside'}
            onLocationChange={(location) => {
              setState({
                ...state,
                legend: {
                  ...state.legend,
                  isInside: location === 'inside',
                },
              });
            }}
            onDisplayChange={(optionId) => {
              const newMode = legendOptions.find(({ id }) => id === optionId)!.value;
              if (newMode === 'auto') {
                setState({
                  ...state,
                  legend: {
                    ...state.legend,
                    isVisible: true,
                    showSingleSeries: false,
                  },
                });
              } else if (newMode === 'show') {
                setState({
                  ...state,
                  legend: {
                    ...state.legend,
                    isVisible: true,
                    showSingleSeries: true,
                  },
                });
              } else if (newMode === 'hide') {
                setState({
                  ...state,
                  legend: {
                    ...state.legend,
                    isVisible: false,
                    showSingleSeries: false,
                  },
                });
              }
            }}
            position={state?.legend.position}
            horizontalAlignment={state?.legend.horizontalAlignment}
            verticalAlignment={state?.legend.verticalAlignment}
            floatingColumns={state?.legend.floatingColumns}
            onFloatingColumnsChange={(val) => {
              setState({
                ...state,
                legend: { ...state.legend, floatingColumns: val },
              });
            }}
            onPositionChange={(id) => {
              setState({
                ...state,
                legend: { ...state.legend, position: id as Position },
              });
            }}
            onAlignmentChange={(value) => {
              const [vertical, horizontal] = value.split('_');
              const verticalAlignment = vertical as VerticalAlignment;
              const horizontalAlignment = horizontal as HorizontalAlignment;
              setState({
                ...state,
                legend: { ...state.legend, verticalAlignment, horizontalAlignment },
              });
            }}
            renderValueInLegendSwitch={nonOrdinalXAxis}
            valueInLegend={state?.valuesInLegend}
            onValueInLegendChange={() => {
              setState({
                ...state,
                valuesInLegend: !state.valuesInLegend,
              });
            }}
          />
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFlexGroup gutterSize="none" responsive={false}>
          <TooltipWrapper
            tooltipContent={
              shouldRotate
                ? i18n.translate('xpack.lens.xyChart.bottomAxisDisabledHelpText', {
                    defaultMessage: 'This setting only applies when bottom axis is enabled.',
                  })
                : i18n.translate('xpack.lens.xyChart.leftAxisDisabledHelpText', {
                    defaultMessage: 'This setting only applies when left axis is enabled.',
                  })
            }
            condition={
              Object.keys(axisGroups.find((group) => group.groupId === 'left') || {}).length === 0
            }
          >
            <AxisSettingsPopover
              axis="yLeft"
              layers={state?.layers}
              axisTitle={state?.yTitle}
              updateTitleState={(value) => setState({ ...state, yTitle: value })}
              areTickLabelsVisible={tickLabelsVisibilitySettings.yLeft}
              toggleTickLabelsVisibility={onTickLabelsVisibilitySettingsChange}
              areGridlinesVisible={gridlinesVisibilitySettings.yLeft}
              toggleGridlinesVisibility={onGridlinesVisibilitySettingsChange}
              isDisabled={
                Object.keys(axisGroups.find((group) => group.groupId === 'left') || {}).length === 0
              }
              orientation={labelsOrientation.yLeft}
              setOrientation={onLabelsOrientationChange}
              isAxisTitleVisible={axisTitlesVisibilitySettings.yLeft}
              toggleAxisTitleVisibility={onAxisTitlesVisibilitySettingsChange}
              extent={state?.yLeftExtent || { mode: 'full' }}
              setExtent={setLeftExtent}
              hasBarOrAreaOnAxis={hasBarOrAreaOnLeftAxis}
              dataBounds={dataBounds.left}
              hasPercentageAxis={hasPercentageAxis(axisGroups, 'left', state)}
            />
          </TooltipWrapper>
          <AxisSettingsPopover
            axis="x"
            layers={state?.layers}
            axisTitle={state?.xTitle}
            updateTitleState={(value) => setState({ ...state, xTitle: value })}
            areTickLabelsVisible={tickLabelsVisibilitySettings.x}
            toggleTickLabelsVisibility={onTickLabelsVisibilitySettingsChange}
            areGridlinesVisible={gridlinesVisibilitySettings.x}
            toggleGridlinesVisibility={onGridlinesVisibilitySettingsChange}
            orientation={labelsOrientation.x}
            setOrientation={onLabelsOrientationChange}
            isAxisTitleVisible={axisTitlesVisibilitySettings.x}
            toggleAxisTitleVisibility={onAxisTitlesVisibilitySettingsChange}
            endzonesVisible={!state?.hideEndzones}
            setEndzoneVisibility={onChangeEndzoneVisiblity}
            hasBarOrAreaOnAxis={false}
            hasPercentageAxis={false}
          />
          <TooltipWrapper
            tooltipContent={
              shouldRotate
                ? i18n.translate('xpack.lens.xyChart.topAxisDisabledHelpText', {
                    defaultMessage: 'This setting only applies when top axis is enabled.',
                  })
                : i18n.translate('xpack.lens.xyChart.rightAxisDisabledHelpText', {
                    defaultMessage: 'This setting only applies when right axis is enabled.',
                  })
            }
            condition={
              Object.keys(axisGroups.find((group) => group.groupId === 'right') || {}).length === 0
            }
          >
            <AxisSettingsPopover
              axis="yRight"
              layers={state?.layers}
              axisTitle={state?.yRightTitle}
              updateTitleState={(value) => setState({ ...state, yRightTitle: value })}
              areTickLabelsVisible={tickLabelsVisibilitySettings.yRight}
              toggleTickLabelsVisibility={onTickLabelsVisibilitySettingsChange}
              areGridlinesVisible={gridlinesVisibilitySettings.yRight}
              toggleGridlinesVisibility={onGridlinesVisibilitySettingsChange}
              isDisabled={
                Object.keys(axisGroups.find((group) => group.groupId === 'right') || {}).length ===
                0
              }
              orientation={labelsOrientation.yRight}
              setOrientation={onLabelsOrientationChange}
              hasPercentageAxis={hasPercentageAxis(axisGroups, 'right', state)}
              isAxisTitleVisible={axisTitlesVisibilitySettings.yRight}
              toggleAxisTitleVisibility={onAxisTitlesVisibilitySettingsChange}
              extent={state?.yRightExtent || { mode: 'full' }}
              setExtent={setRightExtent}
              hasBarOrAreaOnAxis={hasBarOrAreaOnRightAxis}
              dataBounds={dataBounds.right}
            />
          </TooltipWrapper>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
});

const idPrefix = htmlIdGenerator()();

export function DimensionEditor(
  props: VisualizationDimensionEditorProps<State> & {
    formatFactory: FormatFactory;
    paletteService: PaletteRegistry;
  }
) {
  const { state, setState, layerId, accessor } = props;
  const index = state.layers.findIndex((l) => l.layerId === layerId);
  const layer = state.layers[index];
  const isHorizontal = isHorizontalChart(state.layers);
  const axisMode =
    (layer.yConfig &&
      layer.yConfig?.find((yAxisConfig) => yAxisConfig.forAccessor === accessor)?.axisMode) ||
    'auto';

  if (props.groupId === 'breakdown') {
    return (
      <>
        <PalettePicker
          palettes={props.paletteService}
          activePalette={layer.palette}
          setPalette={(newPalette) => {
            setState(updateLayer(state, { ...layer, palette: newPalette }, index));
          }}
        />
      </>
    );
  }

  if (layer.layerType === 'threshold') {
    return <ThresholdPanel {...props} />;
  }

  return (
    <>
      <ColorPicker {...props} />

      <EuiFormRow
        display="columnCompressed"
        fullWidth
        label={i18n.translate('xpack.lens.xyChart.axisSide.label', {
          defaultMessage: 'Axis side',
        })}
      >
        <EuiButtonGroup
          isFullWidth
          legend={i18n.translate('xpack.lens.xyChart.axisSide.label', {
            defaultMessage: 'Axis side',
          })}
          data-test-subj="lnsXY_axisSide_groups"
          name="axisSide"
          buttonSize="compressed"
          options={[
            {
              id: `${idPrefix}auto`,
              label: i18n.translate('xpack.lens.xyChart.axisSide.auto', {
                defaultMessage: 'Auto',
              }),
              'data-test-subj': 'lnsXY_axisSide_groups_auto',
            },
            {
              id: `${idPrefix}left`,
              label: isHorizontal
                ? i18n.translate('xpack.lens.xyChart.axisSide.bottom', {
                    defaultMessage: 'Bottom',
                  })
                : i18n.translate('xpack.lens.xyChart.axisSide.left', {
                    defaultMessage: 'Left',
                  }),
              'data-test-subj': 'lnsXY_axisSide_groups_left',
            },
            {
              id: `${idPrefix}right`,
              label: isHorizontal
                ? i18n.translate('xpack.lens.xyChart.axisSide.top', {
                    defaultMessage: 'Top',
                  })
                : i18n.translate('xpack.lens.xyChart.axisSide.right', {
                    defaultMessage: 'Right',
                  }),
              'data-test-subj': 'lnsXY_axisSide_groups_right',
            },
          ]}
          idSelected={`${idPrefix}${axisMode}`}
          onChange={(id) => {
            const newMode = id.replace(idPrefix, '') as YAxisMode;
            const newYAxisConfigs = [...(layer.yConfig || [])];
            const existingIndex = newYAxisConfigs.findIndex(
              (yAxisConfig) => yAxisConfig.forAccessor === accessor
            );
            if (existingIndex !== -1) {
              newYAxisConfigs[existingIndex] = {
                ...newYAxisConfigs[existingIndex],
                axisMode: newMode,
              };
            } else {
              newYAxisConfigs.push({
                forAccessor: accessor,
                axisMode: newMode,
              });
            }
            setState(updateLayer(state, { ...layer, yConfig: newYAxisConfigs }, index));
          }}
        />
      </EuiFormRow>
    </>
  );
}

const tooltipContent = {
  auto: i18n.translate('xpack.lens.configPanel.color.tooltip.auto', {
    defaultMessage: 'Lens automatically picks colors for you unless you specify a custom color.',
  }),
  custom: i18n.translate('xpack.lens.configPanel.color.tooltip.custom', {
    defaultMessage: 'Clear the custom color to return to “Auto” mode.',
  }),
  disabled: i18n.translate('xpack.lens.configPanel.color.tooltip.disabled', {
    defaultMessage:
      'Individual series cannot be custom colored when the layer includes a “Break down by.“',
  }),
};

const ColorPicker = ({
  state,
  setState,
  layerId,
  accessor,
  frame,
  formatFactory,
  paletteService,
}: VisualizationDimensionEditorProps<State> & {
  formatFactory: FormatFactory;
  paletteService: PaletteRegistry;
}) => {
  const index = state.layers.findIndex((l) => l.layerId === layerId);
  const layer = state.layers[index];
  const disabled = !!layer.splitAccessor;

  const overwriteColor = getSeriesColor(layer, accessor);
  const currentColor = useMemo(() => {
    if (overwriteColor || !frame.activeData) return overwriteColor;

    const datasource = frame.datasourceLayers[layer.layerId];
    const sortedAccessors: string[] = getSortedAccessors(datasource, layer);

    const colorAssignments = getColorAssignments(
      state.layers,
      { tables: frame.activeData },
      formatFactory
    );
    const mappedAccessors = getAccessorColorConfig(
      colorAssignments,
      frame,
      {
        ...layer,
        accessors: sortedAccessors.filter((sorted) => layer.accessors.includes(sorted)),
      },
      paletteService
    );

    return mappedAccessors.find((a) => a.columnId === accessor)?.color || null;
  }, [overwriteColor, frame, paletteService, state.layers, accessor, formatFactory, layer]);

  const [color, setColor] = useState(currentColor);

  const handleColor: EuiColorPickerProps['onChange'] = (text, output) => {
    setColor(text);
    if (output.isValid || text === '') {
      updateColorInState(text, output);
    }
  };

  const updateColorInState: EuiColorPickerProps['onChange'] = useMemo(
    () =>
      debounce((text, output) => {
        const newYConfigs = [...(layer.yConfig || [])];
        const existingIndex = newYConfigs.findIndex((yConfig) => yConfig.forAccessor === accessor);
        if (existingIndex !== -1) {
          if (text === '') {
            newYConfigs[existingIndex] = { ...newYConfigs[existingIndex], color: undefined };
          } else {
            newYConfigs[existingIndex] = { ...newYConfigs[existingIndex], color: output.hex };
          }
        } else {
          newYConfigs.push({
            forAccessor: accessor,
            color: output.hex,
          });
        }
        setState(updateLayer(state, { ...layer, yConfig: newYConfigs }, index));
      }, 256),
    [state, setState, layer, accessor, index]
  );

  const colorPicker = (
    <EuiColorPicker
      data-test-subj="indexPattern-dimension-colorPicker"
      compressed
      isClearable={Boolean(overwriteColor)}
      onChange={handleColor}
      color={disabled ? '' : color || currentColor}
      disabled={disabled}
      placeholder={i18n.translate('xpack.lens.xyChart.seriesColor.auto', {
        defaultMessage: 'Auto',
      })}
      aria-label={i18n.translate('xpack.lens.xyChart.seriesColor.label', {
        defaultMessage: 'Series color',
      })}
    />
  );

  return (
    <EuiFormRow
      display="columnCompressed"
      fullWidth
      label={
        <EuiToolTip
          delay="long"
          position="top"
          content={color && !disabled ? tooltipContent.custom : tooltipContent.auto}
        >
          <span>
            {i18n.translate('xpack.lens.xyChart.seriesColor.label', {
              defaultMessage: 'Series color',
            })}{' '}
            <EuiIcon type="questionInCircle" color="subdued" size="s" className="eui-alignTop" />
          </span>
        </EuiToolTip>
      }
    >
      {disabled ? (
        <EuiToolTip
          position="top"
          content={tooltipContent.disabled}
          delay="long"
          anchorClassName="eui-displayBlock"
        >
          {colorPicker}
        </EuiToolTip>
      ) : (
        colorPicker
      )}
    </EuiFormRow>
  );
};

const icons = [
  { value: 'none', label: 'None' },
  { value: 'asterisk', label: 'Asterisk' },
  { value: 'bell', label: 'Bell' },
  { value: 'bolt', label: 'Bolt' },
  { value: 'bug', label: 'Bug' },
  { value: 'editorComment', label: 'Comment' },
  { value: 'alert', label: 'Alert' },
  { value: 'flag', label: 'Flag' },
  { value: 'tag', label: 'Tag' },
];

const IconView = (props: { value?: string; label: string }) => {
  if (!props.value) return null;
  return (
    <span>
      <EuiIcon type={props.value} />
      {` ${props.label}`}
    </span>
  );
};

const IconSelect = ({
  value,
  onChange,
}: {
  value?: string;
  onChange: (newIcon: string) => void;
}) => {
  const selectedIcon = icons.find((option) => value === option.value) || icons[0];

  return (
    <EuiComboBox
      isClearable={false}
      options={icons}
      selectedOptions={[selectedIcon]}
      onChange={(selection) => {
        onChange(selection[0].value!);
      }}
      singleSelection={{ asPlainText: true }}
      renderOption={IconView}
      compressed
    />
  );
};

const ThresholdPanel = (
  props: VisualizationDimensionEditorProps<State> & {
    formatFactory: FormatFactory;
    paletteService: PaletteRegistry;
  }
) => {
  const { state, setState, layerId, accessor } = props;
  const index = state.layers.findIndex((l) => l.layerId === layerId);
  const layer = state.layers[index];

  function setYConfig(yConfig: Partial<YConfig>) {
    const newYConfigs = [...(layer.yConfig || [])];
    const existingIndex = newYConfigs.findIndex(
      (yAxisConfig) => yAxisConfig.forAccessor === accessor
    );
    if (existingIndex !== -1) {
      newYConfigs[existingIndex] = { ...newYConfigs[existingIndex], ...yConfig };
    } else {
      newYConfigs.push({
        forAccessor: accessor,
        ...yConfig,
      });
    }
    setState(updateLayer(state, { ...layer, yConfig: newYConfigs }, index));
  }

  const currentYConfig = layer.yConfig?.find((yConfig) => yConfig.forAccessor === accessor);
  return (
    <>
      <ColorPicker {...props} />
      <EuiFormRow
        display="columnCompressed"
        fullWidth
        label={i18n.translate('xpack.lens.xyChart.lineStyle.label', {
          defaultMessage: 'Line style',
        })}
      >
        <EuiButtonGroup
          isFullWidth
          legend={i18n.translate('xpack.lens.xyChart.lineStyle.label', {
            defaultMessage: 'Line style',
          })}
          data-test-subj="lnsXY_line_style"
          name="lineStyle"
          buttonSize="compressed"
          options={[
            {
              id: `${idPrefix}solid`,
              label: i18n.translate('xpack.lens.xyChart.lineStyle.solid', {
                defaultMessage: 'Solid',
              }),
              'data-test-subj': 'lnsXY_line_style_solid',
            },
            {
              id: `${idPrefix}dashed`,
              label: i18n.translate('xpack.lens.xyChart.lineStyle.dashed', {
                defaultMessage: 'Dashed',
              }),
              'data-test-subj': 'lnsXY_line_style_dashed',
            },
            {
              id: `${idPrefix}dotted`,
              label: i18n.translate('xpack.lens.xyChart.lineStyle.dotted', {
                defaultMessage: 'Dotted',
              }),
              'data-test-subj': 'lnsXY_line_style_dotted',
            },
          ]}
          idSelected={`${idPrefix}${currentYConfig?.lineStyle || 'solid'}`}
          onChange={(id) => {
            const newMode = id.replace(idPrefix, '') as LineStyle;
            setYConfig({ lineStyle: newMode });
          }}
        />
      </EuiFormRow>
      <EuiFormRow
        display="columnCompressed"
        fullWidth
        label={i18n.translate('xpack.lens.xyChart.lineThickness.label', {
          defaultMessage: 'Line thickness',
        })}
      >
        <EuiRange
          fullWidth
          data-test-subj="lnsXY_lineThickness"
          value={currentYConfig?.lineWidth || 1}
          onChange={(e) => {
            // TODO: fix number validation
            setYConfig({ lineWidth: Number(e.currentTarget.value) });
          }}
          showInput
          min={1}
          max={50}
          compressed
        />
      </EuiFormRow>
      <EuiFormRow
        display="columnCompressed"
        fullWidth
        label={i18n.translate('xpack.lens.xyChart.fillThreshold.label', {
          defaultMessage: 'Fill',
        })}
      >
        <EuiButtonGroup
          isFullWidth
          legend={i18n.translate('xpack.lens.xyChart.fillThreshold.label', {
            defaultMessage: 'Fill',
          })}
          data-test-subj="lnsXY_fill_threshold"
          name="fill"
          buttonSize="compressed"
          options={[
            {
              id: `${idPrefix}none`,
              label: i18n.translate('xpack.lens.xyChart.fillThreshold.none', {
                defaultMessage: 'None',
              }),
              'data-test-subj': 'lnsXY_fill_none',
            },
            {
              id: `${idPrefix}above`,
              label: i18n.translate('xpack.lens.xyChart.fillThreshold.above', {
                defaultMessage: 'Above',
              }),
              'data-test-subj': 'lnsXY_fill_above',
            },
            {
              id: `${idPrefix}below`,
              label: i18n.translate('xpack.lens.xyChart.fillThreshold.below', {
                defaultMessage: 'Below',
              }),
              'data-test-subj': 'lnsXY_fill_below',
            },
          ]}
          idSelected={`${idPrefix}${currentYConfig?.fill || 'none'}`}
          onChange={(id) => {
            const newMode = id.replace(idPrefix, '') as FillStyle;
            setYConfig({ fill: newMode });
          }}
        />
      </EuiFormRow>
      <EuiFormRow
        display="columnCompressed"
        fullWidth
        label={i18n.translate('xpack.lens.xyChart.axisSide.icon', {
          defaultMessage: 'Icon',
        })}
      >
        <IconSelect
          value={currentYConfig?.icon}
          onChange={(newIcon) => {
            setYConfig({ icon: newIcon });
          }}
        />
      </EuiFormRow>
    </>
  );
};
