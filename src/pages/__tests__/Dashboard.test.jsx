import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthProvider } from '../../auth/AuthContext';
import Dashboard from '../Dashboard';

const mockAuthContext = {
  user: { name: 'Test User', email: 'test@stonybrook.edu' },
  signin: jest.fn(),
  signout: jest.fn()
};

jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => mockAuthContext
}));

describe('Dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders student dashboard by default', () => {
    localStorage.setItem('role', 'student');
    render(
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    );
    expect(screen.getByText(/Student Dashboard/i)).toBeInTheDocument();
  });

  it('displays student stats', () => {
    localStorage.setItem('role', 'student');
    render(
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    );
    expect(screen.getByText(/Enrolled Courses/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Credits/i)).toBeInTheDocument();
  });

  it('renders instructor dashboard when role is instructor', () => {
    localStorage.setItem('role', 'instructor');
    render(
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    );
    expect(screen.getByText(/Instructor Dashboard/i)).toBeInTheDocument();
  });
});

