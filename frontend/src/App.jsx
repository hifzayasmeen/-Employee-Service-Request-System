import { useState, useEffect, useCallback } from 'react';
import { api, setToken, hasToken } from './api';

const fmt = t => new Date(t).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
const DEMO = [['Asha (Employee)', 'asha@corp.com'], ['Meera (IT agent)', 'meera@corp.com'], ['Karan (HR agent)', 'karan@corp.com'], ['Admin', 'admin@corp.com']];

function Login({ onLogin }) {
  const [email, setEmail] = useState('asha@corp.com');
  const [password, setPassword] = useState(import.meta.env.DEV ? 'Password@123' : '');
  const [err, setErr] = useState('');
  const [forgot, setForgot] = useState(false);
  const [notice, setNotice] = useState('');
  const [resetUrl, setResetUrl] = useState('');
  const go = async e => {
    e.preventDefault(); setErr('');
    try { const d = await api('/auth/login', { method: 'POST', body: { email, password } }); setToken(d.token); onLogin(d.user); }
    catch (x) { setErr(x.message); }
  };
  const requestReset = async e => {
    e.preventDefault(); setErr(''); setNotice(''); setResetUrl('');
    try {
      const data = await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setNotice(data.message);
      setResetUrl(data.developmentResetUrl || '');
    } catch (x) { setErr(x.message); }
  };
  return (
    <main className="narrow">
      <h1>Service Desk</h1>
      {forgot ? (
        <form className="card" onSubmit={requestReset}>
          <h2>Reset password</h2>
          <label>Account email<input value={email} onChange={e => setEmail(e.target.value)} type="email" required /></label>
          {err && <p className="err" role="alert">{err}</p>}
          {notice && <p className="mut" role="status">{notice}</p>}
          {resetUrl && <p><a href={resetUrl}>Open development reset link</a></p>}
          <button>Send reset link</button>
          <button type="button" className="ghost" onClick={() => { setForgot(false); setErr(''); setNotice(''); }}>Back to sign in</button>
        </form>
      ) : (
        <>
      <form className="card" onSubmit={go}>
        <label>Email<input value={email} onChange={e => setEmail(e.target.value)} type="email" required /></label>
        <label>Password<input value={password} onChange={e => setPassword(e.target.value)} type="password" required /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <button>Sign in</button>
        <button type="button" className="ghost" onClick={() => { setForgot(true); setErr(''); }}>Forgot password?</button>
      </form>
      {import.meta.env.DEV && <>
        <p className="mut">Demo accounts (password Password@123):</p>
        <div className="chips">{DEMO.map(([n, m]) => <button key={m} className="ghost" onClick={() => setEmail(m)}>{n}</button>)}</div>
      </>}
        </>
      )}
    </main>
  );
}

function PasswordReset({ token }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr('');
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      setToken(null);
      sessionStorage.removeItem('user');
      setDone(true);
    } catch (error) { setErr(error.message); }
  };
  return (
    <main className="narrow">
      <h1>Service Desk</h1>
      <form className="card" onSubmit={submit}>
        <h2>{done ? 'Password updated' : 'Choose a new password'}</h2>
        {done ? <><p className="mut">You can now sign in with your new password.</p><button type="button" onClick={() => window.location.assign('/')}>Return to sign in</button></> : <>
          <label>New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required /></label>
          <label>Confirm password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={8} required /></label>
          {err && <p className="err" role="alert">{err}</p>}
          <button>Update password</button>
          <p className="mut">Reset links expire after one hour and can only be used once.</p>
        </>}</form>
      {!done && <p><a href="/">Back to sign in</a></p>}
    </main>
  );
}

function NewRequest({ onDone }) {
  const [f, setF] = useState({ title: '', description: '', category: 'IT', priority: 'Medium' });
  const [err, setErr] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr('');
    try { await api('/requests', { method: 'POST', body: f }); setF({ ...f, title: '', description: '' }); onDone(); }
    catch (x) { setErr(x.message); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h2>Raise a request</h2>
      <div className="grid">
        <label>Category<select value={f.category} onChange={set('category')}><option>IT</option><option>HR</option><option>Facility</option></select></label>
        <label>Priority<select value={f.priority} onChange={set('priority')}><option>Low</option><option>Medium</option><option>High</option></select></label>
      </div>
      <label>Title<input value={f.title} onChange={set('title')} maxLength={80} /></label>
      <label>Details<textarea rows={3} value={f.description} onChange={set('description')} maxLength={500} /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button>Submit request</button>
      <p className="mut">SLA: High 4h, Medium 24h, Low 72h.</p>
    </form>
  );
}

function Sla({ r }) {
  if (['Resolved', 'Closed'].includes(r.status)) return <span className="ok">Done</span>;
  const m = Math.round((new Date(r.due_at) - Date.now()) / 60000);
  return m < 0 ? <span className="bad">SLA breached {Math.round(-m / 60)}h ago</span> : <span>{Math.floor(m / 60)}h {m % 60}m left</span>;
}

function UserManagement({ users, onRefresh }) {
  const [draft, setDraft] = useState({ name: '', email: '', password: '', role: 'employee', team: '' });
  const [edits, setEdits] = useState({});
  const [message, setMessage] = useState('');
  const update = (id, field, value) => setEdits(current => ({
    ...current,
    [id]: { ...users.find(user => user.id === id), ...current[id], [field]: value },
  }));

  const create = async e => {
    e.preventDefault(); setMessage('');
    try {
      await api('/users', { method: 'POST', body: { ...draft, team: draft.role === 'agent' ? draft.team : null } });
      setDraft({ name: '', email: '', password: '', role: 'employee', team: '' });
      await onRefresh();
      setMessage('Account created.');
    } catch (error) { setMessage(error.message); }
  };

  const save = async (e, user) => {
    e.preventDefault(); setMessage('');
    const values = edits[user.id] || user;
    const body = { name: values.name, role: values.role, team: values.role === 'agent' ? values.team : null, active: values.active };
    if (values.password) body.password = values.password;
    try {
      await api(`/users/${user.id}`, { method: 'PATCH', body });
      setEdits(current => { const next = { ...current }; delete next[user.id]; return next; });
      await onRefresh();
      setMessage('Account updated.');
    } catch (error) { setMessage(error.message); }
  };

  return (
    <section className="card">
      <h2>User management</h2>
      <form className="user-create" onSubmit={create}>
        <label>Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required minLength={2} maxLength={80} /></label>
        <label>Email<input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} required /></label>
        <label>Temporary password<input type="password" value={draft.password} onChange={e => setDraft({ ...draft, password: e.target.value })} required minLength={8} /></label>
        <label>Role<select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value, team: '' })}><option value="employee">Employee</option><option value="agent">Agent</option><option value="admin">Admin</option></select></label>
        {draft.role === 'agent' && <label>Team<select value={draft.team} onChange={e => setDraft({ ...draft, team: e.target.value })} required><option value="">Choose team</option><option>IT</option><option>HR</option><option>Facility</option></select></label>}
        <button>Create account</button>
      </form>
      <div className="user-list">
        {users.map(user => {
          const values = edits[user.id] || user;
          return (
            <form className="user-row" key={user.id} onSubmit={e => save(e, user)}>
              <label>Name<input value={values.name} onChange={e => update(user.id, 'name', e.target.value)} required minLength={2} maxLength={80} /></label>
              <label>Email<input value={user.email} readOnly /></label>
              <label>Role<select value={values.role} onChange={e => setEdits(current => ({ ...current, [user.id]: { ...user, ...current[user.id], role: e.target.value, team: e.target.value === 'agent' ? (current[user.id]?.team || user.team || '') : '' } }))}><option value="employee">Employee</option><option value="agent">Agent</option><option value="admin">Admin</option></select></label>
              <label>Team<select value={values.team || ''} disabled={values.role !== 'agent'} onChange={e => update(user.id, 'team', e.target.value)}><option value="">No team</option><option>IT</option><option>HR</option><option>Facility</option></select></label>
              <label>New password<input type="password" value={values.password || ''} onChange={e => update(user.id, 'password', e.target.value)} minLength={8} placeholder="Leave blank to keep" /></label>
              <label className="active-toggle"><input type="checkbox" checked={values.active} onChange={e => update(user.id, 'active', e.target.checked)} /> Active</label>
              <button>Save</button>
            </form>
          );
        })}
      </div>
      {message && <p className="mut" role="status">{message}</p>}
    </section>
  );
}

export default function App() {
  const resetToken = new URLSearchParams(window.location.search).get('reset');
  const [user, setUser] = useState(() => { try { return hasToken() ? JSON.parse(sessionStorage.getItem('user')) : null; } catch { return null; } });
  const [reqPage, setReqPage] = useState({ items: [], page: 1, pageSize: 20, total: 0, pages: 0 });
  const [page, setPage] = useState(1);
  const [dash, setDash] = useState(null);
  const [logs, setLogs] = useState([]);
  const [agents, setAgents] = useState([]);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setErr('');
      const [requests, dashboard, alerts] = await Promise.all([
        api(`/requests?page=${page}&pageSize=20`), api('/dashboard'), api('/notifications'),
      ]);
      setReqPage(requests);
      setDash(dashboard);
      setNotifications(alerts);
      if (user?.role === 'admin') {
        const [audit, agentList, userList] = await Promise.all([api('/audit'), api('/agents'), api('/users')]);
        setLogs(audit); setAgents(agentList); setUsers(userList);
      }
    } catch (x) { setErr(x.message); }
  }, [user, page]);
  useEffect(() => { if (user) load(); }, [user, load]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => api('/notifications').then(setNotifications).catch(x => setErr(x.message)), 60000);
    return () => clearInterval(timer);
  }, [user]);

  const login = u => { sessionStorage.setItem('user', JSON.stringify(u)); setUser(u); };
  const logout = () => { setToken(null); sessionStorage.removeItem('user'); setUser(null); };
  const patch = async (id, body) => { try { await api('/requests/' + id, { method: 'PATCH', body }); await load(); } catch (x) { setErr(x.message); } };
  const requestCreated = () => { if (page === 1) load(); else setPage(1); };

  if (resetToken) return <PasswordReset token={resetToken} />;
  if (!user) return <Login onLogin={login} />;
  const n = k => dash?.byStatus.find(s => s.k === k)?.n || 0;
  const total = dash?.byStatus.reduce((a, s) => a + s.n, 0) || 0;

  return (
    <>
      <header><b>Service Desk</b><span>{user.name} · {user.role}{user.team ? ' · ' + user.team : ''} <button className="ghost" onClick={logout}>Sign out</button></span></header>
      <main>
        {err && <p className="err" role="alert">{err}</p>}
        {notifications.length > 0 && <section className="sla-alerts" role="status"><b>{notifications.length} SLA breach{notifications.length === 1 ? '' : 'es'}</b>{notifications.map(alert => <p key={alert.id}>#{alert.id} {alert.title} · {alert.category} · Due {fmt(alert.due_at)}</p>)}</section>}
        {user.role === 'employee' && <NewRequest onDone={requestCreated} />}
        <section className="card">
          <h2>{user.role === 'admin' ? 'Dashboard' : user.role === 'agent' ? `${user.team} queue` : 'My requests'}</h2>
          <div className="stats">
            <div><b>{total}</b>Total</div><div><b>{n('Open')}</b>Open</div><div><b>{n('In Progress')}</b>In progress</div>
            <div><b>{n('Resolved') + n('Closed')}</b>Resolved</div><div><b className="bad">{dash?.breached || 0}</b>SLA breached</div>
          </div>
          {user.role === 'admin' && <div className="breakdowns"><p><b>By team</b>{dash?.byCategory.map(c => `${c.k} ${c.n}`).join(' · ') || ' none yet'}</p><p><b>By priority</b>{dash?.byPriority.map(item => `${item.k} ${item.n}`).join(' · ') || ' none yet'}</p></div>}
        </section>
        <section className="card">
          <h2>Requests <span className="mut">({reqPage.total})</span></h2>
          {!reqPage.items.length && <p className="mut">{user.role === 'employee' ? 'No requests yet. Raise one above.' : 'Nothing in the queue.'}</p>}
          {reqPage.items.map(r => (
            <div className="req" key={r.id}>
              <b>#{r.id} {r.title}</b>
              <div><span className="tag">{r.category}</span><span className="tag">{r.priority}</span><span className="tag">{r.status}</span> <Sla r={r} /></div>
              <div className="mut">{r.description}<br />By {r.requester} · {fmt(r.created_at)} · Due {fmt(r.due_at)}{r.assignee && ` · Assigned: ${r.assignee}`}</div>
              {user.role !== 'employee' && (
                <div className="grid">
                  <select aria-label="Status" value={r.status} onChange={e => patch(r.id, { status: e.target.value })}>
                    {['Open', 'In Progress', 'Resolved', 'Closed'].map(s => <option key={s}>{s}</option>)}
                  </select>
                  {user.role === 'agent' && <button className="ghost" onClick={() => patch(r.id, { assign_to_me: true })}>Assign to me</button>}
                  {user.role === 'admin' && <select aria-label={`Assignee for request ${r.id}`} value={r.assignee_id || ''} onChange={e => patch(r.id, { assignee_id: e.target.value ? Number(e.target.value) : null })}><option value="">Unassigned</option>{agents.filter(agent => agent.team === r.category).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>}
                </div>
              )}
            </div>
          ))}
          {reqPage.pages > 1 && <nav className="pagination" aria-label="Request pages"><button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {reqPage.page} of {reqPage.pages}</span><button className="ghost" disabled={page >= reqPage.pages} onClick={() => setPage(page + 1)}>Next</button></nav>}
        </section>
        {user.role === 'admin' && <UserManagement users={users} onRefresh={load} />}
        {user.role === 'admin' && (
          <section className="card"><h2>Audit log</h2>
            <div className="log">{logs.map(l => <div key={l.id}>{fmt(l.created_at)} · <b>{l.actor}</b> · {l.request_id ? `#${l.request_id}` : 'Account'} {l.action}: {l.detail}</div>)}</div>
          </section>
        )}
      </main>
    </>
  );
}
