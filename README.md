# 🚀 Confidence, Engineered — AI-Powered Mock Interview Platform

**Confidence, Engineered** is a cutting-edge, full-stack web application designed to help candidates prepare for and master high-stakes behavioral job interviews. Using state-of-the-art AI, the platform simulates realistic, professional interview interactions via both voice and text, evaluates candidate responses under rigorous executive criteria, and delivers personalized coaching insights and progress tracking.

---

## ✨ Features

- **🎙️ Real-Time Voice & Text Simulation**: Supports natural, conversational speech-to-text (STT) via OpenAI Whisper, allowing candidates to speak their answers directly.
- **🎯 Tailored Setup**: Paste a specific job description and background/resume (or upload a PDF/DOCX resume for automatic parsing), and choose target behavioral topics (Teamwork, Leadership, Communication, etc.).
- **👔 Realistic Hiring Manager AI**: The AI interviewer acts as a strict, professional executive—probing for STAR-method elements (Situation, Task, Action, Result) and referencing the candidate's resume instead of offering generic cheerleading.
- **📊 Strict Scoring & Feedback**: Answers are analyzed across 5 key dimensions:
  - **Clarity** (communication structure)
  - **Relevance** (addressing the prompt)
  - **Structure** (adherence to STAR method)
  - **Confidence** (language assertiveness)
  - **Depth** (substance and metrics)
- **📈 Performance Trend Analytics**: Keep track of improvement trajectories with interactive radar and area charts using Recharts.
- **🤖 Jay, Your Dashboard Assistant**: An AI chatbot (Jay) built into the dashboard that has context of your performance stats and can answer questions, compute averages, and find your strengths/weaknesses.
- **🔐 Secure Authentication**: Built-in credential management and Google OAuth login integration.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React (Vite)
- **UI & Iconography**: Material UI (MUI) & MUI Icons
- **State & Routing**: React Router v7, Custom Auth/Theme contexts
- **Data Visualization**: Recharts (Radar, Area, Line charts)
- **Animations**: Framer Motion
- **OAuth**: Google OAuth Integration

### Backend
- **Framework**: Flask (Python)
- **Database**: SQLite (local development) / MySQL (AWS RDS for production)
- **ORM**: SQLAlchemy
- **Authentication**: PyJWT (JSON Web Tokens), Google Auth Client
- **Document Parsing**: PyMuPDF (PDF parsing) & python-docx (Word parsing)

### AI Integration
- **LLM**: OpenAI GPT-4o-mini (interview questions, grading, chatbot)
- **Speech-to-Text**: OpenAI Whisper-1 API (voice transcription)

---

## 📂 Repository Structure

```
├── backend/                    # Flask backend application
│   ├── app.py                  # Main Flask server (API routes, AI prompts, DB models)
│   ├── app.db                  # SQLite database (dev)
│   ├── models.py               # Database schemas
│   ├── tests/                  # Backend test suite
│   └── global-bundle.pem       # SSL certificate for secure RDS connection
│
├── frontend/                   # React frontend application
│   └── confidence-engineered/
│       ├── src/
│       │   ├── api/            # API client wrapper
│       │   ├── components/     # Reusable UI components (e.g. JayChatbot.jsx)
│       │   ├── context/        # React Contexts (Auth, Theme)
│       │   ├── pages/          # Pages: Login, Register, Dashboard
│       │   ├── App.jsx         # App routing and InterviewPage logic
│       │   └── main.jsx        # Main React Entrypoint
│       ├── package.json        # Frontend dependencies
│       └── vite.config.js      # Vite compilation configuration
│
├── requirements.txt            # Python dependencies
├── Procfile                    # Deployment execution command
└── README_DEPLOY.md            # Comprehensive AWS deployment guide
```

Key files linked:
- Backend Entrypoint: [app.py](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/backend/app.py)
- Frontend App Entrypoint: [App.jsx](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/frontend/confidence-engineered/src/App.jsx)
- Frontend Dashboard Page: [Dashboard.jsx](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/frontend/confidence-engineered/src/pages/Dashboard.jsx)
- Frontend Login Page: [Login.jsx](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/frontend/confidence-engineered/src/pages/Login.jsx)
- Frontend Register Page: [Register.jsx](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/frontend/confidence-engineered/src/pages/Register.jsx)
- Frontend Chatbot Component: [JayChatbot.jsx](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/frontend/confidence-engineered/src/components/JayChatbot.jsx)
- Root requirements: [requirements.txt](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/requirements.txt)
- Root Procfile: [Procfile](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/Procfile)
- Root Deployment Guide: [README_DEPLOY.md](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/README_DEPLOY.md)

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have the following installed on your machine:
- **Node.js** (v18+)
- **Python** (v3.9+)
- **OpenAI API Key**

---

### 2. Backend Setup

1. Navigate to the root directory and create a Python virtual environment:
   ```bash
   python -m venv .venv
   ```
2. Activate the virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     .venv\Scripts\Activate.ps1
     ```
   - **macOS/Linux**:
     ```bash
     source .venv/bin/activate
     ```
3. Install the backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the root directory (or update the existing one) with your credentials:
   ```env
   SECRET_KEY=your_super_secret_jwt_key
   OPENAI_API_KEY=your_openai_api_key
   GOOGLE_CLIENT_ID=your_google_client_id
   DATABASE_URL=sqlite:///backend/app.db
   FLASK_DEBUG=True
   ```
5. Run the Flask development server:
   ```bash
   python backend/app.py
   ```
   The backend will start running on [http://127.0.0.1:5000](http://127.0.0.1:5000).

---

### 3. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend/confidence-engineered
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Create a `.env` file inside the `frontend/confidence-engineered/` folder:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:5000
   ```
4. Start the Vite dev server:
   ```bash
   npm run dev
   ```
   Open your browser to the URL displayed in the terminal (usually [http://localhost:5173](http://localhost:5173)).

---

## 🔗 Key API Reference

The backend exposes several critical REST endpoints (defined in [app.py](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/backend/app.py)):

- **`/api/register` [POST]**: Registers a new user.
- **`/api/login` [POST]**: Authenticates credentials and issues a JWT.
- **`/api/auth/google` [POST]**: Handles Google OAuth tokens.
- **`/api/parse-document` [POST]**: Uploads and parses PDF/DOCX resumes and job descriptions.
- **`/api/session/start` [POST]**: Initializes an interview session with a tailored prompt.
- **`/api/session/respond` [POST]**: Processes text or audio responses. Audio is transcribed via Whisper and sent to the LLM.
- **`/api/session/end` [POST]**: Triggers the hyper-critical scoring evaluation (Clarity, Relevance, Structure, Confidence, Depth).
- **`/api/analytics/me` [GET]**: Aggregates history and metrics for the authenticated user.
- **`/api/chatbot/jay` [POST]**: Connects with Jay the chatbot to offer data-driven analytics insights.

---

## ☁️ Deployment

For production cloud deployment, refer to the full, step-by-step instructions in the [AWS Deployment Guide](file:///c:/Users/draiz/PycharmProjects/Confidence-Engineered/README_DEPLOY.md).
- **Backend**: Deployed to AWS Elastic Beanstalk.
- **Frontend**: Deployed to AWS Amplify.
- **Database**: Hosted on AWS RDS (MySQL).
