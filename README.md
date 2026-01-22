# 📊 FarmVaidya Pipecat Dashboard

Welcome to the **FarmVaidya Pipecat Analytics Dashboard**. This project provides a comprehensive visualization of your voice AI agents, sessions, and conversation logs. It consists of a modern React frontend, a Node.js/Express API server, and a dedicated synchronization service that pulls real-time data from Pipecat Cloud into a PostgreSQL database.

---

## 📂 Project Structure

The project is organized into two main directories:

### 1. `frontend/` (Dashboard & API)
This directory contains the user interface and the API server that powers it.
- **Frontend**: A **React + Vite** application responsible for displaying agents, stats, and chat logs.
- **Backend API**: A **Node.js + Express** server (`server/index.js`) that queries the PostgreSQL database and serves data to the frontend.

**Key Files:**
- `src/`: React source code (pages, components, styles).
- `server/index.js`: The Express API server connecting to PostgreSQL.
- `.env`: Configuration for API and Database credentials.

### 2. `pipecat-mongodb-sync/` (Data Sync Service)
*Note: Despite the name, this service now syncs to **PostgreSQL**.*
This service runs in the background to fetch data from the Pipecat API and keep the local database updated in real-time.
- **Sync Script**: (`scripts/sync-realtime.js`) Continuously polls Pipecat for new sessions and updates the database.
- **Database Connection**: (`src/config/database.js`) Manages Sequelize connections to Azure PostgreSQL.

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL Database (Azure PostgreSQL configured)

### 1️⃣ Setting up the Dashboard (Frontend + API)
Access the interface to view your data.

1.  Navigate to the directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure Environment:
    - Ensure your `.env` file is set up with valid `POSTGRES_*` credentials.
4.  **Start the Application**:
    ```bash
    npm start
    ```
    - This command automatically cleans up ports `3000` & `5173` and starts both the **Express Server** and **Vite Frontend**.
    - **Dashboard URL**: `http://localhost:5173`
    - **API URL**: `http://localhost:3000`

### 2️⃣ Setting up the Sync Service (Backend Data Pipeline)
Keep your database populated with the latest data.

1.  Navigate to the directory:
    ```bash
    cd pipecat-mongodb-sync
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure Environment:
    - Ensure `.env` contains `PIPECAT_API_KEY` and PostgreSQL credentials.
4.  **Start Synchronization**:
    ```bash
    npm start
    ```
    - This runs the real-time sync script to fetch Agents, Sessions, and Conversations.

---

## 🧱 Directory Layout

```text
dashboard/
├── README.md                      # This documentation
├── frontend/                      # User Interface & API
│   ├── public/                    # Static assets (logo, icons)
│   ├── server/                    # Express API Server
│   │   └── index.js               # Main API entry point
│   ├── src/                       # React Application
│   │   ├── pages/                 # Dashboard, SessionDetails, etc.
│   │   ├── App.css                # Global Styles
│   │   └── main.jsx               # React Entry
│   ├── .env                       # Frontend/API Config
│   ├── package.json               # NPM Scripts for Frontend
│   └── vite.config.js             # Vite Configuration
│
└── pipecat-mongodb-sync/          # Data Ingestion Service
    ├── scripts/
    │   └── sync-realtime.js       # Main sync logic
    ├── src/
    │   ├── config/                # DB & API Config
    │   └── services/              # Business logic for sync
    ├── .env                       # Sync Service Config
    └── package.json               # NPM Scripts for Sync
```

## 🛠️ Troubleshooting

- **Database Connection Errors**:
    - If you see `ECONNRESET` or timeouts, check your **Azure Firewall settings**.
    - Ensure your current IP address is whitelisted in the Azure Portal for the PostgreSQL resource.
- **Port Conflicts**:
    - `npm start` in the `frontend` directory is designed to auto-kill processes on ports 3000 and 5173. If issues persist, manually stop Node processes.

---

**Developed for FarmVaidya**
