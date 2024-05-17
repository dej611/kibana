/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { NoMatches } from './no_matches';

describe('NoMatches', () => {
  it('renders the no matches messages', () => {
    render(<NoMatches />);

    expect(screen.getByText("User doesn't exist or is unavailable"));
  });
});
