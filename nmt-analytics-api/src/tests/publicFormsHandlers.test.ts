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
        mapped_contact_name: 'Test User',
        mapped_phone: '+38761240679',
      },
    })
  })
})
