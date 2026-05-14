# Confidence, Engineered - AWS Deployment Guide

This guide provides step-by-step, idiot-proof instructions for deploying your application to AWS safely. 

Your application is split into two parts:
1. **The Backend (Python/Flask)**: Handles the API, AI logic, and database connections.
2. **The Frontend (React/Vite)**: The user interface.

We recommend deploying the **Backend to AWS Elastic Beanstalk** (or AWS App Runner) and the **Frontend to AWS Amplify**. This is the most straightforward, industry-standard approach.

---

## Phase 1: Preparation & Safety First 🛑

Before touching any deployment settings, secure your data.

1. **Snapshot your Database**: Go to the **AWS RDS Console**. Find your database (`database-confidenceengineered...`), select it, click **Actions**, and choose **Take snapshot**. If anything goes wrong, you can restore your data from this snapshot.
2. **Download the SSL Certificate**: You must download the `global-bundle.pem` file from AWS (Search "AWS RDS SSL Certificate" in Google). Place this `global-bundle.pem` file directly inside your `backend/` folder. Your backend will fail to connect without it.

---

## Phase 2: Environment Variables Master List 📝

Both your backend and frontend require specific environment variables to talk to each other and external services securely. **You will need to copy/paste these exactly into your AWS dashboards during deployment.**

### Backend Variables (Set these in AWS Elastic Beanstalk)

| Variable Name | What it is | Example Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | The exact string to connect to your RDS instance. Replace `<YOUR_PASSWORD>` with the real password and `<DB_NAME>` with your database name (often `postgres` or the app name). | `mysql+pymysql://masterpassword:<YOUR_PASSWORD>@database-confidenceengineered.cv7jasd3ohgn.us-east-1.rds.amazonaws.com:3306/<DB_NAME>` |
| `DB_SSL_CA` | Tells the server where to find the RDS SSL certificate. | `./global-bundle.pem` |
| `SECRET_KEY` | A long, random, impossible-to-guess password used to secure user logins. Do NOT lose this. | `x8Fj2p9L... (Make up a random 30+ character string)` |
| `OPENAI_API_KEY` | Your live OpenAI API key. | `sk-proj-...` |
| `GOOGLE_CLIENT_ID` | Your Google OAuth credentials. | `555185131868-mvkio7hhse2ka2m14seida28u4vra5fu.apps.googleusercontent.com` |
| `FRONTEND_URL` | The live URL of your frontend (once it's deployed). This prevents hackers from using your backend API from their own websites. | `https://main.d12345abcd.amplifyapp.com` (You will get this URL in Phase 4) |
| `FLASK_DEBUG` | Turns off developer error screens so users don't see your code if an error occurs. | `False` |

### Frontend Variables (Set these in AWS Amplify)

| Variable Name | What it is | Example Value |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | The live URL of your backend (once it's deployed). This tells your React app where to send API requests. | `https://confidence-backend.us-east-1.elasticbeanstalk.com` (You will get this URL in Phase 3) |

---

## Phase 3: Deploying the Backend (AWS Elastic Beanstalk) ⚙️

Elastic Beanstalk reads your `Procfile` and `requirements.txt` and automatically sets up a server for you.

1. Zip your project: Create a `.zip` file containing your entire codebase (make sure `backend/`, `Procfile`, `requirements.txt`, and `.env` are included. **CRITICAL: DO NOT include the `node_modules` or `.venv` folders to save space**).
2. Go to the **AWS Elastic Beanstalk Console**.
3. Click **Create Application**.
4. **Environment tier**: Select **Web server environment**.
5. **Platform**: Select **Python** (choose the version that matches your local environment, likely Python 3.9 or 3.10).
6. **Application code**: Choose **Upload your code** and upload the `.zip` file you just created.
7. Click **Configure more options** (Do NOT click Create environment yet).
8. Scroll down to **Software** and click **Edit**.
9. Under **Environment properties**, add EVERY variable from the **Backend Variables** list above.
10. Click **Save**, then click **Create environment**.
11. Wait 5-10 minutes. When it finishes, AWS will give you a URL (e.g., `http://your-app-env.eba-xxx.us-east-1.elasticbeanstalk.com`). **Save this URL. This is your `VITE_API_BASE_URL`**.

---

## Phase 4: Deploying the Frontend (AWS Amplify) 🖥️

Amplify is designed specifically for modern React/Vite apps.

1. Go to the **AWS Amplify Console**.
2. Click **New app** -> **Host web app**.
3. Connect your GitHub repository (if your code is on GitHub) OR choose "Deploy without Git provider" and upload your code manually.
4. If using GitHub, select the branch (e.g., `main`).
5. **Build settings**: Amplify usually detects Vite automatically. Ensure the build command is `npm run build` and the output directory is `dist`. If your frontend is inside a folder (like `frontend/confidence-engineered`), you must specify the **Base directory** in the build settings as `frontend/confidence-engineered`.
6. **Advanced Settings**: Expand this section and add your **Frontend Variable**: `VITE_API_BASE_URL` = (The URL you got from Elastic Beanstalk).
7. Click **Save and deploy**.
8. Wait a few minutes. AWS will give you a live frontend URL (e.g., `https://main.dxxxxx.amplifyapp.com`). **Save this URL. This is your `FRONTEND_URL`**.

---

## Phase 5: The Final Connection 🔗

Because your backend and frontend rely on knowing each other's URLs, you have to do a quick update:

1. Go back to your **Elastic Beanstalk** environment.
2. Go to **Configuration** -> **Software**.
3. Find the `FRONTEND_URL` environment variable.
4. Update it to the real AWS Amplify URL you just received.
5. Apply the changes (the backend will restart).

### 🎉 You are live!
Test your application. Create an account, start an interview, and verify that everything is saving to your RDS database safely.
