// Cliente de datos local (PostgreSQL + Prisma vía API routes).
// Mantiene la misma interfaz que @supabase/supabase-js para que las
// páginas y componentes existentes funcionen sin cambios.

type Filter = { type: 'eq' | 'gte' | 'lte' | 'lt' | 'or'; column?: string; value?: any; raw?: string }
type Order = { column: string; ascending: boolean }

interface DbResult<T = any[]> {
  data: T | null
  error: { message: string; code?: string } | null
  count?: number
}

class QueryBuilder<T = any[]> implements PromiseLike<DbResult<T>> {
  private table: string
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private payload: any = undefined
  private filters: Filter[] = []
  private orderList: Order[] = []
  private limitN?: number
  private isSingle = false
  private wantCount = false
  private selectStr?: string

  constructor(table: string) {
    this.table = table
  }

  select(columns?: string, opts?: { count?: string }) {
    if (this.op === 'select') this.selectStr = columns || '*'
    if (opts?.count) this.wantCount = true
    return this
  }

  insert(payload: any) {
    this.op = 'insert'
    this.payload = payload
    return this
  }

  update(payload: any) {
    this.op = 'update'
    this.payload = payload
    return this
  }

  upsert(payload: any) {
    this.op = 'upsert'
    this.payload = payload
    return this
  }

  delete() {
    this.op = 'delete'
    return this
  }

  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value })
    return this
  }

  gte(column: string, value: any) {
    this.filters.push({ type: 'gte', column, value })
    return this
  }

  lte(column: string, value: any) {
    this.filters.push({ type: 'lte', column, value })
    return this
  }

  lt(column: string, value: any) {
    this.filters.push({ type: 'lt', column, value })
    return this
  }

  or(raw: string) {
    this.filters.push({ type: 'or', raw })
    return this
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderList.push({ column, ascending: opts?.ascending !== false })
    return this
  }

  limit(n: number) {
    this.limitN = n
    return this
  }

  single(): QueryBuilder<any> {
    this.isSingle = true
    return this as QueryBuilder<any>
  }

  private async execute(): Promise<DbResult<T>> {
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: this.table,
          op: this.op,
          payload: this.payload,
          filters: this.filters,
          order: this.orderList,
          limit: this.limitN,
          single: this.isSingle,
          count: this.wantCount,
          select: this.selectStr,
        }),
      })
      const json = await res.json()
      return {
        data: json.data ?? null,
        error: json.error ?? null,
        count: json.count,
      }
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'Error de red' } }
    }
  }

  then<TResult1 = DbResult<T>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}

// ---------- Auth ----------

type AuthUser = {
  id: string
  email: string
  user_metadata: { nombre: string | null }
} | null

let cachedUser: AuthUser | undefined

async function fetchUser(): Promise<AuthUser> {
  if (cachedUser !== undefined) return cachedUser
  try {
    const res = await fetch('/api/auth/session')
    const json = await res.json()
    cachedUser = json.user ?? null
  } catch {
    cachedUser = null
  }
  return cachedUser ?? null
}

const auth = {
  async getSession() {
    const user = await fetchUser()
    return { data: { session: user ? { user } : null }, error: null }
  },

  async getUser() {
    const user = await fetchUser()
    return { data: { user }, error: null }
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json()
      if (!res.ok) {
        return { data: { user: null, session: null }, error: json.error || { message: 'Error al iniciar sesión' } }
      }
      cachedUser = json.user
      return { data: { user: json.user, session: { user: json.user } }, error: null }
    } catch (e: any) {
      return { data: { user: null, session: null }, error: { message: e?.message || 'Error de red' } }
    }
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: { nombre?: string } } }) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nombre: options?.data?.nombre }),
      })
      const json = await res.json()
      if (!res.ok) {
        return { data: { user: null, session: null }, error: json.error || { message: 'Error al crear la cuenta' } }
      }
      cachedUser = json.user
      return { data: { user: json.user, session: { user: json.user } }, error: null }
    } catch (e: any) {
      return { data: { user: null, session: null }, error: { message: e?.message || 'Error de red' } }
    }
  },

  async signOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      cachedUser = null
    }
    return { error: null }
  },

  async updateUser({ password }: { password?: string }) {
    try {
      const res = await fetch('/api/auth/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const json = await res.json()
      if (!res.ok) {
        return { data: null, error: json.error || { message: 'Error al actualizar' } }
      }
      return { data: { user: cachedUser }, error: null }
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'Error de red' } }
    }
  },
}

export const supabase = {
  from: (table: string) => new QueryBuilder(table),
  auth,
}
