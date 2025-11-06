import { render, screen, fireEvent } from '@testing-library/react';
import DeclareMajorMinor from '../components/DeclareMajorMinor';
import '@testing-library/jest-dom';

describe('DeclareMajorMinor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('renders default values when no localStorage', () => {
    render(<DeclareMajorMinor />);
    expect(screen.getByText(/Current Major:/)).toHaveTextContent('Computer Science');
    expect(screen.getByText(/Current Minor:/)).toHaveTextContent('Economics');
  });

  test('saves selected major and minor to localStorage', () => {
    render(<DeclareMajorMinor />);
    
    fireEvent.change(screen.getByLabelText(/Select Type/i), { target: { value: 'major' } });
    fireEvent.change(screen.getByLabelText(/Major:/i), { target: { value: 'Biology (BS)' } });
    
    fireEvent.change(screen.getByLabelText(/Select Type/i), { target: { value: 'minor' } });
    fireEvent.change(screen.getByLabelText(/Minor:/i), { target: { value: 'Psychology' } });
    
    fireEvent.click(screen.getByText(/Send/i));

    expect(localStorage.getItem('major')).toBe('Biology (BS)');
    expect(localStorage.getItem('minor')).toBe('Psychology');
    expect(screen.getByText(/Program updated successfully!/i)).toBeInTheDocument();
  });
});

