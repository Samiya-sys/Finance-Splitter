# Finance Splitter 💰

A web-based Flask application to create shared expense rooms, track members, log expenses, and calculate settlements among participants.

## ✨ Features

- **Create and join rooms** with unique IDs
- **Add members** to expense rooms
- **Add and split expenses** (equal or custom percentages)
- **View expense history** per room
- **Get room summary** with net balances and suggested settlements
- **Receipt scanner page** per member
- **Simple MySQL backend** to persist rooms, users, and expenses

## 🛠️ Tech Stack

- **Backend:** Python, Flask
- **Database:** MySQL
- **Frontend:** HTML templates (`landing.html`, `room.html`, `receipt.html`)
- **Libraries:**
  - Flask
  - mysql-connector-python

## Prerequisites

Before you begin, ensure you have the following installed:

- Python 3.8+
- MySQL Server
- Git

## Project Setup

### 1. Clone the repository

```bash
git clone https://github.com/fin-split-org/Finance-Splitter.git
cd Finance-Splitter
```

### 2. Create a virtual environment

```bash
python -m venv venv
```

### 3. Activate the virtual environment

**Windows PowerShell:**

```powershell
.\venv\Scripts\Activate.ps1
```

If execution policy blocks activation:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

**macOS/Linux:**

```bash
source venv/bin/activate
```

### 4. Upgrade pip (optional but recommended)

```bash
python -m pip install --upgrade pip
```

### 5. Install dependencies

```bash
pip install Flask mysql-connector-python
```

## 🗄️ Database Setup

### Create Database and Tables

```python
MYSQL_CONFIG = {
    "host": "localhost",
    "user": "your_mysql_user",
    "password": "your_mysql_password",
    "database": "finance_splitter"
}
```

## ▶️ Running the App

### 1. Activate the virtual environment

```powershell
.\venv\Scripts\Activate.ps1
```

### 2. Run Flask

```bash
python app.py
```

### 3. Open your browser

Navigate to:

```
http://127.0.0.1:8000/
```

## 📁 Project Structure

```
Finance-Splitter/
├── app.py                  # Main Flask application
├── BACKEND/
│   └── config.py          # MySQL configuration
├── FRONTEND/              # Optional front-end assets
├── templates/             # HTML templates
│   ├── landing.html
│   ├── room.html
│   └── receipt.html
├── venv/                  # Virtual environment (not tracked in git)
├── .gitignore
└── README.md
```
