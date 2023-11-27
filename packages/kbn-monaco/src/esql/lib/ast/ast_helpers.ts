/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import type { ParserRuleContext } from 'antlr4ts/ParserRuleContext';
import { ErrorNode } from 'antlr4ts/tree/ErrorNode';
import type { TerminalNode } from 'antlr4ts/tree/TerminalNode';
import type {
  ArithmeticUnaryContext,
  DecimalValueContext,
  IntegerValueContext,
  QualifiedIntegerLiteralContext,
} from '../../antlr/esql_parser';
import { getPosition } from './ast_position_utils';
import type {
  ESQLCommand,
  ESQLLiteral,
  ESQLList,
  ESQLTimeInterval,
  ESQLLocation,
  ESQLFunction,
  ESQLSource,
  ESQLColumn,
  ESQLCommandOption,
  ESQLAstItem,
} from './types';

export function nonNullable<T>(v: T): v is NonNullable<T> {
  return v != null;
}

export function createCommand(name: string, ctx: ParserRuleContext): ESQLCommand {
  return {
    type: 'command',
    name,
    text: ctx.text,
    args: [],
    location: getPosition(ctx.start, ctx.stop),
    incomplete: Boolean(ctx.exception),
  };
}

export function createList(ctx: ParserRuleContext, values: ESQLLiteral[]): ESQLList {
  return {
    type: 'list',
    name: ctx.text,
    values,
    text: ctx.text,
    location: getPosition(ctx.start, ctx.stop),
    incomplete: Boolean(ctx.exception),
  };
}

export function createNumericLiteral(ctx: DecimalValueContext | IntegerValueContext): ESQLLiteral {
  const text = ctx.text;
  return {
    type: 'literal',
    literalType: 'number',
    text,
    name: text,
    value: Number(text),
    location: getPosition(ctx.start, ctx.stop),
    incomplete: Boolean(ctx.exception),
  };
}

export function createFakeMultiplyLiteral(ctx: ArithmeticUnaryContext): ESQLLiteral {
  return {
    type: 'literal',
    literalType: 'number',
    text: ctx.text,
    name: ctx.text,
    value: ctx.PLUS() ? 1 : -1,
    location: getPosition(ctx.start, ctx.stop),
    incomplete: Boolean(ctx.exception),
  };
}

export function createLiteral(
  type: ESQLLiteral['literalType'],
  node: TerminalNode | undefined
): ESQLLiteral | undefined {
  if (!node) {
    return;
  }
  const text = node.text;
  return {
    type: 'literal',
    literalType: type,
    text,
    name: text,
    value: type === 'number' ? Number(text) : text,
    location: getPosition(node.symbol),
    incomplete: /<missing /.test(node.text),
  };
}

export function createTimeUnit(ctx: QualifiedIntegerLiteralContext): ESQLTimeInterval {
  return {
    type: 'timeInterval',
    quantity: Number(ctx.integerValue().text),
    unit: ctx.UNQUOTED_IDENTIFIER().text,
    text: ctx.text,
    location: getPosition(ctx.start, ctx.stop),
    name: `${ctx.integerValue().text} ${ctx.UNQUOTED_IDENTIFIER().text}`,
    incomplete: Boolean(ctx.exception),
  };
}

export function createFunction(
  name: string,
  ctx: ParserRuleContext,
  customPosition?: ESQLLocation
): ESQLFunction {
  return {
    type: 'function',
    name,
    text: ctx.text,
    location: customPosition ?? getPosition(ctx.start, ctx.stop),
    args: [],
    incomplete: Boolean(ctx.exception),
  };
}

function walkFunctionStructure(
  args: ESQLAstItem[],
  initialLocation: ESQLLocation,
  prop: 'min' | 'max',
  getNextItemIndex: (arg: ESQLAstItem[]) => number
) {
  let nextArg: ESQLAstItem | undefined = args[getNextItemIndex(args)];
  const location = { ...initialLocation };
  while (Array.isArray(nextArg) || nextArg) {
    if (Array.isArray(nextArg)) {
      nextArg = nextArg[getNextItemIndex(nextArg)];
    } else {
      location[prop] = Math[prop](location[prop], nextArg.location[prop]);
      if (nextArg.type === 'function') {
        nextArg = nextArg.args[getNextItemIndex(nextArg.args)];
      } else {
        nextArg = undefined;
      }
    }
  }
  return location[prop];
}

export function computeLocationExtends(fn: ESQLFunction) {
  const location = fn.location;
  if (fn.args) {
    // get min location navigating in depth keeping the left/first arg
    location.min = walkFunctionStructure(fn.args, location, 'min', () => 0);
    // get max location navigating in depth keeping the right/last arg
    location.max = walkFunctionStructure(fn.args, location, 'max', (args) => args.length - 1);
  }
  return location;
}

// Note: do not import esql_parser or bundle size will grow up by ~500 kb
function getQuotedText(ctx: ParserRuleContext) {
  return (
    ctx.tryGetToken(73 /* esql_parser.SRC_QUOTED_IDENTIFIER*/, 0) ||
    ctx.tryGetToken(64 /* esql_parser.QUOTED_IDENTIFIER */, 0)
  );
}

function getUnquotedText(ctx: ParserRuleContext) {
  return (
    ctx.tryGetToken(72 /* esql_parser.SRC_UNQUOTED_IDENTIFIER */, 0) ||
    ctx.tryGetToken(63 /* esql_parser.UNQUOTED_IDENTIFIER */, 0)
  );
}

export function sanifyIdentifierString(ctx: ParserRuleContext) {
  return (
    getUnquotedText(ctx)?.text ||
    getQuotedText(ctx)?.text.replace(/(`)/g, '') ||
    ctx.text.replace(/(`)/g, '') // for some reason some quoted text is not detected correctly by the parser
  );
}

export function createSource(
  ctx: ParserRuleContext,
  type: 'index' | 'policy' = 'index'
): ESQLSource {
  const text = sanifyIdentifierString(ctx);
  return {
    type: 'source',
    name: text,
    sourceType: type,
    text,
    location: getPosition(ctx.start, ctx.stop),
    incomplete: Boolean(ctx.exception || text === ''),
  };
}

export function createColumn(ctx: ParserRuleContext): ESQLColumn {
  const text = sanifyIdentifierString(ctx);
  return {
    type: 'column',
    name: text,
    text,
    location: getPosition(ctx.start, ctx.stop),
    incomplete: Boolean(ctx.exception || text === ''),
    quoted: Boolean(getQuotedText(ctx)),
  };
}

export function createOption(name: string, ctx: ParserRuleContext): ESQLCommandOption {
  return {
    type: 'option',
    name,
    text: ctx.text,
    location: getPosition(ctx.start, ctx.stop),
    args: [],
    incomplete: Boolean(ctx.exception || ctx.children?.some((c) => c instanceof ErrorNode)),
  };
}
