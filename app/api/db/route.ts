import { NextResponse } from 'next/server'
import { prisma } from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth-server'

type Filter = { type: 'eq' | 'gte' | 'lte' | 'lt' | 'or'; column?: string; value?: any; raw?: string }
type Order = { column: string; ascending: boolean }

interface DbRequest {
  table: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  payload?: any
  filters?: Filter[]
  order?: Order[]
  limit?: number
  single?: boolean
  count?: boolean
  select?: string
}

const TABLES: Record<
  string,
  { user: 'id' | 'user_id'; allowSystem?: boolean; relations?: Record<string, string> }
> = {
  profiles: { user: 'id' },
  wallets: { user: 'user_id' },
  categories: { user: 'user_id', allowSystem: true },
  transactions: { user: 'user_id', relations: { categories: 'category', wallets: 'wallet' } },
  budgets: { user: 'user_id', relations: { categories: 'category' } },
  budget_rollovers: { user: 'user_id' },
  metas: { user: 'user_id' },
  debts: { user: 'user_id' },
  debt_payments: { user: 'user_id' },
}

const DATE_COLS = new Set(['fecha', 'fecha_limite'])
const NUM_COLS = new Set([
  'monto', 'monto_limite', 'monto_total', 'monto_pagado', 'monto_objetivo', 'monto_actual',
  'saldo_inicial', 'credito_limite', 'mes', 'anio', 'fecha_corte', 'fecha_pago', 'posicion',
])
const BOOL_COLS = new Set(['activo', 'es_sistema', 'completada', 'onboarding_completado'])

// La columna "año" del frontend se llama "anio" en Prisma
const colIn = (c: string) => (c === 'año' ? 'anio' : c)

function coerce(column: string, value: any): any {
  if (value === undefined) return undefined
  if (DATE_COLS.has(column)) {
    if (value === '' || value === null) return null
    return new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`)
  }
  if (NUM_COLS.has(column)) {
    if (value === '' || value === null) return null
    return typeof value === 'number' ? value : Number(value)
  }
  if (BOOL_COLS.has(column)) {
    if (value === 'true') return true
    if (value === 'false') return false
    return Boolean(value)
  }
  if (column.endsWith('_id') && value === '') return null
  return value
}

function coercePayload(payload: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(payload || {})) {
    out[colIn(k)] = coerce(colIn(k), v)
  }
  return out
}

function serializeValue(key: string, v: any): any {
  if (v instanceof Date) {
    return DATE_COLS.has(key) ? v.toISOString().slice(0, 10) : v.toISOString()
  }
  return v
}

function serializeRow(row: any): any {
  if (row === null || typeof row !== 'object') return row
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(row)) {
    const key = k === 'anio' ? 'año' : k
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      out[key] = serializeRow(v)
    } else {
      out[key] = serializeValue(k, v)
    }
  }
  return out
}

// Divide el string de select por comas de nivel superior (respeta paréntesis)
function splitTopLevel(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  parts.push(cur)
  return parts.map(p => p.trim()).filter(Boolean)
}

// Devuelve [{ alias, prismaRelation }] a partir del select estilo PostgREST
function parseRelations(table: string, select?: string): { alias: string; rel: string }[] {
  if (!select) return []
  const cfg = TABLES[table]
  if (!cfg?.relations) return []
  const result: { alias: string; rel: string }[] = []
  for (const part of splitTopLevel(select)) {
    const idx = part.indexOf('(')
    if (idx === -1) continue
    let head = part.slice(0, idx) // ej: "categories" o "wallets:wallets!transactions_wallet_id_fkey"
    let alias = head
    if (head.includes(':')) {
      const [a, rest] = head.split(':')
      alias = a
      head = rest
    }
    const target = head.split('!')[0].trim()
    const rel = cfg.relations[target]
    if (rel) result.push({ alias: alias.trim(), rel })
  }
  return result
}

function buildWhere(table: string, userId: string, filters: Filter[]): any {
  const cfg = TABLES[table]
  const conditions: any[] = []

  // Scope de seguridad: cada usuario solo accede a sus datos
  if (cfg.user === 'id') {
    conditions.push({ id: userId })
  } else if (cfg.allowSystem) {
    conditions.push({ OR: [{ user_id: userId }, { es_sistema: true }] })
  } else {
    conditions.push({ user_id: userId })
  }

  for (const f of filters || []) {
    if (f.type === 'or' && f.raw) {
      const ors = f.raw.split(',').map(seg => {
        const [col, op, ...rest] = seg.trim().split('.')
        const c = colIn(col)
        const val = coerce(c, rest.join('.'))
        return op === 'eq' ? { [c]: val } : {}
      })
      conditions.push({ OR: ors })
    } else if (f.column) {
      const c = colIn(f.column)
      const val = coerce(c, f.value)
      if (f.type === 'eq') conditions.push({ [c]: val })
      else if (f.type === 'gte') conditions.push({ [c]: { gte: val } })
      else if (f.type === 'lte') conditions.push({ [c]: { lte: val } })
      else if (f.type === 'lt') conditions.push({ [c]: { lt: val } })
    }
  }

  return { AND: conditions }
}

export async function POST(req: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json(
      { data: null, error: { message: 'No autenticado' } },
      { status: 401 }
    )
  }

  let body: DbRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: { message: 'JSON inválido' } }, { status: 400 })
  }

  const cfg = TABLES[body.table]
  if (!cfg) {
    return NextResponse.json(
      { data: null, error: { message: `Tabla no permitida: ${body.table}` } },
      { status: 400 }
    )
  }

  const model = (prisma as any)[body.table]
  const where = buildWhere(body.table, session.id, body.filters || [])
  const relations = parseRelations(body.table, body.select)
  const include = relations.length
    ? Object.fromEntries(relations.map(r => [r.rel, true]))
    : undefined

  const remapRelations = (row: any) => {
    if (!row) return row
    for (const { alias, rel } of relations) {
      if (rel in row && alias !== rel) {
        row[alias] = row[rel]
        delete row[rel]
      } else if (rel in row) {
        row[alias] = row[rel]
        if (alias !== rel) delete row[rel]
      }
    }
    return row
  }

  try {
    switch (body.op) {
      case 'select': {
        if (body.count) {
          const count = await model.count({ where })
          return NextResponse.json({ data: [], count, error: null })
        }
        const orderBy = (body.order || []).map(o => ({
          [colIn(o.column)]: o.ascending ? 'asc' : 'desc',
        }))
        const rows = await model.findMany({
          where,
          ...(include ? { include } : {}),
          ...(orderBy.length ? { orderBy } : {}),
          ...(body.limit ? { take: body.limit } : {}),
          ...(body.single ? { take: 1 } : {}),
        })
        const data = rows.map((r: any) => serializeRow(remapRelations(r)))
        if (body.single) {
          if (data.length === 0) {
            return NextResponse.json({
              data: null,
              error: { code: 'PGRST116', message: 'No se encontraron filas' },
            })
          }
          return NextResponse.json({ data: data[0], error: null })
        }
        return NextResponse.json({ data, error: null })
      }

      case 'insert': {
        const items = Array.isArray(body.payload) ? body.payload : [body.payload]
        const created: any[] = []
        for (const item of items) {
          const data = coercePayload(item)
          if (cfg.user === 'id') data.id = session.id
          else data.user_id = session.id
          created.push(await model.create({ data }))
        }
        const out = created.map(serializeRow)
        return NextResponse.json({
          data: body.single ? out[0] : out,
          error: null,
        })
      }

      case 'update': {
        const data = coercePayload(body.payload)
        delete data.id
        if (cfg.user === 'id') delete data.user_id
        else data.user_id = session.id
        await model.updateMany({ where, data })
        return NextResponse.json({ data: null, error: null })
      }

      case 'upsert': {
        const data = coercePayload(body.payload)
        if (cfg.user === 'id') data.id = session.id
        else data.user_id = session.id
        const id = cfg.user === 'id' ? session.id : data.id
        let row
        if (id) {
          const update = { ...data }
          delete update.id
          // Verificar pertenencia antes de actualizar
          const existing = await model.findUnique({ where: { id } })
          if (existing) {
            const owner = cfg.user === 'id' ? existing.id : existing.user_id
            if (owner !== session.id) {
              return NextResponse.json(
                { data: null, error: { message: 'No autorizado' } },
                { status: 403 }
              )
            }
            row = await model.update({ where: { id }, data: update })
          } else {
            row = await model.create({ data })
          }
        } else {
          row = await model.create({ data })
        }
        return NextResponse.json({
          data: body.single ? serializeRow(row) : [serializeRow(row)],
          error: null,
        })
      }

      case 'delete': {
        await model.deleteMany({ where })
        return NextResponse.json({ data: null, error: null })
      }

      default:
        return NextResponse.json(
          { data: null, error: { message: `Operación no soportada` } },
          { status: 400 }
        )
    }
  } catch (e: any) {
    const message = e?.code === 'P2002'
      ? 'Ya existe un registro con esos datos'
      : e?.message || 'Error de base de datos'
    return NextResponse.json({ data: null, error: { message, code: e?.code } }, { status: 400 })
  }
}
