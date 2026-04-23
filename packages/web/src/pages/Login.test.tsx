import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LoginPage } from './Login.js';

describe('LoginPage', () => {
  it('renders the sign-in call to action', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /sign in with google/i });
    // Label reads "[ sign in with google ]" under the terminal theme; case-insensitive regex above still matches.
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toContain('/auth/google/start');
  });
});
