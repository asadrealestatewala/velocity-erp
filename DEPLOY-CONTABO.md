# Deploying to your Contabo server (auto-deploy on push)

This sets things up so that every time you push to `main` on GitHub, your
Contabo server automatically pulls the new code, rebuilds, and restarts —
no manual steps after today.

Server: `161.97.164.139` (user `root`)

## One-time setup (do this once)

### 1. Let GitHub log in to your server

GitHub needs a way to connect to your server without a password. A key pair
was generated for this:

- **Public key** (goes on the server): see `deploy_key.pub` shared with you
- **Private key** (goes into GitHub, never on the server): see the private
  key shared with you

On the server, as `root`, run:

```bash
mkdir -p ~/.ssh
echo "PASTE_THE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 2. Install Node.js, pm2, and git (if not already installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git
npm install -g pm2
```

### 3. Clone the repo onto the server

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/asadrealestatewala/velocity-erp.git
cd velocity-erp
npm ci
```

### 4. Create the `.env` file on the server

Copy `.env.example` to `.env` and fill in real values (database connection,
`APP_SECRET`, `APP_URL`, etc. — see the comments in `.env.example`):

```bash
cp .env.example .env
nano .env
```

### 5. Build and start the app for the first time

```bash
npm run build
pm2 start npm --name velocity-erp -- start
pm2 save
pm2 startup
```

(`pm2 startup` prints one more command to run — run the exact command it
gives you, so the app restarts automatically if the server reboots.)

### 6. Add 3 secrets to your GitHub repo

Go to: `github.com/asadrealestatewala/velocity-erp` → **Settings** →
**Secrets and variables** → **Actions** → **New repository secret**, and
add these three:

| Secret name       | Value                                   |
|--------------------|------------------------------------------|
| `SSH_HOST`         | `161.97.164.139`                         |
| `SSH_USER`         | `root`                                   |
| `SSH_PRIVATE_KEY`  | the private key shared with you (the whole thing, including the `BEGIN`/`END` lines) |

## After that

Just push to `main` as normal:

```bash
git push origin main
```

GitHub Actions will SSH in, pull the new code, run any new database
migrations, rebuild, and reload the app — automatically. You can watch it
happen under the **Actions** tab on GitHub.

## If something goes wrong

- Check the **Actions** tab on GitHub for the failed step's log.
- `pm2 logs velocity-erp` on the server shows the app's own error output.
- `pm2 status` shows whether the app is currently running.
