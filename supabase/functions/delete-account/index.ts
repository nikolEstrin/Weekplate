import { createClient } from 'jsr:@supabase/supabase-js@2'

const allowedOrigins = new Set(['capacitor://localhost', 'http://localhost:5173'])

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'capacitor://localhost',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }
  if (request.method !== 'POST') {
    return json(request, { ok: false, error: 'method_not_allowed' }, 405)
  }

  const authorization = request.headers.get('Authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return json(request, { ok: false, error: 'unauthorized' }, 401)
  }

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceRoleKey) {
    return json(request, { ok: false, error: 'server_configuration' }, 500)
  }

  try {
    const verifier = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await verifier.auth.getUser(match[1])
    if (error || !data.user) {
      return json(request, { ok: false, error: 'unauthorized' }, 401)
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id)
    if (deleteError) {
      return json(request, { ok: false, error: 'delete_failed' }, 500)
    }

    return json(request, { ok: true })
  } catch {
    return json(request, { ok: false, error: 'unexpected_error' }, 500)
  }
})
