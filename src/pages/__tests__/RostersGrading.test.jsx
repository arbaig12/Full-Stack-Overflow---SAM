import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RostersGrading from '../RostersGrading';

describe('RostersGrading', () => {
  it('renders rosters and grading page', () => {
    render(<RostersGrading />);
    expect(screen.getByText(/Roster/i) || screen.getByText(/Grading/i)).toBeInTheDocument();
  });
});

