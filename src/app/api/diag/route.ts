import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    env_keys: [],
    globalThis_keys: [],
    cf_env: null,
    request_context: null,
    db_binding: null,
    db_test: null,
    tables: null,
    opening_trees_count: null
  };

  // 1. Check process.env for DB-related keys
  try {
    const envKeys = Object.keys(process.env || {}).filter(k => 
      k.includes('DB') || k.includes('DATABASE') || k.includes('D1') || k.includes('speerchess')
    );
    diagnostics.env_keys = envKeys;
  } catch (e: any) {
    diagnostics.env_keys = `Error: ${e?.message}`;
  }

  // 2. Check globalThis for DB bindings
  try {
    const gKeys: string[] = [];
    for (const key of Object.keys(globalThis || {})) {
      if (key.includes('DB') || key.includes('DATABASE') || key.includes('D1') || key.includes('cf') || key.includes('__')) {
        gKeys.push(key);
      }
    }
    diagnostics.globalThis_keys = gKeys;
  } catch (e: any) {
    diagnostics.globalThis_keys = `Error: ${e?.message}`;
  }

  // 3. Try @cloudflare/next-on-pages getRequestContext
  try {
    const { getRequestContext } = await import('@cloudflare/next-on-pages');
    const ctx = getRequestContext();
    if (ctx && ctx.env) {
      const envKeys = Object.keys(ctx.env);
      diagnostics.request_context = {
        available: true,
        env_keys: envKeys,
        has_DB: 'DB' in ctx.env,
        has_DATABASE: 'DATABASE' in ctx.env
      };

      // Try to get DB binding
      const db = (ctx.env as any).DB || (ctx.env as any).DATABASE || null;
      if (db) {
        diagnostics.db_binding = 'Found via getRequestContext';
        
        // Test basic query
        try {
          const testResult = await db.prepare('SELECT 1 as test').first();
          diagnostics.db_test = testResult;
        } catch (e: any) {
          diagnostics.db_test = `Error: ${e?.message}`;
        }

        // List tables
        try {
          const tablesResult = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
          diagnostics.tables = tablesResult.results?.map((r: any) => r.name) || [];
        } catch (e: any) {
          diagnostics.tables = `Error: ${e?.message}`;
        }

        // Count opening trees
        try {
          const countResult = await db.prepare("SELECT COUNT(*) as cnt FROM user_opening_trees").first();
          diagnostics.opening_trees_count = countResult;
        } catch (e: any) {
          diagnostics.opening_trees_count = `Error: ${e?.message}`;
        }

        // Count users
        try {
          const usersCount = await db.prepare("SELECT COUNT(*) as cnt FROM users").first();
          diagnostics.users_count = usersCount;
        } catch (e: any) {
          diagnostics.users_count = `Error: ${e?.message}`;
        }

        // Count linked_accounts
        try {
          const laCount = await db.prepare("SELECT COUNT(*) as cnt FROM linked_accounts").first();
          diagnostics.linked_accounts_count = laCount;
        } catch (e: any) {
          diagnostics.linked_accounts_count = `Error: ${e?.message}`;
        }

        // Try inserting a test row into user_opening_trees
        try {
          await db.prepare(`
            INSERT INTO users (id, username, is_vip) 
            VALUES ('__diag_test__', '__diag_test__', 0)
            ON CONFLICT(id) DO NOTHING
          `).run();
          
          await db.prepare(`
            INSERT INTO user_opening_trees (user_id, is_vip, max_ply, total_games, tree_json, updated_at) 
            VALUES ('__diag_test__', 0, 10, 0, '{"test":true}', datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET tree_json = '{"test":true,"updated":true}'
          `).run();
          
          const verify = await db.prepare("SELECT user_id, tree_json FROM user_opening_trees WHERE user_id = '__diag_test__'").first();
          diagnostics.test_insert = { success: true, verify };
          
          // Cleanup test data
          await db.prepare("DELETE FROM user_opening_trees WHERE user_id = '__diag_test__'").run();
          await db.prepare("DELETE FROM users WHERE id = '__diag_test__'").run();
        } catch (e: any) {
          diagnostics.test_insert = { success: false, error: e?.message };
        }
      } else {
        diagnostics.db_binding = 'NOT found in request context env';
      }
    } else {
      diagnostics.request_context = { available: false, reason: 'No context or no env' };
    }
  } catch (e: any) {
    diagnostics.request_context = { available: false, error: e?.message };
  }

  // 4. Try process.env direct access
  if (!diagnostics.db_binding) {
    try {
      const db = (process.env as any).DB || (process.env as any).DATABASE;
      if (db && typeof db.prepare === 'function') {
        diagnostics.db_binding = 'Found via process.env';
      }
    } catch (e: any) {}
  }

  return NextResponse.json(diagnostics);
}
