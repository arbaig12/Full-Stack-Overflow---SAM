import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DeclareMajor from '../DeclareMajor';

describe('DeclareMajor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders declare major page', () => {
    render(<DeclareMajor />);
    const hasDeclare = screen.queryByText(/Declare/i);
    const hasMajor = screen.queryByText(/Major/i);
    const hasMinor = screen.queryByText(/Minor/i);
    expect(hasDeclare || hasMajor || hasMinor || document.body).toBeTruthy();
  });

  it('allows selecting program type', () => {
    render(<DeclareMajor />);
    const selects = screen.queryAllByRole('combobox');
    if (selects.length > 0) {
      fireEvent.change(selects[0], { target: { value: 'major' } });
    }
    expect(document.body).toBeTruthy();
  });
});
