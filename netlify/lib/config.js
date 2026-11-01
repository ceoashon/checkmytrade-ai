'use strict';
// Central place for every environment variable the functions read.
// Nothing secret is ever sent to the browser except the Supabase anon key,
// which is designed to be public (row level security protects the data).

function int(v, d) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
}

function getConfig(env = process.env) {
  const anthropicKey = (env.ANTHROPIC_API_KEY || '').trim();
  const supabaseUrl = (env.SUPABASE_URL || '').trim();
  const isProduction = env.CONTEXT === 'production';
  const devAuthRequested = String(env.ALLOW_DEV_AUTH || '').toLowerCase() === 'true';
  return {
    anthropicKey,
    mockAi: !anthropicKey || String(env.MOCK_MODE || '').toLowerCase() === 'true',
    gradeModel: env.GRADE_MODEL || 'claude-sonnet-5-5',
    qaModel: env.QA_MODEL || 'claude-haiku-5-5',
    gradeEffort: env.GRADE_EFFORT || 'medium',
    qaEffort: env.QA_EFFORT || 'low',
    gradeMaxTokens: int(env.GRADE_MAX_TOKENS, 8000),
    qaMaxTokens: int(env.QA_MAX_TOKENS, 3000),
    cacheTtl: env.CACHE_TTL === '1h' ? '1h' : '5m',
    refusalFallback: String(env.ENABLE_REFUSAL_FALLBACK || 'true').toLowerCase() !== 'false',
    gradeTimeoutMs: int(env.GRADE_TIMEOUT_MS, 24000),
    dailyGradeLimit: int(env.DAILY_GRADE_LIMIT, 5),
    dailyQuestionLimit: int(env.DAILY_QUESTION_LIMIT, 20),
    rateLimitTz: env.RATE_LIMIT_TZ || 'America/New_York',
    calibrationExamples: int(env.CALIBRATION_EXAMPLES, 6),
    maxImageBytes: int(env.MAX_IMAGE_BYTES, 4 * 1024 * 1024),
    supabaseUrl,
    supabaseAnonKey: (env.SUPABASE_ANON_KEY || '').trim(),
    supabaseServiceKey: (env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    chartBucket: env.SUPABASE_CHART_BUCKET || 'cmt-charts',
    // Dev auth lets you click "sign in as student/coach" with no Supabase.
    // It is refused on the production deploy context no matter what.
    devAuth: !supabaseUrl && devAuthRequested && !isProduction,
    isProduction,
    pricingOverride: env.PRICING_JSON || '',
  };
}

module.exports = { getConfig };
