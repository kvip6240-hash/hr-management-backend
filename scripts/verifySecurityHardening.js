/**
 * Security hardening verification suite.
 *
 * Covers: DB health, NoSQL injection, generated temporary passwords, employee ID
 * counter, token revocation on logout, change-password, path traversal in leave
 * attachments, durable GridFS document storage, task input validation.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'dedicated-security-test-secret-at-least-32-characters';
process.env.JWT_REFRESH_SECRET = 'dedicated-security-refresh-test-secret-at-least-32';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { app } = require('../server');
const { connectTestDatabase } = require('./testDatabase');
const User = require('../models/User');
const HRDocument = require('../models/HRDocument');
const { generateAccessToken } = require('../utils/jwt');

let base;
let passed = 0;
const ok = (cond, msg) => {
  assert(cond, msg);
  passed += 1;
  console.log(`  [PASS] ${msg}`);
};

const api = async (method, url, { token, body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${url}`, { method, headers, body: payload });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString('utf8')); } catch (_) { /* binary */ }
  return { status: res.status, body: json, raw: buf };
};

const login = async (email, password) => api('POST', '/api/auth/login', { body: { email, password } });

async function run() {
  await connectTestDatabase();
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  const hr = await User.create({ firstName: 'Sec', lastName: 'HR', email: 'sec.hr@example.com', password: 'HrPassword123', role: 'HR' });
  const hrToken = generateAccessToken(hr);

  console.log('\n--- Health & injection ---');
  const health = await api('GET', '/api/health');
  ok(health.status === 200 && health.body.database === 'connected', 'Health check reports database connected');
  const inj = await api('POST', '/api/auth/login', { body: { email: { $ne: null }, password: { $ne: null } } });
  ok(inj.status === 422, 'NoSQL operator login payload is rejected');

  console.log('\n--- Temporary password & employee IDs ---');
  const created = await api('POST', '/api/hr/employees', {
    token: hrToken,
    body: { firstName: 'Temp', lastName: 'User', email: 'temp.user@example.com', department: 'Tech', designation: 'Engineer' }
  });
  ok(created.status === 201, 'Employee created without a password');
  const tempPassword = created.body.data.temporaryPassword;
  ok(typeof tempPassword === 'string' && tempPassword.length === 12 && tempPassword !== 'Password@123', 'Random 12-char temporary password returned (no shared default)');
  ok(created.body.data.employeeId === 'EMP1001', `First auto employee ID is EMP1001 (got ${created.body.data.employeeId})`);
  const oldDefault = await login('temp.user@example.com', 'Password@123');
  ok(oldDefault.status === 401, 'Old shared default password no longer works');

  const concurrent = await Promise.all([1, 2, 3, 4, 5].map((i) => api('POST', '/api/hr/employees', {
    token: hrToken,
    body: { firstName: `C${i}`, lastName: 'User', email: `c${i}.user@example.com`, password: 'Password123', department: 'Tech', designation: 'Engineer' }
  })));
  const ids = concurrent.map((r) => r.body && r.body.data && r.body.data.employeeId);
  ok(concurrent.every((r) => r.status === 201) && new Set(ids).size === 5, `Concurrent creates receive unique IDs (${ids.join(', ')})`);
  ok(concurrent.every((r) => r.body.data.temporaryPassword === undefined), 'No temporary password is returned when HR sets one');

  const weak = await api('POST', '/api/hr/employees', {
    token: hrToken,
    body: { firstName: 'Weak', lastName: 'Pw', email: 'weak.pw@example.com', password: 'abcdef', department: 'Tech', designation: 'Engineer' }
  });
  ok(weak.status === 422, 'Weak HR-set password (6 letters) is rejected');

  console.log('\n--- Login, change password, logout revocation ---');
  const staffLogin = await login('temp.user@example.com', tempPassword);
  ok(staffLogin.status === 200 && staffLogin.body.data.user.mustChangePassword === true, 'Login with temporary password flags mustChangePassword');
  const staffToken = staffLogin.body.data.accessToken;

  const wrongCurrent = await api('POST', '/api/auth/change-password', { token: staffToken, body: { currentPassword: 'nope', newPassword: 'NewPassword123' } });
  ok(wrongCurrent.status === 400, 'Change password rejects wrong current password');
  const weakNew = await api('POST', '/api/auth/change-password', { token: staffToken, body: { currentPassword: tempPassword, newPassword: 'short' } });
  ok(weakNew.status === 422, 'Change password rejects weak new password');
  const changed = await api('POST', '/api/auth/change-password', { token: staffToken, body: { currentPassword: tempPassword, newPassword: 'NewPassword123' } });
  ok(changed.status === 200 && changed.body.data.accessToken, 'Change password succeeds and returns fresh tokens');
  const oldTokenAfterChange = await api('GET', '/api/staff/profile', { token: staffToken });
  ok(oldTokenAfterChange.status === 401, 'Access token issued before password change is revoked');
  const newToken = changed.body.data.accessToken;
  const profile = await api('GET', '/api/staff/profile', { token: newToken });
  ok(profile.status === 200, 'New access token works');
  const relogin = await login('temp.user@example.com', 'NewPassword123');
  ok(relogin.status === 200 && relogin.body.data.user.mustChangePassword === false, 'mustChangePassword cleared after change');

  const sessionToken = relogin.body.data.accessToken;
  const refreshToken = relogin.body.data.refreshToken;
  const logout = await api('POST', '/api/auth/logout', { token: sessionToken });
  ok(logout.status === 200, 'Logout succeeds');
  const afterLogout = await api('GET', '/api/staff/profile', { token: sessionToken });
  ok(afterLogout.status === 401, 'Access token is rejected after logout');
  const refreshAfterLogout = await api('POST', '/api/auth/refresh-token', { body: { refreshToken } });
  ok(refreshAfterLogout.status === 401, 'Refresh token is rejected after logout');

  console.log('\n--- Path traversal in leave attachments ---');
  const staff2 = await login('c1.user@example.com', 'Password123');
  const staff2Token = staff2.body.data.accessToken;
  const traversal = await api('POST', '/api/staff/leaves', {
    token: staff2Token,
    body: { leaveType: 'SICK', startDate: '2030-01-10', endDate: '2030-01-10', reason: 'test', documentUrl: '/uploads/documents/../../package.json' }
  });
  ok(traversal.status === 400, `documentUrl path traversal is rejected (status ${traversal.status})`);
  const leakedDoc = await HRDocument.findOne({ fileName: /package\.json/ });
  ok(!leakedDoc, 'No document record was created for a file outside uploads/');

  console.log('\n--- Durable GridFS document storage ---');
  const employee = created.body.data;
  const content = Buffer.from('%PDF-1.4\n% durable storage test\n');
  const form = new FormData();
  form.append('title', 'Offer Letter');
  form.append('category', 'Other');
  form.append('file', new Blob([content], { type: 'application/pdf' }), 'offer.pdf');
  const upload = await api('POST', `/api/hr/employees/${employee._id}/documents`, { token: hrToken, form });
  ok(upload.status === 201 && upload.body.data.storageId, 'Uploaded document is stored in GridFS (storageId set)');
  const docId = upload.body.data._id;
  const diskPath = path.join(__dirname, '..', 'uploads', 'documents', upload.body.data.fileName);
  fs.unlinkSync(diskPath); // simulate a Render redeploy wiping the local disk
  const download = await api('GET', `/api/hr/documents/${docId}/download`, { token: hrToken });
  ok(download.status === 200 && download.raw.equals(content), 'Document still downloads after the local file is gone');

  const badExt = new FormData();
  badExt.append('file', new Blob(['<script>alert(1)</script>'], { type: 'application/pdf' }), 'evil.html');
  const badUpload = await api('POST', `/api/hr/employees/${employee._id}/documents`, { token: hrToken, form: badExt });
  ok(badUpload.status === 400, 'HTML file disguised with a PDF MIME type is rejected');

  console.log('\n--- Task input validation ---');
  const noDesc = await api('POST', '/api/hr/tasks', { token: hrToken, body: { employeeId: 'EMP1001' } });
  ok(noDesc.status === 422, 'Task without description is rejected with 422 (was a 500 crash)');
  const badTaskId = await api('GET', '/api/hr/tasks/not-an-id', { token: hrToken });
  ok(badTaskId.status === 400, 'Invalid task ID is rejected with 400');

  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`\nALL ${passed} SECURITY HARDENING CHECKS PASSED\n`);
  process.exit(0);
}

run().catch(async (err) => {
  console.error('\nSecurity hardening verification failed:', err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
