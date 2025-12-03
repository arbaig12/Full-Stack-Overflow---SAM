import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CurrentDateConfig from '../CurrentDate';

describe('CurrentDateConfig', () => {
  it('renders current date configuration', () => {
    render(<CurrentDateConfig />);
    expect(screen.getByText(/Current Date Configuration/i)).toBeInTheDocument();
  });

  it('allows setting custom date', () => {
    render(<CurrentDateConfig />);
    const dateInput = screen.getByLabelText(/date/i) || screen.getByDisplayValue(/2025/i);
    if (dateInput) {
      fireEvent.change(dateInput, { target: { value: '2025-09-15' } });
      expect(dateInput.value).toBe('2025-09-15');
    }
  });
});

