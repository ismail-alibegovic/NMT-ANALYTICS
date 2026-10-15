import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'

const formRow = {
  id: 'form-1',
  slug: 'umrah-interest',
  active: true,
  org_id: '00000000-0000-0000-0000-000000000111',
  fields: [
    { id: 'full_name', label: 'Ime i prezime', type: 'short_text', required: true, mapTo: 'contact_name' },
    { id: 'phone', label: 'Telefon', type: 'phone', required: true, mapTo: 'phone' },
  ],
}

const rpcMock = vi.fn()
const maybeSingleMock = vi.fn()
const dataResolvedMock = vi.fn().mockResolvedValue({ data: [], error: null })

const createChain = () => {
  const chain: any = {
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: maybeSingleMock,
    then: (resolve: any, reject: any) => dataResolvedMock().then(resolve, reject),
  }
  return chain
}

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => createChain()),
    })),
    rpc: rpcMock,
  },
  handleSupabaseError: (res: Response, _error: unknown, message: string) =>
    res.status(500).json({ code: 'DB_ERROR', message }),
}))

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (_req: Request, _res: Response, next: NextFunction) => next(),
}))

vi.mock('../middleware/requireRole', () => ({
  requireMinimumRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

let app: express.Express

beforeAll(async () => {
  app = express()
  app.use(express.json())
  app.get('/api/public/forms/:slug', async (req, res) => {
    const { getPublicForm } = await import('../routes/publicFormsHandlers')
    return getPublicForm(req, res)
  })
  app.post('/api/public/forms/:slug', async (req, res) => {
    const { submitPublicForm } = await import('../routes/publicFormsHandlers')
    return submitPublicForm(req, res)
  })
})

beforeEach(() => {
  maybeSingleMock.mockReset()
  rpcMock.mockReset()
  dataResolvedMock.mockReset().mockResolvedValue({ data: [], error: null })
})

describe('POST /api/public/forms/:slug', () => {
  it('calls the canonical submit_public_form RPC and returns inquiryId', async () => {
    maybeSingleMock.mockResolvedValue({ data: formRow, error: null })
    rpcMock.mockResolvedValue({
      data: { inquiry_id: 'inq-123', submission_id: 'sub-123' },
      error: null,
    })

    const res = await request(app)
      .post('/api/public/forms/umrah-interest')
      .send({
        full_name: 'Test User',
        phone: '+38761240679',
      })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ ok: true, inquiryId: 'inq-123' })
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('submit_public_form', {
      form_slug: 'umrah-interest',
      submission_data: {
        full_name: 'Test User',
        phone: '+38761240679',
      },
    })
  })

  it('rejects inactive forms', async () => {
    maybeSingleMock.mockResolvedValue({ data: { ...formRow, active: false }, error: null })

    const res = await request(app)
      .post('/api/public/forms/umrah-interest')
      .send({ full_name: 'Test User', phone: '+38761240679' })

    expect(res.status).toBe(404)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects missing required fields', async () => {
    maybeSingleMock.mockResolvedValue({ data: formRow, error: null })

    const res = await request(app)
      .post('/api/public/forms/umrah-interest')
      .send({ phone: '+38761240679' })

    expect(res.status).toBe(400)
    expect(res.body.message).toContain('required')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects invalid email/select/multiselect values', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          ...formRow,
          fields: [{ id: 'email_address', label: 'Email', type: 'email', required: true, mapTo: 'email' }],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...formRow,
          fields: [{ id: 'trip_type', label: 'Tip', type: 'select', required: true, options: ['umrah', 'hajj'] }],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...formRow,
          fields: [{ id: 'interests', label: 'Interests', type: 'multiselect', required: true, options: ['visa', 'hotel'] }],
        },
        error: null,
      })

    const invalidEmail = await request(app)
      .post('/api/public/forms/umrah-interest')
      .send({ email_address: 'bad' })
    const invalidSelect = await request(app)
      .post('/api/public/forms/umrah-interest')
      .send({ trip_type: 'other' })
    const invalidMulti = await request(app)
      .post('/api/public/forms/umrah-interest')
      .send({ interests: ['visa', 'bad'] })

    expect(invalidEmail.status).toBe(400)
    expect(invalidSelect.status).toBe(400)
    expect(invalidMulti.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('ignores malicious extra mapped fields and derives crm values only from configured fields', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        ...formRow,
        fields: [
          { id: 'contact', label: 'Contact', type: 'short_text', required: true, mapTo: 'contact_name' },
          { id: 'budget_amount', label: 'Budget', type: 'number', required: false, mapTo: 'budget' },
        ],
      },
      error: null,
    })
    rpcMock.mockResolvedValue({
      data: { inquiry_id: 'inq-123', submission_id: 'sub-123' },
      error: null,
    })

    const res = await request(app)
      .post('/api/public/forms/umrah-interest')
      .send({
        contact: 'Real Contact',
        budget_amount: '2400',
        full_name: 'Injected Name',
        budget: 1,
      })

    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith('submit_public_form', {
      form_slug: 'umrah-interest',
      submission_data: {
        contact: 'Real Contact',
        budget_amount: 2400,
        full_name: 'Real Contact',
        budget: 2400,
      },
    })
  })

  it('returns safe 400 for malformed payloads', async () => {
    maybeSingleMock.mockResolvedValue({ data: formRow, error: null })

    const res = await request(app)
      .post('/api/public/forms/umrah-interest')
      .send(['bad'])

    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Invalid submission payload')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('preserves valid departure_id and package_id overrides or defaults', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        ...formRow,
        package_id: '11111111-1111-1111-1111-111111111111',
        departure_id: '22222222-2222-2222-2222-222222222222',
      },
      error: null,
    })
    rpcMock.mockResolvedValue({
      data: { inquiry_id: 'inq-999', submission_id: 'sub-999' },
      error: null,
    })

    const customDep = '33333333-3333-3333-3333-333333333333'
    const res = await request(app)
      .post('/api/public/forms/umrah-interest')
      .send({
        full_name: 'Traveler Name',
        phone: '+38761111222',
        departureId: customDep,
      })

    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith('submit_public_form', {
      form_slug: 'umrah-interest',
      submission_data: {
        full_name: 'Traveler Name',
        phone: '+38761111222',
        departure_id: customDep,
        package_id: '11111111-1111-1111-1111-111111111111',
      },
    })
  })
})

describe('GET /api/public/forms/:slug', () => {
  it('returns form definition with package and departure availability context', async () => {
    const pkgId = '11111111-1111-1111-1111-111111111111'
    const depId = '22222222-2222-2222-2222-222222222222'

    // 1st call for form, 2nd call for package, 3rd call for departure
    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          ...formRow,
          title: 'Umra Proljeće 2026',
          description: 'Prijavite se za polazak',
          package_id: pkgId,
          departure_id: depId,
          thank_you_message: 'Hvala!',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: pkgId,
          name: 'Umra 10 dana',
          destination: 'Mekka & Medina',
          base_price: 2500,
          currency: 'BAM',
          duration_days: 10,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: depId,
          package_id: pkgId,
          depart_at: '2026-04-10T08:00:00Z',
          return_at: '2026-04-20T18:00:00Z',
          capacity: 45,
          booked: 30,
          status: 'active',
        },
        error: null,
      })

    const res = await request(app).get('/api/public/forms/umrah-interest')

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Umra Proljeće 2026')
    expect(res.body.package).toEqual({
      id: pkgId,
      name: 'Umra 10 dana',
      destination: 'Mekka & Medina',
      basePrice: 2500,
      currency: 'BAM',
      durationDays: 10,
    })
    expect(res.body.departure).toEqual({
      id: depId,
      packageId: pkgId,
      departAt: '2026-04-10T08:00:00Z',
      returnAt: '2026-04-20T18:00:00Z',
      capacity: 45,
      booked: 30,
      available: 15,
      status: 'active',
    })
  })

  it('returns 404 if form not found or inactive', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null })
    const res404 = await request(app).get('/api/public/forms/non-existent')
    expect(res404.status).toBe(404)

    maybeSingleMock.mockResolvedValueOnce({ data: { ...formRow, active: false }, error: null })
    const resInactive = await request(app).get('/api/public/forms/umrah-interest')
    expect(resInactive.status).toBe(404)
  })
})
