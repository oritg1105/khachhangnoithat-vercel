# Woodcraft customer storefront

This folder is a standalone Vercel project for the customer-facing storefront.
It does not import admin/staff controllers, models, or API routes.

## Local setup

Configure these variables for the Vercel project rooted at this folder:

- `SUPABASE_URL`: URL of the Supabase project containing the existing tables.
- `SUPABASE_ANON_KEY`: publishable/anon key, used only by the public catalog API.
- `SUPABASE_SERVICE_ROLE_KEY`: legacy service-role key, used only by server APIs.
- `CUSTOMER_SESSION_SECRET`: a private random value with at least 32 characters.

Never put `SUPABASE_SERVICE_ROLE_KEY` or `CUSTOMER_SESSION_SECRET` in browser code,
commit them, or send them in chat. For local development, store them in
`.env.development.local` in this folder.

From this folder, link it to a separate Vercel project and run `vercel dev`.
Do not use the admin project's root directory as this project's deployment root.

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
