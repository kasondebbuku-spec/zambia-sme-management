# Putting Kantemba online

Kantemba runs on **Render** (the app) with its data on **Neon** (PostgreSQL). Both have free plans that are fine for a pilot with a few shops. About 30 minutes the first time.

> **Free plans, at the time of writing.** Check each provider's pricing page for current limits.
> - Render's free web service **goes to sleep after about 15 minutes with no visitors**. The next visit takes up to a minute to wake it. Fine for a pilot, not for paying shops: switch to the **Starter** plan (about $7/month, always awake) before charging anyone.
> - Neon's free database has limited storage, which is plenty for a few shops.

## Before you start

- Merge the open pull requests into `main`, in order. Render deploys whatever is on `main`.
- Think of an **invite code** for your pilot shops, for example `MWILA-PILOT-2026`. Only people with the code can register a business.

## 1. Create the database on Neon

1. Go to **neon.tech** and sign up. Signing in with GitHub is easiest.
2. Create a project:
   - **Name:** `kantemba`
   - **PostgreSQL version:** the default
   - **Region:** **AWS Europe Central (Frankfurt)**. There's no African region, and Frankfurt is close to Render's Frankfurt servers.
3. On the project dashboard, click **Connect**. You need **two** connection strings:
   - **Pooled** (the "Connection pooling" switch **on**): the host contains `-pooler`. This becomes `DATABASE_URL`.
   - **Direct** (pooling **off**). This becomes `DIRECT_URL`.

   Both end in `?sslmode=require`. Keep them private: anyone with them can read the shops' data.

## 2. Create the app on Render

1. Go to **render.com** and sign up with GitHub. Allow it to see the `zambia-sme-management` repository.
2. Click **New → Blueprint**, choose `kasondebbuku-spec/zambia-sme-management`, and confirm. Render reads `render.yaml` from the repository.
3. Render asks for the values marked "sync: false":
   - `DATABASE_URL`: the **pooled** Neon string
   - `DIRECT_URL`: the **direct** Neon string
   - `SIGNUP_CODE`: your invite code

   `SESSION_SECRET` is generated for you.
4. Click **Apply**. The first build takes a few minutes. It installs everything, creates the database tables (`prisma migrate deploy`) and builds the app.
5. When it shows **Live**, open the address Render gives you, something like `https://kantemba.onrender.com`. Check `/api/health` shows `{"status":"ok"}`.

## 3. Set up your pilot shops

For each shop:

1. Open `https://<your-address>/signup` on the owner's phone.
2. Enter the invite code, the shop's name, the owner's name, email and a password of 10+ characters.
3. Add their products with opening stock. Doing this together the first time is the best training.
4. Under **Staff**, the owner adds each cashier with their own email and a starting password, told in person. The cashier signs in on their phone and changes it under **My account**. When someone leaves, the owner switches their login off.
5. Show the cashier the **Sell** screen, and the owner the **Dashboard**, **Running low** and **Today's sales**.

Tip: add the site to the phone's home screen (browser menu → *Add to Home screen*) so it opens like an app.

## Updating

Merge a pull request into `main`. Render rebuilds and deploys automatically, and new database migrations run as part of the build.

## If something goes wrong

- **Build fails:** open the deploy in Render and read the log. The usual cause is a mistyped `DATABASE_URL` or `DIRECT_URL`.
- **Site shows an error:** check `/api/health`. If it says `database unavailable`, the Neon strings are wrong or the Neon project is paused.
- **Forgot the invite code:** change `SIGNUP_CODE` in Render → *Environment*. Render restarts the app with the new code.

## Before charging anyone

- Switch Render to **Starter** so the till never sleeps.
- Check Neon's backup and restore options for your plan, and consider a paid plan for longer restore history.
- Add your own domain (Render → *Settings → Custom Domains*).
- Write simple terms of service and a privacy policy, and check your obligations under Zambia's **Data Protection Act 2021**.
