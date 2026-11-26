'use client';

import { ROLE_LABELS, ROLE_RANK, ROLES, type Paginated, type Role, type UserDTO } from '@jobs/shared';
import { Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { PageHeader, Pager, Table, td, th } from '@/components/admin/common';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Card, Field, Input, Select, Switch } from '@/components/ui/primitives';
import { api, errorText, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/hooks';
import { cn, initials, timeAgo } from '@/lib/utils';

const ROLE_HELP: Record<Role, string> = {
  SUPER_ADMIN: 'Full access, including managing admins',
  ADMIN: 'Publish/approve jobs, manage tags, users, LLM settings',
  EDITOR: 'Submit URLs, create & edit jobs (publishing needs approval)',
  VIEWER: 'Browse and save jobs',
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q, 300);
  const { data, mutate } = useSWR<Paginated<UserDTO>>(`/admin/users${qs({ q: dq, page, pageSize: 20 })}`);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'EDITOR' as Role });
  const [busy, setBusy] = useState(false);

  const assignable = ROLES.filter((r) => me?.role === 'SUPER_ADMIN' || ROLE_RANK[r] < ROLE_RANK[me?.role ?? 'VIEWER']);
  const canManage = (u: UserDTO) => u.id !== me?.id && (me?.role === 'SUPER_ADMIN' || ROLE_RANK[u.role] < ROLE_RANK[me?.role ?? 'VIEWER']);

  const update = async (u: UserDTO, body: Partial<Pick<UserDTO, 'role' | 'status'>>) => {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PUT', body });
      toast.success(`${u.name} updated`);
      mutate();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      await api('/admin/users', { method: 'POST', body: form });
      toast.success('User created');
      setCreating(false);
      setForm({ name: '', email: '', password: '', role: 'EDITOR' });
      mutate();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Role-based access: Super Admin › Admin › Content Editor › Viewer."
        actions={<Button onClick={() => setCreating(true)} icon={<UserPlus className="h-4 w-4" />}>Add user</Button>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => (
          <Card key={r} className="p-4">
            <p className="text-sm font-semibold text-fg">{ROLE_LABELS[r]}</p>
            <p className="mt-0.5 text-xs text-muted">{ROLE_HELP[r]}</p>
          </Card>
        ))}
      </div>
      <Card>
        <div className="border-b border-line p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name or email" className="pl-9" aria-label="Search users" />
          </div>
        </div>
        <Table
          head={
            <tr>
              <th className={th}>User</th>
              <th className={th}>Role</th>
              <th className={th}>Active</th>
              <th className={cn(th, 'hidden md:table-cell')}>Last login</th>
              <th className={cn(th, 'hidden md:table-cell')}>Joined</th>
            </tr>
          }
        >
          {data?.data.map((u) => (
            <tr key={u.id} className="hover:bg-surface-2/40">
              <td className={td}>
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted">{initials(u.name)}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">
                      {u.name} {u.id === me?.id && <Badge tone="brand" className="ml-1">You</Badge>}
                    </p>
                    <p className="truncate text-xs text-subtle">{u.email}</p>
                  </div>
                </div>
              </td>
              <td className={td}>
                {canManage(u) ? (
                  <Select value={u.role} onChange={(e) => update(u, { role: e.target.value as Role })} className="h-9 w-40 text-sm" aria-label={`Role for ${u.name}`}>
                    {(assignable.includes(u.role) ? assignable : [u.role, ...assignable]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone="neutral">{ROLE_LABELS[u.role]}</Badge>
                )}
              </td>
              <td className={td}>
                <Switch checked={u.status === 'ACTIVE'} disabled={!canManage(u)} onChange={(v) => update(u, { status: v ? 'ACTIVE' : 'SUSPENDED' })} />
              </td>
              <td className={cn(td, 'hidden text-xs text-muted md:table-cell')}>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</td>
              <td className={cn(td, 'hidden text-xs text-muted md:table-cell')}>{timeAgo(u.createdAt)}</td>
            </tr>
          ))}
        </Table>
        {data && <div className="border-t border-line px-4"><Pager page={page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={setPage} /></div>}
      </Card>

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="Add a user"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} loading={busy}>Create user</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="u-name"><Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="u-email"><Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Temporary password" htmlFor="u-pass" hint="At least 8 characters with a letter and a number."><Input id="u-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Role" htmlFor="u-role" hint={ROLE_HELP[form.role]}>
            <Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {assignable.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </>
  );
}
