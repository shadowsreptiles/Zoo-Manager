import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://zelqxnbnnoomeubnjvwq.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_YwxDyTvprXWzZiK7bEQC0w__phq-pBY'

export const db = createClient(SUPABASE_URL, SUPABASE_KEY)
