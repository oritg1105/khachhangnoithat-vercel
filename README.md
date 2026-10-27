# Woodcraft customer storefront

This project root contains the standalone customer-facing storefront. Its
frontend files, models, views, and serverless APIs are kept together here; it
does not import admin/staff controllers, models, or API routes.

## Local setup

Set these values in `.env.development.local` using `.env.example` as a template.
If the local file already exists, add the values without replacing its contents:

- `SUPABASE_URL`: URL of the Supabase project containing the existing tables.
- `SUPABASE_ANON_KEY`: publishable/anon key, used only by the public catalog API.
- `SUPABASE_SERVICE_ROLE_KEY`: legacy service-role key, used only by server APIs.
- `CUSTOMER_SESSION_SECRET`: a private random value with at least 32 characters.

Never put `SUPABASE_SERVICE_ROLE_KEY` or `CUSTOMER_SESSION_SECRET` in browser
code, commit them, or send them in chat. The `.gitignore` excludes local env files.

Run `vercel dev --listen 3000` from this folder. Configure the same variables in
the linked Vercel project's Development environment for local API requests to
reach Supabase.

## Customer accounts

Registration writes a customer profile to the existing `KHACHHANG` table and a
PBKDF2 password hash to the existing `DANGNHAP` table. Login verifies that hash
on the server. Email is optional and is not used for authentication. No Supabase
Auth endpoint is called.

This project does not create, alter, or drop database tables or columns, and
does not run SQL. The configured database must already expose the columns used
by the storefront APIs.

Order submission currently calls the existing
`place_customer_password_order` database function. If that function is not
already present, COD checkout will not work; this project intentionally does
not create it or change the database.
