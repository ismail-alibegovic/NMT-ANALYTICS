import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const ORG = '00000000-0000-4000-8000-000000000111'

const PACKAGE_A = '9a000000-0000-4000-8000-000000000001'
const PACKAGE_B = '9a000000-0000-4000-8000-000000000002'
const DEPARTURE_A = 'da000000-0000-4000-8000-000000000001'
const DEPARTURE_B = 'da000000-0000-4000-8000-000000000002'
const DEPARTURE_A2 = 'da000000-0000-4000-8000-000000000003'
const FORM_ID = 'f1000000-0000-4000-8000-000000000001'
const NON_EXISTENT = 'ff000000-0000-4000-8000-000000000000'

const { hoistedMaybeSingle, hoistedSingle } = vi.hoisted(() => {
  return { hoistedMaybeSingle: vi.fn(), hoistedSingle: vi.fn() }
})

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../lib/supabase', () => {
  function chain() {
    const c: any = {}
    c.select = vi.fn(() => c)
    c.eq = vi.fn(() => c)
    c.update = vi.fn(() => c)
    c.order = vi.fn(() => c)
    c.maybeSingle = hoistedMaybeSingle
    c.single = hoistedSingle
    return c
  }
  return {
    supabaseAdmin: {
      from: vi.fn(() => chain()),
    },
    handleSupabaseError: (res: Response, _error: unknown, message: string) =>
      res.status(500).json({ code: 'DB_ERROR', message }),
  }
})

let app: express.Express

beforeAll(async () => {
  app = express()
  app.use(express.json())

  const router = (await import('../routes/publicForms')).default
  app.use('/api', router)

  app.use((req: any, _res: Response, next: NextFunction) => {
    req.orgId = ORG
    next()
  })
})

beforeEach(() => {
  hoistedMaybeSingle.mockReset()
  hoistedSingle.mockReset()
})

function existingForm(overrides: Record<string, any> = {}) {
  return {
    data: {
      id: FORM_ID,
      package_id: PACKAGE_A,
      departure_id: DEPARTURE_A,
      ...overrides,
    },
    error: null,
  }
}

function validPackage(pkgId: string = PACKAGE_A) {
  return { data: { id: pkgId }, error: null }
}

function validDeparture(depId: string, pkgId: string = PACKAGE_A) {
  return { data: { id: depId, package_id: pkgId }, error: null }
}

function notFound() {
  return { data: null, error: null }
}

function updatedForm() {
  return {
    data: {
      id: FORM_ID,
      org_id: ORG,
      title: 'Test Form',
      slug: 'test-form',
      active: true,
      fields: [],
      package_id: PACKAGE_A,
      departure_id: DEPARTURE_A,
      thank_you_message: 'Thanks!',
      created_by: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    error: null,
  }
}

describe('PATCH /api/forms/:id — context validation', () => {

  // ── Bug reproduction: mismatch scenarios ──

  it('rejects when changing only departureId to a departure from another package', async () => {
    // existing: package=A, departure=A; request: departureId=B (pkg B)
    // effective: package=A, departure=B → mismatch
    // maybeSingle calls: 1=load form, 2=validate package A, 3=validate departure B
    hoistedMaybeSingle
      .mockResolvedValueOnce(existingForm())
      .mockResolvedValueOnce(validPackage(PACKAGE_A))
      .mockResolvedValueOnce(validDeparture(DEPARTURE_B, PACKAGE_B))

    const res = await request(app)
      .patch(`/api/forms/${FORM_ID}`)
      .send({ departureId: DEPARTURE_B })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('departure_package_mismatch')
  })

  it('rejects when changing only packageId while existing departure belongs to another package', async () => {
    // existing: package=A, departure=A; request: packageId=B
    // effective: package=B, departure=A → mismatch (dep A belongs to pkg A, not B)
    // maybeSingle: 1=load form, 2=validate package B, 3=validate departure A
    hoistedMaybeSingle
      .mockResolvedValueOnce(existingForm())
      .mockResolvedValueOnce(validPackage(PACKAGE_B))
      .mockResolvedValueOnce(validDeparture(DEPARTURE_A, PACKAGE_A))

    const res = await request(app)
      .patch(`/api/forms/${FORM_ID}`)
      .send({ packageId: PACKAGE_B })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('departure_package_mismatch')
  })

  // ── Happy path ──

  it('accepts valid partial departure update within the same package', async () => {
    // existing: package=A, departure=A; request: departureId=A2 (also pkg A)
    // maybeSingle: 1=load form, 2=validate package A, 3=validate departure A2
    hoistedMaybeSingle
      .mockResolvedValueOnce(existingForm())
      .mockResolvedValueOnce(validPackage(PACKAGE_A))
      .mockResolvedValueOnce(validDeparture(DEPARTURE_A2, PACKAGE_A))
    hoistedSingle.mockResolvedValueOnce(updatedForm())

    const res = await request(app)
      .patch(`/api/forms/${FORM_ID}`)
      .send({ departureId: DEPARTURE_A2 })

    expect(res.status).toBe(200)
  })

  it('preserves existing packageId when only departureId is patched with matching package', async () => {
    // same scenario as above — verifies effective merge logic
    hoistedMaybeSingle
      .mockResolvedValueOnce(existingForm())
      .mockResolvedValueOnce(validPackage(PACKAGE_A))
      .mockResolvedValueOnce(validDeparture(DEPARTURE_A2, PACKAGE_A))
    hoistedSingle.mockResolvedValueOnce(updatedForm())

    const res = await request(app)
      .patch(`/api/forms/${FORM_ID}`)
      .send({ departureId: DEPARTURE_A2 })

    expect(res.status).toBe(200)
  })

  // ── Explicit null to unlink ──

  it('accepts clearing departureId with null', async () => {
    // request: departureId=null → effective departure=null
    // maybeSingle: 1=load form, 2=validate package A (departure=null skipped)
    hoistedMaybeSingle
      .mockResolvedValueOnce(existingForm())
      .mockResolvedValueOnce(validPackage(PACKAGE_A))
    hoistedSingle.mockResolvedValueOnce(updatedForm())

    const res = await request(app)
      .patch(`/api/forms/${FORM_ID}`)
      .send({ departureId: null })

    expect(res.status).toBe(200)
  })

  it('accepts clearing packageId and departureId together', async () => {
    // request: packageId=null, departureId=null → effective both null
    // maybeSingle: 1=load form only (no validation for null values)
    hoistedMaybeSingle.mockResolvedValueOnce(existingForm())
    hoistedSingle.mockResolvedValueOnce(updatedForm())

    const res = await request(app)
      .patch(`/api/forms/${FORM_ID}`)
      .send({ packageId: null, departureId: null })

    expect(res.status).toBe(200)
  })

  // ── Cross-org rejection ──

  it('rejects cross-org package', async () => {
    // existing: no links; request: packageId=A
    // maybeSingle: 1=load form, 2=validate package A → not found
    hoistedMaybeSingle
      .mockResolvedValueOnce(existingForm({ package_id: null, departure_id: null }))
      .mockResolvedValueOnce(notFound())

    const res = await request(app)
      .patch(`/api/forms/${FORM_ID}`)
      .send({ packageId: PACKAGE_A })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('invalid_package')
  })

  it('rejects cross-org departure', async () => {
    // existing: no links; request: departureId=A
    // maybeSingle: 1=load form, 2=validate departure A → not found
    hoistedMaybeSingle
      .mockResolvedValueOnce(existingForm({ package_id: null, departure_id: null }))
      .mockResolvedValueOnce(notFound())

    const res = await request(app)
      .patch(`/api/forms/${FORM_ID}`)
      .send({ departureId: DEPARTURE_A })

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('invalid_departure')
  })

  // ── Not found ──

  it('returns 404 when form does not exist in org', async () => {
    hoistedMaybeSingle.mockResolvedValueOnce(notFound())

    const res = await request(app)
      .patch(`/api/forms/${NON_EXISTENT}`)
      .send({ title: 'New Title' })

    expect(res.status).toBe(404)
  })
})
