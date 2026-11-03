/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useReactFlow } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import useLatest from 'react-use/lib/useLatest';
import type { TransformResult, WorkflowYaml } from '@kbn/workflows';
import { resolveSectionWrapRange } from '@kbn/workflows';

export interface MarqueeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What a finished marquee would do: wrap a run of steps, or why it cannot. */
export type SectionMarqueeProposal =
  | { readonly kind: 'range'; readonly stepNames: readonly string[]; readonly bounds: MarqueeRect }
  | { readonly kind: 'refused'; readonly reason: 'nested'; readonly bounds: MarqueeRect };

interface UseSectionMarqueeParams {
  /** The element around the canvas; Shift+drag on it draws the marquee. */
  readonly containerRef: RefObject<HTMLElement>;
  readonly enabled: boolean;
  readonly workflow: WorkflowYaml | undefined;
  readonly transformed: TransformResult;
  readonly onWrap: (stepNames: readonly string[]) => void;
}

interface UseSectionMarqueeResult {
  /** The rectangle being dragged, relative to the container; `null` when not dragging. */
  readonly dragRect: MarqueeRect | null;
  readonly proposal: SectionMarqueeProposal | null;
  readonly confirm: () => void;
  readonly cancel: () => void;
}

/** A drag shorter than this is a click, not a marquee. */
const MIN_DRAG_PX = 8;
/** Controls on the canvas keep their own Shift+click. */
const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, .react-flow__panel';

interface Point {
  readonly x: number;
  readonly y: number;
}

const rectBetween = (from: Point, to: Point): MarqueeRect => ({
  x: Math.min(from.x, to.x),
  y: Math.min(from.y, to.y),
  width: Math.abs(to.x - from.x),
  height: Math.abs(to.y - from.y),
});

/**
 * Shift+drag on the canvas to pick the steps for a new section. It is its own gesture
 * rather than React Flow's selection, because the canvas owns node selection: the drag
 * is read straight from the pointer, and the nodes it fully covers are looked up on the
 * flow. What those nodes mean for the workflow is `resolveSectionWrapRange`'s call.
 */
export const useSectionMarquee = ({
  containerRef,
  enabled,
  workflow,
  transformed,
  onWrap,
}: UseSectionMarqueeParams): UseSectionMarqueeResult => {
  const flow = useReactFlow();
  const [dragRect, setDragRect] = useState<MarqueeRect | null>(null);
  const [proposal, setProposal] = useState<SectionMarqueeProposal | null>(null);
  const abortDragRef = useRef<(() => void) | null>(null);

  const latest = useLatest({ flow, workflow, transformed, onWrap });

  const propose = useCallback(
    (client: MarqueeRect) => {
      const { flow: reactFlow, workflow: current, transformed: graph } = latest.current;
      const topLeft = reactFlow.screenToFlowPosition({ x: client.x, y: client.y });
      const bottomRight = reactFlow.screenToFlowPosition({
        x: client.x + client.width,
        y: client.y + client.height,
      });
      const area: MarqueeRect = {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      };

      const caught = reactFlow.getIntersectingNodes(area, false).flatMap(({ id }) => {
        const ref = graph.nodeRefs[id];
        return ref?.kind === 'step' ? [ref.stepName] : [];
      });
      const resolved = resolveSectionWrapRange(current, caught);
      if (resolved.kind === 'refused') {
        setProposal(
          resolved.reason === 'nested' ? { kind: 'refused', reason: 'nested', bounds: area } : null
        );
        return;
      }

      const nodeIds = Object.entries(graph.nodeRefs).flatMap(([id, ref]) =>
        ref.kind === 'step' && resolved.stepNames.includes(ref.stepName) ? [id] : []
      );
      setProposal({
        kind: 'range',
        stepNames: resolved.stepNames,
        bounds: reactFlow.getNodesBounds(nodeIds),
      });
    },
    [latest]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return undefined;

    const onPointerDown = (event: MouseEvent): void => {
      if (!event.shiftKey || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)) return;
      // Keep the drag away from whatever pans the canvas.
      event.stopPropagation();
      event.preventDefault();

      const origin = { x: event.clientX, y: event.clientY };
      const bounds = container.getBoundingClientRect();
      setProposal(null);

      const stop = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        abortDragRef.current = null;
        setDragRect(null);
      };
      const onMove = (move: MouseEvent): void => {
        const rect = rectBetween(origin, { x: move.clientX, y: move.clientY });
        setDragRect({ ...rect, x: rect.x - bounds.left, y: rect.y - bounds.top });
      };
      const onUp = (up: MouseEvent): void => {
        const rect = rectBetween(origin, { x: up.clientX, y: up.clientY });
        stop();
        if (Math.max(rect.width, rect.height) >= MIN_DRAG_PX) propose(rect);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      abortDragRef.current = stop;
    };

    container.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown, true);
      abortDragRef.current?.();
    };
  }, [containerRef, enabled, propose]);

  const cancel = useCallback(() => {
    abortDragRef.current?.();
    setProposal(null);
  }, []);

  const hasProposalOrDrag = proposal !== null || dragRect !== null;
  useEffect(() => {
    if (!hasProposalOrDrag) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasProposalOrDrag, cancel]);

  const confirm = useCallback(() => {
    if (proposal?.kind !== 'range') return;
    latest.current.onWrap(proposal.stepNames);
    setProposal(null);
  }, [proposal, latest]);

  return { dragRect, proposal, confirm, cancel };
};
