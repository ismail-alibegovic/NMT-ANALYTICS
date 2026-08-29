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

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock,
        })),
      })),
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
  app.post('/api/public/forms/:slug', async (req, res) => {
    const { submitPublicForm } = await import('../routes/publicFormsHandlers')
    return submitPublicForm(req, res)
  })
})

beforeEach(() => {
  maybeSingleMock.mockReset()
  rpcMock.mockReset()
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
})
