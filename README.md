# 💬 Sap-chatflow: The AI-Powered SAP Assistant

**[🌐 Live Demo → Sap-chatflow](https://sap-chatflow.vercel.app/)**

Sap-chatflow is an innovative conversational AI application designed to simplify complex interactions with **Enterprise Resource Planning (ERP)** systems — specifically focusing on **SAP** operations and terminology.  
By leveraging a modern **Large Language Model (LLM)** and **Retrieval-Augmented Generation (RAG)** architecture, it transforms rigid SAP workflows into intuitive chat commands.

---

## ✨ Features

Sap-chatflow functions as a highly effective digital assistant, providing both **informational retrieval** and **direct action** capabilities within the chat interface.

### 1. 🧠 Contextual Information Retrieval (RAG)
- **SAP Terminology:** Instantly provides clear, layman definitions and explanations for complex SAP transaction codes (e.g., `FB60`) and process terminology, sourced from a dedicated knowledge base.  
- **FAQ Handling:** Accurately answers step-by-step process questions (e.g., "How do I create a PO?") by querying a dedicated FAQ knowledge base.
- **Fuzzy Searching:** Uses advanced fuzzy text matching to understand user queries even with typos or slight variations.

### 2. 📊 Dynamic Data Lookups
Users can query real-time operational data, which the chatbot retrieves from the backend’s persistent storage and displays in formatted tables directly in the chat.
- **Inventory Status:** Check current stock levels for specific materials.  
- **Procurement:** View lists of active Purchase Orders (POs) and filter by value or vendor.  
- **Sales:** Retrieve delivered or open Sales Orders (SOs).  

### 3. ⚙️ Interactive Workflow Automation
The chatbot can dynamically generate interactive UI elements within the chat for routine administrative tasks.
- **Leave Application:** Generates a structured, fillable form upon user request and saves the data to the backend.  
- **Document Retrieval:** Provides direct, one-click downloads for PDF documents like the Mentor-Mentee User Manual.

### 4. 🗂️ Intelligent Chat Management
- **Chat History:** A dedicated sidebar to manage past conversations.
- **Session Controls:** Pin important chats, rename sessions, export chat logs, or delete history.
- **UI/UX:** Beautiful, animated interface with dark/light mode support and perfect markdown formatting (including tables and styled lists).

---

## 💻 Technology Stack

| Category | Technology | Purpose |
|-----------|-------------|----------|
| **Frontend** | React (Vite) & TypeScript | Modern, responsive chat interface and UI components |
| **Backend** | Node.js & Express | Handles API routing, tool execution, and local JSON data persistence |
| **LLM** | Llama 3.1 8B Instant | Core generative model, accessed via the lightning-fast **Groq API** |
| **Architecture** | RAG & Function Calling | Grounds LLM responses using SAP-specific data and dynamic tool routing |
| **Search Logic** | Fuse.js | Lightweight fuzzy-search library for precise knowledge base retrieval |
| **UI Styling** | Tailwind CSS & Framer Motion | Fluid animations, perfectly spaced typography, and responsive design |

---

## 🛠️ Setup and Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (LTS version)
- [Bun](https://bun.sh) (Recommended) or npm/yarn
- A free **Groq API Key** (Get one at [console.groq.com](https://console.groq.com/))

---

### Installation Steps

#### 1. Clone the Repository
\`\`\`bash
git clone https://github.com/IshaanBhatt23/sap-chatflow
cd sap-chatflow
\`\`\`

#### 2. Install Dependencies
Since the repository uses `bun.lockb`, using **Bun** is recommended:
\`\`\`bash
bun install
\`\`\`
*(Alternatively, you can use `npm install` or `yarn install`)*

#### 3. Configure Environment Variables
Create a `.env` file in the project root (or inside your backend folder depending on your setup) and add your Groq API key:
\`\`\`env
GROQ_API_KEY="your_groq_api_key_here"
\`\`\`
*(Note: Ensure your `index.js` backend file is configured to read this from `process.env.GROQ_API_KEY`!)*

#### 4. Add Public Assets
Ensure your downloadable documents (like `MENTOR_MENTEE_USER_MANUAL.pdf`) are placed exactly inside the `public/` directory so the frontend can serve them.

#### 5. Run the Application
You will need to run the **backend** and **frontend** concurrently.

**Start the Backend (Port 3001)**
\`\`\`bash
node index.js
\`\`\`

**Start the Frontend (Port 5173)**
\`\`\`bash
bun run dev
\`\`\`

Open your browser and navigate to `http://localhost:5173` to start chatting!

---

## 📜 License

Distributed under the **MIT License**.  
See `LICENSE.md` for more information.

---

### Made with 💙 by [IshaanBhatt23](https://github.com/IshaanBhatt23) and [Bhargav Kishore](https://github.com/Kishore-Bhargav)
