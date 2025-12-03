import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DeclareMajor from '../DeclareMajor';

describe('DeclareMajor', () => {
  it('renders declare major page', () => {
    render(<DeclareMajor />);
    expect(screen.getByText(/Declare/i) || screen.getByText(/Major/i)).toBeInTheDocument();
  });
});

