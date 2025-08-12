import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://chvptvbuoqhvqjrzicsk.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export const prisma = new PrismaClient();
