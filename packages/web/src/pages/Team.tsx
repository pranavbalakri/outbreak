import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@outbreak/shared';
import { Badge, Button, Card, Field, Modal, inputClass } from '../components/ui.js';
import {
  createUser,
  deactivateUser,
  fetchRateHistory,
  fetchUsers,
  updateUser,
  updateUserRate,
} from '../api/queries.js';

function fmtCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function TeamPage() {
  const qc = useQueryClient();
  const usersQ = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const deactivateM = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const toggleActiveM = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateUser(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Team</h1>
        <Button onClick={() => setInviteOpen(true)}>Invite user</Button>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-400 text-left text-xs uppercase text-ink-200">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3 text-right">Current rate</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {usersQ.data?.users.map((u) => (
              <tr key={u.id} className="border-b border-ink-500 last:border-none">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-ink-200">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge tone={u.role === 'ADMIN' ? 'indigo' : 'slate'}>{u.role}</Badge>
                </td>
                <td className="px-4 py-3 text-right">{fmtCents(u.currentRateCents)}/hr</td>
                <td className="px-4 py-3">
                  {u.isActive ? (
                    <Badge tone="green">Active</Badge>
                  ) : (
                    <Badge tone="red">Inactive</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setEditing(u)}>
                      Edit
                    </Button>
                    {u.isActive ? (
                      <Button
                        variant="danger"
                        onClick={() => {
                          if (confirm(`Deactivate ${u.name}?`)) deactivateM.mutate(u.id);
                        }}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => toggleActiveM.mutate({ id: u.id, isActive: true })}
                      >
                        Reactivate
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} />}
      {inviteOpen && <InviteUserModal onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function EditUserModal({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<'ADMIN' | 'INSTRUCTOR'>(user.role);
  const [rateVisibleToSelf, setRateVisibleToSelf] = useState(user.rateVisibleToSelf);
  const [rateDollars, setRateDollars] = useState(
    (user.currentRateCents / 100).toFixed(2),
  );

  const historyQ = useQuery({
    queryKey: ['rateHistory', user.id],
    queryFn: () => fetchRateHistory(user.id),
  });

  const saveProfileM = useMutation({
    mutationFn: () =>
      updateUser(user.id, {
        name,
        role,
        rateVisibleToSelf,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const saveRateM = useMutation({
    mutationFn: () => {
      const cents = Math.round(Number(rateDollars) * 100);
      if (!Number.isFinite(cents) || cents < 0) throw new Error('Invalid rate');
      return updateUserRate(user.id, cents);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['users'] }),
        qc.invalidateQueries({ queryKey: ['rateHistory', user.id] }),
      ]);
    },
  });

  return (
    <Modal open onClose={onClose} title={`Edit ${user.name}`}>
      <div className="space-y-4">
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Role">
          <select
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as 'ADMIN' | 'INSTRUCTOR')}
          >
            <option value="INSTRUCTOR">Instructor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-100">
          <input
            type="checkbox"
            checked={rateVisibleToSelf}
            onChange={(e) => setRateVisibleToSelf(e.target.checked)}
          />
          Let this user see their own rate
        </label>
        <div className="flex justify-end">
          <Button onClick={() => saveProfileM.mutate()} disabled={saveProfileM.isPending}>
            {saveProfileM.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </div>

        <div className="border-t border-ink-400 pt-4">
          <h3 className="mb-2 text-sm font-semibold">Billing rate</h3>
          <div className="flex items-end gap-2">
            <Field label="New rate ($/hr)">
              <input
                className={inputClass}
                type="number"
                step="0.01"
                min="0"
                value={rateDollars}
                onChange={(e) => setRateDollars(e.target.value)}
              />
            </Field>
            <Button
              onClick={() => saveRateM.mutate()}
              disabled={saveRateM.isPending}
            >
              {saveRateM.isPending ? 'Updating…' : 'Update rate'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-200">
            Rate changes never touch past entries — historical time keeps the rate it was logged with.
          </p>

          <h4 className="mt-4 text-xs font-semibold uppercase text-ink-200">
            Rate history
          </h4>
          {historyQ.data && historyQ.data.history.length > 0 ? (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-200">
                  <th className="py-1">Effective from</th>
                  <th className="py-1 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {historyQ.data.history.map((h) => (
                  <tr key={h.id} className="border-t border-ink-500">
                    <td className="py-1">
                      {new Date(h.effectiveFrom).toLocaleString()}
                    </td>
                    <td className="py-1 text-right">{fmtCents(h.rateCents)}/hr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-xs text-ink-200">No recorded rate history.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function InviteUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'INSTRUCTOR'>('INSTRUCTOR');
  const [rateDollars, setRateDollars] = useState('0.00');
  const [error, setError] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: () =>
      createUser({
        name,
        email,
        role,
        rateCents: Math.round(Number(rateDollars) * 100),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal open onClose={onClose} title="Invite user">
      <div className="space-y-3">
        <p className="text-sm text-ink-200">
          Create the user row now. Share the web app URL with them — their first
          successful Google sign-in will bind their Google account automatically.
        </p>
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Role">
          <select
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as 'ADMIN' | 'INSTRUCTOR')}
          >
            <option value="INSTRUCTOR">Instructor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        <Field label="Starting rate ($/hr)">
          <input
            className={inputClass}
            type="number"
            min="0"
            step="0.01"
            value={rateDollars}
            onChange={(e) => setRateDollars(e.target.value)}
          />
        </Field>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name || !email || createM.isPending}
            onClick={() => createM.mutate()}
          >
            {createM.isPending ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
