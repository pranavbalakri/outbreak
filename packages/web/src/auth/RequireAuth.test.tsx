import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RequireAuth } from './RequireAuth.js';

vi.mock('./AuthContext.js', () => ({
  useAuth: () => ({ user: null, loading: false, logout: vi.fn(), refresh: vi.fn() }),
}));

describe('RequireAuth', () => {
  it('redirects to /login when no user', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <div>Private area</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div>Login screen</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText('Private area')).toBeNull();
  });
});
