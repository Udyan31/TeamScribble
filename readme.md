# 🎨 TeamScribble - Real-Time Collaborative Whiteboard

A feature-rich, real-time collaborative whiteboard application built with Node.js, Express, and Socket.IO. TeamScribble allows multiple users to join a shared canvas, draw, chat, and brainstorm together from anywhere in the world.

**Live Demo:** **[https://teamscribble.onrender.com/]**
---

## ✨ Key Features

* **Real-Time Collaboration:** All drawing actions, cursor movements, and chat messages are synced instantly across all users in the room.
* **Multi-User Cursors:** See the cursors and nicknames of other participants moving around the canvas in real-time.
* **Room-Based Sessions:** Create a private room with a unique 4-digit code or join an existing one.
* **Rich Drawing Tools:**
    * Pencil & Eraser
    * Shape tools (Rectangle, Circle)
    * Paint Bucket (Fill) tool
    * Full color palette and adjustable brush sizes.
* **Multi-Page Canvas:** Create multiple pages within a single session to organize your ideas. Each page has its own drawing history.
* **Integrated Chat:** A built-in chat allows for seamless communication without leaving the whiteboard.
* **Live Participant List:** See a list of everyone currently in the room.

---

## 🛠️ Tech Stack

This project is built with a modern, real-time web stack:

* **Front-End:**
    * HTML5
    * CSS3 (with Flexbox for responsive layout)
    * **Vanilla JavaScript (ES6+)**
    * **Socket.IO Client** for real-time communication
* **Back-End:**
    * **Node.js** as the runtime environment
    * **Express.js** for the web server
    * **Socket.IO** for WebSocket-based real-time event handling
* **Deployment:**
    * Hosted on **Render**
    * Version control with **Git** and **GitHub**

---

## 🚀 Getting Started

To run this project locally on your own machine, follow these steps.

### Prerequisites

* [Node.js](https://nodejs.org/en/) (v18.x or later recommended)
* [Git](https://git-scm.com/)

### Installation & Setup

1.  **Clone the repository:**
    ```sh
    git clone [https://github.com/Udyan31/TeamScribble.git]
    ```
    2.  **Navigate to the project directory:**
    ```sh
    cd TeamScribble
    ```

3.  **Install the dependencies:**
    ```sh
    npm install
    ```

4.  **Start the server:**
    ```sh
    npm start
    ```

5.  **Open in your browser:**
    Navigate to `http://localhost:3000` to see the application running. Open multiple tabs to test the real-time collaboration!

---

## 💡 Future Improvements

This project is a solid foundation. Future features could include:
* **User Authentication:** Allowing users to sign up and save their boards.
* **More Tools:** Adding text input, straight lines, and image uploading.
* **"Browse Public Rooms":** A lobby to see and join active public sessions.
* **Persistent Storage:** Connecting a database (like MongoDB or PostgreSQL) so that drawings are saved even if the server restarts.
