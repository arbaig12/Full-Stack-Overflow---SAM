import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserManage from '../UserManage';

describe('UserManage', () => {
  it('renders user management page', () => {
    render(<UserManage />);
    expect(screen.getByText(/User/i) || screen.getByText(/Manage/i)).toBeInTheDocument();
  });
});

