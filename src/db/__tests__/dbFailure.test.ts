import { describe, it, expect, afterEach } from 'vitest';
import type { Response } from 'express';
import { isDatabaseUnavailable } from '../dbFailure';
import { sendDataError } from '../../middleware/platform/security';

function fakeRes() {
  const state: { statusCode: number | null; body: Record<string, unknown> | null } = {
    statusCode: null,
    body: null,
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      state.body = body;
      return res;
    },
    setHeader() {
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('isDatabaseUnavailable — must stay tight', () => {
  it.each([
    ['ECONNREFUSED socket', { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:5432' }],
    ['ETIMEDOUT socket', { code: 'ETIMEDOUT', message: 'connect ETIMEDOUT 10.0.0.1:5432' }],
    ['pg connect timeout', { message: 'timeout expired' }],
    ['connection terminated', { message: 'Connection terminated unexpectedly' }],
    ['invalid password SQLSTATE', { code: '28P01', message: 'password authentication failed' }],
    ['unknown database SQLSTATE', { code: '3D000', message: 'database "app" does not exist' }],
    ['missing pg_hba entry', { message: 'no pg_hba.conf entry for host "1.2.3.4"' }],
    ['too many connections', { code: '53300', message: 'sorry, too many clients already' }],
  ])('classifies %s as unavailable', (_label, thrown) => {
    const error = new Error(String((thrown as { message: string }).message));
    Object.assign(error, thrown);
    expect(isDatabaseUnavailable(error)).toBe(true);
  });

  it('is false for application-level failures (those must stay 500)', () => {
    expect(isDatabaseUnavailable(new Error('invalid input syntax for type integer: "abc"'))).toBe(false);
    expect(isDatabaseUnavailable(new Error('duplicate key value violates unique constraint'))).toBe(false);
    expect(isDatabaseUnavailable(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
    expect(isDatabaseUnavailable(new Error('boom'))).toBe(false);
    expect(isDatabaseUnavailable('ECONNREFUSED 5432')).toBe(true); // raw driver string
    expect(isDatabaseUnavailable(null)).toBe(false);
    expect(isDatabaseUnavailable(undefined)).toBe(false);
  });

  it('reads a pg SQLSTATE without an Error wrapper', () => {
    expect(isDatabaseUnavailable({ code: '08006' })).toBe(true);
    expect(isDatabaseUnavailable({ code: '23505' })).toBe(false);
  });

  it('walks the cause chain that repositories attach to their domain message', () => {
    const driver = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });
    const wrapped = new Error('Không thể tải danh sách cổ phiếu từ cơ sở dữ liệu.', { cause: driver });
    expect(isDatabaseUnavailable(wrapped)).toBe(true);

    const deep = new Error('outer', { cause: new Error('inner', { cause: driver }) });
    expect(isDatabaseUnavailable(deep)).toBe(true);

    const benign = new Error('Không thể tìm thấy thông tin cổ phiếu X.', {
      cause: new Error('no rows returned'),
    });
    expect(isDatabaseUnavailable(benign)).toBe(false);
  });
});

describe('sendDataError — status mapping', () => {
  it('answers 503 + DATA_UNAVAILABLE when Postgres is unreachable', () => {
    const { res, state } = fakeRes();
    const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
      code: 'ECONNREFUSED',
    });
    sendDataError(res, 'Lỗi khi phân tích dòng tiền', error);

    expect(state.statusCode).toBe(503);
    expect(state.body).toMatchObject({
      error: 'Lỗi khi phân tích dòng tiền',
      code: 'DATA_UNAVAILABLE',
      dataStatus: 'DATA_UNAVAILABLE',
    });
  });

  it('keeps a genuine handler bug as 500 without a dependency code', () => {
    const { res, state } = fakeRes();
    sendDataError(res, 'Lỗi hệ thống', new Error('x is not a function'));
    expect(state.statusCode).toBe(500);
    expect(state.body).not.toHaveProperty('dataStatus');
    expect(state.body?.error).toBe('Lỗi hệ thống');
  });

  it('never exposes the driver message in production', () => {
    process.env.NODE_ENV = 'production';
    const { res, state } = fakeRes();
    const error = Object.assign(new Error('password authentication failed for user "postgres"'), {
      code: '28P01',
    });
    sendDataError(res, 'Lỗi khi tải danh sách cổ phiếu', error);

    expect(state.statusCode).toBe(503);
    expect(state.body).not.toHaveProperty('dev');
    expect(JSON.stringify(state.body)).not.toContain('password');
    expect(JSON.stringify(state.body)).not.toContain('postgres');
  });

  it('keeps development diagnostics on the 503 branch', () => {
    process.env.NODE_ENV = 'development';
    const { res, state } = fakeRes();
    sendDataError(res, 'Lỗi khi tải danh sách cổ phiếu', new Error('timeout expired'));
    expect(state.statusCode).toBe(503);
    expect(state.body?.dev).toBe('timeout expired');
  });
});
