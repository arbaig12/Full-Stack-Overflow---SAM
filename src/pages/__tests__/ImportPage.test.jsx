import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportPage from '../ImportPage';

describe('ImportPage', () => {
  it('renders import page', () => {
    render(<ImportPage />);
    expect(screen.getByText(/Import/i)).toBeInTheDocument();
  });
});

