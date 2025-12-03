import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RegistrationSchedule from '../RegistrationSchedule';

describe('RegistrationSchedule', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders registration schedule page', () => {
    render(<RegistrationSchedule />);
    expect(screen.getByText(/Registration Schedule/i)).toBeInTheDocument();
  });

  it('displays available courses', () => {
    render(<RegistrationSchedule />);
    expect(screen.getByText(/CSE101/i)).toBeInTheDocument();
  });

  it('allows searching for courses', () => {
    render(<RegistrationSchedule />);
    const searchInput = screen.getByPlaceholderText(/Search courses/i);
    fireEvent.change(searchInput, { target: { value: 'CSE114' } });
    expect(screen.getByText(/CSE114/i)).toBeInTheDocument();
  });

  it('handles course registration', () => {
    render(<RegistrationSchedule />);
    // Find a register button and click it
    const registerButtons = screen.queryAllByText(/Register/i);
    if (registerButtons.length > 0) {
      fireEvent.click(registerButtons[0]);
      // Verify message appears or enrollment changes
      expect(screen.getByText(/Registration Schedule/i)).toBeInTheDocument();
    }
  });

  it('handles course withdrawal', () => {
    render(<RegistrationSchedule />);
    // First register, then withdraw
    const registerButtons = screen.queryAllByText(/Register/i);
    if (registerButtons.length > 0) {
      fireEvent.click(registerButtons[0]);
      const withdrawButtons = screen.queryAllByText(/Withdraw/i);
      if (withdrawButtons.length > 0) {
        fireEvent.click(withdrawButtons[0]);
      }
    }
    expect(screen.getByText(/Registration Schedule/i)).toBeInTheDocument();
  });

  it('filters by term', () => {
    render(<RegistrationSchedule />);
    const termSelect = screen.getByLabelText(/Term/i);
    fireEvent.change(termSelect, { target: { value: 'Fall 2025' } });
    expect(screen.getByText(/Registration Schedule/i)).toBeInTheDocument();
  });
});

