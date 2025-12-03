import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentProfile from '../StudentProfile';

describe('StudentProfile', () => {
  it('renders student profile page', () => {
    render(<StudentProfile />);
    expect(screen.getByText(/Student Profile/i) || screen.getByText(/Profile/i)).toBeInTheDocument();
  });
});

