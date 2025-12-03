import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Plan from '../Plan';

describe('Plan', () => {
  it('renders plan page', () => {
    render(<Plan />);
    expect(screen.getByText(/Plan/i)).toBeInTheDocument();
  });
});

