import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import Login from '../Login';

const mockSignin = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signin: mockSignin })
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('Login', () => {
  it('renders login page', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );
    expect(screen.getByText(/SAM/i)).toBeInTheDocument();
  });

  it('displays login instructions', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );
    expect(screen.getByText(/Sign in with Google/i)).toBeInTheDocument();
  });
});

