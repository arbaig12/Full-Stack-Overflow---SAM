import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CourseCatalog from '../CourseCatalog';

describe('CourseCatalog', () => {
  it('renders course catalog', () => {
    render(<CourseCatalog />);
    expect(screen.getByText(/Course Catalog/i)).toBeInTheDocument();
  });

  it('displays courses', () => {
    render(<CourseCatalog />);
    expect(screen.getByText(/Introduction to Computer Science/i)).toBeInTheDocument();
    expect(screen.getByText(/CSE101/i)).toBeInTheDocument();
  });

  it('filters courses by search term', () => {
    render(<CourseCatalog />);
    const searchInput = screen.getByPlaceholderText(/Search courses/i);
    fireEvent.change(searchInput, { target: { value: 'Data Structures' } });
    expect(screen.getByText(/Data Structures/i)).toBeInTheDocument();
  });

  it('filters courses by department', () => {
    render(<CourseCatalog />);
    const departmentSelect = screen.getByLabelText(/Department/i);
    fireEvent.change(departmentSelect, { target: { value: 'CSE' } });
    expect(screen.getByText(/CSE114/i)).toBeInTheDocument();
  });
});

