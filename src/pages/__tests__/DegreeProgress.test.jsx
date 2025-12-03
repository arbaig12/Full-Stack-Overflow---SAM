import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DegreeProgress from '../DegreeProgress';

describe('DegreeProgress', () => {
  it('renders degree progress page', () => {
    render(<DegreeProgress />);
    expect(screen.getByText(/Degree Progress/i)).toBeInTheDocument();
  });

  it('displays degree requirements', () => {
    render(<DegreeProgress />);
    // Check for common degree progress elements
    expect(screen.getByText(/Progress/i) || screen.getByText(/Requirements/i)).toBeInTheDocument();
  });
});

