import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { NextFunction, Request, Response } from 'express'

const handlerState = vi.hoisted(() => ({
  getPublicForm: vi.fn(async (req: Request, res: Response) => res.json({ wired: 'get', slug: req.params.slug })),
  submitPublicForm: vi.fn(async (req: Request, res: Response) => res.status(201).json({ wired: 'post', slug: req.params.slug })),
}))

vi.mock('../routes/publicFormsHandlers', () => ({
  getPublicForm: handlerState.getPublicForm,
  submitPublicForm: handlerState.submitPublicForm,
}))

vi.mock('../middleware/requireOrgContext', () => ({
  requireOrgContext: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).orgId = 'org-1'
    next()
  },
}))

vi.mock('../middleware/authenticateToken', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    // Simulate an authenticated agent — role below manager — so the REAL
    // requireMinimumRole('manager') middleware must reject admin writes.
    (req as any).user = { id: 'user-1', role: 'agent' }
    next()
  },
}))

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: { rpc: vi.fn(async () => ({ data: null, error: null })) },
  handleSupabaseError: vi.fn(),
}))

vi.mock('../middleware/auditLogger', () => ({
  auditLog: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

let app: express.Express

beforeAll(async () => {
  app = express()
  app.use(express.json())
  const router = (await import('../routes/publicForms')).default
  app.use('/api', router)
})

beforeEach(() => {
  handlerState.getPublicForm.mockClear()
  handlerState.submitPublicForm.mockClear()
})

describe('Public forms route wiring', () => {
  it('GET /public/forms/:slug delegates to the hardened handler', async () => {
    const res = await request(app).get('/api/public/forms/umrah-inquiry')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ wired: 'get', slug: 'umrah-inquiry' })
    expect(handlerState.getPublicForm).toHaveBeenCalledTimes(1)
  })

  it('POST /public/forms/:slug delegates to the hardened handler', async () => {
    const res = await request(app).post('/api/public/forms/umrah-inquiry').send({})

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ wired: 'post', slug: 'umrah-inquiry' })
    expect(handlerState.submitPublicForm).toHaveBeenCalledTimes(1)
    expect(handlerState.getPublicForm).not.toHaveBeenCalled()
  })

  it('admin form routes keep their role gating', async () => {
    const express = (await import('express')).default
    const { default: router } = await import('../routes/publicForms')

    const app = express()
    app.use(express.json())
    app.use('/api', router)

    // Authenticated agent (below manager) → the REAL requireMinimumRole('manager')
    // middleware must reject with 403. This proves admin writes stay gated.
    const res = await request(app).post('/api/forms').send({ title: 'x', slug: 'x', fields: [] })
    expect(res.status).toBe(403)
  })
})
