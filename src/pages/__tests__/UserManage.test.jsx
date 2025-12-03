import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserManage from '../UserManage';

describe('UserManage', () => {
  it('renders user management page', () => {
    render(<UserManage />);
    // Check for any text that indicates user management
    const hasUserText = screen.queryAllByText(/User/i).length > 0;
    const hasManageText = screen.queryAllByText(/Manage/i).length > 0;
    expect(hasUserText || hasManageText).toBe(true);
  });
});

