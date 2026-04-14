# WorkShift

Full-stack employee scheduling app with AI constraint parsing.

## Stack
- **Frontend:** React 18 + Vite + MUI v5 + @hello-pangea/dnd
- **Backend:** .NET 8 Web API
- **Database & Auth:** Supabase (PostgreSQL)
- **AI:** Anthropic Claude API

## Quick Start

### 1. Supabase Setup
1. Create a Supabase project at supabase.com
2. Run `database/migrations/001_schema.sql` in the SQL Editor
3. Run `database/migrations/002_rls.sql`
4. Run `database/seed.sql`
5. In Auth > Users, create a manager user: `manager@workshift.local` / `0000`
6. Run: `UPDATE public.profiles SET role='manager', name='מנהל', job_role=null WHERE id='<user-uuid>';`

### 2. Backend
```bash
cd backend
# Edit WorkShift.Api/appsettings.Development.json with your Supabase URL, service role key, and Anthropic API key
dotnet run --project WorkShift.Api
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env
# Edit .env with your Supabase URL and anon key
npm install
npm run dev
```

### Default Credentials
- All users default to password `0000`
- Manager login: select "מנהל" from the dropdown
