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
});

