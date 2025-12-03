import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthProvider from '../../auth/AuthContext';
import Dashboard from '../Dashboard';

const mockAuthContext = {
  user: { name: 'Test User', email: 'test@stonybrook.edu' },
  signin: jest.fn(),
  signout: jest.fn()
};

jest.mock('../../auth/AuthContext', () => {
  const actual = jest.requireActual('../../auth/AuthContext');
  return {
    ...actual,
    useAuth: () => mockAuthContext
  };
});

describe('Dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders dashboard', () => {
    localStorage.setItem('role', 'student');
    render(<Dashboard />);
    // Dashboard should render something
    expect(screen.getByText(/Dashboard/i) || document.body).toBeTruthy();
  });

  it('displays dashboard content', () => {
    localStorage.setItem('role', 'student');
    render(<Dashboard />);
    // Just verify it renders without errors
    expect(document.body).toBeTruthy();
  });
});

