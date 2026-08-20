function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function getSupabasePublicConfig() {
  return {
    url: requiredEnvironmentValue('NEXT_PUBLIC_SUPABASE_URL'),
    publishableKey: requiredEnvironmentValue('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  }
}
