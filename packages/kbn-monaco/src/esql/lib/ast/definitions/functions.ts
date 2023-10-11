/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { i18n } from '@kbn/i18n';
import { FunctionDefinition } from './types';

export const evalFunctionsDefinitions: FunctionDefinition[] = [
  {
    name: 'round',
    description: i18n.translate('monaco.esql.autocomplete.roundDoc', {
      defaultMessage:
        'Returns a number rounded to the decimal, specified by he closest integer value. The default is to round to an integer.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval round_value = round(field)`],
      },
    ],
  },
  {
    name: 'abs',
    description: i18n.translate('monaco.esql.autocomplete.absDoc', {
      defaultMessage: 'Returns the absolute value.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval abs_value = abs(field)`],
      },
    ],
  },
  {
    name: 'log10',
    description: i18n.translate('monaco.esql.autocomplete.log10Doc', {
      defaultMessage: 'Returns the log base 10.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval log10_value = log10(field)`],
      },
    ],
  },
  {
    name: 'pow',
    description: i18n.translate('monaco.esql.autocomplete.powDoc', {
      defaultMessage:
        'Returns the the value of a base (first argument) raised to a power (second argument).',
    }),
    signatures: [
      {
        params: [
          { name: 'field', type: 'number' },
          { name: 'exponent', type: 'number' },
        ],
        returnType: 'number',
        examples: ['from index | eval s = POW(field, exponent)'],
      },
    ],
  },
  {
    name: 'concat',
    description: i18n.translate('monaco.esql.autocomplete.concatDoc', {
      defaultMessage: 'Concatenates two or more strings.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'string' }],
        infiniteParams: true,
        minParams: 1,
        returnType: 'string',
        examples: ['from index | eval concatenated = concat(field1, "-", field2)'],
      },
    ],
  },
  {
    name: 'replace',
    description: i18n.translate('monaco.esql.autocomplete.replaceDoc', {
      defaultMessage:
        'The function substitutes in the string (1st argument) any match of the regular expression (2nd argument) with the replacement string (3rd argument). If any of the arguments are NULL, the result is NULL.',
    }),
    signatures: [
      {
        params: [
          { name: 'field', type: 'string' },
          { name: 'regexp', type: 'string' },
          { name: 'replacement', type: 'string' },
        ],
        returnType: 'string',
        examples: ['from index | eval newStr = replace(field, "Hello", "World")'],
      },
    ],
  },
  {
    name: 'substring',
    description: i18n.translate('monaco.esql.autocomplete.substringDoc', {
      defaultMessage:
        'Returns a substring of a string, specified by a start position and an optional length. This example returns the first three characters of every last name.',
    }),
    signatures: [
      {
        params: [
          { name: 'field', type: 'string' },
          { name: 'startIndex', type: 'number' },
          { name: 'endIndex', type: 'number' },
        ],
        returnType: 'string',
        examples: ['from index | eval new_string = substring(field, 1, 3)'],
      },
    ],
  },
  {
    name: 'trim',
    description: i18n.translate('monaco.esql.autocomplete.trimDoc', {
      defaultMessage: 'Removes leading and trailing whitespaces from strings.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'string' }],
        returnType: 'string',
        examples: ['from index | eval new_string = trim(field)'],
      },
    ],
  },
  {
    name: 'starts_with',
    description: i18n.translate('monaco.esql.autocomplete.startsWithDoc', {
      defaultMessage:
        'Returns a boolean that indicates whether a keyword string starts with another string.',
    }),
    signatures: [
      {
        params: [
          { name: 'field', type: 'string' },
          { name: 'prefix', type: 'string' },
        ],
        returnType: 'boolean',
        examples: ['from index | eval new_string = starts_with(field, "a")'],
      },
    ],
  },
  {
    name: 'ends_with',
    description: i18n.translate('monaco.esql.autocomplete.endsWithDoc', {
      defaultMessage:
        'Returns a boolean that indicates whether a keyword string ends with another string:',
    }),
    signatures: [
      {
        params: [
          { name: 'field', type: 'string' },
          { name: 'prefix', type: 'string' },
        ],
        returnType: 'boolean',
        examples: ['from index | eval new_string = ends_with(field, "a")'],
      },
    ],
  },
  {
    name: 'split',
    description: i18n.translate('monaco.esql.autocomplete.splitDoc', {
      defaultMessage: 'Splits a single valued string into multiple strings.',
    }),
    signatures: [
      {
        params: [
          { name: 'words', type: 'string' },
          { name: 'separator', type: 'string' },
        ],
        returnType: 'string[]',
        examples: [`ROW words="foo;bar;baz;qux;quux;corge" | EVAL word = SPLIT(words, ";")`],
      },
    ],
  },
  {
    name: 'to_string',
    alias: ['to_str'],
    description: i18n.translate('monaco.esql.autocomplete.toStringDoc', {
      defaultMessage: 'Converts to string.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'any' }],
        returnType: 'string',
        examples: [`from index" | EVAL string = to_string(field)`],
      },
    ],
  },
  {
    name: 'to_boolean',
    alias: ['to_bool'],
    description: i18n.translate('monaco.esql.autocomplete.toBooleanDoc', {
      defaultMessage: 'Converts to boolean.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'any' }],
        returnType: 'boolean',
        examples: [`from index" | EVAL bool = to_boolean(field)`],
      },
    ],
  },
  {
    name: 'to_datetime',
    alias: ['to_dt'],
    description: i18n.translate('monaco.esql.autocomplete.toDateTimeDoc', {
      defaultMessage: 'Converts to date.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'any' }],
        returnType: 'date',
        examples: [`from index" | EVAL datetime = to_datetime(field)`],
      },
    ],
  },
  {
    name: 'to_degrees',
    description: i18n.translate('monaco.esql.autocomplete.toDegreesDoc', {
      defaultMessage: 'Coverts to degrees',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval degrees = to_degrees(field)`],
      },
    ],
  },
  {
    name: 'to_double',
    alias: ['to_dbl'],
    description: i18n.translate('monaco.esql.autocomplete.toDoubleDoc', {
      defaultMessage: 'Converts to double.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'any' }],
        returnType: 'number',
        examples: [`from index" | EVAL double = to_double(field)`],
      },
    ],
  },
  {
    name: 'to_integer',
    alias: ['to_int'],
    description: i18n.translate('monaco.esql.autocomplete.toIntegerDoc', {
      defaultMessage: 'Converts to integer.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'any' }],
        returnType: 'number',
        examples: [`from index" | EVAL integer = to_integer(field)`],
      },
    ],
  },
  {
    name: 'to_long',
    description: i18n.translate('monaco.esql.autocomplete.toLongDoc', {
      defaultMessage: 'Converts to long.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'any' }],
        returnType: 'number',
        examples: [`from index" | EVAL long = to_long(field)`],
      },
    ],
  },
  {
    name: 'to_radians',
    description: i18n.translate('monaco.esql.autocomplete.toRadiansDoc', {
      defaultMessage: 'Converts to radians',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval radians = to_radians(field)`],
      },
    ],
  },
  {
    name: 'to_unsigned_long',
    alias: ['to_ul', 'to_ulong'],
    description: i18n.translate('monaco.esql.autocomplete.toUnsignedLongDoc', {
      defaultMessage: 'Converts to unsigned long.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'any' }],
        returnType: 'number',
        examples: [`from index" | EVAL unsigned_long = to_unsigned_long(field)`],
      },
    ],
  },
  {
    name: 'to_ip',
    description: i18n.translate('monaco.esql.autocomplete.toIpDoc', {
      defaultMessage: 'Converts to ip.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'any' }],
        returnType: 'ip',
        examples: [`from index" | EVAL ip = to_ip(field)`],
      },
    ],
  },
  {
    name: 'to_version',
    alias: ['to_ver'],
    description: i18n.translate('monaco.esql.autocomplete.toVersionDoc', {
      defaultMessage: 'Converts to version.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'string' }],
        returnType: 'version',
        examples: [`from index | EVAL version = to_version(stringField)`],
      },
      {
        params: [{ name: 'field', type: 'version' }],
        returnType: 'version',
        examples: [`from index | EVAL version = to_version(versionField)`],
      },
    ],
  },
  {
    name: 'date_extract',
    description: i18n.translate('monaco.esql.autocomplete.dateExtractDoc', {
      defaultMessage: `Extracts parts of a date, like year, month, day, hour. The supported field types are those provided by java.time.temporal.ChronoField`,
    }),
    signatures: [
      {
        params: [
          {
            name: 'date_part',
            type: 'chrono_literal',
          },
          { name: 'field', type: 'date' },
        ],
        returnType: 'number',
        examples: [
          `ROW date = DATE_PARSE("2022-05-06", "yyyy-MM-dd") | EVAL year = DATE_EXTRACT("year", date)`,
        ],
      },
    ],
  },
  {
    name: 'date_format',
    description: i18n.translate('monaco.esql.autocomplete.dateFormatDoc', {
      defaultMessage: `Returns a string representation of a date in the provided format. If no format is specified, the "yyyy-MM-dd'T'HH:mm:ss.SSSZ" format is used.`,
    }),
    signatures: [
      {
        params: [
          { name: 'field', type: 'date' },
          { name: 'format_string', type: 'string', optional: true },
        ],
        returnType: 'string',
        examples: ['from index | eval hired = date_format(hire_date, "YYYY-MM-dd")'],
      },
    ],
  },
  {
    name: 'date_trunc',
    description: i18n.translate('monaco.esql.autocomplete.dateTruncDoc', {
      defaultMessage: `Rounds down a date to the closest interval. Intervals can be expressed using the timespan literal syntax.`,
    }),
    signatures: [
      {
        params: [
          { name: 'time', type: 'time_literal' },
          { name: 'field', type: 'date' },
        ],
        returnType: 'date',
        examples: [`from index | eval year_hired = DATE_TRUNC(1 year, hire_date)`],
      },
    ],
  },
  {
    name: 'date_parse',
    description: i18n.translate('monaco.esql.autocomplete.dateParseDoc', {
      defaultMessage: `Parse dates from strings.`,
    }),
    signatures: [
      {
        params: [
          { name: 'field', type: 'string' },
          { name: 'format_string', type: 'string' },
        ],
        returnType: 'date',
        examples: [
          `from index | eval year_hired = date_parse(hire_date, yyyy-MM-dd'T'HH:mm:ss.SSS'Z')`,
        ],
      },
    ],
  },
  {
    name: 'auto_bucket',
    description: i18n.translate('monaco.esql.autocomplete.autoBucketDoc', {
      defaultMessage: `Automatically bucket dates based on a given range and bucket target.`,
    }),
    signatures: [
      {
        params: [
          { name: 'field', type: 'date' },
          { name: 'buckets', type: 'number' },
          { name: 'startDate', type: 'string' },
          { name: 'endDate', type: 'string' },
        ],
        returnType: 'date',
        examples: [
          'from index | eval hd = auto_bucket(hire_date, 20, "1985-01-01T00:00:00Z", "1986-01-01T00:00:00Z")',
        ],
      },
      {
        params: [
          { name: 'field', type: 'date' },
          { name: 'buckets', type: 'number' },
          { name: 'startValue', type: 'number' },
          { name: 'endValue', type: 'number' },
        ],
        returnType: 'number',
        examples: ['from index | eval bs = auto_bucket(salary, 20, 25324, 74999)'],
      },
    ],
  },
  {
    name: 'is_finite',
    description: i18n.translate('monaco.esql.autocomplete.isFiniteDoc', {
      defaultMessage: 'Returns a boolean that indicates whether its input is a finite number.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'boolean',
        examples: ['from index | eval s = is_finite(field/0)'],
      },
    ],
  },
  {
    name: 'is_infinite',
    description: i18n.translate('monaco.esql.autocomplete.isInfiniteDoc', {
      defaultMessage: 'Returns a boolean that indicates whether its input is infinite.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'boolean',
        examples: ['from index | eval s = is_infinite(field/0)'],
      },
    ],
  },
  {
    name: 'is_nan',
    description: i18n.translate('monaco.esql.autocomplete.isNanDoc', {
      defaultMessage: 'Returns a boolean that indicates whether its input is not a number.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'boolean',
        examples: ['row a = 1 | eval is_nan(a)'],
      },
    ],
  },
  {
    name: 'case',
    description: i18n.translate('monaco.esql.autocomplete.caseDoc', {
      defaultMessage:
        'Accepts pairs of conditions and values. The function returns the value that belongs to the first condition that evaluates to `true`. If the number of arguments is odd, the last argument is the default value which is returned when no condition matches.',
    }),
    signatures: [
      {
        params: [
          { name: 'condition', type: 'boolean' },
          { name: 'value', type: 'any' },
        ],
        minParams: 3,
        returnType: 'any',
        examples: [
          `from index | eval type = case(languages <= 1, "monolingual", languages <= 2, "bilingual", "polyglot")`,
        ],
      },
    ],
  },
  {
    name: 'length',
    description: i18n.translate('monaco.esql.autocomplete.lengthDoc', {
      defaultMessage: 'Returns the character length of a string.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'string' }],
        returnType: 'number',
        examples: [`from index | eval fn_length = length(field)`],
      },
    ],
  },
  {
    name: 'acos',
    description: i18n.translate('monaco.esql.autocomplete.acosDoc', {
      defaultMessage: 'Inverse cosine trigonometric function',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval acos = acos(field)`],
      },
    ],
  },
  {
    name: 'asin',
    description: i18n.translate('monaco.esql.autocomplete.asinDoc', {
      defaultMessage: 'Inverse sine trigonometric function',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval asin = asin(field)`],
      },
    ],
  },
  {
    name: 'atan',
    description: i18n.translate('monaco.esql.autocomplete.atanDoc', {
      defaultMessage: 'Inverse tangent trigonometric function',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval atan = atan(field)`],
      },
    ],
  },
  {
    name: 'atan2',
    description: i18n.translate('monaco.esql.autocomplete.atan2Doc', {
      defaultMessage:
        'The angle between the positive x-axis and the ray from the origin to the point (x , y) in the Cartesian plane',
    }),
    signatures: [
      {
        params: [
          { name: 'x', type: 'number' },
          { name: 'y', type: 'number' },
        ],
        returnType: 'number',
        examples: [`from index | eval atan2 = atan2(x, y)`],
      },
    ],
  },
  {
    name: 'coalesce',
    description: i18n.translate('monaco.esql.autocomplete.coalesceDoc', {
      defaultMessage: 'Returns the first non-null value.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'any' }],
        infiniteParams: true,
        returnType: 'any',
        examples: [`ROW a=null, b="b" | EVAL COALESCE(a, b)`],
      },
    ],
  },
  {
    name: 'cos',
    description: i18n.translate('monaco.esql.autocomplete.cosDoc', {
      defaultMessage: 'Cosine trigonometric function',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval cos = cos(field)`],
      },
    ],
  },
  {
    name: 'cosh',
    description: i18n.translate('monaco.esql.autocomplete.coshDoc', {
      defaultMessage: 'Cosine hyperbolic function',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval cosh = cosh(field)`],
      },
    ],
  },
  {
    name: 'floor',
    description: i18n.translate('monaco.esql.autocomplete.floorDoc', {
      defaultMessage: 'Round a number down to the nearest integer.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`from index | eval a = floor(field)`],
      },
    ],
  },
  {
    name: 'greatest',
    description: i18n.translate('monaco.esql.autocomplete.greatestDoc', {
      defaultMessage: 'Returns the maximum value from many columns.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        infiniteParams: true,
        returnType: 'number',
        examples: [`ROW a = 10, b = 20 | EVAL g = GREATEST(a, b)`],
      },
    ],
  },
  {
    name: 'left',
    description: i18n.translate('monaco.esql.autocomplete.leftDoc', {
      defaultMessage:
        'Return the substring that extracts length chars from the string starting from the left.',
    }),
    signatures: [
      {
        params: [
          { name: 'field', type: 'string' },
          { name: 'length', type: 'number' },
        ],
        returnType: 'string',
        examples: [`from index | eval substr = left(field, 3)`],
      },
    ],
  },
  {
    name: 'ltrim',
    description: i18n.translate('monaco.esql.autocomplete.ltrimDoc', {
      defaultMessage: 'Removes leading whitespaces from strings.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'string' }],
        returnType: 'string',
        examples: [`ROW message = "   some text  "| EVAL message = LTRIM(message)`],
      },
    ],
  },
  {
    name: 'now',
    description: i18n.translate('monaco.esql.autocomplete.nowDoc', {
      defaultMessage: 'Returns current date and time.',
    }),
    signatures: [
      {
        params: [],
        returnType: 'date',
        examples: [`ROW current_date = NOW()`],
      },
    ],
  },
  {
    name: 'right',
    description: i18n.translate('monaco.esql.autocomplete.rightDoc', {
      defaultMessage:
        'Return the substring that extracts length chars from the string starting from the right.',
    }),
    signatures: [
      {
        params: [
          { name: 'field', type: 'string' },
          { name: 'length', type: 'number' },
        ],
        returnType: 'string',
        examples: [`from index | eval string = right(field, 3)`],
      },
    ],
  },
  {
    name: 'rtrim',
    description: i18n.translate('monaco.esql.autocomplete.rtrimDoc', {
      defaultMessage: 'Removes trailing whitespaces from strings.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'string' }],
        returnType: 'string',
        examples: [`ROW message = "   some text  " | EVAL message = RTRIM(message)`],
      },
    ],
  },
  {
    name: 'sin',
    description: i18n.translate('monaco.esql.autocomplete.sinDoc', {
      defaultMessage: 'Sine trigonometric function.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`ROW a=1.8 | EVAL sin=SIN(a)`],
      },
    ],
  },
  {
    name: 'sinh',
    description: i18n.translate('monaco.esql.autocomplete.sinhDoc', {
      defaultMessage: 'Sine hyperbolic function.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`ROW a=1.8 | EVAL sinh=SINH(a)`],
      },
    ],
  },
  {
    name: 'sqrt',
    description: i18n.translate('monaco.esql.autocomplete.sqrtDoc', {
      defaultMessage: 'Returns the square root of a number. ',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`ROW d = 100.0 | EVAL s = SQRT(d)`],
      },
    ],
  },
  {
    name: 'tan',
    description: i18n.translate('monaco.esql.autocomplete.tanDoc', {
      defaultMessage: 'Tangent trigonometric function.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`ROW a=1.8 | EVAL tan=TAN(a)`],
      },
    ],
  },
  {
    name: 'tanh',
    description: i18n.translate('monaco.esql.autocomplete.tanhDoc', {
      defaultMessage: 'Tangent hyperbolic function.',
    }),
    signatures: [
      {
        params: [{ name: 'field', type: 'number' }],
        returnType: 'number',
        examples: [`ROW a=1.8 | EVAL tanh=TANH(a)`],
      },
    ],
  },
  {
    name: 'cidr_match',
    description: i18n.translate('monaco.esql.autocomplete.cidrMatchDoc', {
      defaultMessage:
        'The function takes a first parameter of type IP, followed by one or more parameters evaluated to a CIDR specificatione.',
    }),
    signatures: [
      {
        minParams: 2,
        params: [
          { name: 'ip', type: 'ip' },
          { name: 'cidr_block', type: 'string' },
        ],
        returnType: 'boolean',
        examples: [
          'from index | where cidr_match(ip_field, "127.0.0.1/30")',
          'from index | eval cidr="10.0.0.0/8" | where cidr_match(ip_field, "127.0.0.1/30", cidr)',
        ],
      },
    ],
  },
  {
    name: 'mv_avg',
    description: i18n.translate('monaco.esql.autocomplete.mvAvgDoc', {
      defaultMessage:
        'Converts a multivalued field into a single valued field containing the average of all of the values.',
    }),
    signatures: [
      {
        params: [{ name: 'multivalue', type: 'number[]' }],
        returnType: 'number',
        examples: ['row a = [1, 2, 3] | mv_avg(a)'],
      },
    ],
  },
  {
    name: 'mv_concat',
    description: i18n.translate('monaco.esql.autocomplete.mvConcatDoc', {
      defaultMessage:
        'Converts a multivalued string field into a single valued field containing the concatenation of all values separated by a delimiter',
    }),
    signatures: [
      {
        params: [
          { name: 'multivalue', type: 'string[]' },
          { name: 'delimeter', type: 'string' },
        ],
        returnType: 'string',
        examples: ['row a = ["1", "2", "3"] | mv_concat(a, ", ")'],
      },
    ],
  },
  {
    name: 'mv_count',
    description: i18n.translate('monaco.esql.autocomplete.mvCountDoc', {
      defaultMessage:
        'Converts a multivalued field into a single valued field containing a count of the number of values',
    }),
    signatures: [
      {
        params: [{ name: 'multivalue', type: 'any[]' }],
        returnType: 'number',
        examples: ['row a = [1, 2, 3] | eval mv_count(a)'],
      },
    ],
  },
  {
    name: 'mv_dedupe',
    description: i18n.translate('monaco.esql.autocomplete.mvDedupeDoc', {
      defaultMessage: 'Removes duplicates from a multivalued field',
    }),
    signatures: [
      {
        params: [{ name: 'multivalue', type: 'any[]' }],
        returnType: 'any[]',
        examples: ['row a = [2, 2, 3] | eval mv_dedupe(a)'],
      },
    ],
  },
  {
    name: 'mv_max',
    description: i18n.translate('monaco.esql.autocomplete.mvMaxDoc', {
      defaultMessage:
        'Converts a multivalued field into a single valued field containing the maximum value.',
    }),
    signatures: [
      {
        params: [{ name: 'multivalue', type: 'number[]' }],
        returnType: 'number',
        examples: ['row a = [1, 2, 3] | eval mv_max(a)'],
      },
    ],
  },
  {
    name: 'mv_min',
    description: i18n.translate('monaco.esql.autocomplete.mvMinDoc', {
      defaultMessage:
        'Converts a multivalued field into a single valued field containing the minimum value.',
    }),
    signatures: [
      {
        params: [{ name: 'multivalue', type: 'number[]' }],
        returnType: 'number',
        examples: ['row a = [1, 2, 3] | eval mv_min(a)'],
      },
    ],
  },
  {
    name: 'mv_median',
    description: i18n.translate('monaco.esql.autocomplete.mvMedianDoc', {
      defaultMessage:
        'Converts a multivalued field into a single valued field containing the median value.',
    }),
    signatures: [
      {
        params: [{ name: 'multivalue', type: 'number[]' }],
        returnType: 'number',
        examples: ['row a = [1, 2, 3] | eval mv_median(a)'],
      },
    ],
  },
  {
    name: 'mv_sum',
    description: i18n.translate('monaco.esql.autocomplete.mvSumDoc', {
      defaultMessage:
        'Converts a multivalued field into a single valued field containing the minimum value.',
    }),
    signatures: [
      {
        params: [{ name: 'multivalue', type: 'number[]' }],
        returnType: 'number',
        examples: ['row a = [1, 2, 3] | eval mv_sum(a)'],
      },
    ],
  },
  {
    name: 'pi',
    description: i18n.translate('monaco.esql.autocomplete.piDoc', {
      defaultMessage: 'The ratio of a circle’s circumference to its diameter.',
    }),
    signatures: [
      {
        params: [],
        returnType: 'number',
        examples: ['row a = 1 | eval pi()'],
      },
    ],
  },
  {
    name: 'e',
    description: i18n.translate('monaco.esql.autocomplete.eDoc', {
      defaultMessage: 'Euler’s number.',
    }),
    signatures: [
      {
        params: [],
        returnType: 'number',
        examples: ['row a = 1 | eval e()'],
      },
    ],
  },
  {
    name: 'tau',
    description: i18n.translate('monaco.esql.autocomplete.tauDoc', {
      defaultMessage: 'The ratio of a circle’s circumference to its radius.',
    }),
    signatures: [
      {
        params: [],
        returnType: 'number',
        examples: ['row a = 1 | eval tau()'],
      },
    ],
  },
]
  .sort(({ name: a }, { name: b }) => a.localeCompare(b))
  .map((def) => ({ ...def, supportedCommands: ['eval', 'where', 'row'] }));
